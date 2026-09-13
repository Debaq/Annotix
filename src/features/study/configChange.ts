// `config.change` (sección 3.4 del modo estudio).
//
// Del cambio se registra el nombre del parámetro y si el valor era o no el
// predeterminado, nunca el valor. La única excepción de la especificación son
// cuatro parámetros numéricos de entrenamiento, que sí registran `from` y `to`.

import { studyLog } from './studyLog';

export type ConfigScope = 'project' | 'training' | 'inference' | 'annotation';

/** Parámetros cuyo valor sí se registra, por acuerdo del estudio. */
const NUMERIC_WHITELIST = new Set(['epochs', 'batch_size', 'learning_rate', 'image_size']);

/** Nombres de la app → nombres del esquema del estudio. */
const KEY_ALIASES: Record<string, string> = {
  batchSize: 'batch_size',
  imageSize: 'image_size',
  lr: 'learning_rate',
};

function typeName(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

export function emitConfigChange(
  scope: ConfigScope,
  key: string,
  from: unknown,
  to: unknown,
  defaultValue: unknown,
): void {
  if (!studyLog.isActive()) return;
  if (Object.is(from, to)) return;

  const name = KEY_ALIASES[key] ?? key;
  const payload: Record<string, unknown> = {
    scope,
    key: name,
    from_type: typeName(from),
    to_type: typeName(to),
    is_default_before: Object.is(from, defaultValue),
    is_default_after: Object.is(to, defaultValue),
  };

  if (NUMERIC_WHITELIST.has(name) && typeof from === 'number' && typeof to === 'number') {
    payload.from = from;
    payload.to = to;
  }

  studyLog.emit('config.change', payload);
}
