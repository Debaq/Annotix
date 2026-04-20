import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { readFile, exists } from '@tauri-apps/plugin-fs';
import type { TrainingBackend, TrainingEpochMetrics, TrainingResult } from '../types';

export interface ReportParams {
  backend: TrainingBackend;
  projectName: string;
  modelId: string;
  modelSize?: string | null;
  startedAt: number;
  finishedAt: number;
  config: Record<string, unknown>;
  finalMetrics: TrainingEpochMetrics | null;
  metricsHistory: TrainingEpochMetrics[];
  logs: string[];
  result: TrainingResult;
  chartsContainer: HTMLElement | null;
}

interface Artifact {
  title: string;
  filename: string;
  dataUrl: string;
  mime: string;
}

const IMG_EXT_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
};

async function readImageAsDataUrl(path: string): Promise<{ dataUrl: string; mime: string } | null> {
  try {
    if (!(await exists(path))) return null;
    const bytes = await readFile(path);
    const ext = path.split('.').pop()?.toLowerCase() || 'png';
    const mime = IMG_EXT_MIME[ext] || 'image/png';
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    const b64 = btoa(binary);
    return { dataUrl: `data:${mime};base64,${b64}`, mime };
  } catch {
    return null;
  }
}

async function tryCollect(resultsDir: string, filename: string, title: string): Promise<Artifact | null> {
  const sep = resultsDir.includes('\\') ? '\\' : '/';
  const path = `${resultsDir}${sep}${filename}`;
  const img = await readImageAsDataUrl(path);
  if (!img) return null;
  return { title, filename, dataUrl: img.dataUrl, mime: img.mime };
}

async function collectYoloArtifacts(resultsDir: string): Promise<Artifact[]> {
  const targets: Array<[string, string]> = [
    ['results.png', 'Training curves'],
    ['confusion_matrix.png', 'Confusion matrix'],
    ['confusion_matrix_normalized.png', 'Confusion matrix (normalized)'],
    ['PR_curve.png', 'Precision-Recall curve'],
    ['F1_curve.png', 'F1 curve'],
    ['P_curve.png', 'Precision curve'],
    ['R_curve.png', 'Recall curve'],
    ['labels.jpg', 'Label distribution'],
    ['labels_correlogram.jpg', 'Label correlogram'],
    ['val_batch0_labels.jpg', 'Val batch 0 — labels'],
    ['val_batch0_pred.jpg', 'Val batch 0 — predictions'],
    ['val_batch1_pred.jpg', 'Val batch 1 — predictions'],
    ['val_batch2_pred.jpg', 'Val batch 2 — predictions'],
    ['MaskPR_curve.png', 'Mask PR curve'],
    ['MaskF1_curve.png', 'Mask F1 curve'],
  ];
  const collected = await Promise.all(targets.map(([f, t]) => tryCollect(resultsDir, f, t)));
  return collected.filter((x): x is Artifact => x !== null);
}

// Minimal generic collector for backends not yet fully supported — grabs common filenames if present
async function collectGenericArtifacts(resultsDir: string): Promise<Artifact[]> {
  const targets: Array<[string, string]> = [
    ['results.png', 'Results'],
    ['confusion_matrix.png', 'Confusion matrix'],
    ['metrics.png', 'Metrics'],
    ['loss.png', 'Loss curve'],
    ['predictions.png', 'Sample predictions'],
  ];
  const collected = await Promise.all(targets.map(([f, t]) => tryCollect(resultsDir, f, t)));
  return collected.filter((x): x is Artifact => x !== null);
}

type Collector = (resultsDir: string) => Promise<Artifact[]>;

const COLLECTORS: Partial<Record<TrainingBackend, Collector>> = {
  yolo: collectYoloArtifacts,
  rt_detr: collectYoloArtifacts, // ultralytics → mismo layout
};

