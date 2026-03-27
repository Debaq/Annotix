import { useState, useRef, useCallback, useEffect } from 'react';

export interface RecorderState {
  isRecording: boolean;
  isPaused: boolean;
  duration: number;       // seconds
  vuLevel: number;        // 0-1
  isClipping: boolean;
  isNoisy: boolean;
  audioBlob: Blob | null;
  audioUrl: string | null;
  mimeType: string;       // mime type real del MediaRecorder
}

export interface AudioDevice {
  deviceId: string;
  label: string;
}

export interface MicRecorder {
  state: RecorderState;
  devices: AudioDevice[];
  selectedDeviceId: string | null;
  setSelectedDeviceId: (id: string) => void;
  refreshDevices: () => Promise<void>;
  start: () => Promise<void>;
  stop: () => void;
  reset: () => void;
}

const NOISE_THRESHOLD = 0.015;   // RMS threshold for background noise
const CLIP_THRESHOLD = 0.98;     // Peak threshold for clipping detection

export function useMicRecorder(onError?: (msg: string) => void): MicRecorder {
  const [state, setState] = useState<RecorderState>({
    isRecording: false,
    isPaused: false,
    duration: 0,
    vuLevel: 0,
    isClipping: false,
    isNoisy: false,
    audioBlob: null,
    audioUrl: null,
    mimeType: '',
  });

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);
  const durationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Device enumeration
  const [devices, setDevices] = useState<AudioDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);

  const permissionGrantedRef = useRef(false);

  const refreshDevices = useCallback(async () => {
    try {
      if (!navigator.mediaDevices?.enumerateDevices) return;

      // Sin permiso previo, los labels vienen vacíos.
      // Pedimos un stream temporal para obtener permiso.
      if (!permissionGrantedRef.current) {
        try {
          const tmp = await navigator.mediaDevices.getUserMedia({ audio: true });
          tmp.getTracks().forEach(t => t.stop());
          permissionGrantedRef.current = true;
        } catch { /* el usuario negó, enumeramos igual */ }
      }

      const all = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = all
        .filter(d => d.kind === 'audioinput' && d.deviceId)
        .map((d, i) => ({
          deviceId: d.deviceId,
          label: d.label || `Microphone ${i + 1}`,
        }));
      setDevices(audioInputs);

      if (!selectedDeviceId && audioInputs.length > 0) {
        const def = audioInputs.find(d => d.deviceId === 'default');
        setSelectedDeviceId(def?.deviceId || audioInputs[0].deviceId);
      }
    } catch { /* ignore */ }
  }, [selectedDeviceId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (durationTimerRef.current) clearInterval(durationTimerRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      if (audioContextRef.current) audioContextRef.current.close();
      if (state.audioUrl) URL.revokeObjectURL(state.audioUrl);
    };
  }, []);

  const analyzeAudio = useCallback(() => {
    if (!analyserRef.current) return;
    const analyser = analyserRef.current;
    const dataArray = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(dataArray);

    let peak = 0;
    let sumSquares = 0;
    for (let i = 0; i < dataArray.length; i++) {
      const abs = Math.abs(dataArray[i]);
      if (abs > peak) peak = abs;
      sumSquares += dataArray[i] * dataArray[i];
    }
    const rms = Math.sqrt(sumSquares / dataArray.length);

    setState(prev => ({
      ...prev,
      vuLevel: Math.min(1, peak),
      isClipping: peak > CLIP_THRESHOLD,
      isNoisy: rms > NOISE_THRESHOLD && peak < 0.1, // noise but no speech signal
    }));

    if (mediaRecorderRef.current?.state === 'recording') {
      rafRef.current = requestAnimationFrame(analyzeAudio);
    }
  }, []);

  const start = useCallback(async () => {
    // Cleanup previous
    if (state.audioUrl) URL.revokeObjectURL(state.audioUrl);
    chunksRef.current = [];

    // Check browser support
    if (!navigator.mediaDevices?.getUserMedia) {
      onError?.('Microphone API not available in this browser/WebView');
      return;
    }

    let stream: MediaStream;
    try {
      const audioConstraints: MediaTrackConstraints = {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      };
      if (selectedDeviceId) {
        audioConstraints.deviceId = { exact: selectedDeviceId };
      }
      stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
      // Refrescar labels después de obtener permiso
      refreshDevices();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      onError?.(`Microphone access denied: ${msg}`);
      return;
    }
    streamRef.current = stream;

    // Web Audio API for analysis
    const ctx = new AudioContext();
    audioContextRef.current = ctx;
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);
    analyserRef.current = analyser;

    // MediaRecorder — find supported mime type
    let mimeType = '';
    for (const mime of ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg', 'audio/mp4', '']) {
      if (mime === '' || MediaRecorder.isTypeSupported(mime)) {
        mimeType = mime;
        break;
      }
    }

    let recorder: MediaRecorder;
    try {
      recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      onError?.(`MediaRecorder init failed: ${msg}`);
      stream.getTracks().forEach(t => t.stop());
      ctx.close();
      return;
    }
    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = () => {
      const actualMime = recorder.mimeType || mimeType || 'audio/ogg';
      const blob = new Blob(chunksRef.current, { type: actualMime });
      const url = URL.createObjectURL(blob);
      setState(prev => ({
        ...prev,
        isRecording: false,
        audioBlob: blob,
        audioUrl: url,
        mimeType: actualMime,
        vuLevel: 0,
        isClipping: false,
        isNoisy: false,
      }));

      // Cleanup stream & context
      stream.getTracks().forEach(t => t.stop());
      ctx.close();
      if (durationTimerRef.current) clearInterval(durationTimerRef.current);
    };

    recorder.onerror = (e) => {
      onError?.(`Recording error: ${(e as ErrorEvent).message || 'unknown'}`);
    };

    recorder.start(100); // chunks cada 100ms
    startTimeRef.current = Date.now();

    setState(prev => ({
      ...prev,
      isRecording: true,
      isPaused: false,
      duration: 0,
      audioBlob: null,
      audioUrl: null,
      vuLevel: 0,
      isClipping: false,
      isNoisy: false,
    }));

    // Duration timer
    durationTimerRef.current = setInterval(() => {
      setState(prev => ({
        ...prev,
        duration: (Date.now() - startTimeRef.current) / 1000,
      }));
    }, 100);

    // Start VU analysis
    rafRef.current = requestAnimationFrame(analyzeAudio);
  }, [state.audioUrl, analyzeAudio, onError, selectedDeviceId, refreshDevices]);

  const stop = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (durationTimerRef.current) clearInterval(durationTimerRef.current);
  }, []);

  const reset = useCallback(() => {
    if (state.audioUrl) URL.revokeObjectURL(state.audioUrl);
    chunksRef.current = [];
    setState({
      isRecording: false,
      isPaused: false,
      duration: 0,
      vuLevel: 0,
      isClipping: false,
      isNoisy: false,
      audioBlob: null,
      audioUrl: null,
      mimeType: '',
    });
  }, [state.audioUrl]);

  return { state, devices, selectedDeviceId, setSelectedDeviceId, refreshDevices, start, stop, reset };
}
