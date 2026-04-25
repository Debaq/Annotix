import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

// ─── Parameter Definition ───────────────────────────────────────────────────

export type ParamType = 'number' | 'slider' | 'select' | 'checkbox';

export interface ParamDefinition {
  key: string;
  type: ParamType;
  min?: number;
  max?: number;
  step?: number;
  options?: { value: string; label: string }[];
}

interface TrainingParamGroupProps {
  titleKey: string;
  icon: string;
  defaultOpen?: boolean;
  params: ParamDefinition[];
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}

export function TrainingParamGroup({
  titleKey,
  icon,
  defaultOpen = false,
  params,
  values,
  onChange,
}: TrainingParamGroupProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border border-border/50 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full px-3 py-2 text-sm font-medium text-left hover:bg-muted/50 transition-colors"
      >
        <i className={`${icon} text-xs text-muted-foreground w-4`} />
        <span className="flex-1">{t(titleKey)}</span>
        <i className={`fas fa-chevron-${open ? 'down' : 'right'} text-[10px] text-muted-foreground`} />
      </button>

      {open && (
        <div className="px-3 pb-3 pt-1">
          <TooltipProvider delayDuration={200}>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              {params.map((param) => (
                <ParamInput
                  key={param.key}
                  param={param}
                  value={values[param.key]}
                  onChange={(v) => onChange(param.key, v)}
                />
              ))}
            </div>
          </TooltipProvider>
        </div>
      )}
    </div>
  );
}

// ─── Individual Param Input ─────────────────────────────────────────────────

function ParamInput({
  param,
  value,
  onChange,
}: {
  param: ParamDefinition;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const { t } = useTranslation();
  const label = t(`training.params.${param.key}`);
  const desc = t(`training.params.${param.key}Desc`);
  const hasDesc = desc !== `training.params.${param.key}Desc`;

  const labelEl = (
    <Label className="text-xs flex items-center gap-1">
      {label}
      {hasDesc && (
        <Tooltip>
          <TooltipTrigger asChild>
            <i className="fas fa-info-circle text-[10px] text-muted-foreground cursor-help" />
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-[250px] text-xs">
            {desc}
          </TooltipContent>
        </Tooltip>
      )}
    </Label>
  );

  if (param.type === 'checkbox') {
    return (
      <div className="flex items-center gap-2 col-span-1">
        <Checkbox
          checked={value as boolean}
          onCheckedChange={(v) => onChange(!!v)}
        />
        {labelEl}
      </div>
    );
  }

  if (param.type === 'slider') {
    const numVal = (value as number) ?? 0;
    const step = param.step ?? 0.1;
    const decimals = step < 0.01 ? 4 : step < 1 ? 2 : 0;
    return (
      <div className="space-y-1 col-span-1">
        <div className="flex justify-between items-center">
          {labelEl}
          <span className="text-xs text-muted-foreground font-mono">
            {numVal.toFixed(decimals)}
          </span>
        </div>
        <Slider
          min={param.min ?? 0}
          max={param.max ?? 1}
          step={step}
          value={[numVal]}
          onValueChange={([v]) => onChange(v)}
        />
      </div>
    );
  }

  if (param.type === 'select') {
    return (
      <div className="space-y-1 col-span-1">
        {labelEl}
        <Select
          value={String(value)}
          onValueChange={(v) => onChange(v)}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(param.options ?? []).map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  // number
  const numVal = value as number;
  return (
    <div className="space-y-1 col-span-1">
      {labelEl}
      <Input
        type="number"
        className="h-8 text-xs"
        min={param.min}
        max={param.max}
        step={param.step}
        value={numVal ?? ''}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === '' || raw === '-') return;
          const parsed = param.step && param.step < 1
            ? parseFloat(raw)
            : parseInt(raw);
          if (!isNaN(parsed)) onChange(parsed);
        }}
      />
    </div>
  );
}
