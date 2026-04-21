import type { TrainingEpochMetrics } from '../types';

export type ObservationSeverity = 'ok' | 'info' | 'warn' | 'bad';

export interface Observation {
  id: string;
  severity: ObservationSeverity;
  ruleKey: string;
  params?: Record<string, string | number>;
}

// ─── numeric helpers ────────────────────────────────────────────────────────

type MaybeNum = number | null | undefined;

const clean = (xs: MaybeNum[]): number[] =>
  xs.filter((v): v is number => v != null && Number.isFinite(v));

const lastN = <T,>(a: T[], n: number): T[] => a.slice(Math.max(0, a.length - n));

const mean = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

const std = (xs: number[]): number => {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
};

const cv = (xs: number[]): number => {
  const m = Math.abs(mean(xs));
  return m < 1e-9 ? 0 : std(xs) / m;
};

function linSlope(xs: number[]): number {
  const n = xs.length;
  if (n < 2) return 0;
  const mx = (n - 1) / 2;
  const my = mean(xs);
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - mx) * (xs[i] - my);
    den += (i - mx) ** 2;
  }
  return den === 0 ? 0 : num / den;
}

// Relative slope (per epoch, as fraction of mean magnitude) — scale-invariant.
const relSlope = (xs: number[]): number => {
  if (xs.length < 2) return 0;
  const m = Math.abs(mean(xs));
  return m < 1e-9 ? 0 : linSlope(xs) / m;
};

const signFlips = (xs: number[]): number => {
  let flips = 0;
  for (let i = 2; i < xs.length; i++) {
    const a = xs[i - 1] - xs[i - 2];
    const b = xs[i] - xs[i - 1];
    if (a * b < 0) flips++;
  }
  return flips;
};

const bestIdx = (xs: number[], direction: 'max' | 'min'): number => {
  if (!xs.length) return -1;
  let bi = 0;
  for (let i = 1; i < xs.length; i++) {
    if (direction === 'max' ? xs[i] > xs[bi] : xs[i] < xs[bi]) bi = i;
  }
  return bi;
};

const pick = (h: TrainingEpochMetrics[], k: keyof TrainingEpochMetrics): MaybeNum[] =>
  h.map((m) => m[k] as MaybeNum);

const hasAny = (xs: MaybeNum[]): boolean => xs.some((v) => v != null && Number.isFinite(v));
const hasBroken = (xs: MaybeNum[]): boolean => xs.some((v) => v != null && !Number.isFinite(v));

// ─── primary metric selection ──────────────────────────────────────────────

type MetricKey = keyof TrainingEpochMetrics;
interface PrimaryMetric {
  key: MetricKey;
  direction: 'max' | 'min';
  label: string;
}

const METRIC_PRIORITY: PrimaryMetric[] = [
  { key: 'mAP50_95',       direction: 'max', label: 'mAP50-95' },
  { key: 'mAP50',          direction: 'max', label: 'mAP50' },
  { key: 'maskAP',         direction: 'max', label: 'maskAP' },
  { key: 'keypointAP',     direction: 'max', label: 'keypointAP' },
  { key: 'meanIoU',        direction: 'max', label: 'mIoU' },
  { key: 'f1Score',        direction: 'max', label: 'F1' },
  { key: 'accuracy',       direction: 'max', label: 'acc' },
  { key: 'aucRoc',         direction: 'max', label: 'AUC' },
  { key: 'rocAuc',         direction: 'max', label: 'AUC' },
  { key: 'r2Score',        direction: 'max', label: 'R²' },
  { key: 'silhouetteScore', direction: 'max', label: 'silhouette' },
  { key: 'rmse',           direction: 'min', label: 'RMSE' },
  { key: 'mae',            direction: 'min', label: 'MAE' },
  { key: 'mse',            direction: 'min', label: 'MSE' },
];

function selectPrimary(h: TrainingEpochMetrics[]): PrimaryMetric | null {
  for (const m of METRIC_PRIORITY) {
    if (hasAny(pick(h, m.key))) return m;
  }
  return null;
}

// ─── analysis ───────────────────────────────────────────────────────────────

const WINDOW = 6;

