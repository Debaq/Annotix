import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { BackendMeta } from '../../data/backendsData';

interface Props {
  backend: BackendMeta | null;
  open: boolean;
  onClose: () => void;
}

export function ScriptViewerDialog({ backend, open, onClose }: Props) {
  const { t } = useTranslation();
  if (!backend) return null;

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl p-0 gap-0 bg-card border-border overflow-hidden">
        <DialogHeader className="px-4 py-3 bg-muted/30 border-b border-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <i className={`${backend.icon} ${backend.iconColor} text-sm`} />
              <DialogTitle className="text-sm font-medium text-foreground">{backend.name}</DialogTitle>
              <span className="text-[11px] text-muted-foreground font-mono">train.py</span>
            </div>
            <span className="text-[10px] text-muted-foreground">{t('settings.trainingModels.readOnly')}</span>
          </div>
        </DialogHeader>
        <pre className="p-4 text-[12px] leading-relaxed overflow-auto max-h-[60vh] bg-muted/10">
          <code className="text-foreground font-mono whitespace-pre">{backend.scriptTemplate}</code>
        </pre>
      </DialogContent>
    </Dialog>
  );
}
