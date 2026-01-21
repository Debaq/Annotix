import React, { useState, useEffect } from 'react';
import { ShortcutsModal } from './ShortcutsModal';
import { useShortcut } from '@/features/core/hooks/useShortcuts';

/**
 * Componente principal que gestiona los atajos de teclado
 * Se integra fácilmente en la aplicación y proporciona acceso al modal
 */
export const ShortcutsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [showShortcutsModal, setShowShortcutsModal] = useState(false);

  // Atajo para abrir el modal (? o /)
  useShortcut(
    'help',
    () => setShowShortcutsModal(true),
    [setShowShortcutsModal]
  );

  // Escuchar la tecla ? para abrir el modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.key === '?' || e.key === '/') && !e.ctrlKey && !e.metaKey) {
        // Verificar que no estamos en un input
        if (!(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
          setShowShortcutsModal(true);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <>
      {children}
      <ShortcutsModal open={showShortcutsModal} onOpenChange={setShowShortcutsModal} />
    </>
  );
};

export default ShortcutsProvider;
