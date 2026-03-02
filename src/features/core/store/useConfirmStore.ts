import { create } from 'zustand';

interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  kind?: 'info' | 'warning' | 'destructive';
}

interface ConfirmState {
  isOpen: boolean;
  options: ConfirmOptions | null;
  resolve: ((value: boolean) => void) | null;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  close: (result: boolean) => void;
}

export const useConfirmStore = create<ConfirmState>((set, get) => ({
  isOpen: false,
  options: null,
  resolve: null,
  confirm: (options) => {
    return new Promise((resolve) => {
      set({
        isOpen: true,
        options,
        resolve,
      });
    });
  },
  close: (result) => {
    const { resolve } = get();
    if (resolve) resolve(result);
    set({ isOpen: false, options: null, resolve: null });
  },
}));
