import { useCallback, useEffect, useState } from 'react';
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
import type { SplitPolicy } from '../types';

/**
 * Campo de sólo dígitos que confirma al salir o con Enter.
 *
 * La semilla no puede ser un `<input type="number">`: es un entero de 64 bits y
 * el valor numérico de JavaScript la redondearía por encima de 2^53, que es
 * justo el rango en el que caen las semillas derivadas del id del proyecto.
 */
function CampoSemilla({
  valor,
  placeholder,
  onCommit,
}: {
  valor: string | null | undefined;
  placeholder: string;
  onCommit: (v: string | null) => void;
}) {
  const [texto, setTexto] = useState(valor ?? '');

  useEffect(() => {
    setTexto(valor ?? '');
  }, [valor]);

  const confirmar = () => {
    const limpio = texto.trim();
    if (limpio !== '' && !/^\d+$/.test(limpio)) {
      setTexto(valor ?? '');
      return;
    }
    const siguiente = limpio === '' ? null : limpio;
    if (siguiente !== (valor ?? null)) onCommit(siguiente);
  };

  return (
    <Input
      type="text"
      inputMode="numeric"
      className="h-8 text-xs font-mono"
      value={texto}
      placeholder={placeholder}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={confirmar}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
      }}
    />
  );
}

/**
 * Campo numérico que confirma al salir o con Enter, nunca en cada tecla.
 *
 * Cada guardado reescribe `project.json` entero (`with_project_mut` hace flush
 * inmediato): guardar por pulsación serializaría un archivo de megas cuatro veces
 * para escribir una semilla de cuatro cifras.
 */
function CampoNumerico({
  valor,
  placeholder,
  min,
  max,
  step,
  onCommit,
}: {
  valor: number | null | undefined;
  placeholder: string;
  min?: number;
  max?: number;
  step?: number;
  onCommit: (v: number | null) => void;
}) {
  const externo = valor ?? '';
  const [texto, setTexto] = useState(String(externo));

  // El valor de fuera manda cuando cambia sin pasar por aquí (carga inicial, o
  // un guardado que el backend rechazó y dejó la política como estaba).
  useEffect(() => {
    setTexto(String(valor ?? ''));
  }, [valor]);

  const confirmar = () => {
    const limpio = texto.trim();
    const n = limpio === '' ? null : Number(limpio);
    if (n !== null && Number.isNaN(n)) {
      setTexto(String(valor ?? ''));
      return;
    }
    if (n !== (valor ?? null)) onCommit(n);
  };

  return (
    <Input
      type="number"
      min={min}
      max={max}
      step={step}
      className="h-8 text-xs"
      value={texto}
      placeholder={placeholder}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={confirmar}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
      }}
    />
  );
}

interface Props {
  projectId: string;
  /** Fracciones de la corrida que se está configurando. */
  valSplit: number;
  testSplit: number;
  /** Aplica a la corrida las fracciones que el proyecto recomienda. */
  onApplyFractions: (valSplit: number, testSplit: number) => void;
}

const UNIDADES = ['auto', 'subject', 'video', 'item'] as const;

/** Dos fracciones son la misma si difieren menos que el paso de los sliders. */
function igual(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.005;
}

/**
 * Declara cómo se reparte el corpus de este proyecto.
 *
 * Hasta ahora la unidad de agrupación y la semilla se decidían solas —se deducían
 * del dato presente y no quedaban escritas en ningún sitio—, así que el reparto
 * no se podía repetir fuera de la app ni transcribir a un contrato de modelo sin
 * deducirlo del resultado. Esto lo vuelve una declaración del proyecto.
 *
 * Nada de aquí impide entrenar: lo que se incumple aparece como aviso en el
 * informe del reparto, que es donde se lee la métrica.
 */
