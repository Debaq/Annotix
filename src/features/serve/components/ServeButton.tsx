import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { ServeDialog } from './ServeDialog';

interface ServeInfo {
  projectIds: string[];
  port: number;
  urls: string[];
  active: boolean;
  reachable: boolean;
  firewallHelp: string;
  autoSave: boolean;
}

interface Props {
  projectId?: string | null;
}

export const ServeButton: React.FC<Props> = ({ projectId }) => {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(false);
  const [reachable, setReachable] = useState(false);

  useEffect(() => {
    invoke<ServeInfo | null>('get_serve_status').then(s => {
      setActive(!!s?.active);
      setReachable(!!s?.reachable);
    }).catch(() => {});
  }, [open]);

  const dotColor = active ? (reachable ? 'bg-green-500' : 'bg-amber-500') : '';

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="h-9 px-3 rounded bg-white/10 border border-white/20 text-white text-sm hover:bg-white/20 transition-all flex items-center gap-2"
        title={active ? 'Compartiendo en red' : 'Compartir en red'}
      >
        {active && <span className={`w-2 h-2 rounded-full ${dotColor} animate-pulse`} />}
        <i className="fas fa-wifi"></i>
        <span className="hidden sm:inline">{active ? 'Compartiendo' : 'Compartir'}</span>
      </button>
      <ServeDialog projectId={projectId ?? null} open={open} onOpenChange={setOpen} />
    </>
  );
};
