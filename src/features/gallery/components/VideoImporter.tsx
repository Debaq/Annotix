import { ReactNode, useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useVideoImport } from '../hooks/useVideoImport';
import { getVideoInfo, VideoInfo, calculateTimestamps } from '../services/videoService';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Slider } from '@/components/ui/slider';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

interface VideoImporterProps {
  trigger?: ReactNode;
}

type ExtractionMode = 'fps' | 'everyN';

export function VideoImporter({ trigger }: VideoImporterProps) {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoPreviewRef = useRef<HTMLVideoElement>(null);

  const [open, setOpen] = useState(false);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [isLoadingInfo, setIsLoadingInfo] = useState(false);
  const [mode, setMode] = useState<ExtractionMode>('fps');
  const [fpsValue, setFpsValue] = useState(1);
  const [everyNValue, setEveryNValue] = useState(30);
  const [quality, setQuality] = useState(0.85);
  const [error, setError] = useState<string | null>(null);

  const {
    isExtracting,
    isProcessingFFmpeg,
    progress,
    totalFrames,
    extractedCount,
    importVideo,
    cancelExtraction,
  } = useVideoImport();

  // Estimated frame count
  const estimatedFrames = videoInfo
    ? calculateTimestamps(videoInfo.duration, {
        mode,
        value: mode === 'fps' ? fpsValue : everyNValue,
      }).length
    : 0;

  // Cleanup video URL on unmount or when file changes
  useEffect(() => {
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    };
  }, [videoUrl]);

  const handleFileSelect = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const file = files[0];
    setError(null);

    // Validate it's a video by MIME type or file extension
    const videoExtensions = /\.(mp4|webm|ogg|mov|avi|mkv|flv|wmv|m4v|3gp)$/i;
    if (!file.type.startsWith('video/') && !videoExtensions.test(file.name)) {
      setError(t('video.formatError'));
      return;
    }

    setIsLoadingInfo(true);

    try {
      // getVideoInfo tries native first, falls back to FFmpeg.wasm
      const info = await getVideoInfo(file);
      setVideoFile(file);
      setVideoInfo(info);

      // Create preview URL (native preview may not work for FFmpeg-only formats)
      if (videoUrl) URL.revokeObjectURL(videoUrl);
      const url = URL.createObjectURL(file);
      setVideoUrl(url);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      setError(`${t('video.formatError')} ${msg ? `(${msg})` : ''}`);
    } finally {
      setIsLoadingInfo(false);
    }
  }, [t, videoUrl]);

  const handleExtract = async () => {
    if (!videoFile || !videoInfo) return;

    await importVideo(
      videoFile,
      {
        mode,
        value: mode === 'fps' ? fpsValue : everyNValue,
        quality,
      },
      videoInfo
    );

    // Close dialog on completion
    setOpen(false);
    resetState();
  };

  const handleCancel = () => {
    cancelExtraction();
  };

  const resetState = () => {
    setVideoFile(null);
    setVideoInfo(null);
    setError(null);
    setIsLoadingInfo(false);
    if (videoUrl) {
      URL.revokeObjectURL(videoUrl);
      setVideoUrl(null);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen && isExtracting) return;
    setOpen(newOpen);
    if (!newOpen) resetState();
  };

  const formatDuration = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={(e) => handleFileSelect(e.target.files)}
      />

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogTrigger asChild>
          {trigger || (
            <Button variant="outline" size="sm">
              <i className="fas fa-video mr-2"></i>
              {t('video.importVideo')}
            </Button>
          )}
        </DialogTrigger>

        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>
              <i className="fas fa-video mr-2"></i>
              {t('video.importVideo')}
            </DialogTitle>
            <DialogDescription>
              {t('video.extractFrames')}
            </DialogDescription>
          </DialogHeader>

          {/* Extraction in progress */}
          {isExtracting ? (
            <div className="space-y-4 py-4">
              <div className="text-center">
                <i className="fas fa-cog fa-spin text-3xl mb-3" style={{ color: 'var(--annotix-primary)' }}></i>
                {isProcessingFFmpeg ? (
                  <>
                    <p className="text-sm font-medium">{t('video.processingVideo')}</p>
                    <p className="text-xs text-muted-foreground mt-1">FFmpeg</p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-medium">{t('video.extracting')}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {extractedCount} / {totalFrames}
                    </p>
                  </>
                )}
              </div>
              {!isProcessingFFmpeg && <Progress value={progress} className="h-3" />}
              {!isProcessingFFmpeg && (
                <p className="text-center text-xs text-muted-foreground">{progress}%</p>
              )}
              <DialogFooter>
                <Button variant="destructive" onClick={handleCancel}>
                  <i className="fas fa-stop mr-2"></i>
                  {t('video.cancel')}
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4 py-2">
              {/* Loading video info (may involve FFmpeg download) */}
              {isLoadingInfo ? (
                <div className="border-2 border-dashed rounded-lg p-8 text-center">
                  <i className="fas fa-spinner fa-spin text-3xl mb-3" style={{ color: 'var(--annotix-primary)' }}></i>
                  <p className="text-sm font-medium">{t('video.loadingInfo')}</p>
                  <p className="text-xs text-muted-foreground mt-1">{t('video.loadingInfoHint')}</p>
                </div>
              ) : !videoFile ? (
                <div
                  className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <i className="fas fa-film text-4xl mb-3 opacity-30"></i>
                  <p className="text-sm font-medium">{t('video.selectVideo')}</p>
                  <p className="text-xs text-muted-foreground mt-1">{t('video.noVideoSelected')}</p>
                </div>
              ) : (
                <>
                  {/* Video preview (only works for natively supported formats) */}
                  <div className="rounded-lg overflow-hidden bg-black/5">
                    {videoUrl && videoInfo?.nativeSupport && (
                      <video
                        ref={videoPreviewRef}
                        src={videoUrl}
                        className="w-full max-h-[200px] object-contain"
                        controls
                        muted
                      />
                    )}
                    {videoInfo && !videoInfo.nativeSupport && (
                      <div className="p-4 text-center text-xs text-muted-foreground">
                        <i className="fas fa-info-circle mr-1"></i>
                        {t('video.ffmpegMode')}
                      </div>
                    )}
                  </div>

                  {/* Video info */}
                  {videoInfo && (
                    <div className="grid grid-cols-3 gap-2 text-center text-xs">
                      <div className="rounded-md bg-muted p-2">
                        <p className="font-medium">{t('video.duration')}</p>
                        <p className="text-muted-foreground">{formatDuration(videoInfo.duration)}</p>
                      </div>
                      <div className="rounded-md bg-muted p-2">
                        <p className="font-medium">{t('video.resolution')}</p>
                        <p className="text-muted-foreground">{videoInfo.width}x{videoInfo.height}</p>
                      </div>
                      <div className="rounded-md bg-muted p-2">
                        <p className="font-medium">{t('video.estimatedFrames')}</p>
                        <p className="text-muted-foreground">{estimatedFrames}</p>
                      </div>
                    </div>
                  )}

                  {/* Extraction mode */}
                  <div className="space-y-3">
                    <label className="text-sm font-medium">{t('video.extractionMode')}</label>
                    <div className="flex gap-2">
                      <button
                        className={`flex-1 rounded-md px-3 py-2 text-xs font-medium transition-colors ${
                          mode === 'fps'
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted hover:bg-muted/80'
                        }`}
                        onClick={() => setMode('fps')}
                      >
                        {t('video.fps')}
                      </button>
                      <button
                        className={`flex-1 rounded-md px-3 py-2 text-xs font-medium transition-colors ${
                          mode === 'everyN'
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted hover:bg-muted/80'
                        }`}
                        onClick={() => setMode('everyN')}
                      >
                        {t('video.everyNFrames')}
                      </button>
                    </div>

                    {/* Value slider */}
                    {mode === 'fps' ? (
                      <div className="space-y-2">
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>1 FPS</span>
                          <span className="font-medium text-foreground">{fpsValue} FPS</span>
                          <span>30 FPS</span>
                        </div>
                        <Slider
                          value={[fpsValue]}
                          onValueChange={([v]) => setFpsValue(v)}
                          min={1}
                          max={30}
                          step={1}
                        />
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>1</span>
                          <span className="font-medium text-foreground">{everyNValue}</span>
                          <span>100</span>
                        </div>
                        <Slider
                          value={[everyNValue]}
                          onValueChange={([v]) => setEveryNValue(v)}
                          min={1}
                          max={100}
                          step={1}
                        />
                      </div>
                    )}
                  </div>

                  {/* Quality */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">{t('video.quality')}</label>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>10%</span>
                      <span className="font-medium text-foreground">{Math.round(quality * 100)}%</span>
                      <span>100%</span>
                    </div>
                    <Slider
                      value={[quality]}
                      onValueChange={([v]) => setQuality(v)}
                      min={0.1}
                      max={1}
                      step={0.05}
                    />
                  </div>

                  {/* Change video button */}
                  <button
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => {
                      resetState();
                      fileInputRef.current?.click();
                    }}
                  >
                    <i className="fas fa-exchange-alt mr-1"></i>
                    {t('video.addMore')}
                  </button>
                </>
              )}

              {/* Error */}
              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}

              {/* Footer */}
              {!isLoadingInfo && (
                <DialogFooter>
                  <Button variant="outline" onClick={() => handleOpenChange(false)}>
                    {t('common.cancel')}
                  </Button>
                  <Button
                    onClick={handleExtract}
                    disabled={!videoFile || estimatedFrames === 0}
                  >
                    <i className="fas fa-images mr-2"></i>
                    {t('video.extractFrames')} ({estimatedFrames})
                  </Button>
                </DialogFooter>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
