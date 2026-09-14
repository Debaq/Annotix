import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  getEncryptionState,
  invalidateEncryptionState,
  type EncryptionState,
} from '@/lib/projectEncryption';

interface Avance {
  hechos: number;
  total: number;
  saltados: number;
  fallos: string[];
}

interface Props {
  projectId: string;
}

/**
 * Cifrado en reposo del proyecto.
 *
 * Lo que da: los archivos en disco no se leen sin la frase. Lo que no da —y se
 * dice aquí, no en la documentación— es cumplimiento normativo, ni protección
 * mientras el proyecto está abierto.
 *
 * El punto de no retorno está arriba del todo por una razón: una frase perdida
 * es un proyecto perdido, y no hay recuperación posible. Una puerta trasera
 * valdría igual para quien copie el disco.
 */
export function EncryptionPanel({ projectId }: Props) {
  const { t } = useTranslation();
  const [estado, setEstado] = useState<EncryptionState | null>(null);
  const [frase, setFrase] = useState('');
  const [frase2, setFrase2] = useState('');
  const [etiquetaPublica, setEtiquetaPublica] = useState('');
  const [recordar, setRecordar] = useState(false);
  const [trabajando, setTrabajando] = useState(false);
  const [avance, setAvance] = useState<Avance | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [claveCompartida, setClaveCompartida] = useState<string | null>(null);

  const refrescar = useCallback(() => {
    invalidateEncryptionState(projectId);
    getEncryptionState(projectId).then(setEstado).catch(() => setEstado(null));
  }, [projectId]);

  useEffect(refrescar, [refrescar]);

  useEffect(() => {
    const p = listen<Avance>('crypto:progress', (e) => setAvance(e.payload));
    return () => {
      p.then((off) => off());
    };
  }, []);

  const correr = async (accion: () => Promise<unknown>) => {
    setTrabajando(true);
    setError(null);
    try {
      await accion();
      setFrase('');
      setFrase2('');
      refrescar();
    } catch (e) {
      setError(String(e));
    } finally {
      setTrabajando(false);
      setAvance(null);
    }
  };

  if (!estado) return null;

  // ─── Proyecto en claro: activar ───────────────────────────────────────────
  if (!estado.encrypted) {
    const corta = frase.trim().length < 8;
    const distintas = frase !== frase2;
    return (
      <div className="space-y-3 rounded-lg border border-border/60 p-3">
        <Cabecera icono="fa-lock-open" titulo={t('encryption.title')} />
        <p className="text-xs text-muted-foreground leading-relaxed">
          {t('encryption.intro')}
        </p>
        <Aviso tono="rojo" texto={t('encryption.noReturn')} />
        <Aviso tono="ambar" texto={t('encryption.datasetInClear')} />

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs">{t('encryption.passphrase')}</Label>
            <Input
              type="password"
              className="h-8 text-xs"
              value={frase}
              onChange={(e) => setFrase(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t('encryption.passphraseAgain')}</Label>
            <Input
              type="password"
              className="h-8 text-xs"
              value={frase2}
              onChange={(e) => setFrase2(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">{t('encryption.publicLabel')}</Label>
          <Input
            className="h-8 text-xs"
            value={etiquetaPublica}
            placeholder={t('encryption.publicLabelPlaceholder')}
            onChange={(e) => setEtiquetaPublica(e.target.value)}
          />
          <p className="text-[11px] text-muted-foreground">
            {t('encryption.publicLabelDesc')}
          </p>
        </div>

        {avance && (
          <p className="text-[11px] text-muted-foreground">
            {t('encryption.progress', { done: avance.hechos, total: avance.total })}
          </p>
        )}
        {error && <p className="text-[11px] text-destructive">{error}</p>}

        <Button
          size="sm"
          disabled={trabajando || corta || distintas}
          onClick={() =>
            correr(() =>
              invoke('activar_cifrado', {
                projectId,
                passphrase: frase,
                publicLabel: etiquetaPublica || null,
              }),
            )
          }
        >
          <i className="fas fa-lock mr-2" />
          {trabajando ? t('encryption.working') : t('encryption.enable')}
        </Button>
        {corta && frase.length > 0 && (
          <p className="text-[11px] text-amber-600">{t('encryption.tooShort')}</p>
        )}
        {distintas && frase2.length > 0 && (
          <p className="text-[11px] text-amber-600">{t('encryption.mismatch')}</p>
        )}
      </div>
    );
  }

  // ─── Proyecto cifrado ─────────────────────────────────────────────────────
  return (
    <div className="space-y-3 rounded-lg border border-border/60 p-3">
      <Cabecera
        icono={estado.unlocked ? 'fa-lock-open' : 'fa-lock'}
        titulo={t('encryption.title')}
        sufijo={estado.unlocked ? t('encryption.open') : t('encryption.closed')}
      />

      {!estado.unlocked && (
        <div className="space-y-2">
          <Label className="text-xs">{t('encryption.passphrase')}</Label>
          <Input
            type="password"
            className="h-8 text-xs"
            value={frase}
            onChange={(e) => setFrase(e.target.value)}
          />
          {estado.keyringAvailable && (
            <div className="flex items-start gap-2">
              <Checkbox
                id="enc-remember"
                checked={recordar}
                onCheckedChange={(v) => setRecordar(v === true)}
              />
              <Label htmlFor="enc-remember" className="text-xs leading-tight">
                {t('encryption.remember')}
                <span className="block text-[11px] font-normal text-muted-foreground">
                  {t('encryption.rememberDesc')}
                </span>
              </Label>
            </div>
          )}
          <Button
            size="sm"
            disabled={trabajando || !frase}
            onClick={() =>
              correr(() =>
                invoke('abrir_proyecto_cifrado', {
                  projectId,
                  passphrase: frase,
                  remember: recordar,
                }),
              )
            }
          >
            <i className="fas fa-key mr-2" />
            {t('encryption.unlock')}
          </Button>
        </div>
      )}

      {estado.unlocked && (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={trabajando}
            onClick={() => correr(() => invoke('cerrar_proyecto_cifrado', { projectId }))}
          >
            <i className="fas fa-lock mr-2" />
            {t('encryption.lock')}
          </Button>
        </div>
      )}

      <div className="space-y-1">
        <Label className="text-xs">{t('encryption.slots')}</Label>
        <ul className="space-y-1">
          {estado.slots.map((s) => (
            <li key={s.id} className="flex items-center gap-2 text-xs">
              <i className="fas fa-user-lock text-muted-foreground" />
              <span className="flex-1 truncate">{s.label || s.id.slice(0, 8)}</span>
              {estado.slots.length > 1 && (
                <button
                  className="text-[11px] text-destructive"
                  disabled={trabajando}
                  onClick={() =>
                    correr(() => invoke('quitar_frase_cifrado', { projectId, slotId: s.id }))
                  }
                >
                  {t('encryption.removeSlot')}
                </button>
              )}
            </li>
          ))}
        </ul>
        <p className="text-[11px] text-muted-foreground">{t('encryption.slotsDesc')}</p>
      </div>

      {/* Compartir el dataset: la clave, no la frase. */}
      <div className="space-y-1">
        <Label className="text-xs">{t('encryption.share')}</Label>
        <p className="text-[11px] text-muted-foreground">{t('encryption.shareDesc')}</p>
        <div className="flex gap-2">
          <Input
            type="password"
            className="h-8 text-xs"
            placeholder={t('encryption.passphrase')}
            value={frase}
            onChange={(e) => setFrase(e.target.value)}
          />
          <Button
            size="sm"
            variant="outline"
            disabled={trabajando || !frase}
            onClick={() =>
              correr(async () => {
                const clave = await invoke<string>('exportar_clave_proyecto', {
                  projectId,
                  passphrase: frase,
                });
                setClaveCompartida(clave);
              })
            }
          >
            {t('encryption.exportKey')}
          </Button>
        </div>
        {claveCompartida && (
          <div className="space-y-1">
            <textarea
              readOnly
              className="w-full rounded border border-border bg-muted/40 p-2 font-mono text-[10px]"
              rows={2}
              value={claveCompartida}
              onFocus={(e) => e.currentTarget.select()}
            />
            <Aviso tono="rojo" texto={t('encryption.keyWarning')} />
          </div>
        )}
      </div>

      {error && <p className="text-[11px] text-destructive">{error}</p>}
      {avance && (
        <p className="text-[11px] text-muted-foreground">
          {t('encryption.progress', { done: avance.hechos, total: avance.total })}
        </p>
      )}

      <details className="text-xs">
        <summary className="cursor-pointer text-muted-foreground">
          {t('encryption.disable')}
        </summary>
        <div className="space-y-2 pt-2">
          <p className="text-[11px] text-muted-foreground">{t('encryption.disableDesc')}</p>
          <Input
            type="password"
            className="h-8 text-xs"
            placeholder={t('encryption.passphrase')}
            value={frase2}
            onChange={(e) => setFrase2(e.target.value)}
          />
          <Button
            size="sm"
            variant="destructive"
            disabled={trabajando || !frase2}
            onClick={() =>
              correr(() => invoke('desactivar_cifrado', { projectId, passphrase: frase2 }))
            }
          >
            {t('encryption.disableConfirm')}
          </Button>
        </div>
      </details>
    </div>
  );
}

function Cabecera({
  icono,
  titulo,
  sufijo,
}: {
  icono: string;
  titulo: string;
  sufijo?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <i className={`fas ${icono} text-xs text-muted-foreground`} />
      <span className="flex-1 text-xs font-medium">{titulo}</span>
      {sufijo && <span className="text-[10px] text-muted-foreground">{sufijo}</span>}
    </div>
  );
}

function Aviso({ tono, texto }: { tono: 'rojo' | 'ambar'; texto: string }) {
  const clase =
    tono === 'rojo'
      ? 'border-red-500/30 bg-red-500/5 text-red-600'
      : 'border-amber-500/30 bg-amber-500/5 text-amber-600';
  return (
    <p className={`rounded-md border px-2 py-1.5 text-[11px] leading-relaxed ${clase}`}>
      {texto}
    </p>
  );
}
