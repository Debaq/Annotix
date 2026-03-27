import type { ProjectType } from '@/lib/db';

// ============================================================================
// TYPES
// ============================================================================

export interface WizardOption {
  id: string;
  icon: string;
  colorClass: string;
}

export interface WizardQuestion {
  id: string;
  options: WizardOption[];
  /** Show this question only when a previous answer matches */
  showWhen?: { questionId: string; answerIds: string[] };
}

export interface ScoringRule {
  /** Conditions: { questionId: answerId } - all must match */
  when: Record<string, string>;
  /** Points to add per project type */
  then: Partial<Record<ProjectType, number>>;
}

export interface Recommendation {
  type: ProjectType;
  score: number;
  icon: string;
  colorClass: string;
}

export interface WizardConfig {
  questions: WizardQuestion[];
  rules: ScoringRule[];
}

// ============================================================================
// TYPE METADATA (icon + color, shared with ProjectTypeSelector)
// ============================================================================

export const PROJECT_TYPE_META: Record<ProjectType, { icon: string; colorClass: string }> = {
  bbox:                       { icon: 'fa-vector-square',      colorClass: 'bg-blue-100 text-blue-600' },
  mask:                       { icon: 'fa-paintbrush',         colorClass: 'bg-purple-100 text-purple-600' },
  polygon:                    { icon: 'fa-draw-polygon',       colorClass: 'bg-green-100 text-green-600' },
  keypoints:                  { icon: 'fa-sitemap',            colorClass: 'bg-orange-100 text-orange-600' },
  landmarks:                  { icon: 'fa-location-dot',       colorClass: 'bg-red-100 text-red-600' },
  obb:                        { icon: 'fa-rotate',             colorClass: 'bg-indigo-100 text-indigo-600' },
  classification:             { icon: 'fa-tag',                colorClass: 'bg-yellow-100 text-yellow-600' },
  'multi-label-classification': { icon: 'fa-tags',             colorClass: 'bg-amber-100 text-amber-600' },
  'instance-segmentation':    { icon: 'fa-object-ungroup',     colorClass: 'bg-fuchsia-100 text-fuchsia-600' },
  'timeseries-classification':{ icon: 'fa-chart-line',         colorClass: 'bg-cyan-100 text-cyan-600' },
  'timeseries-forecasting':   { icon: 'fa-chart-area',         colorClass: 'bg-teal-100 text-teal-600' },
  'anomaly-detection':        { icon: 'fa-exclamation-triangle', colorClass: 'bg-rose-100 text-rose-600' },
  'timeseries-segmentation':  { icon: 'fa-layer-group',        colorClass: 'bg-emerald-100 text-emerald-600' },
  'pattern-recognition':      { icon: 'fa-wave-square',        colorClass: 'bg-violet-100 text-violet-600' },
  'event-detection':          { icon: 'fa-bolt',               colorClass: 'bg-fuchsia-100 text-fuchsia-600' },
  'timeseries-regression':    { icon: 'fa-chart-simple',       colorClass: 'bg-sky-100 text-sky-600' },
  clustering:                 { icon: 'fa-circle-nodes',        colorClass: 'bg-lime-100 text-lime-600' },
  imputation:                 { icon: 'fa-fill-drip',          colorClass: 'bg-pink-100 text-pink-600' },
  tabular:                    { icon: 'fa-table',              colorClass: 'bg-emerald-100 text-emerald-600' },
  'audio-classification':     { icon: 'fa-music',              colorClass: 'bg-indigo-100 text-indigo-600' },
  'speech-recognition':       { icon: 'fa-microphone',         colorClass: 'bg-blue-100 text-blue-600' },
  'sound-event-detection':    { icon: 'fa-volume-high',        colorClass: 'bg-orange-100 text-orange-600' },
  'tts-recording':            { icon: 'fa-record-vinyl',       colorClass: 'bg-rose-100 text-rose-600' },
};