export function analyzeTraining(history: TrainingEpochMetrics[]): Observation[] {
  const obs: Observation[] = [];
  const n = history.length;

  if (n === 0) return [{ id: 'waiting', severity: 'info', ruleKey: 'waiting' }];
  if (n < 3) return [{ id: 'warming_up', severity: 'info', ruleKey: 'warmingUp', params: { n } }];

  const win = lastN(history, WINDOW);

  // Raw series
  const trainLossAll = pick(history, 'trainLoss');
  const valLossAll = pick(history, 'valLoss');
  const lrAll = pick(history, 'lr');

  // Broken values → abort early with actionable message.
  if (hasBroken(trainLossAll) || hasBroken(valLossAll)) {
    return [{ id: 'nan', severity: 'bad', ruleKey: 'nan' }];
  }

  const trainLoss = clean(trainLossAll);
  const valLoss = clean(valLossAll);
  const trainLossWin = clean(pick(win, 'trainLoss'));
  const valLossWin = clean(pick(win, 'valLoss'));

  // ── Loss exploding ────────────────────────────────────────────────────────
  if (trainLoss.length >= 4) {
    const minPrev = Math.min(...trainLoss.slice(0, -2));
    const recentMax = Math.max(...trainLoss.slice(-2));
    if (minPrev > 0 && recentMax > minPrev * 2) {
      obs.push({
        id: 'loss_exploding',
        severity: 'bad',
        ruleKey: 'lossExploding',
        params: { ratio: (recentMax / minPrev).toFixed(1), from: minPrev.toFixed(3), to: recentMax.toFixed(3) },
      });
    }
  }

  // ── Dead start (stuck near zero) ─────────────────────────────────────────
  const primary = selectPrimary(history);
  const primarySeriesAll = primary ? clean(pick(history, primary.key)) : [];
  const latestPrimary = primarySeriesAll.length ? primarySeriesAll[primarySeriesAll.length - 1] : null;
  const bestPrimary = primarySeriesAll.length
    ? primarySeriesAll[bestIdx(primarySeriesAll, primary!.direction)]
    : null;
  const epochsSinceBest = primary && primarySeriesAll.length
    ? primarySeriesAll.length - 1 - bestIdx(primarySeriesAll, primary!.direction)
    : 0;
  const isMax = primary?.direction === 'max';

  if (primary && n >= 6 && primarySeriesAll.length >= 5 && isMax && latestPrimary != null && latestPrimary < 0.03) {
    obs.push({
      id: 'dead_model',
      severity: 'bad',
      ruleKey: 'deadModel',
      params: { metric: primary.label, value: (latestPrimary * 100).toFixed(1), epochs: n },
    });
  }

  // ── Overfitting signal (gap widening) ────────────────────────────────────
  const trainSlopeWin = relSlope(trainLossWin);
  const valSlopeWin = relSlope(valLossWin);

  if (trainLossWin.length >= 4 && valLossWin.length >= 4) {
    const gapNow = valLossWin[valLossWin.length - 1] - trainLossWin[trainLossWin.length - 1];
    const gapStart = valLossWin[0] - trainLossWin[0];
    const widening = gapNow - gapStart;
    const severe = trainSlopeWin < -0.005 && valSlopeWin > 0.01 && widening > Math.abs(trainLossWin[0]) * 0.2;
    const mild = trainSlopeWin < -0.002 && valSlopeWin > 0.002 && !severe;

    if (severe) {
      obs.push({
        id: 'overfit_severe',
        severity: 'bad',
        ruleKey: 'overfitSevere',
        params: { gap: gapNow.toFixed(3) },
      });
    } else if (mild) {
      obs.push({ id: 'overfitting', severity: 'warn', ruleKey: 'overfitting' });
    }
  }

  // ── Val loss rising alone ────────────────────────────────────────────────
  if (valLossWin.length >= 4 && valSlopeWin > 0.005 && trainSlopeWin > -0.001) {
    if (!obs.some((o) => o.id === 'overfit_severe' || o.id === 'overfitting')) {
      obs.push({ id: 'val_loss_up', severity: 'warn', ruleKey: 'valLossUp' });
    }
  }

  // ── LR too high: oscillation ─────────────────────────────────────────────
  if (trainLossWin.length >= 5) {
    const flips = signFlips(trainLossWin);
    const noisyCv = cv(trainLossWin);
    const noProgress = relSlope(trainLossWin) > -0.002;
    if (flips >= 3 && noisyCv > 0.08 && noProgress) {
      obs.push({
        id: 'lr_too_high',
        severity: 'warn',
        ruleKey: 'lrTooHigh',
        params: { cv: (noisyCv * 100).toFixed(1) },
      });
    }
  }

  // ── LR too low: glacial progress ────────────────────────────────────────
  if (n >= 10 && primary && isMax && latestPrimary != null && latestPrimary < 0.3) {
    const primWin = clean(pick(win, primary.key));
    const trainProgress = trainLoss.length >= 4
      ? (trainLoss[0] - trainLoss[trainLoss.length - 1]) / Math.abs(trainLoss[0] + 1e-9)
      : 0;
    if (primWin.length >= 4 && Math.abs(relSlope(primWin)) < 0.005 && trainProgress < 0.1) {
      obs.push({ id: 'lr_too_low', severity: 'info', ruleKey: 'lrTooLow' });
    }
  }

  // ── Loss component imbalance (YOLO box/cls/dfl) ──────────────────────────
  const box = clean(pick(win, 'boxLoss'));
  const cls = clean(pick(win, 'clsLoss'));
  const dfl = clean(pick(win, 'dflLoss'));
  if (box.length && cls.length) {
    const bm = mean(box), cm = mean(cls);
    if (bm > cm * 5) {
      obs.push({ id: 'box_dominates', severity: 'info', ruleKey: 'boxDominates', params: { ratio: (bm / cm).toFixed(1) } });
    } else if (cm > bm * 5) {
      obs.push({ id: 'cls_dominates', severity: 'info', ruleKey: 'clsDominates', params: { ratio: (cm / bm).toFixed(1) } });
    }
  }
  if (dfl.length && box.length && mean(dfl) > mean(box) * 3) {
    obs.push({ id: 'dfl_high', severity: 'info', ruleKey: 'dflHigh' });
  }

  // ── Metric regression from best ──────────────────────────────────────────
  // Require sustained regression: ≥6 epochs since best AND drop ≥10% — avoids
  // reacting to single noisy epochs.
  if (primary && bestPrimary != null && latestPrimary != null && epochsSinceBest >= 6) {
    const drop = isMax ? (bestPrimary - latestPrimary) / (bestPrimary + 1e-9) : (latestPrimary - bestPrimary) / (bestPrimary + 1e-9);
    if (drop > 0.1) {
      obs.push({
        id: 'regression',
        severity: 'warn',
        ruleKey: 'regression',
        params: {
          metric: primary.label,
          best: (bestPrimary * (isMax ? 100 : 1)).toFixed(isMax ? 1 : 3),
          now: (latestPrimary * (isMax ? 100 : 1)).toFixed(isMax ? 1 : 3),
          epochs: epochsSinceBest,
        },
      });
    }
  }

  // ── Early stop suggestion (no improvement) ───────────────────────────────
  if (primary && epochsSinceBest >= 12 && !obs.some((o) => o.id === 'regression')) {
    obs.push({
      id: 'early_stop',
      severity: 'info',
      ruleKey: 'earlyStop',
      params: { epochs: epochsSinceBest },
    });
  }

  // ── Plateau (need broader window to be sure) ─────────────────────────────
  if (primary && n >= 12) {
    const primRecent = clean(pick(lastN(history, 12), primary.key));
    if (primRecent.length >= 8) {
      const range = Math.max(...primRecent) - Math.min(...primRecent);
      const lo = primRecent[primRecent.length - 1];
      if (range < 0.005) {
        if (isMax && lo > 0.85) {
          obs.push({ id: 'converged', severity: 'ok', ruleKey: 'converged', params: { metric: primary.label, value: (lo * 100).toFixed(1) } });
        } else if (isMax && lo < 0.5) {
          obs.push({ id: 'plateau_low', severity: 'warn', ruleKey: 'plateauLow', params: { value: (lo * 100).toFixed(1) } });
        } else {
          obs.push({ id: 'plateau', severity: 'info', ruleKey: 'plateau' });
        }
      }
    }
  }

  // ── Precision / Recall imbalance ────────────────────────────────────────
  const latestPrec = clean(pick(history, 'precision')).slice(-1)[0];
  const latestRec = clean(pick(history, 'recall')).slice(-1)[0];
  if (latestPrec != null && latestRec != null) {
    const diff = latestPrec - latestRec;
    if (Math.abs(diff) > 0.2) {
      obs.push({
        id: 'pr_imbalance',
        severity: 'info',
        ruleKey: diff > 0 ? 'precisionHigh' : 'recallHigh',
        params: {
          precision: (latestPrec * 100).toFixed(1),
          recall: (latestRec * 100).toFixed(1),
        },
      });
    }
  }

  // ── Val looks too easy (leak / bad split) ───────────────────────────────
  if (valLoss.length >= 3 && trainLoss.length >= 3) {
    const vRecent = mean(valLoss.slice(-3));
    const tRecent = mean(trainLoss.slice(-3));
    if (tRecent > 0 && tRecent - vRecent > Math.max(0.3, tRecent * 0.25)) {
      obs.push({ id: 'val_too_easy', severity: 'info', ruleKey: 'valTooEasy', params: { train: tRecent.toFixed(3), val: vRecent.toFixed(3) } });
    }
  }

  // ── Noisy training (small batch / unstable) ─────────────────────────────
  if (trainLossWin.length >= 5) {
    const noise = cv(trainLossWin);
    const improving = relSlope(trainLossWin) < -0.005;
    if (noise > 0.15 && improving && !obs.some((o) => o.id === 'lr_too_high')) {
      obs.push({ id: 'noisy', severity: 'info', ruleKey: 'noisy', params: { cv: (noise * 100).toFixed(1) } });
    }
  }

  // ── Healthy progression w/ rate ─────────────────────────────────────────
  const lossImproving = trainSlopeWin < -0.003;
  let metricImproving = false;
  let improvementPct = 0;
  if (primary) {
    const primWin = clean(pick(win, primary.key));
    if (primWin.length >= 4) {
      const rs = relSlope(primWin);
      metricImproving = isMax ? rs > 0.005 : rs < -0.005;
      improvementPct = Math.abs(rs) * 100;
    }
  }
  const noBadOrWarn = !obs.some((o) => o.severity === 'bad' || o.severity === 'warn');
  if (lossImproving && metricImproving && noBadOrWarn) {
    obs.push({
      id: 'healthy',
      severity: 'ok',
      ruleKey: 'healthy',
      params: { rate: improvementPct.toFixed(1) },
    });
  }

  // ── Excellent / Strong ──────────────────────────────────────────────────
  if (primary && isMax && latestPrimary != null) {
    if (latestPrimary > 0.9) {
      obs.push({
        id: 'excellent',
        severity: 'ok',
        ruleKey: 'excellent',
        params: { metric: primary.label, value: (latestPrimary * 100).toFixed(1) },
      });
    } else if (latestPrimary > 0.75 && !obs.some((o) => o.id === 'regression')) {
      obs.push({
        id: 'strong',
        severity: 'ok',
        ruleKey: 'strong',
        params: { metric: primary.label, value: (latestPrimary * 100).toFixed(1) },
      });
    }
  }

  // ── LR schedule warm-up active ──────────────────────────────────────────
  const lrWin = clean(pick(win, 'lr'));
  const lrAllClean = clean(lrAll);
  if (lrWin.length >= 3 && n <= 6) {
    const rising = lrWin[lrWin.length - 1] > lrWin[0] * 1.5;
    if (rising) obs.push({ id: 'warmup', severity: 'info', ruleKey: 'warmupPhase' });
  }
  // LR decayed effectively to zero
  if (lrAllClean.length >= 5 && primary) {
    const lrLast = lrAllClean[lrAllClean.length - 1];
    const lrMax = Math.max(...lrAllClean);
    if (lrMax > 0 && lrLast / lrMax < 0.05 && (epochsSinceBest >= 3)) {
      obs.push({ id: 'lr_decayed', severity: 'info', ruleKey: 'lrDecayed' });
    }
  }

  // ── Fallback ────────────────────────────────────────────────────────────
  if (obs.length === 0) obs.push({ id: 'neutral', severity: 'info', ruleKey: 'neutral' });

  // Dedup by id
  const seen = new Set<string>();
  return obs.filter((o) => (seen.has(o.id) ? false : (seen.add(o.id), true)));
}
