import { useConfirmStore } from '@/features/core/store/useConfirmStore';

interface ConfirmOptions {
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  kind?: 'info' | 'warning' | 'destructive';
}

/**
 * Reemplazo para confirm() nativo que usa un diálogo con tema de la app
 */
export async function confirm(message: string, options?: ConfirmOptions): Promise<boolean> {
  return useConfirmStore.getState().confirm({
    message,
    ...options,
  });
}
