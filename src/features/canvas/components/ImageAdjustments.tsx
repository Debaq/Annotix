import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCurrentProject } from '@/features/projects/hooks/useCurrentProject';
import { useDraggablePanel } from '../hooks/useDraggablePanel';

export interface ImageAdjustmentValues {
  brightness: number;   // -100 to 100
  contrast: number;     // -100 to 100
  clahe: number;        // 0 to 100
  temperature: number;  // -100 to 100
  sharpness: number;    // 0 to 100
}

export const DEFAULT_ADJUSTMENTS: ImageAdjustmentValues = {
  brightness: 0,
  contrast: 0,
  clahe: 0,
  temperature: 0,
  sharpness: 0,
};

interface ImageAdjustmentsProps {
  values: ImageAdjustmentValues;
  onChange: (values: ImageAdjustmentValues) => void;
}

interface SliderRowProps {
  icon: string;
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}

function SliderRow({ icon, label, value, min, max, onChange }: SliderRowProps) {
  const center = (min + max) / 2;
  const isDefault = value === center || (min === 0 && value === 0);

  return (
    <div className="flex items-center gap-1.5">
      <i
        className={`fas ${icon} text-[0.6rem] w-3 text-center`}
        style={{ color: isDefault ? 'var(--annotix-gray)' : 'var(--annotix-primary)' }}
      />
      <span
        className="text-[0.6rem] w-[52px] truncate select-none"
        style={{ color: 'var(--annotix-dark)' }}
        title={label}
      >
        {label}
      </span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 h-1 accent-[var(--annotix-primary)]"
        style={{ minWidth: 0 }}
      />
      <span
        className="text-[0.55rem] w-7 text-right font-mono tabular-nums"
        style={{ color: isDefault ? 'var(--annotix-gray)' : 'var(--annotix-primary)' }}
      >
        {value > 0 && min < 0 ? `+${value}` : value}
      </span>
    </div>
  );
}

export const ImageAdjustments: React.FC<ImageAdjustmentsProps> = ({ values, onChange }) => {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(true);
  const { project } = useCurrentProject();
  const { containerRef, handleMouseDown, position, dragging, justDraggedRef } = useDraggablePanel(
    'adjustments',
    project?.id,
  );

  const isDefault = Object.keys(DEFAULT_ADJUSTMENTS).every(
    (k) => values[k as keyof ImageAdjustmentValues] === DEFAULT_ADJUSTMENTS[k as keyof ImageAdjustmentValues]
  );

  const update = (key: keyof ImageAdjustmentValues) => (v: number) => {
    onChange({ ...values, [key]: v });
  };

  const panelStyle: React.CSSProperties = position
    ? { left: position.left, top: position.top }
    : { top: '155px', right: '20px' };

  return (
    <div
      ref={containerRef}
      className="annotix-floating"
      style={{ ...panelStyle, userSelect: dragging ? 'none' : undefined }}
    >
      <div className="flex flex-col" style={{ width: collapsed ? 'auto' : '200px' }}>
        <button
          onClick={() => {
            if (justDraggedRef.current) return;
            setCollapsed((c) => !c);
          }}
          onMouseDown={(e) => {
            if (e.button === 0) handleMouseDown(e);
          }}
          className="flex items-center gap-1.5 w-full text-left"
          style={{ background: 'none', border: 'none', padding: 0, cursor: dragging ? 'grabbing' : 'grab' }}
        >
          <i
            className={`fas fa-sliders-h text-[0.65rem]`}
            style={{ color: isDefault ? 'var(--annotix-gray)' : 'var(--annotix-primary)' }}
          />
          <h4
            className="text-[0.7em] uppercase font-semibold tracking-wider flex-1"
            style={{ color: 'var(--annotix-gray)' }}
          >
            {t('canvas.adjustments', 'Ajustes')}
          </h4>
          <i
            className={`fas fa-chevron-${collapsed ? 'down' : 'up'} text-[0.5rem]`}
            style={{ color: 'var(--annotix-gray)' }}
          />
        </button>

        {!collapsed && (
          <div className="flex flex-col gap-1.5 mt-2">
            <SliderRow
              icon="fa-sun"
              label={t('canvas.brightness', 'Brillo')}
              value={values.brightness}
              min={-100}
              max={100}
              onChange={update('brightness')}
            />
            <SliderRow
              icon="fa-adjust"
              label={t('canvas.contrast', 'Contraste')}
              value={values.contrast}
              min={-100}
              max={100}
              onChange={update('contrast')}
            />
            <SliderRow
              icon="fa-chart-bar"
              label="CLAHE"
              value={values.clahe}
              min={0}
              max={100}
              onChange={update('clahe')}
            />
            <SliderRow
              icon="fa-thermometer-half"
              label={t('canvas.temperature', 'Temperatura')}
              value={values.temperature}
              min={-100}
              max={100}
              onChange={update('temperature')}
            />
            <SliderRow
              icon="fa-bullseye"
              label={t('canvas.sharpness', 'Nitidez')}
              value={values.sharpness}
              min={0}
              max={100}
              onChange={update('sharpness')}
            />

            <button
              onClick={() => onChange({ ...DEFAULT_ADJUSTMENTS })}
              disabled={isDefault}
              className="w-full px-2 py-1 rounded text-[0.65rem] font-medium transition-colors mt-1"
              style={{
                background: isDefault ? 'var(--annotix-light)' : 'var(--annotix-white)',
                border: 'none',
                color: isDefault ? 'var(--annotix-gray)' : 'var(--annotix-dark)',
                cursor: isDefault ? 'default' : 'pointer',
                opacity: isDefault ? 0.5 : 1,
              }}
              onMouseEnter={(e) => {
                if (!isDefault) {
                  e.currentTarget.style.background = 'var(--annotix-primary)';
                  e.currentTarget.style.color = 'white';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = isDefault ? 'var(--annotix-light)' : 'var(--annotix-white)';
                e.currentTarget.style.color = isDefault ? 'var(--annotix-gray)' : 'var(--annotix-dark)';
              }}
            >
              <i className="fas fa-undo mr-1" />
              {t('canvas.reset', 'Reset')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
