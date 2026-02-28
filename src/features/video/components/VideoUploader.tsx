import { ReactNode, useMemo, useState } from 'react';
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
    setProgress(0);
    setProgressText(t('video.uploading'));

    try {
      const videoId = await videoService.upload(currentProjectId, selectedPath, fps);

      setProgressText(t('video.extracting'));

      const unlisten = await listen<{ progress: number; current: number; total: number }>(
        'video:extraction-progress',
        (event) => {
          setProgress(event.payload.progress);
          setProgressText(
            t('video.extractingFrame', {
              current: event.payload.current,
              total: event.payload.total,
            })
          );
        }
      );

      await videoService.extractFrames(currentProjectId, videoId);
      unlisten();

      setProgress(100);
      setProgressText(t('video.done'));
    } catch (error) {
      console.error('Error procesando video:', error);
      setProgressText(`Error: ${error}`);
    } finally {
      setTimeout(() => {
        setIsProcessing(false);
        setProgress(0);
        setProgressText('');
        setVideoInfo(null);
      }, 1500);
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

      {/* Progress dialog — siempre montado, controlado por open */}
      <Dialog open={isProcessing} onOpenChange={() => {}}>
        <DialogContent
          className="sm:max-w-[400px]"
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>{t('video.processing')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Progress value={progress} className="h-3" />
            <p className="text-sm text-center text-muted-foreground">
              {progressText}
            </p>
            <p className="text-xs text-center text-muted-foreground/60">
              {progress > 0 && progress < 100 && `${progress}%`}
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