function collectorFor(backend: TrainingBackend): Collector {
  return COLLECTORS[backend] ?? collectGenericArtifacts;
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString();
}

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}h ${m}m ${sec}s`;
}

function fmtMetric(v: number | null | undefined, pct = true): string {
  if (v == null) return '—';
  return pct ? `${(v * 100).toFixed(2)}%` : v.toFixed(4);
}

export async function generateTrainingReport(params: ReportParams): Promise<Blob> {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 12;
  let y = margin;

  const ensureSpace = (need: number) => {
    if (y + need > pageH - margin) {
      pdf.addPage();
      y = margin;
    }
  };

  // --- Cover
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(18);
  pdf.text('Training Report', margin, y);
  y += 8;
  pdf.setFontSize(11);
  pdf.setFont('helvetica', 'normal');
  pdf.text(`Project: ${params.projectName}`, margin, y); y += 5;
  pdf.text(`Backend: ${params.backend.toUpperCase()}  |  Model: ${params.modelId}${params.modelSize ? params.modelSize : ''}`, margin, y); y += 5;
  pdf.text(`Started: ${formatDate(params.startedAt)}`, margin, y); y += 5;
  pdf.text(`Finished: ${formatDate(params.finishedAt)}`, margin, y); y += 5;
  pdf.text(`Duration: ${formatDuration(params.finishedAt - params.startedAt)}`, margin, y); y += 8;

  // --- Final metrics
  if (params.finalMetrics) {
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(13);
    pdf.text('Final metrics', margin, y); y += 6;
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(10);
    const m = params.finalMetrics;
    const rows: Array<[string, string]> = [];
    const push = (k: string, v: string) => { if (v !== '—') rows.push([k, v]); };
    push('mAP50', fmtMetric(m.mAP50));
    push('mAP50-95', fmtMetric(m.mAP50_95));
    push('Precision', fmtMetric(m.precision));
    push('Recall', fmtMetric(m.recall));
    push('mIoU', fmtMetric(m.meanIoU));
    push('Mean Accuracy', fmtMetric(m.meanAccuracy));
    push('Accuracy', fmtMetric(m.accuracy));
    push('F1 Score', fmtMetric(m.f1Score));
    push('Mask AP', fmtMetric(m.maskAP));
    push('Keypoint AP', fmtMetric(m.keypointAP));
    push('Train Loss', fmtMetric(m.trainLoss, false));
    push('Val Loss', fmtMetric(m.valLoss, false));
    push('MAE', fmtMetric(m.mae, false));
    push('RMSE', fmtMetric(m.rmse, false));
    push('R²', fmtMetric(m.r2Score, false));

    for (const [k, v] of rows) {
      ensureSpace(5);
      pdf.text(`${k}:`, margin, y);
      pdf.text(v, margin + 45, y);
      y += 5;
    }
    y += 3;
  }

  // --- Config
  ensureSpace(14);
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(13);
  pdf.text('Configuration', margin, y); y += 6;
  pdf.setFont('courier', 'normal'); pdf.setFontSize(8);
  const cfgPairs = Object.entries(params.config).filter(([k]) =>
    !['backendParams', 'augmentation'].includes(k)
  );
  const wrapWidth = pageW - margin * 2;
  for (const [k, v] of cfgPairs) {
    const line = `${k} = ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`;
    const wrapped = pdf.splitTextToSize(line, wrapWidth);
    ensureSpace(wrapped.length * 3.5 + 1);
    pdf.text(wrapped, margin, y);
    y += wrapped.length * 3.5 + 1;
  }
  y += 3;

  // --- Charts snapshot (if container provided)
  if (params.chartsContainer && params.metricsHistory.length > 0) {
    try {
      const canvas = await html2canvas(params.chartsContainer, {
        backgroundColor: '#ffffff',
        scale: 2,
        useCORS: true,
      });
      const imgData = canvas.toDataURL('image/png');
      const imgW = pageW - margin * 2;
      const imgH = (canvas.height / canvas.width) * imgW;
      pdf.addPage(); y = margin;
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(13);
      pdf.text('Metrics over epochs', margin, y); y += 6;
      if (imgH > pageH - y - margin) {
        const scaled = pageH - y - margin;
        const scaledW = (canvas.width / canvas.height) * scaled;
        pdf.addImage(imgData, 'PNG', margin, y, scaledW, scaled);
      } else {
        pdf.addImage(imgData, 'PNG', margin, y, imgW, imgH);
      }
    } catch (e) {
      console.error('charts snapshot failed:', e);
    }
  }

  // --- Artifacts (backend-specific)
  if (params.result.resultsDir) {
    const collect = collectorFor(params.backend);
    const artifacts = await collect(params.result.resultsDir);
    for (const art of artifacts) {
      pdf.addPage(); y = margin;
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(13);
      pdf.text(art.title, margin, y); y += 2;
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8);
      pdf.setTextColor(120);
      pdf.text(art.filename, margin, y + 4); y += 8;
      pdf.setTextColor(0);
      try {
        const props = pdf.getImageProperties(art.dataUrl);
        const maxW = pageW - margin * 2;
        const maxH = pageH - y - margin;
        let w = maxW;
        let h = (props.height / props.width) * w;
        if (h > maxH) {
          h = maxH;
          w = (props.width / props.height) * h;
        }
        pdf.addImage(art.dataUrl, art.mime === 'image/jpeg' ? 'JPEG' : 'PNG', margin, y, w, h);
      } catch (e) {
        console.error('add image failed:', art.filename, e);
      }
    }
  }

  // --- Log tail
  if (params.logs.length > 0) {
    pdf.addPage(); y = margin;
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(13);
    pdf.text('Log (tail)', margin, y); y += 6;
    pdf.setFont('courier', 'normal'); pdf.setFontSize(7);
    const tail = params.logs.slice(-400);
    const wrap = pageW - margin * 2;
    for (const line of tail) {
      const wrapped = pdf.splitTextToSize(line, wrap);
      ensureSpace(wrapped.length * 2.8);
      pdf.text(wrapped, margin, y);
      y += wrapped.length * 2.8;
    }
  }

  return pdf.output('blob');
}
