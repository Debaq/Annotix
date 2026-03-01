import { invoke } from '@tauri-apps/api/core';
import type { VenvInfo, InstalledPackage, SystemGpuInfo } from '../types';

export const settingsService = {
  getVenvInfo(): Promise<VenvInfo> {
    return invoke('get_venv_info');
  },

  listInstalledPackages(): Promise<InstalledPackage[]> {
    return invoke('list_installed_packages');
  },

  updatePackages(packages: string[]): Promise<void> {
    return invoke('update_packages', { packages });
  },

  installPytorch(cudaVersion: string): Promise<void> {
    return invoke('install_pytorch', { cudaVersion });
  },

  installOnnx(withGpu: boolean): Promise<void> {
    return invoke('install_onnx', { withGpu });
  },

  removeVenv(): Promise<void> {
    return invoke('remove_venv');
  },

  detectSystemGpu(): Promise<SystemGpuInfo> {
    return invoke('detect_system_gpu');
  },
};
