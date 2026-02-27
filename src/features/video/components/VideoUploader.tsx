import { ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { listen } from '@tauri-apps/api/event';
import { useUIStore } from '../../core/store/uiStore';
import { videoService } from '../services/videoService';
import { pickVideo } from '@/lib/nativeDialogs';
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
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressText, setProgressText] = useState('');
  const [ffmpegAvailable, setFfmpegAvailable] = useState<boolean | null>(null);

  const handleClick = async () => {
    if (!currentProjectId || isProcessing) return;

    // Check ffmpeg
    if (ffmpegAvailable === null) {
      const available = await videoService.checkFfmpeg();
      setFfmpegAvailable(available);
      if (!available) {
        alert('ffmpeg no encontrado en PATH. Instálalo para usar videos.');
        return;
      }
    } else if (!ffmpegAvailable) {
      alert('ffmpeg no encontrado en PATH. Instálalo para usar videos.');
      return;
    }

    const filePath = await pickVideo();
    if (!filePath) return;

    setSelectedPath(filePath);
    setShowFpsDialog(true);
  };

  const handleConfirm = async () => {
    if (!currentProjectId || !selectedPath) return;

    setShowFpsDialog(false);
    setIsProcessing(true);
    setProgress(0);
    setProgressText('Subiendo video...');

    try {
      const videoId = await videoService.upload(currentProjectId, selectedPath, fps);

      setProgressText('Extrayendo frames...');

      const unlisten = await listen<{ progress: number; current: number; total: number }>(
        'video:extraction-progress',
        (event) => {
          setProgress(event.payload.progress);
          setProgressText(`Extrayendo frame ${event.payload.current} / ${event.payload.total}`);
        }
      );

      await videoService.extractFrames(currentProjectId, videoId);
      unlisten();

      setProgress(100);
      setProgressText('Listo');
    } catch (error) {
      console.error('Error procesando video:', error);
      setProgressText(`Error: ${error}`);
    } finally {
      setTimeout(() => {
        setIsProcessing(false);
        setProgress(0);
        setProgressText('');
      }, 1500);
    }
  };

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
              {t('video.upload', 'Subir video')}
            </>
          )}
        </Button>
      )}

      {/* FPS Dialog */}
      <Dialog open={showFpsDialog} onOpenChange={setShowFpsDialog}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>{t('video.fpsTitle', 'Configurar extracción')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{t('video.fpsLabel', 'Frames por segundo a extraer')}</Label>
              <Input
                type="number"
                min={1}
                max={60}
                step={1}
                value={fps}
                onChange={(e) => setFps(Number(e.target.value))}
              />
              <p className="text-xs text-muted-foreground">
                {t('video.fpsHelp', 'Valores bajos = menos frames, más rápido. Recomendado: 2-10 FPS')}
              </p>
            </div>
            <div className="text-sm text-muted-foreground">
              <i className="fas fa-file-video mr-1"></i>
              {selectedPath?.split('/').pop() || selectedPath?.split('\\').pop()}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowFpsDialog(false)}>
                {t('common.cancel', 'Cancelar')}
              </Button>
              <Button onClick={handleConfirm}>
                {t('video.extract', 'Extraer frames')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Progress overlay */}
      {isProcessing && (
        <Dialog open={isProcessing}>
          <DialogContent className="sm:max-w-[400px]" onPointerDownOutside={(e) => e.preventDefault()}>
            <DialogHeader>
              <DialogTitle>{t('video.processing', 'Procesando video')}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <Progress value={progress} />
              <p className="text-sm text-center text-muted-foreground">{progressText}</p>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
