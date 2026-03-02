import { invoke } from '@tauri-apps/api/core';
import type { AutomationRequest, AutomationSession, DetectedBrowser } from '../types';

export const automationService = {
  detectBrowsers(): Promise<DetectedBrowser[]> {
    return invoke('detect_browsers');
  },

  startAutomation(request: AutomationRequest): Promise<string> {
    return invoke('start_browser_automation', { request });
  },

  pauseAutomation(sessionId: string): Promise<void> {
    return invoke('pause_automation', { sessionId });
  },

  resumeAutomation(sessionId: string): Promise<void> {
    return invoke('resume_automation', { sessionId });
  },

  cancelAutomation(sessionId: string): Promise<void> {
    return invoke('cancel_automation', { sessionId });
  },

  getSession(sessionId: string): Promise<AutomationSession | null> {
    return invoke('get_automation_session', { sessionId });
  },
};
