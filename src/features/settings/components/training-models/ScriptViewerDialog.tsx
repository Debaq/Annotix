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
      <DialogContent className="max-w-2xl p-0 gap-0 bg-[#1e1e2e] border-[#313244] overflow-hidden">
        <DialogHeader className="px-4 py-3 bg-[#181825] border-b border-[#313244]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <i className={`${backend.icon} ${backend.iconColor} text-sm`} />
              <DialogTitle className="text-sm font-medium text-[#cdd6f4]">{backend.name}</DialogTitle>
              <span className="text-[11px] text-[#6c7086] font-mono">train.py</span>
            </div>
            <span className="text-[10px] text-[#6c7086]">{t('settings.trainingModels.readOnly')}</span>
          </div>
        </DialogHeader>
        <pre className="p-4 text-[12px] leading-relaxed overflow-auto max-h-[60vh]">
          <code className="text-[#cdd6f4] font-mono whitespace-pre">{backend.scriptTemplate}</code>
        </pre>
      </DialogContent>
    </Dialog>
  );
}
