import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { VideoTrack, ClassDefinition } from '@/lib/db';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { useUIStore } from '../../core/store/uiStore';
import {
  EXTEND_MODES,
  INTERP_MODES,
  extendModeOf,
  interpModeOf,
} from '../utils/interpolation';

interface VideoTrackPanelProps {
  tracks: VideoTrack[];
  classes: ClassDefinition[];
  currentFrameIndex: number;
  selectedTrackId: string | null;
  onSelectTrack: (trackId: string | null) => void;
  onCreateTrack: (classId: number, label?: string) => Promise<string | undefined | void>;
  onDeleteTrack: (trackId: string) => Promise<void>;
  onUpdateTrack: (
    trackId: string,
    updates: {
      classId?: number;
      label?: string;
      enabled?: boolean;
      interpolation?: string;
      extend?: string;
    },
  ) => Promise<void>;
}

/**
 * Extensión temporal de un track, en índices de fotograma reales.
 *
 * Un track que prolonga su última caja no termina en su último keyframe, así que
 * el rango se abre por ese lado (`Infinity`) y por el otro si prolonga hacia
 * atrás. Sin esto el panel dice que el track no está en un fotograma en el que
 * la consolidación sí va a escribir una caja.
 */
function rangoDeTrack(track: VideoTrack): { desde: number; hasta: number } | null {
  if (track.keyframes.length === 0) return null;
  const indices = track.keyframes.map(kf => kf.frameIndex);
  const extend = extendModeOf(track);
  return {
    desde: extend === 'both' ? -Infinity : Math.min(...indices),
    hasta: extend === 'none' ? Math.max(...indices) : Infinity,
  };
}

/**
 * Panel de tracks de video.
 *
 * Sustituye a la lista vertical sin límite que había antes: con veinte o cien
 * tracks crecía hasta empujar fuera de la vista el resto del panel, y aun así no
 * decía lo único que importa de un track —cuándo existe—, porque eso es temporal y
 * un listado no lo muestra.
 *
 * Ahora: recuento por clase como filtro, la lista acotada en altura y centrada en
 * los tracks presentes en el fotograma actual (los que de verdad se manipulan al
 * anotar), y las acciones por track en un menú en vez de cuatro botones diminutos
 * por fila. La extensión temporal vive en las pistas de la línea de tiempo, que es
 * su lugar natural.
 */
