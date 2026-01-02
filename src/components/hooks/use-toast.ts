// Stub toast hook for Shadcn Toaster component
// Not used in FASE 1, but required for toaster.tsx to compile

import { useState } from 'react';

export interface Toast {
  id: string;
  title?: string;
  description?: string;
  action?: React.ReactNode;
  [key: string]: any;
}

export function useToast() {
  const [toasts] = useState<Toast[]>([]);

  return {
    toasts,
    toast: (_: Partial<Toast>) => {},
    dismiss: (_: string) => {},
  };
}
