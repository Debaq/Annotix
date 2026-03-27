import * as tauriDb from '@/lib/tauriDb';

export const audioEditService = {
  trim: tauriDb.audioTrim,
  cut: tauriDb.audioCut,
  deleteRange: tauriDb.audioDeleteRange,
  split: tauriDb.audioSplit,
  silenceRange: tauriDb.audioSilenceRange,
  normalize: tauriDb.audioNormalize,
  equalize: tauriDb.audioEqualize,
};
