import type { TrainingEpochMetrics } from '../types';

export type ObservationSeverity = 'ok' | 'info' | 'warn' | 'bad';

export interface Observation {
  id: string;
  severity: ObservationSeverity;
  ruleKey: string;
  params?: Record<string, string | number>;
}

const WINDOW = 5;

function lastN<T>(arr: T[], n: number): T[] {
  return arr.slice(Math.max(0, arr.length - n));
}

function slope(values: Array<number | null | undefined>): number | null {
  const clean = values.filter((v): v is number => v != null && Number.isFinite(v));
  if (clean.length < 3) return null;
  const n = clean.length;
  const xs = clean.map((_, i) => i);
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = clean.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (clean[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  return den === 0 ? 0 : num / den;
}

function pickSeries(history: TrainingEpochMetrics[], key: keyof TrainingEpochMetrics): Array<number | null | undefined> {
  return history.map((m) => m[key] as number | null | undefined);
}

function hasAnyValid(values: Array<number | null | undefined>): boolean {
  return values.some((v) => v != null && Number.isFinite(v));
}

function latestValid(values: Array<number | null | undefined>): number | null {
  for (let i = values.length - 1; i >= 0; i--) {
    const v = values[i];
    if (v != null && Number.isFinite(v)) return v;
  }
  return null;
}

function hasNaNOrInf(values: Array<number | null | undefined>): boolean {
  return values.some((v) => v != null && !Number.isFinite(v));
}

export function analyzeTraining(history: TrainingEpochMetrics[]): Observation[] {
  const obs: Observation[] = [];

  if (history.length === 0) {
    return [{ id: 'waiting', severity: 'info', ruleKey: 'waiting' }];
  }

  if (history.length < 3) {
    return [{ id: 'warming_up', severity: 'info', ruleKey: 'warmingUp', params: { n: history.length } }];
  }

  const win = lastN(history, WINDOW);

  // Gather slopes
  const trainLossSlope = slope(pickSeries(win, 'trainLoss'));
  const valLossSlope = slope(pickSeries(win, 'valLoss'));
  const boxLossSlope = slope(pickSeries(win, 'boxLoss'));
  const clsLossSlope = slope(pickSeries(win, 'clsLoss'));
  const map50Slope = slope(pickSeries(win, 'mAP50'));
  const map5095Slope = slope(pickSeries(win, 'mAP50_95'));
  const mIoUSlope = slope(pickSeries(win, 'meanIoU'));

  const latestMap50 = latestValid(pickSeries(history, 'mAP50'));
  const latestMap5095 = latestValid(pickSeries(history, 'mAP50_95'));
  const latestMIoU = latestValid(pickSeries(history, 'meanIoU'));
  const latestPrecision = latestValid(pickSeries(history, 'precision'));
  const latestRecall = latestValid(pickSeries(history, 'recall'));
  const latestValLoss = latestValid(pickSeries(history, 'valLoss'));
  const latestTrainLoss = latestValid(pickSeries(history, 'trainLoss'));

  // Divergence / NaN
  if (hasNaNOrInf(pickSeries(history, 'trainLoss')) || hasNaNOrInf(pickSeries(history, 'valLoss'))) {
    obs.push({ id: 'nan', severity: 'bad', ruleKey: 'nan' });
  }

  // Loss exploding
  const tlSeries = pickSeries(history, 'trainLoss').filter((v): v is number => v != null && Number.isFinite(v));
  if (tlSeries.length >= 4) {
    const minSoFar = Math.min(...tlSeries.slice(0, -2));
    const recentMax = Math.max(...tlSeries.slice(-2));
    if (minSoFar > 0 && recentMax > minSoFar * 2) {
      obs.push({
        id: 'loss_exploding',
        severity: 'bad',
        ruleKey: 'lossExploding',
        params: { ratio: (recentMax / minSoFar).toFixed(1) },
      });
    }
  }

  // Overfitting: val loss going up while train loss going down
  if (trainLossSlope != null && valLossSlope != null && trainLossSlope < -1e-4 && valLossSlope > 1e-4) {
    obs.push({ id: 'overfitting', severity: 'warn', ruleKey: 'overfitting' });
  }

  // Val loss plateau/increase alone
  if (valLossSlope != null && valLossSlope > 1e-3 && (trainLossSlope == null || trainLossSlope > -1e-4)) {
    obs.push({ id: 'val_loss_up', severity: 'warn', ruleKey: 'valLossUp' });
  }

  // mAP decreasing
  if (map50Slope != null && map50Slope < -1e-3) {
    obs.push({ id: 'map_down', severity: 'warn', ruleKey: 'mapDown' });
  } else if (mIoUSlope != null && mIoUSlope < -1e-3) {
    obs.push({ id: 'iou_down', severity: 'warn', ruleKey: 'iouDown' });
  }

  // Plateau on the metric of interest
  if (history.length >= 10) {
    const recent = lastN(history, 10);
    const metricKey: keyof TrainingEpochMetrics = hasAnyValid(pickSeries(recent, 'meanIoU'))
      ? 'meanIoU'
      : hasAnyValid(pickSeries(recent, 'mAP50'))
        ? 'mAP50'
        : hasAnyValid(pickSeries(recent, 'accuracy'))
          ? 'accuracy'
          : 'mAP50_95';
    const series = pickSeries(recent, metricKey).filter((v): v is number => v != null && Number.isFinite(v));
    if (series.length >= 5) {
      const min = Math.min(...series);
      const max = Math.max(...series);
      if (max - min < 0.005) {
        obs.push({ id: 'plateau', severity: 'info', ruleKey: 'plateau' });
      }
    }
  }

  // Precision / Recall imbalance
  if (latestPrecision != null && latestRecall != null) {
    const diff = latestPrecision - latestRecall;
    if (Math.abs(diff) > 0.3) {
      obs.push({
        id: 'pr_imbalance',
        severity: 'info',
        ruleKey: diff > 0 ? 'precisionHigh' : 'recallHigh',
        params: {
          precision: (latestPrecision * 100).toFixed(1),
          recall: (latestRecall * 100).toFixed(1),
        },
      });
    }
  }

  // Good progression
  const lossImproving = (trainLossSlope != null && trainLossSlope < -1e-4) ||
    (boxLossSlope != null && boxLossSlope < -1e-4) ||
    (clsLossSlope != null && clsLossSlope < -1e-4);
  const metricImproving = (map50Slope != null && map50Slope > 1e-4) ||
    (map5095Slope != null && map5095Slope > 1e-4) ||
    (mIoUSlope != null && mIoUSlope > 1e-4);

  if (lossImproving && metricImproving && !obs.some((o) => o.severity === 'bad' || o.severity === 'warn')) {
    obs.push({ id: 'healthy', severity: 'ok', ruleKey: 'healthy' });
  }

  // Excellent performance
  const bestMetric = latestMap5095 ?? latestMap50 ?? latestMIoU;
  if (bestMetric != null && bestMetric > 0.9) {
    obs.push({
      id: 'excellent',
      severity: 'ok',
      ruleKey: 'excellent',
      params: { value: (bestMetric * 100).toFixed(1) },
    });
  } else if (bestMetric != null && bestMetric > 0.75) {
    obs.push({
      id: 'strong',
      severity: 'ok',
      ruleKey: 'strong',
      params: { value: (bestMetric * 100).toFixed(1) },
    });
  }

  // Val loss << train loss (possibly leak or too simple val)
  if (latestValLoss != null && latestTrainLoss != null && latestTrainLoss - latestValLoss > 0.3) {
    obs.push({ id: 'val_too_easy', severity: 'info', ruleKey: 'valTooEasy' });
  }

  // Fallback
  if (obs.length === 0) {
    obs.push({ id: 'neutral', severity: 'info', ruleKey: 'neutral' });
  }

  // Dedup by id
  const seen = new Set<string>();
  return obs.filter((o) => (seen.has(o.id) ? false : (seen.add(o.id), true)));
}
