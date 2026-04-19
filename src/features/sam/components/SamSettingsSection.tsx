import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { open } from '@tauri-apps/plugin-dialog';
import { Wand2, Trash2 } from 'lucide-react';
import {
  samListAppModels,
  samUploadAppModel,
  samDeleteAppModel,
  samLoadModel,
  samClearCache,
  type SamAppModel,
} from '@/lib/tauriDb';
import { useSamStore } from '../store/useSamStore';
import { useToast } from '@/components/hooks/use-toast';

export function SamSettingsSection() {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [models, setModels] = useState<SamAppModel[]>([]);
  const [encoderId, setEncoderId] = useState<string>('');
  const [decoderId, setDecoderId] = useState<string>('');
  const [loadingPair, setLoadingPair] = useState(false);
  const [uploading, setUploading] = useState<'encoder' | 'decoder' | null>(null);

  const pairId = useSamStore((s) => s.pairId);
  const setPairId = useSamStore((s) => s.setPairId);
  const hqMode = useSamStore((s) => s.hqMode);
  const setHqMode = useSamStore((s) => s.setHqMode);
  const reset = useSamStore((s) => s.reset);

  const refresh = useCallback(async () => {
    try {
      const list = await samListAppModels();
      setModels(list);
    } catch (e) {
      toast({ title: String(e), variant: 'destructive' });
    }
  }, [toast]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const encoders = models.filter((m) => m.kind === 'encoder');
  const decoders = models.filter((m) => m.kind === 'decoder');

  const handleUpload = async (kind: 'encoder' | 'decoder') => {
    try {
      const file = await open({
        title: t('sam.section.selectOnnx'),
        filters: [{ name: 'ONNX', extensions: ['onnx'] }],
      });
      if (!file) return;
      const filePath = typeof file === 'string' ? file : (file as any).path ?? '';
      if (!filePath) return;
      const baseName = filePath.split(/[\\/]/).pop() || 'model.onnx';
      setUploading(kind);
      const entry = await samUploadAppModel(filePath, baseName, kind);
      await refresh();
      if (kind === 'encoder') setEncoderId(entry.id);
      else setDecoderId(entry.id);
      toast({ title: `${kind}: ${entry.name}`, duration: 2500 });
    } catch (e) {
      toast({ title: String(e), variant: 'destructive', duration: 6000 });
    } finally {
      setUploading(null);
    }
  };

  const handleDelete = async (m: SamAppModel) => {
    if (!window.confirm(t('sam.section.deleteConfirm', { name: m.name }))) return;
    try {
      await samDeleteAppModel(m.id);
      await refresh();
      if (encoderId === m.id) setEncoderId('');
      if (decoderId === m.id) setDecoderId('');
      if (pairId && pairId.includes(m.id)) setPairId(null);
    } catch (e) {
      toast({ title: String(e), variant: 'destructive' });
    }
  };

  const handleLoadPair = async () => {
    if (!encoderId || !decoderId) return;
    setLoadingPair(true);
    try {
      const id = await samLoadModel(encoderId, decoderId);
      setPairId(id);
      toast({ title: t('sam.section.pairLoaded'), duration: 3000 });
    } catch (e) {
      toast({ title: String(e), variant: 'destructive', duration: 6000 });
    } finally {
      setLoadingPair(false);
    }
  };

  const handleClearCache = async () => {
    try {
      await samClearCache();
      reset();
      toast({ title: t('sam.section.clearCache'), duration: 2000 });
    } catch (e) {
      toast({ title: String(e), variant: 'destructive' });
    }
  };

  const fmtSize = (b: number) =>
    b > 1024 * 1024 ? `${(b / (1024 * 1024)).toFixed(1)} MB` : `${(b / 1024).toFixed(0)} KB`;

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Wand2 className="h-4 w-4" style={{ color: '#7c3aed' }} />
          <span className="font-medium text-[var(--annotix-dark)]">
            {t('sam.section.title')}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">{t('sam.section.appLevelHint')}</p>
      </div>

      {/* Encoders */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium">{t('sam.section.encoders')}</label>
          <button
            className="annotix-btn annotix-btn-outline text-xs"
            disabled={uploading === 'encoder'}
            onClick={() => handleUpload('encoder')}
          >
            {uploading === 'encoder' ? '...' : t('sam.section.uploadEncoder')}
          </button>
        </div>
        {encoders.length === 0 ? (
          <div className="text-xs text-muted-foreground italic">
            {t('sam.section.empty')}
          </div>
        ) : (
          <div className="space-y-1">
            {encoders.map((m) => (
              <ModelRow
                key={m.id}
                m={m}
                selected={encoderId === m.id}
                onSelect={() => setEncoderId(m.id)}
                onDelete={() => handleDelete(m)}
                fmtSize={fmtSize}
              />
            ))}
          </div>
        )}
      </div>

      {/* Decoders */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium">{t('sam.section.decoders')}</label>
          <button
            className="annotix-btn annotix-btn-outline text-xs"
            disabled={uploading === 'decoder'}
            onClick={() => handleUpload('decoder')}
          >
            {uploading === 'decoder' ? '...' : t('sam.section.uploadDecoder')}
          </button>
        </div>
        {decoders.length === 0 ? (
          <div className="text-xs text-muted-foreground italic">
            {t('sam.section.empty')}
          </div>
        ) : (
          <div className="space-y-1">
            {decoders.map((m) => (
              <ModelRow
                key={m.id}
                m={m}
                selected={decoderId === m.id}
                onSelect={() => setDecoderId(m.id)}
                onDelete={() => handleDelete(m)}
                fmtSize={fmtSize}
              />
            ))}
          </div>
        )}
      </div>

      {/* Cargar par */}
      <div className="space-y-2 pt-2 border-t border-[var(--annotix-border)]">
        <button
          className="annotix-btn annotix-btn-primary w-full"
          disabled={!encoderId || !decoderId || loadingPair}
          onClick={handleLoadPair}
        >
          {loadingPair ? '...' : t('sam.section.loadPair')}
        </button>
        {pairId && (
          <div
            className="text-xs p-2 rounded"
            style={{
              background: 'rgba(16, 185, 129, 0.1)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              color: '#059669',
            }}
          >
            {t('sam.section.pairLoaded')}: <span className="font-mono">{pairId}</span>
          </div>
        )}
      </div>

      {/* Opciones */}
      <label className="flex items-center justify-between text-xs cursor-pointer">
        <div className="flex flex-col">
          <span style={{ color: 'var(--annotix-dark)' }}>{t('sam.section.hqMode')}</span>
          <span style={{ color: 'var(--annotix-gray)' }}>{t('sam.section.hqModeHint')}</span>
        </div>
        <input
          type="checkbox"
          checked={hqMode}
          onChange={(e) => setHqMode(e.target.checked)}
        />
      </label>

      <button
        className="annotix-btn annotix-btn-outline w-full"
        onClick={handleClearCache}
      >
        {t('sam.section.clearCache')}
      </button>
    </div>
  );
}

interface ModelRowProps {
  m: SamAppModel;
  selected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  fmtSize: (b: number) => string;
}

function ModelRow({ m, selected, onSelect, onDelete, fmtSize }: ModelRowProps) {
  return (
    <div
      className="flex items-center gap-2 px-3 py-2 rounded text-xs"
      style={{
        background: selected ? 'rgba(124, 58, 237, 0.12)' : 'var(--annotix-gray-light)',
        border: selected
          ? '1px solid rgba(124, 58, 237, 0.4)'
          : '1px solid var(--annotix-border)',
      }}
    >
      <button onClick={onSelect} className="flex-1 text-left">
        <div className="font-medium" style={{ color: selected ? '#7c3aed' : 'var(--annotix-dark)' }}>
          {m.name}
        </div>
        <div className="opacity-60 font-mono text-[10px]">{fmtSize(m.size)}</div>
      </button>
      <button
        onClick={onDelete}
        className="opacity-50 hover:opacity-100 hover:text-red-600"
        title="Delete"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
