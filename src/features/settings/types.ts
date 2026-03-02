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

export interface BrowserAutomationConfig {
  preferredBrowserPath: string | null;
  preferredBrowserName: string | null;
  defaultProvider: string | null;
  stepTimeoutMs: number;
  maxRetries: number;
  userActionTimeoutSecs: number;
  llmResponseTimeoutSecs: number;
  userDataDir: string | null;
  windowWidth: number;
  windowHeight: number;
}

export interface ProviderSelectorSummary {
  key: string;
  name: string;
  url: string;
  selectorCount: number;
}

export interface DetectedBrowser {
  name: string;
  path: string;
  version: string | null;
}
