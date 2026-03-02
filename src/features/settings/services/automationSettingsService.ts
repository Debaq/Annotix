import { invoke } from '@tauri-apps/api/core';
import type { BrowserAutomationConfig, DetectedBrowser, ProviderSelectorSummary } from '../types';

export const automationSettingsService = {
  detectBrowsers(): Promise<DetectedBrowser[]> {
    return invoke('detect_browsers');
  },

  getConfig(): Promise<BrowserAutomationConfig> {
    return invoke('get_browser_automation_config');
  },

  saveConfig(config: BrowserAutomationConfig): Promise<void> {
    return invoke('save_browser_automation_config', { config });
  },

  testLaunchBrowser(path: string): Promise<string> {
    return invoke('test_launch_browser', { path });
  },

  listProviderSelectors(): Promise<ProviderSelectorSummary[]> {
    return invoke('list_provider_selectors');
  },

  getProviderSelectors(provider: string): Promise<string> {
    return invoke('get_provider_selectors', { provider });
  },

  saveProviderSelectors(provider: string, content: string): Promise<void> {
    return invoke('save_provider_selectors', { provider, content });
  },
};
