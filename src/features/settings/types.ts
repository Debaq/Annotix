export interface VenvInfo {
  exists: boolean;
  path: string;
  diskUsageBytes: number;
  diskUsageHuman: string;
  pythonVersion: string | null;
  systemPython: string | null;
}

export interface InstalledPackage {
  name: string;
  version: string;
}

export interface SystemGpuInfo {
  hasNvidia: boolean;
  nvidiaDriverVersion: string | null;
  suggestedCuda: string | null;
}

export interface PackageUpdateProgress {
  message: string;
  progress: number;
  package?: string;
}

export interface PytorchInstallProgress {
  message: string;
  progress: number;
}
