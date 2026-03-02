import { useTranslation } from 'react-i18next';
import { useConfirmStore } from '../store/useConfirmStore';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export function ConfirmDialog() {
  const { t } = useTranslation();
  const { isOpen, options, close } = useConfirmStore();

  if (!options) return null;

  const handleConfirm = () => close(true);
  const handleCancel = () => close(false);

  const getVariant = () => {
    switch (options.kind) {
      case 'destructive':
      case 'warning':
        return 'destructive';
      default:
        return 'default';
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleCancel()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {options.title || t('common.confirmTitle', 'Confirm Action')}
          </DialogTitle>
          <DialogDescription className="pt-2 text-foreground">
            {options.message}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" onClick={handleCancel}>
            {options.cancelLabel || t('common.cancel')}
          </Button>
          <Button variant={getVariant()} onClick={handleConfirm}>
            {options.confirmLabel || t('common.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