export function SplitPolicyPanel({ projectId, valSplit, testSplit, onApplyFractions }: Props) {
  const { t } = useTranslation();
  const [policy, setPolicy] = useState<SplitPolicy | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    trainingService
      .getSplitPolicy(projectId)
      .then((p) => {
        if (vivo) setPolicy(p);
      })
      .catch(() => {
        if (vivo) setPolicy(null);
      });
    return () => {
      vivo = false;
    };
  }, [projectId]);

  const guardar = useCallback(
    (parcial: Partial<SplitPolicy>) => {
      setPolicy((prev) => {
        if (!prev) return prev;
        const siguiente = { ...prev, ...parcial };
        trainingService
          .setSplitPolicy(projectId, siguiente)
          .then(() => setError(null))
          // El backend valida y puede negarse (val + test sin dejar nada para
          // entrenar, por ejemplo). Si se niega, la pantalla vuelve a lo que hay
          // guardado: dejarla mostrando lo rechazado es enseñar una política que
          // no rige.
          .catch((e) => {
            setError(String(e));
            setPolicy(prev);
          });
        return siguiente;
      });
    },
    [projectId],
  );

  if (!policy) return null;

  const recomendadas =
    policy.valSplit != null &&
    policy.testSplit != null &&
    (!igual(policy.valSplit, valSplit) || !igual(policy.testSplit, testSplit));

  return (
    <div className="rounded-lg border border-border/50 overflow-hidden">
      <button
        onClick={() => setAbierto(!abierto)}
        className="flex items-center gap-2 w-full px-3 py-2 text-xs font-medium text-left hover:bg-muted/50 transition-colors"
      >
        <i className="fas fa-scale-balanced text-xs text-muted-foreground w-4" />
        <span className="flex-1">{t('training.splitPolicy.title')}</span>
        <span className="text-[10px] text-muted-foreground font-normal">
          {t(`training.splitPolicy.unit.${policy.unit}`)}
          {policy.requireTest ? ` · ${t('training.splitPolicy.testShort')}` : ''}
        </span>
        <i className={`fas fa-chevron-${abierto ? 'down' : 'right'} text-[10px] text-muted-foreground`} />
      </button>

      {abierto && (
        <div className="px-3 pb-3 pt-1 space-y-3">
          <p className="text-[11px] text-muted-foreground">
            {t('training.splitPolicy.intro')}
          </p>

          <div className="space-y-1">
            <Label className="text-xs">{t('training.splitPolicy.unitLabel')}</Label>
            <Select value={policy.unit} onValueChange={(v) => guardar({ unit: v })}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {UNIDADES.map((u) => (
                  <SelectItem key={u} value={u} className="text-xs">
                    {t(`training.splitPolicy.unit.${u}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              {t(`training.splitPolicy.unitDesc.${policy.unit}`)}
            </p>
          </div>

          <div className="flex items-start gap-2">
            <Checkbox
              id="split-policy-require-test"
              checked={policy.requireTest}
              onCheckedChange={(v) => guardar({ requireTest: v === true })}
            />
            <Label htmlFor="split-policy-require-test" className="text-xs leading-tight">
              {t('training.splitPolicy.requireTest')}
              <span className="block text-[11px] font-normal text-muted-foreground">
                {t('training.splitPolicy.requireTestDesc')}
              </span>
            </Label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">{t('training.splitPolicy.recommended')}</Label>
              <div className="flex items-center gap-1">
                <CampoNumerico
                  valor={policy.valSplit}
                  placeholder="val"
                  min={0}
                  max={0.9}
                  step={0.05}
                  onCommit={(v) => guardar({ valSplit: v })}
                />
                <CampoNumerico
                  valor={policy.testSplit}
                  placeholder="test"
                  min={0}
                  max={0.9}
                  step={0.05}
                  onCommit={(v) => guardar({ testSplit: v })}
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">{t('training.splitPolicy.seed')}</Label>
              <CampoSemilla
                valor={policy.seed}
                placeholder={t('training.splitPolicy.seedDerived')}
                onCommit={(v) => guardar({ seed: v })}
              />
              <p className="text-[11px] text-muted-foreground">
                {t('training.splitPolicy.seedDesc')}
              </p>
            </div>
          </div>

          {recomendadas && (
            <div className="flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-2 py-1.5">
              <p className="flex-1 text-[11px] text-amber-600">
                {t('training.splitPolicy.differs', {
                  val: policy.valSplit,
                  test: policy.testSplit,
                })}
              </p>
              <button
                className="annotix-btn annotix-btn-outline shrink-0"
                style={{ fontSize: '0.7rem', padding: '3px 8px' }}
                onClick={() => onApplyFractions(policy.valSplit ?? 0, policy.testSplit ?? 0)}
              >
                {t('training.splitPolicy.apply')}
              </button>
            </div>
          )}

          {error && <p className="text-[11px] text-destructive">{error}</p>}
        </div>
      )}
    </div>
  );
}
