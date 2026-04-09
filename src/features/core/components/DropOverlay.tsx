import { useTranslation } from 'react-i18next';
import { useUIStore } from '../store/uiStore';

interface DropOverlayProps {
  isDragging: boolean;
  isUploading: boolean;
  fileCount: number;
}

export function DropOverlay({ isDragging, isUploading, fileCount }: DropOverlayProps) {
  const { t } = useTranslation();
  const currentProjectId = useUIStore(s => s.currentProjectId);

  if (!isDragging && !isUploading) return null;

  if (isUploading) {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 pointer-events-none">
        <div className="bg-background border-2 border-primary rounded-2xl px-8 py-6 text-center shadow-2xl">
          <i className="fas fa-spinner fa-spin text-3xl text-primary mb-3 block"></i>
          <p className="text-sm font-medium">{t('gallery.uploading')}</p>
          <p className="text-xs text-muted-foreground mt-1">{fileCount} {t('gallery.imageCount', { count: fileCount })}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 pointer-events-none">
      <div className="border-4 border-dashed border-primary rounded-3xl px-12 py-10 text-center bg-background/90 shadow-2xl">
        <i className="fas fa-cloud-arrow-up text-5xl text-primary mb-4 block"></i>
        {currentProjectId ? (
          <>
            <p className="text-lg font-semibold">{t('gallery.dropImages')}</p>
            <p className="text-sm text-muted-foreground mt-1">
              {fileCount > 0 && `${fileCount} `}{t('gallery.dropHint')}
            </p>
          </>
        ) : (
          <p className="text-lg font-semibold text-muted-foreground">{t('gallery.dropNoProject')}</p>
        )}
      </div>
    </div>
  );
}
