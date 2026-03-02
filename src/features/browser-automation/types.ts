// ─── Browser Automation Types ────────────────────────────────────────────────

export type StepState = 'pending' | 'running' | 'waiting_user' | 'completed' | 'failed' | 'skipped';

export type SessionState =
  | 'idle'
  | 'detecting_browser'
  | 'launching_browser'
  | 'waiting_login'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type BrowserProvider = 'colab_free' | 'kimi' | 'qwen' | 'deep_seek' | 'hugging_chat';

export interface AutomationStep {
  id: string;
  name: string;
  state: StepState;
  requiresUser: boolean;
  userInstruction?: string;
  progress: number;
}

export interface AutomationSession {
  id: string;
  state: SessionState;
  provider: BrowserProvider;
  steps: AutomationStep[];
  currentStepIndex: number;
  logs: string[];
}

export type AutomationResult =
  | { type: 'model_downloaded'; path: string }
  | { type: 'llm_response'; text: string };

export interface AutomationRequest {
  provider: BrowserProvider;
  projectId?: string;
  trainingJobId?: string;
  trainingParams?: Record<string, unknown>;
  prompt?: string;
  datasetPath?: string;
  browserPath?: string;
}

export interface DetectedBrowser {
  name: string;
  path: string;
  version: string | null;
}