// ============================================================================
// WIZARD CONFIG
// ============================================================================

export const WIZARD_CONFIG: WizardConfig = {
  questions: [
    // Q1: What kind of data do you work with?
    {
      id: 'dataType',
      options: [
        { id: 'images',     icon: 'fa-image',      colorClass: 'bg-blue-100 text-blue-600' },
        { id: 'timeseries', icon: 'fa-chart-line',  colorClass: 'bg-cyan-100 text-cyan-600' },
        { id: 'tabular',    icon: 'fa-table',       colorClass: 'bg-emerald-100 text-emerald-600' },
        { id: 'audio',      icon: 'fa-headphones',  colorClass: 'bg-indigo-100 text-indigo-600' },
      ],
    },

    // Q2a: What do you want to do with images?
    {
      id: 'goalImages',
      showWhen: { questionId: 'dataType', answerIds: ['images'] },
      options: [
        { id: 'classify',       icon: 'fa-tag',            colorClass: 'bg-yellow-100 text-yellow-600' },
        { id: 'detectLocate',   icon: 'fa-vector-square',  colorClass: 'bg-blue-100 text-blue-600' },
        { id: 'segment',        icon: 'fa-draw-polygon',   colorClass: 'bg-green-100 text-green-600' },
        { id: 'pointsKeypts',   icon: 'fa-sitemap',        colorClass: 'bg-orange-100 text-orange-600' },
      ],
    },

    // Q2b: What do you want to do with time series?
    {
      id: 'goalTimeseries',
      showWhen: { questionId: 'dataType', answerIds: ['timeseries'] },
      options: [
        { id: 'tsClassify',  icon: 'fa-chart-line',          colorClass: 'bg-cyan-100 text-cyan-600' },
        { id: 'tsPredict',   icon: 'fa-chart-area',          colorClass: 'bg-teal-100 text-teal-600' },
        { id: 'tsAnomaly',   icon: 'fa-exclamation-triangle', colorClass: 'bg-rose-100 text-rose-600' },
        { id: 'tsAnalyze',   icon: 'fa-wave-square',         colorClass: 'bg-violet-100 text-violet-600' },
      ],
    },

    // Q2c: What do you want to do with audio?
    {
      id: 'goalAudio',
      showWhen: { questionId: 'dataType', answerIds: ['audio'] },
      options: [
        { id: 'audioTranscribe', icon: 'fa-microphone',  colorClass: 'bg-blue-100 text-blue-600' },
        { id: 'audioClassify',   icon: 'fa-music',       colorClass: 'bg-indigo-100 text-indigo-600' },
        { id: 'audioDetect',     icon: 'fa-volume-high',  colorClass: 'bg-orange-100 text-orange-600' },
        { id: 'audioTts',        icon: 'fa-record-vinyl', colorClass: 'bg-rose-100 text-rose-600' },
      ],
    },

    // Q3a: Classification detail
    {
      id: 'classifyDetail',
      showWhen: { questionId: 'goalImages', answerIds: ['classify'] },
      options: [
        { id: 'singleLabel', icon: 'fa-tag',  colorClass: 'bg-yellow-100 text-yellow-600' },
        { id: 'multiLabel',  icon: 'fa-tags', colorClass: 'bg-amber-100 text-amber-600' },
      ],
    },

    // Q3b: Detection detail
    {
      id: 'detectDetail',
      showWhen: { questionId: 'goalImages', answerIds: ['detectLocate'] },
      options: [
        { id: 'axisAligned', icon: 'fa-vector-square', colorClass: 'bg-blue-100 text-blue-600' },
        { id: 'rotated',     icon: 'fa-rotate',        colorClass: 'bg-indigo-100 text-indigo-600' },
      ],
    },

    // Q3c: Segmentation detail
    {
      id: 'segmentDetail',
      showWhen: { questionId: 'goalImages', answerIds: ['segment'] },
      options: [
        { id: 'polygonOutline', icon: 'fa-draw-polygon',   colorClass: 'bg-green-100 text-green-600' },
        { id: 'pixelMask',      icon: 'fa-paintbrush',     colorClass: 'bg-purple-100 text-purple-600' },
        { id: 'instanceSeg',    icon: 'fa-object-ungroup', colorClass: 'bg-fuchsia-100 text-fuchsia-600' },
      ],
    },

    // Q3d: Points/keypoints detail
    {
      id: 'pointsDetail',
      showWhen: { questionId: 'goalImages', answerIds: ['pointsKeypts'] },
      options: [
        { id: 'connectedPose', icon: 'fa-sitemap',       colorClass: 'bg-orange-100 text-orange-600' },
        { id: 'freePoints',    icon: 'fa-location-dot',  colorClass: 'bg-red-100 text-red-600' },
      ],
    },

    // Q3e: Time series analysis detail
    {
      id: 'tsAnalyzeDetail',
      showWhen: { questionId: 'goalTimeseries', answerIds: ['tsAnalyze'] },
      options: [
        { id: 'tsSegment',   icon: 'fa-layer-group',   colorClass: 'bg-emerald-100 text-emerald-600' },
        { id: 'tsPattern',   icon: 'fa-wave-square',   colorClass: 'bg-violet-100 text-violet-600' },
        { id: 'tsEvent',     icon: 'fa-bolt',          colorClass: 'bg-fuchsia-100 text-fuchsia-600' },
        { id: 'tsCluster',   icon: 'fa-circle-nodes',  colorClass: 'bg-lime-100 text-lime-600' },
      ],
    },

    // Q3f: Time series predict detail
    {
      id: 'tsPredictDetail',
      showWhen: { questionId: 'goalTimeseries', answerIds: ['tsPredict'] },
      options: [
        { id: 'tsForecast',   icon: 'fa-chart-area',   colorClass: 'bg-teal-100 text-teal-600' },
        { id: 'tsRegression', icon: 'fa-chart-simple', colorClass: 'bg-sky-100 text-sky-600' },
        { id: 'tsImpute',     icon: 'fa-fill-drip',    colorClass: 'bg-pink-100 text-pink-600' },
      ],
    },
  ],

  rules: [
    // ===== IMAGE: Classification =====
    { when: { goalImages: 'classify' },                                          then: { classification: 5, 'multi-label-classification': 3 } },
    { when: { goalImages: 'classify', classifyDetail: 'singleLabel' },           then: { classification: 10 } },
    { when: { goalImages: 'classify', classifyDetail: 'multiLabel' },            then: { 'multi-label-classification': 10 } },

    // ===== IMAGE: Detection =====
    { when: { goalImages: 'detectLocate' },                                      then: { bbox: 5, obb: 3 } },
    { when: { goalImages: 'detectLocate', detectDetail: 'axisAligned' },         then: { bbox: 10 } },
    { when: { goalImages: 'detectLocate', detectDetail: 'rotated' },             then: { obb: 10 } },

    // ===== IMAGE: Segmentation =====
    { when: { goalImages: 'segment' },                                           then: { polygon: 3, mask: 3, 'instance-segmentation': 3 } },
    { when: { goalImages: 'segment', segmentDetail: 'polygonOutline' },          then: { polygon: 10 } },
    { when: { goalImages: 'segment', segmentDetail: 'pixelMask' },              then: { mask: 10 } },
    { when: { goalImages: 'segment', segmentDetail: 'instanceSeg' },            then: { 'instance-segmentation': 10 } },

    // ===== IMAGE: Points/Keypoints =====
    { when: { goalImages: 'pointsKeypts' },                                     then: { keypoints: 4, landmarks: 4 } },
    { when: { goalImages: 'pointsKeypts', pointsDetail: 'connectedPose' },      then: { keypoints: 10 } },
    { when: { goalImages: 'pointsKeypts', pointsDetail: 'freePoints' },         then: { landmarks: 10 } },

    // ===== TIMESERIES: Classify =====
    { when: { goalTimeseries: 'tsClassify' },                                    then: { 'timeseries-classification': 15 } },

    // ===== TIMESERIES: Predict =====
    { when: { goalTimeseries: 'tsPredict' },                                     then: { 'timeseries-forecasting': 5, 'timeseries-regression': 3, imputation: 2 } },
    { when: { goalTimeseries: 'tsPredict', tsPredictDetail: 'tsForecast' },      then: { 'timeseries-forecasting': 10 } },
    { when: { goalTimeseries: 'tsPredict', tsPredictDetail: 'tsRegression' },    then: { 'timeseries-regression': 10 } },
    { when: { goalTimeseries: 'tsPredict', tsPredictDetail: 'tsImpute' },        then: { imputation: 10 } },

    // ===== TIMESERIES: Anomaly =====
    { when: { goalTimeseries: 'tsAnomaly' },                                    then: { 'anomaly-detection': 15 } },

    // ===== TIMESERIES: Analyze =====
    { when: { goalTimeseries: 'tsAnalyze' },                                    then: { 'timeseries-segmentation': 3, 'pattern-recognition': 3, 'event-detection': 3, clustering: 3 } },
    { when: { goalTimeseries: 'tsAnalyze', tsAnalyzeDetail: 'tsSegment' },      then: { 'timeseries-segmentation': 10 } },
    { when: { goalTimeseries: 'tsAnalyze', tsAnalyzeDetail: 'tsPattern' },      then: { 'pattern-recognition': 10 } },
    { when: { goalTimeseries: 'tsAnalyze', tsAnalyzeDetail: 'tsEvent' },        then: { 'event-detection': 10 } },
    { when: { goalTimeseries: 'tsAnalyze', tsAnalyzeDetail: 'tsCluster' },      then: { clustering: 10 } },

    // ===== AUDIO =====
    { when: { goalAudio: 'audioTranscribe' },                                  then: { 'speech-recognition': 15 } },
    { when: { goalAudio: 'audioClassify' },                                    then: { 'audio-classification': 15 } },
    { when: { goalAudio: 'audioDetect' },                                      then: { 'sound-event-detection': 15 } },
    { when: { goalAudio: 'audioTts' },                                         then: { 'tts-recording': 15 } },

    // ===== TABULAR =====
    { when: { dataType: 'tabular' },                                           then: { tabular: 15 } },
  ],
};

