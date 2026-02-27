import { useState, useRef, useCallback } from 'react';
import { extractFrames, ExtractionOptions, calculateTimestamps, getVideoInfo, VideoInfo } from '../services/videoService';
import { imageService } from '../services/imageService';
import { useUIStore } from '../../core/store/uiStore';

interface VideoImportState {
  isExtracting: boolean;
  isProcessingFFmpeg: boolean; // true while FFmpeg runs (before frames start yielding)
  progress: number;            // 0-100
  totalFrames: number;
  extractedCount: number;
  currentVideoName: string;
}

export function useVideoImport() {
  const { currentProjectId } = useUIStore();
  const [state, setState] = useState<VideoImportState>({
    isExtracting: false,
    isProcessingFFmpeg: false,
    progress: 0,
    totalFrames: 0,
    extractedCount: 0,
    currentVideoName: '',
  });
  const abortRef = useRef<AbortController | null>(null);

  const importVideo = useCallback(async (
    file: File,
    options: Omit<ExtractionOptions, 'signal'>,
    videoInfo: VideoInfo
  ) => {
    if (!currentProjectId) return;

    const abortController = new AbortController();
    abortRef.current = abortController;

    const timestamps = calculateTimestamps(videoInfo.duration, options);
    const total = timestamps.length;
    const baseName = file.name.replace(/\.[^/.]+$/, '');

    setState({
      isExtracting: true,
      isProcessingFFmpeg: !videoInfo.nativeSupport,
      progress: 0,
      totalFrames: total,
      extractedCount: 0,
      currentVideoName: file.name,
    });

    try {
      let count = 0;
      const generator = extractFrames(
        file,
        { ...options, signal: abortController.signal },
        videoInfo.nativeSupport
      );

      for await (const frame of generator) {
        if (abortController.signal.aborted) break;

        // First frame arrived = FFmpeg processing phase is done
        if (state.isProcessingFFmpeg || count === 0) {
          setState(prev => ({ ...prev, isProcessingFFmpeg: false }));
        }

        const paddedIndex = String(frame.frameIndex + 1).padStart(5, '0');
        const frameName = `${baseName}_frame_${paddedIndex}.jpg`;

        await imageService.create({
          projectId: currentProjectId,
          name: frameName,
          image: frame.blob,
          annotations: [],
          width: frame.width,
          height: frame.height,
        });

        count++;
        setState(prev => ({
          ...prev,
          extractedCount: count,
          progress: Math.round((count / total) * 100),
        }));
      }
    } finally {
      abortRef.current = null;
      setState(prev => ({
        ...prev,
        isExtracting: false,
        isProcessingFFmpeg: false,
      }));
    }
  }, [currentProjectId]);

  const cancelExtraction = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return {
    ...state,
    importVideo,
    cancelExtraction,
  };
}