export function VideoTrackPanel({
  tracks,
  classes,
  currentFrameIndex,
  selectedTrackId,
  onSelectTrack,
  onCreateTrack,
  onDeleteTrack,
  onUpdateTrack,
}: VideoTrackPanelProps) {
  const { t } = useTranslation();
  const { activeClassId } = useUIStore();
  const [soloEsteFotograma, setSoloEsteFotograma] = useState(true);
  const [filtroClase, setFiltroClase] = useState<number | null>(null);

  const porClase = useMemo(() => {
    const acc = new Map<number, number>();
    for (const track of tracks) {
      if (track.classId == null) continue;
      acc.set(track.classId, (acc.get(track.classId) ?? 0) + 1);
    }
    return acc;
  }, [tracks]);

  /** `true` si el track cubre el fotograma actual (keyframe o interpolación). */
  const estaEnFotograma = (track: VideoTrack) => {
    const rango = rangoDeTrack(track);
    return rango !== null && currentFrameIndex >= rango.desde && currentFrameIndex <= rango.hasta;
  };

  const visibles = useMemo(() => {
    let lista = tracks;
    if (filtroClase !== null) lista = lista.filter(tr => tr.classId === filtroClase);
    if (soloEsteFotograma) {
      const enFotograma = lista.filter(estaEnFotograma);
      // Si en este fotograma no hay ninguno, mostrar todos evita un panel vacío
      // que parece un error.
      return enFotograma.length > 0 ? enFotograma : lista;
    }
    return lista;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracks, filtroClase, soloEsteFotograma, currentFrameIndex]);

  const handleNuevo = async () => {
    if (activeClassId === null) return;
    const nombreClase = classes.find(c => c.id === activeClassId)?.name || 'Track';
    const id = await onCreateTrack(activeClassId, `${nombreClase} ${tracks.length + 1}`);
    if (typeof id === 'string') onSelectTrack(id);
  };

  return (
    <div className="flex flex-col min-h-0">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold">
          {t('video.tracks', 'Tracks')}
          {tracks.length > 0 && (
            <span className="ml-1 font-mono text-[10px] tabular-nums opacity-60">
              {tracks.length}
            </span>
          )}
        </h3>
        <Button
          variant="outline"
          size="sm"
          className="h-6 text-xs px-2"
          onClick={handleNuevo}
          disabled={activeClassId === null}
          title={t('video.newTrackHint', 'Crea un track con la clase activa')}
        >
          <i className="fas fa-plus mr-1"></i>
          {t('video.newTrack', 'Nuevo')}
        </Button>
      </div>

      {tracks.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {t('video.noTracks', 'No hay tracks. Crea uno para empezar a trackear.')}
        </p>
      ) : (
        <>
          {/* Recuento por clase, que además filtra */}
          <div className="flex flex-wrap gap-1 mb-2">
            {[...porClase.entries()].map(([classId, cantidad]) => {
              const info = classes.find(c => c.id === classId);
              const activo = filtroClase === classId;
              return (
                <button
                  key={classId}
                  onClick={() => setFiltroClase(activo ? null : classId)}
                  className={cn(
                    'flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] transition-colors',
                    activo
                      ? 'border-[var(--annotix-primary)] bg-[var(--annotix-primary)]/10'
                      : 'border-[var(--annotix-border)] hover:border-[var(--annotix-primary)]/50',
                  )}
                  title={info?.name}
                >
                  <span
                    className="h-2 w-2 rounded-full border border-black/20"
                    style={{ backgroundColor: info?.color || '#888' }}
                  />
                  <span className="max-w-[72px] truncate">{info?.name ?? classId}</span>
                  <span className="font-mono tabular-nums opacity-70">{cantidad}</span>
                </button>
              );
            })}
          </div>

          <button
            onClick={() => setSoloEsteFotograma(v => !v)}
            className="mb-1.5 self-start text-[10px] text-muted-foreground hover:text-foreground transition-colors"
          >
            <i className={cn('fas mr-1', soloEsteFotograma ? 'fa-filter' : 'fa-list')}></i>
            {soloEsteFotograma
              ? t('video.filterCurrentFrame', 'En este fotograma')
              : t('video.filterAll', 'Todos los tracks')}
          </button>

          {/* Altura acotada: el panel de acciones no se mueve por muchos tracks que haya */}
          <div className="space-y-1 overflow-y-auto max-h-48 pr-0.5">
            {visibles.map(track => {
              const info = classes.find(c => c.id === track.classId);
              const color = info?.color || '#888';
              const keyframes = track.keyframes.filter(kf => kf.isKeyframe).length;
              const aqui = track.keyframes.some(kf => kf.frameIndex === currentFrameIndex);
              const presente = estaEnFotograma(track);
              const seleccionado = selectedTrackId === track.id;

              return (
                <div
                  key={track.id}
                  onClick={() => track.id && onSelectTrack(seleccionado ? null : track.id)}
                  className={cn(
                    'flex cursor-pointer items-center gap-1.5 rounded border p-1.5 text-xs transition-all',
                    seleccionado
                      ? 'border-[var(--annotix-primary)] bg-[var(--annotix-primary)]/10'
                      : 'border-[var(--annotix-border)] bg-[var(--annotix-white)] hover:border-[var(--annotix-primary)]/50',
                    !track.enabled && 'opacity-50',
                    !presente && 'opacity-60',
                  )}
                >
                  <div
                    className="h-3 w-3 shrink-0 rounded-full border border-black/20"
                    style={{ backgroundColor: color }}
                  />
                  <span className="flex-1 truncate font-medium">
                    {track.label || `Track ${track.id}`}
                  </span>

                  {aqui && (
                    <div
                      className="h-2 w-2 rotate-45"
                      style={{ backgroundColor: color }}
                      title={t('video.keyframeHere')}
                    />
                  )}
                  <span className="text-[10px] tabular-nums text-muted-foreground">
                    {keyframes}kf
                  </span>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        onClick={e => e.stopPropagation()}
                        className="flex h-5 w-5 items-center justify-center rounded hover:bg-[var(--annotix-gray-light)]"
                        title={t('common.actions')}
                      >
                        <i className="fas fa-ellipsis-vertical text-[10px]"></i>
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                      <DropdownMenuItem
                        onClick={() => track.id && onUpdateTrack(track.id, { enabled: !track.enabled })}
                      >
                        <i className={cn('fas mr-2 w-3', track.enabled ? 'fa-eye-slash' : 'fa-eye')}></i>
                        {track.enabled ? t('video.hideTrack') : t('video.showTrack')}
                      </DropdownMenuItem>
                      {classes
                        .filter(c => c.id !== track.classId)
                        .slice(0, 6)
                        .map(c => (
                          <DropdownMenuItem
                            key={c.id}
                            onClick={() => track.id && onUpdateTrack(track.id, { classId: c.id })}
                          >
                            <span
                              className="mr-2 h-2.5 w-2.5 rounded-full border border-black/20"
                              style={{ backgroundColor: c.color }}
                            />
                            {t('video.moveToClass', 'Cambiar a')} {c.name}
                          </DropdownMenuItem>
                        ))}
                      <DropdownMenuSeparator />
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger>
                          <i className="fas fa-bezier-curve mr-2 w-3"></i>
                          {t('video.interpolation')}
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent>
                          <DropdownMenuRadioGroup
                            value={interpModeOf(track)}
                            onValueChange={modo =>
                              track.id && onUpdateTrack(track.id, { interpolation: modo })
                            }
                          >
                            {INTERP_MODES.map(modo => (
                              <DropdownMenuRadioItem key={modo} value={modo}>
                                {t(`video.interp${modo[0].toUpperCase()}${modo.slice(1)}`)}
                              </DropdownMenuRadioItem>
                            ))}
                          </DropdownMenuRadioGroup>
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger>
                          <i className="fas fa-arrows-left-right-to-line mr-2 w-3"></i>
                          {t('video.extend')}
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent>
                          <DropdownMenuRadioGroup
                            value={extendModeOf(track)}
                            onValueChange={modo =>
                              track.id && onUpdateTrack(track.id, { extend: modo })
                            }
                          >
                            {EXTEND_MODES.map(modo => (
                              <DropdownMenuRadioItem key={modo} value={modo}>
                                {t(`video.extend${modo[0].toUpperCase()}${modo.slice(1)}`)}
                              </DropdownMenuRadioItem>
                            ))}
                          </DropdownMenuRadioGroup>
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-red-600 focus:text-red-600"
                        onClick={() => track.id && onDeleteTrack(track.id)}
                      >
                        <i className="fas fa-trash mr-2 w-3"></i>
                        {t('video.deleteTrack')}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
