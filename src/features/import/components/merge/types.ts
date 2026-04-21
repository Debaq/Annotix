import { v4 as uuid } from 'uuid';

export interface AnalyzeClass {
  id: number;
  name: string;
  color: string;
  description?: string | null;
  annotationCount: number;
}
export interface AnalyzeProject {
  path: string;
  name: string;
  projectType: string;
  classes: AnalyzeClass[];
  imageCount: number;
}
export interface AnalyzeResult {
  projects: AnalyzeProject[];
  sameType: boolean;
  projectType: string;
  warnings: string[];
}

export interface CanonicalClass {
  localId: string;
  name: string;
  color: string;
  description?: string | null;
}

export type ChipKey = string; // `${pi}:${cid}`

export type AssignmentState = 'pending' | 'assigned' | 'discarded';
export interface Assignment {
  state: AssignmentState;
  canonLocalId: string | null;
}
export type AssignmentMap = Record<ChipKey, Assignment>;

export const DEFAULT_COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8',
  '#F7DC6F', '#BB8FCE', '#85C1E2', '#F8B88B', '#82E0AA',
];

export const chipKey = (pi: number, cid: number): ChipKey => `${pi}:${cid}`;
export const parseChipKey = (k: ChipKey): [number, number] => {
  const [pi, cid] = k.split(':').map(Number);
  return [pi, cid];
};
export const normalize = (s: string) => s.trim().toLowerCase();
export const fmt = (n: number) => n.toLocaleString();

export function makeCanonical(seed?: Partial<Omit<CanonicalClass, 'localId'>>): CanonicalClass {
  return {
    localId: uuid(),
    name: seed?.name ?? 'class',
    color: seed?.color ?? DEFAULT_COLORS[0],
    description: seed?.description ?? null,
  };
}

/** Canónicas = clases del proyecto `baseIdx`. Otros proyectos se auto-asignan por nombre. */
export function initFromProject(
  res: AnalyzeResult,
  baseIdx: number,
): { canonical: CanonicalClass[]; assignments: AssignmentMap } {
  const base = res.projects[baseIdx];
  const canonical: CanonicalClass[] = base.classes.map((c, i) => ({
    localId: uuid(),
    name: c.name,
    color: c.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length],
    description: c.description ?? null,
  }));
  const byName = new Map<string, string>();
  canonical.forEach((c) => byName.set(normalize(c.name), c.localId));

  const assignments: AssignmentMap = {};
  res.projects.forEach((p, pi) => {
    p.classes.forEach((cls) => {
      const k = chipKey(pi, cls.id);
      const lid = byName.get(normalize(cls.name));
      assignments[k] = lid
        ? { state: 'assigned', canonLocalId: lid }
        : { state: 'pending', canonLocalId: null };
    });
  });
  return { canonical, assignments };
}

/** Canónicas = unión de nombres (case-insensitive) de todos los proyectos. */
export function initFromUnion(
  res: AnalyzeResult,
): { canonical: CanonicalClass[]; assignments: AssignmentMap } {
  const canonical: CanonicalClass[] = [];
  const byName = new Map<string, string>();
  res.projects.forEach((p) => {
    p.classes.forEach((cls) => {
      const n = normalize(cls.name);
      if (!byName.has(n)) {
        const localId = uuid();
        byName.set(n, localId);
        canonical.push({
          localId,
          name: cls.name,
          color: cls.color || DEFAULT_COLORS[canonical.length % DEFAULT_COLORS.length],
          description: cls.description ?? null,
        });
      }
    });
  });
  const assignments: AssignmentMap = {};
  res.projects.forEach((p, pi) => {
    p.classes.forEach((cls) => {
      const lid = byName.get(normalize(cls.name))!;
      assignments[chipKey(pi, cls.id)] = { state: 'assigned', canonLocalId: lid };
    });
  });
  return { canonical, assignments };
}

/** Distancia de Levenshtein entre dos strings. */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev = new Array(b.length + 1);
  let curr = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}
export function similarity(a: string, b: string): number {
  const m = Math.max(a.length, b.length);
  if (m === 0) return 1;
  return 1 - levenshtein(a, b) / m;
}

/** Asigna pending → canónica existente por nombre exacto case-insensitive. */
export function autofillByName(
  canonical: CanonicalClass[],
  assignments: AssignmentMap,
  res: AnalyzeResult,
): { assignments: AssignmentMap; matched: number } {
  const byName = new Map<string, string>();
  canonical.forEach((c) => byName.set(normalize(c.name), c.localId));
  const next = { ...assignments };
  let matched = 0;
  res.projects.forEach((p, pi) => {
    p.classes.forEach((cls) => {
      const k = chipKey(pi, cls.id);
      if (next[k]?.state === 'pending') {
        const lid = byName.get(normalize(cls.name));
        if (lid) {
          next[k] = { state: 'assigned', canonLocalId: lid };
          matched += 1;
        }
      }
    });
  });
  return { assignments: next, matched };
}

/** Asigna pending → canónica existente por similitud de Levenshtein ≥ threshold. */
export function autofillFuzzy(
  canonical: CanonicalClass[],
  assignments: AssignmentMap,
  res: AnalyzeResult,
  threshold = 0.85,
): { assignments: AssignmentMap; matched: number } {
  const next = { ...assignments };
  let matched = 0;
  const canonNames = canonical.map((c) => ({ id: c.localId, name: normalize(c.name) }));
  res.projects.forEach((p, pi) => {
    p.classes.forEach((cls) => {
      const k = chipKey(pi, cls.id);
      if (next[k]?.state !== 'pending') return;
      const src = normalize(cls.name);
      let best: { id: string; score: number } | null = null;
      for (const cn of canonNames) {
        const s = similarity(src, cn.name);
        if (s >= threshold && (!best || s > best.score)) best = { id: cn.id, score: s };
      }
      if (best) {
        next[k] = { state: 'assigned', canonLocalId: best.id };
        matched += 1;
      }
    });
  });
  return { assignments: next, matched };
}

/** Convierte al contrato del backend. Pending se omite. */
export function toBackendMappings(
  canonical: CanonicalClass[],
  assignments: AssignmentMap,
): Array<{ projectIndex: number; sourceClassId: number; targetCanonicalIndex: number }> {
  const idxById = new Map<string, number>();
  canonical.forEach((c, i) => idxById.set(c.localId, i));
  const out: Array<{ projectIndex: number; sourceClassId: number; targetCanonicalIndex: number }> = [];
  for (const [k, a] of Object.entries(assignments)) {
    const [pi, cid] = parseChipKey(k);
    if (a.state === 'assigned' && a.canonLocalId != null) {
      const idx = idxById.get(a.canonLocalId);
      if (idx == null) continue;
      out.push({ projectIndex: pi, sourceClassId: cid, targetCanonicalIndex: idx });
    } else if (a.state === 'discarded') {
      out.push({ projectIndex: pi, sourceClassId: cid, targetCanonicalIndex: -1 });
    }
  }
  return out;
}

export function countByState(assignments: AssignmentMap): {
  pending: number;
  assigned: number;
  discarded: number;
} {
  let pending = 0;
  let assigned = 0;
  let discarded = 0;
  for (const a of Object.values(assignments)) {
    if (a.state === 'pending') pending++;
    else if (a.state === 'assigned') assigned++;
    else discarded++;
  }
  return { pending, assigned, discarded };
}