// ============================================================================
// SCORING ENGINE
// ============================================================================

export function computeRecommendations(
  answers: Record<string, string>,
  config: WizardConfig = WIZARD_CONFIG,
  maxResults = 3,
): Recommendation[] {
  const scores: Partial<Record<ProjectType, number>> = {};

  for (const rule of config.rules) {
    // Check if all conditions match
    const matches = Object.entries(rule.when).every(
      ([qId, aId]) => answers[qId] === aId,
    );
    if (!matches) continue;

    // Add points
    for (const [type, points] of Object.entries(rule.then)) {
      const pt = type as ProjectType;
      scores[pt] = (scores[pt] || 0) + points!;
    }
  }

  // Build sorted array
  return Object.entries(scores)
    .filter(([, s]) => s! > 0)
    .sort((a, b) => b[1]! - a[1]!)
    .slice(0, maxResults)
    .map(([type, score]) => {
      const meta = PROJECT_TYPE_META[type as ProjectType];
      return {
        type: type as ProjectType,
        score: score!,
        icon: meta.icon,
        colorClass: meta.colorClass,
      };
    });
}

// ============================================================================
// HELPERS
// ============================================================================

/** Get the visible questions given current answers */
export function getVisibleQuestions(
  answers: Record<string, string>,
  config: WizardConfig = WIZARD_CONFIG,
): WizardQuestion[] {
  return config.questions.filter((q) => {
    if (!q.showWhen) return true;
    return q.showWhen.answerIds.includes(answers[q.showWhen.questionId]);
  });
}
