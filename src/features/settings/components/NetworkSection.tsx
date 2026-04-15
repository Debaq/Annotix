import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useTranslation } from 'react-i18next';

interface AppConfig {
  serve: {
    autoStart: boolean;
    port: number;
    autoSave: boolean;
    projectIds: string[];
  };
  p2pDisabled: boolean;
}

export function NetworkSection() {
  const { t } = useTranslation();
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    invoke<AppConfig>('get_config').then(setConfig).catch(() => {});
  }, []);

  const save = async (updates: Partial<AppConfig>) => {
    if (!config) return;
    setSaving(true);
    try {
      const updated = { ...config, ...updates };
      // Guardar serve config
      if (updates.serve) {
        updated.serve = { ...config.serve, ...updates.serve };
      }
      await invoke('save_network_config', {
        serveAutoStart: updated.serve.autoStart,
        servePort: updated.serve.port,
        serveAutoSave: updated.serve.autoSave,
        p2pDisabled: updated.p2pDisabled,
      });
      setConfig(updated);
    } catch (e) {
      console.error('Error guardando config:', e);
    } finally {
      setSaving(false);
    }
  };

  if (!config) return <div className="text-muted-foreground text-sm">Cargando...</div>;

  return (
    <div className="space-y-6">
      {/* Servidor de Red */}
      <div className="rounded-lg border border-[var(--annotix-border)] bg-[var(--annotix-white)] p-5">
        <h3 className="text-sm font-semibold text-[var(--annotix-dark)] mb-1 flex items-center gap-2">
          <i className="fas fa-wifi text-[var(--annotix-primary)]" />
          Servidor de red (Compartir)
        </h3>
        <p className="text-xs text-muted-foreground mb-4">
          Permite que dispositivos en la red local anoten imágenes desde el navegador.
        </p>

        <div className="space-y-4">
          {/* Auto-start */}
          <label className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-[var(--annotix-dark)]">Iniciar al abrir la app</div>
              <div className="text-xs text-muted-foreground">El servidor se inicia automáticamente al abrir Annotix</div>
            </div>
            <button
              onClick={() => save({ serve: { ...config.serve, autoStart: !config.serve.autoStart } })}
              className={`relative w-11 h-6 rounded-full transition-colors ${config.serve.autoStart ? 'bg-[var(--annotix-primary)]' : 'bg-gray-300'}`}
            >
              <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${config.serve.autoStart ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
            </button>
          </label>

          {/* Puerto */}
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-[var(--annotix-dark)]">Puerto</div>
              <div className="text-xs text-muted-foreground">Puerto TCP para el servidor</div>
            </div>
            <input
              type="number"
              value={config.serve.port}
              onChange={e => save({ serve: { ...config.serve, port: Number(e.target.value) } })}
              className="w-24 h-8 px-2 rounded border border-[var(--annotix-border)] text-sm text-center"
              min={1024} max={65535}
            />
          </div>

          {/* Auto-save */}
          <label className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-[var(--annotix-dark)]">Guardado automático</div>
              <div className="text-xs text-muted-foreground">Las anotaciones se sincronizan al instante</div>
            </div>
            <button
              onClick={() => save({ serve: { ...config.serve, autoSave: !config.serve.autoSave } })}
              className={`relative w-11 h-6 rounded-full transition-colors ${config.serve.autoSave ? 'bg-[var(--annotix-primary)]' : 'bg-gray-300'}`}
            >
              <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${config.serve.autoSave ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
            </button>
          </label>
        </div>
      </div>

      {/* P2P */}
      <div className="rounded-lg border border-[var(--annotix-border)] bg-[var(--annotix-white)] p-5">
        <h3 className="text-sm font-semibold text-[var(--annotix-dark)] mb-1 flex items-center gap-2">
          <i className="fas fa-network-wired text-[var(--annotix-info)]" />
          Colaboración P2P
        </h3>
        <p className="text-xs text-muted-foreground mb-4">
          Sincronización peer-to-peer para trabajo colaborativo en tiempo real.
        </p>

        <label className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-[var(--annotix-dark)]">Habilitar P2P</div>
            <div className="text-xs text-muted-foreground">
              {config.p2pDisabled
                ? 'Las sesiones P2P no se reanudarán al iniciar la app'
                : 'Las sesiones P2P se reanudan automáticamente al iniciar'}
            </div>
          </div>
          <button
            onClick={() => save({ p2pDisabled: !config.p2pDisabled })}
            className={`relative w-11 h-6 rounded-full transition-colors ${!config.p2pDisabled ? 'bg-[var(--annotix-primary)]' : 'bg-gray-300'}`}
          >
            <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${!config.p2pDisabled ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
          </button>
        </label>
      </div>

      {saving && <div className="text-xs text-muted-foreground text-center">Guardando...</div>}
    </div>
  );
}
