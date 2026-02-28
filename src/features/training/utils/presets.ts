import type { AugmentationConfig } from '../types';

export const AUGMENTATION_LEVELS: Record<string, AugmentationConfig> = {
  light: {
    mosaic: 0.5,
    mixup: 0.0,
    hsv_h: 0.015,
    hsv_s: 0.4,
    hsv_v: 0.2,
    flipud: 0.0,
    fliplr: 0.5,
    degrees: 0.0,
    scale: 0.3,
    shear: 0.0,
    perspective: 0.0,
    copy_paste: 0.0,
    erasing: 0.0,
  },
  medium: {
    mosaic: 1.0,
    mixup: 0.1,
    hsv_h: 0.015,
    hsv_s: 0.7,
    hsv_v: 0.4,
    flipud: 0.1,
    fliplr: 0.5,
    degrees: 10.0,
    scale: 0.5,
    shear: 2.0,
    perspective: 0.0001,
    copy_paste: 0.1,
    erasing: 0.1,
  },
  heavy: {
    mosaic: 1.0,
    mixup: 0.3,
    hsv_h: 0.02,
    hsv_s: 0.9,
    hsv_v: 0.5,
    flipud: 0.3,
    fliplr: 0.5,
    degrees: 20.0,
    scale: 0.9,
    shear: 5.0,
    perspective: 0.001,
    copy_paste: 0.3,
    erasing: 0.3,
  },
};

export const OPTIMIZERS = [
  { value: 'auto', label: 'Auto' },
  { value: 'SGD', label: 'SGD' },
  { value: 'Adam', label: 'Adam' },
  { value: 'AdamW', label: 'AdamW' },
  { value: 'NAdam', label: 'NAdam' },
  { value: 'RAdam', label: 'RAdam' },
  { value: 'RMSProp', label: 'RMSProp' },
];

export const EXPORT_FORMATS = [
  { value: 'onnx', label: 'ONNX' },
  { value: 'torchscript', label: 'TorchScript' },
  { value: 'engine', label: 'TensorRT' },
  { value: 'coreml', label: 'CoreML' },
  { value: 'tflite', label: 'TFLite' },
  { value: 'openvino', label: 'OpenVINO' },
];

export function getDefaultConfig() {
  return {
    yoloVersion: 'yolo11',
    task: 'detect',
    modelSize: 'n',
    epochs: 100,
    batchSize: 16,
    imgsz: 640,
    device: 'auto',
    optimizer: 'auto',
    lr0: 0.01,
    lrf: 0.01,
    patience: 25,
    valSplit: 0.2,
    workers: 4,
    augmentation: { ...AUGMENTATION_LEVELS.medium },
    exportFormats: [] as string[],
    resume: false,
  };
}
