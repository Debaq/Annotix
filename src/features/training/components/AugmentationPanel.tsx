import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { trainingService } from '../services/trainingService';
import type {
  AugmentationCatalogEntry,
  AugmentationPlan,
  AugmentationPreview,
  Rango,
  TilingSpec,
  TransformSpec,
} from '../types';

/** Campo numérico que confirma al salir o con Enter, nunca en cada tecla. */
function Numero({
  valor,
  min,
  max,
  step,
  onCommit,
  ancho = 'w-16',
}: {
  valor: number;
  min?: number;
  max?: number;
  step?: number;
  onCommit: (v: number) => void;
  ancho?: string;
}) {
  const [texto, setTexto] = useState(String(valor));
  useEffect(() => setTexto(String(valor)), [valor]);
  const confirmar = () => {
    const n = Number(texto);
    if (!Number.isFinite(n)) {
      setTexto(String(valor));
      return;
    }
    const acotado = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n));
    setTexto(String(acotado));
    if (acotado !== valor) onCommit(acotado);
  };
  return (
    <Input
      type="number"
      className={`h-7 text-xs ${ancho}`}
      value={texto}
      min={min}
      max={max}
      step={step}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={confirmar}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
      }}
    />
  );
}

function esRango(v: unknown): v is Rango {
  return typeof v === 'object' && v !== null && 'min' in v && 'max' in v;
}

/**
 * Dibuja las anotaciones encima de la variante generada.
 *
 * Sin esto la vista previa sólo enseña una foto rara. Lo que hay que poder mirar
 * es si las etiquetas siguen encima de lo que marcan — que es exactamente lo que
 * una augmentación mal hecha rompe sin decir nada.
 */
function Anotaciones({ previa }: { previa: AugmentationPreview }) {
  return (
    <svg
      viewBox={`0 0 ${previa.width} ${previa.height}`}
      className="absolute inset-0 h-full w-full"
      preserveAspectRatio="none"
    >
      {previa.annotations.map((a) => {
        const d = a.data as Record<string, number | undefined> & {
          points?: { x: number; y: number }[];
        };
        const trazo = 'hsl(var(--primary))';
        const grosor = Math.max(1, previa.width / 300);
        if (a.type === 'bbox' && d.x != null && d.y != null) {
          return (
            <rect
              key={a.id}
              x={d.x}
              y={d.y}
              width={d.width ?? 0}
              height={d.height ?? 0}
              fill="none"
              stroke={trazo}
              strokeWidth={grosor}
            />
          );
        }
        if (a.type === 'obb' && d.x != null && d.y != null) {
          const w = d.width ?? 0;
          const h = d.height ?? 0;
          return (
            <rect
              key={a.id}
              x={d.x - w / 2}
              y={d.y - h / 2}
              width={w}
              height={h}
              fill="none"
              stroke={trazo}
              strokeWidth={grosor}
              transform={`rotate(${d.rotation ?? 0} ${d.x} ${d.y})`}
            />
          );
        }
        if (d.points && d.points.length > 0) {
          if (a.type === 'keypoints' || a.type === 'landmarks') {
            return (
              <g key={a.id}>
                {d.points.map((p, i) => (
                  <circle key={i} cx={p.x} cy={p.y} r={grosor * 2} fill={trazo} />
                ))}
              </g>
            );
          }
          return (
            <polygon
              key={a.id}
              points={d.points.map((p) => `${p.x},${p.y}`).join(' ')}
              fill="none"
              stroke={trazo}
              strokeWidth={grosor}
            />
          );
        }
        return null;
      })}
    </svg>
  );
}

interface Props {
  projectId: string;
}

const BALANCES = ['uniform', 'balance', 'manual'] as const;
const VACIAS = ['discard', 'keep_all', 'keep_fraction'] as const;

const TILING_POR_DEFECTO: TilingSpec = {
  rows: 2,
  cols: 2,
  overlap: 0.15,
  emptyTiles: 'keep_fraction',
  emptyKeepRatio: 0.1,
};

