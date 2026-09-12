import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { listen } from '@tauri-apps/api/event';
import { useUIStore } from '../../core/store/uiStore';
import { videoService } from '../services/videoService';
import { pickVideo } from '@/lib/nativeDialogs';
import type { VideoInfo } from '@/lib/db';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';

interface VideoUploaderProps {
  trigger?: ReactNode;
}

export function VideoUploader({ trigger }: VideoUploaderProps) {
  const { t } = useTranslation();
  const { currentProjectId } = useUIStore();
  const [showFpsDialog, setShowFpsDialog] = useState(false);
  const [fps, setFps] = useState(5);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressText, setProgressText] = useState('');
  const [extractingVideoId, setExtractingVideoId] = useState<string | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);

  // `isCancelling` se lee dentro de un async: el state capturado en el closure
  // sería el de antes de pulsar Cancelar.
  const isCancellingRef = useRef(false);
  useEffect(() => {
    isCancellingRef.current = isCancelling;
  }, [isCancelling]);

  const estimatedFrames = useMemo(() => {
    if (!videoInfo || !videoInfo.durationMs || fps <= 0) return 0;
    return Math.ceil((videoInfo.durationMs / 1000) * fps);
  }, [videoInfo, fps]);

  const handleClick = async () => {
    if (!currentProjectId || isProcessing) return;

    const filePath = await pickVideo();
    if (!filePath) return;

    setSelectedPath(filePath);

    try {
      const info = await videoService.getVideoInfo(filePath);
      setVideoInfo(info);
    } catch {
      setVideoInfo(null);
    }

    setShowFpsDialog(true);
  };

  const handleConfirm = async () => {
    if (!currentProjectId || !selectedPath) return;

    setShowFpsDialog(false);
    setIsProcessing(true);
    setIsCancelling(false);
    setProgress(0);
    setProgressText(t('video.uploading'));

    // El listener se suelta en el finally: si la extracción lanzaba, antes
    // quedaba vivo hasta recargar la aplicación.
    let unlisten: (() => void) | null = null;

    try {
      const videoId = await videoService.upload(currentProjectId, selectedPath, fps);
      setExtractingVideoId(videoId);
      setProgressText(t('video.extracting'));

      unlisten = await listen<{
        videoId: string;
        progress: number;
        current: number;
        total: number;
        cancelled?: boolean;
      }>('video:extraction-progress', (event) => {
        if (event.payload.videoId !== videoId) return;
        if (event.payload.cancelled) return;
        setProgress(event.payload.progress);
        setProgressText(
          t('video.extractingFrame', {
            current: event.payload.current,
            total: event.payload.total,
          })
        );
      });

      const extracted = await videoService.extractFrames(currentProjectId, videoId);

      if (isCancellingRef.current) {
        setProgressText(t('video.extractionCancelled', { count: extracted }));
      } else {
        setProgress(100);
        setProgressText(t('video.done'));
      }
    } catch (error) {
      console.error('Error procesando video:', error);
      setProgressText(`Error: ${error}`);
    } finally {
      unlisten?.();
      setExtractingVideoId(null);
      setTimeout(() => {
        setIsProcessing(false);
        setIsCancelling(false);
        setProgress(0);
        setProgressText('');
        setVideoInfo(null);
      }, 1500);
    }
  };

  const handleCancelExtraction = async () => {
    if (!extractingVideoId) return;
    setIsCancelling(true);
    setProgressText(t('video.cancelling'));
    try {
      await videoService.cancelExtraction(extractingVideoId);
    } catch (error) {
      console.error('Error cancelando extracción:', error);
      setIsCancelling(false);
    }
  };

  const fileName = selectedPath?.split('/').pop() || selectedPath?.split('\\').pop();
  const durationSec = videoInfo ? (videoInfo.durationMs / 1000).toFixed(1) : null;

  return (
    <>
      {trigger ? (
        <div onClick={handleClick}>{trigger}</div>
      ) : (
        <Button onClick={handleClick} disabled={isProcessing} variant="outline" className="w-full">
          {isProcessing ? (
            <>
              <i className="fas fa-spinner fa-spin mr-2"></i>
              {progressText || t('common.loading')}
            </>
          ) : (
            <>
              <i className="fas fa-video mr-2"></i>
              {t('video.upload')}
            </>
          )}
        </Button>
      )}

      {/* FPS Dialog */}
      <Dialog open={showFpsDialog} onOpenChange={setShowFpsDialog}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>{t('video.fpsTitle')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* Info del video */}
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <i className="fas fa-file-video"></i>
              <span className="truncate font-medium">{fileName}</span>
            </div>
            {videoInfo && (
              <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                <div className="rounded-md bg-muted px-2 py-1.5 text-center">
                  <div className="font-medium text-foreground">{videoInfo.width}x{videoInfo.height}</div>
                  <div>{t('video.resolution')}</div>
                </div>
                <div className="rounded-md bg-muted px-2 py-1.5 text-center">
                  <div className="font-medium text-foreground">{durationSec}s</div>
                  <div>{t('video.duration')}</div>
                </div>
                <div className="rounded-md bg-muted px-2 py-1.5 text-center">
                  <div className="font-medium text-foreground">{videoInfo.fpsOriginal.toFixed(1)}</div>
                  <div>FPS</div>
                </div>
              </div>
            )}

            {/* FPS selector */}
            <div className="space-y-2">
              <Label>{t('video.fpsLabel')}</Label>
              <Input
                type="number"
                min={1}
                max={60}
                step={1}
                value={fps}
                onChange={(e) => setFps(Math.max(1, Number(e.target.value)))}
              />
              <p className="text-xs text-muted-foreground">
                {t('video.fpsHelp')}
              </p>
            </div>

            {/* Estimación dinámica */}
            {estimatedFrames > 0 && (
              <div className="rounded-md border border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950 px-3 py-2">
                <p className="text-sm font-medium text-blue-700 dark:text-blue-300">
                  <i className="fas fa-images mr-1.5"></i>
                  {t('video.estimatedFrames', { count: estimatedFrames })}
                </p>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowFpsDialog(false)}>
                {t('common.cancel')}
              </Button>
              <Button onClick={handleConfirm}>
                <i className="fas fa-scissors mr-2"></i>
                {t('video.extract')}
                {estimatedFrames > 0 && ` (${estimatedFrames})`}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Progress toast — no bloqueante, permite trabajar mientras extrae */}
      {isProcessing && (
        <div className="fixed bottom-4 right-4 z-50 w-80 rounded-lg border bg-background p-4 shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium">{t('video.processing')}</p>
            {progress > 0 && progress < 100 && (
              <span className="text-xs text-muted-foreground">{progress}%</span>
            )}
          </div>
          <Progress value={progress} className="h-2" />
          <p className="text-xs text-muted-foreground mt-1.5">
            {progressText}
          </p>
          {extractingVideoId && (
            <Button
              variant="outline"
              size="sm"
              className="w-full mt-2"
              onClick={handleCancelExtraction}
              disabled={isCancelling}
            >
              <i className="fas fa-stop mr-2"></i>
              {isCancelling ? t('video.cancelling') : t('video.cancelExtraction')}
            </Button>
          )}
        </div>
      )}
    </>
  );
}