/**
 * Declara cómo se aumenta el corpus antes de entrenar.
 *
 * La augmentación se materializa al preparar el dataset y no dentro del bucle de
 * entrenamiento: se pierde la variación por época y se gana que lo generado se
 * pueda abrir y mirar, que sea el mismo en cada corrida con la misma semilla, y
 * que valga para los diecisiete backends en vez de sólo para el que trae su
 * propia augmentación.
 */
export function AugmentationPanel({ projectId }: Props) {
  const { t } = useTranslation();
  const [plan, setPlan] = useState<AugmentationPlan | null>(null);
  // La modalidad la detecta el backend desde los DICOM del corpus; es la misma
  // que usa la previsión del contrato, y es lo que decide qué transformaciones
  // tienen sentido aquí.
  const [modality, setModality] = useState<string | null>(null);
  const [catalogo, setCatalogo] = useState<AugmentationCatalogEntry[]>([]);
  const [abierto, setAbierto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previa, setPrevia] = useState<AugmentationPreview | null>(null);
  const [cargandoPrevia, setCargandoPrevia] = useState(false);

  useEffect(() => {
    let vivo = true;
    Promise.all([
      trainingService.getAugmentationPlan(projectId),
      trainingService.getAugmentationCatalog(),
    ])
      .then(([p, c]) => {
        if (!vivo) return;
        setPlan(p);
        setCatalogo(c);
      })
      .catch(() => {
        if (vivo) setPlan(null);
      });
    trainingService
      .getReadiness(projectId, 0, 0)
      .then((r) => {
        if (vivo) setModality(r.detectedModality);
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [projectId]);

  const guardar = useCallback(
    (parcial: Partial<AugmentationPlan>) => {
      setPlan((prev) => {
        if (!prev) return prev;
        const siguiente = { ...prev, ...parcial };
        trainingService
          .setAugmentationPlan(projectId, siguiente)
          .then(() => setError(null))
          // El backend valida. Si se niega, la pantalla vuelve a lo guardado:
          // enseñar un plan que no rige es peor que no enseñar nada.
          .catch((e) => {
            setError(String(e));
            setPlan(prev);
          });
        return siguiente;
      });
    },
    [projectId],
  );

  const cambiarTransformacion = useCallback(
    (id: string, cambio: Partial<TransformSpec> | null) => {
      setPlan((prev) => {
        if (!prev) return prev;
        const transforms = cambio
          ? prev.transforms.map((tr) => (tr.kind === id ? { ...tr, ...cambio } : tr))
          : prev.transforms.filter((tr) => tr.kind !== id);
        guardar({ transforms });
        return { ...prev, transforms };
      });
    },
    [guardar],
  );

  const alternar = useCallback(
    (entrada: AugmentationCatalogEntry, activa: boolean) => {
      setPlan((prev) => {
        if (!prev) return prev;
        const transforms = activa
          ? [...prev.transforms, entrada.default]
          : prev.transforms.filter((tr) => tr.kind !== entrada.id);
        guardar({ transforms });
        return { ...prev, transforms };
      });
    },
    [guardar],
  );

  const verPrevia = useCallback(() => {
    if (!plan) return;
    setCargandoPrevia(true);
    trainingService
      .previewAugmentation(projectId, plan)
      .then((p) => {
        setPrevia(p);
        setError(null);
      })
      .catch((e) => {
        setPrevia(null);
        setError(String(e));
      })
      .finally(() => setCargandoPrevia(false));
  }, [plan, projectId]);

  const activas = useMemo(
    () => new Map((plan?.transforms ?? []).map((tr) => [tr.kind, tr])),
    [plan],
  );

  // Los avisos de corrección se calculan aquí para que se vean mientras se
  // edita, no sólo al generar la vista previa.
  const avisoLateralidad = useMemo(() => {
    if (!plan?.enabled || !modality) return false;
    const lateral = new Set(catalogo.filter((e) => e.lateral).map((e) => e.id));
    return plan.transforms.some((tr) => lateral.has(tr.kind) && tr.p > 0);
  }, [plan, catalogo, modality]);

  if (!plan) return null;

  const resumen = plan.enabled
    ? t('training.augmentationPlan.summaryOn', {
        factor: plan.factor,
        n: plan.transforms.length,
      })
    : t('training.augmentationPlan.off');

  return (
    <div className="rounded-lg border border-border/50 overflow-hidden">
      <button
        onClick={() => setAbierto(!abierto)}
        className="flex items-center gap-2 w-full px-3 py-2 text-xs font-medium text-left hover:bg-muted/50 transition-colors"
      >
        <i className="fas fa-wand-magic-sparkles text-xs text-muted-foreground w-4" />
        <span className="flex-1">{t('training.augmentationPlan.title')}</span>
        <span className="text-[10px] text-muted-foreground font-normal">{resumen}</span>
        <i
          className={`fas fa-chevron-${abierto ? 'down' : 'right'} text-[10px] text-muted-foreground`}
        />
      </button>

      {abierto && (
        <div className="px-3 pb-3 pt-1 space-y-3">
          <p className="text-[11px] text-muted-foreground">
            {t('training.augmentationPlan.intro')}
          </p>

          <div className="flex items-start gap-2">
            <Checkbox
              id="aug-enabled"
              checked={plan.enabled}
              onCheckedChange={(v) => guardar({ enabled: v === true })}
            />
            <Label htmlFor="aug-enabled" className="text-xs leading-tight">
              {t('training.augmentationPlan.enable')}
              <span className="block text-[11px] font-normal text-muted-foreground">
                {t('training.augmentationPlan.enableDesc')}
              </span>
            </Label>
          </div>

          {plan.enabled && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">{t('training.augmentationPlan.factor')}</Label>
                  <Numero
                    valor={plan.factor}
                    min={0}
                    max={50}
                    step={1}
                    ancho="w-full"
                    onCommit={(v) => guardar({ factor: v })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{t('training.augmentationPlan.minVisibility')}</Label>
                  <Numero
                    valor={plan.minVisibility}
                    min={0}
                    max={1}
                    step={0.05}
                    ancho="w-full"
                    onCommit={(v) => guardar({ minVisibility: v })}
                  />
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">
                {t('training.augmentationPlan.minVisibilityDesc')}
              </p>

              <div className="space-y-1">
                <Label className="text-xs">{t('training.augmentationPlan.balance')}</Label>
                <Select value={plan.balance} onValueChange={(v) => guardar({ balance: v })}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BALANCES.map((b) => (
                      <SelectItem key={b} value={b} className="text-xs">
                        {t(`training.augmentationPlan.balanceMode.${b}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  {t(`training.augmentationPlan.balanceDesc.${plan.balance}`)}
                </p>
                {plan.balance === 'balance' && (
                  <div className="flex items-center gap-2 pt-1">
                    <Label className="text-xs flex-1">
                      {t('training.augmentationPlan.maxFactor')}
                    </Label>
                    <Numero
                      valor={plan.maxFactor}
                      min={1}
                      max={100}
                      step={1}
                      onCommit={(v) => guardar({ maxFactor: v })}
                    />
                  </div>
                )}
              </div>

              {/* ── Transformaciones ───────────────────────────────────── */}
              <div className="space-y-1">
                <Label className="text-xs">
                  {t('training.augmentationPlan.transforms')}
                </Label>
                <div className="space-y-1">
                  {catalogo.map((entrada) => {
                    const activa = activas.get(entrada.id);
                    const inutil = entrada.needsColor && esMonocroma(modality);
                    return (
                      <div
                        key={entrada.id}
                        className="rounded-md border border-border/40 px-2 py-1.5"
                      >
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id={`aug-${entrada.id}`}
                            checked={!!activa}
                            disabled={inutil}
                            onCheckedChange={(v) => alternar(entrada, v === true)}
                          />
                          <Label
                            htmlFor={`aug-${entrada.id}`}
                            className={`text-xs flex-1 ${inutil ? 'text-muted-foreground' : ''}`}
                          >
                            {t(`training.augmentationPlan.tf.${entrada.id}`)}
                          </Label>
                          {entrada.lateral && (
                            <span className="text-[10px] text-amber-600">
                              {t('training.augmentationPlan.lateralTag')}
                            </span>
                          )}
                          {activa && (
                            <div className="flex items-center gap-1">
                              <span className="text-[10px] text-muted-foreground">p</span>
                              <Numero
                                valor={activa.p}
                                min={0}
                                max={1}
                                step={0.05}
                                ancho="w-14"
                                onCommit={(v) => cambiarTransformacion(entrada.id, { p: v })}
                              />
                            </div>
                          )}
                        </div>
                        {inutil && (
                          <p className="pl-6 text-[11px] text-muted-foreground">
                            {t('training.augmentationPlan.needsColor')}
                          </p>
                        )}
                        {activa && (
                          <div className="pl-6 pt-1 space-y-1">
                            {Object.entries(activa)
                              .filter(([k]) => k !== 'kind' && k !== 'p')
                              .map(([clave, valor]) => (
                                <div key={clave} className="flex items-center gap-2">
                                  <span className="text-[11px] text-muted-foreground flex-1">
                                    {t(`training.augmentationPlan.param.${clave}`, clave)}
                                  </span>
                                  {esRango(valor) ? (
                                    <>
                                      <Numero
                                        valor={valor.min}
                                        step={0.05}
                                        onCommit={(v) =>
                                          cambiarTransformacion(entrada.id, {
                                            [clave]: { ...valor, min: v },
                                          })
                                        }
                                      />
                                      <Numero
                                        valor={valor.max}
                                        step={0.05}
                                        onCommit={(v) =>
                                          cambiarTransformacion(entrada.id, {
                                            [clave]: { ...valor, max: v },
                                          })
                                        }
                                      />
                                    </>
                                  ) : typeof valor === 'string' ? (
                                    <Select
                                      value={valor}
                                      onValueChange={(v) =>
                                        cambiarTransformacion(entrada.id, { [clave]: v })
                                      }
                                    >
                                      <SelectTrigger className="h-7 w-36 text-xs">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {['central', 'aleatorio'].map((o) => (
                                          <SelectItem key={o} value={o} className="text-xs">
                                            {t(`training.augmentationPlan.zoomCenter.${o}`)}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  ) : null}
                                </div>
                              ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* ── Teselado ───────────────────────────────────────────── */}
              <div className="space-y-1">
                <div className="flex items-start gap-2">
                  <Checkbox
                    id="aug-tiling"
                    checked={!!plan.tiling}
                    onCheckedChange={(v) =>
                      guardar({ tiling: v === true ? TILING_POR_DEFECTO : null })
                    }
                  />
                  <Label htmlFor="aug-tiling" className="text-xs leading-tight">
                    {t('training.augmentationPlan.tiling')}
                    <span className="block text-[11px] font-normal text-muted-foreground">
                      {t('training.augmentationPlan.tilingDesc')}
                    </span>
                  </Label>
                </div>
                {plan.tiling && (
                  <div className="pl-6 space-y-2 pt-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-muted-foreground flex-1">
                        {t('training.augmentationPlan.rowsCols')}
                      </span>
                      <Numero
                        valor={plan.tiling.rows}
                        min={1}
                        max={20}
                        step={1}
                        onCommit={(v) =>
                          guardar({ tiling: { ...plan.tiling!, rows: v } })
                        }
                      />
                      <Numero
                        valor={plan.tiling.cols}
                        min={1}
                        max={20}
                        step={1}
                        onCommit={(v) =>
                          guardar({ tiling: { ...plan.tiling!, cols: v } })
                        }
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-muted-foreground flex-1">
                        {t('training.augmentationPlan.overlap')}
                      </span>
                      <Numero
                        valor={plan.tiling.overlap}
                        min={0}
                        max={0.49}
                        step={0.05}
                        onCommit={(v) =>
                          guardar({ tiling: { ...plan.tiling!, overlap: v } })
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <span className="text-[11px] text-muted-foreground">
                        {t('training.augmentationPlan.emptyTiles')}
                      </span>
                      <Select
                        value={plan.tiling.emptyTiles}
                        onValueChange={(v) =>
                          guardar({ tiling: { ...plan.tiling!, emptyTiles: v } })
                        }
                      >
                        <SelectTrigger className="h-7 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {VACIAS.map((o) => (
                            <SelectItem key={o} value={o} className="text-xs">
                              {t(`training.augmentationPlan.emptyTile.${o}`)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {plan.tiling.emptyTiles === 'keep_fraction' && (
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-muted-foreground flex-1">
                            {t('training.augmentationPlan.emptyKeepRatio')}
                          </span>
                          <Numero
                            valor={plan.tiling.emptyKeepRatio}
                            min={0}
                            max={1}
                            step={0.05}
                            onCommit={(v) =>
                              guardar({ tiling: { ...plan.tiling!, emptyKeepRatio: v } })
                            }
                          />
                        </div>
                      )}
                    </div>
                    <p className="text-[11px] text-amber-600">
                      {t('training.augmentationPlan.tilingInference')}
                    </p>
                  </div>
                )}
              </div>

              {avisoLateralidad && (
                <p className="rounded-md border border-red-500/30 bg-red-500/5 px-2 py-1.5 text-[11px] text-red-600">
                  {t('training.augmentationPlan.lateralWarning', { modality })}
                </p>
              )}

              {/* ── Vista previa ───────────────────────────────────────── */}
              <div className="space-y-2">
                <button
                  className="annotix-btn annotix-btn-outline w-full"
                  style={{ fontSize: '0.7rem', padding: '4px 8px' }}
                  onClick={verPrevia}
                  disabled={cargandoPrevia}
                >
                  {cargandoPrevia
                    ? t('training.augmentationPlan.previewing')
                    : t('training.augmentationPlan.preview')}
                </button>
                <p className="text-[11px] text-muted-foreground">
                  {t('training.augmentationPlan.previewDesc')}
                </p>

                {previa && (
                  <div className="space-y-1">
                    <div className="relative overflow-hidden rounded-md border border-border/50">
                      <img
                        src={`data:image/png;base64,${previa.image}`}
                        alt={previa.source}
                        className="block w-full"
                      />
                      <Anotaciones previa={previa} />
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      {previa.transforms.length > 0
                        ? previa.transforms
                            .map((id) => t(`training.augmentationPlan.tf.${id}`))
                            .join(' · ')
                        : t('training.augmentationPlan.noTransforms')}
                    </p>
                    {previa.tiles > 0 && (
                      <p className="text-[11px] text-muted-foreground">
                        {t('training.augmentationPlan.previewTiles', { n: previa.tiles })}
                      </p>
                    )}
                    {previa.droppedAnnotations > 0 && (
                      <p className="text-[11px] text-amber-600">
                        {t('training.augmentationPlan.previewDropped', {
                          n: previa.droppedAnnotations,
                        })}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </>
          )}

          {error && <p className="text-[11px] text-destructive">{error}</p>}
        </div>
      )}
    </div>
  );
}

/**
 * Las modalidades que llegan en un solo canal. El tono y la saturación no
 * existen ahí: ofrecerlos es ofrecer una casilla que no hace nada.
 */
function esMonocroma(modality?: string | null): boolean {
  if (!modality) return false;
  return ['CR', 'DX', 'CT', 'MR', 'MG', 'US', 'PT', 'NM', 'XA'].includes(
    modality.trim().toUpperCase(),
  );
}
