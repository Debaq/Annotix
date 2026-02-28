import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { OPTIMIZERS } from '../utils/presets';
import type { TrainingConfig } from '../types';

interface TrainingAdvancedConfigProps {
  config: TrainingConfig;
  onChange: (partial: Partial<TrainingConfig>) => void;
}

export function TrainingAdvancedConfig({ config, onChange }: TrainingAdvancedConfigProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <h4 className="text-sm font-medium">{t('training.config.advanced')}</h4>

      <div className="grid grid-cols-2 gap-4">
        {/* Epochs */}
        <div className="space-y-1.5">
          <Label>{t('training.config.epochs')}</Label>
          <Input
            type="number"
            min={1}
            max={9999}
            value={config.epochs}
            onChange={(e) => onChange({ epochs: parseInt(e.target.value) || 100 })}
          />
        </div>

        {/* Batch Size */}
        <div className="space-y-1.5">
          <Label>{t('training.config.batchSize')}</Label>
          <Input
            type="number"
            min={-1}
            max={512}
            value={config.batchSize}
            onChange={(e) => onChange({ batchSize: parseInt(e.target.value) || 16 })}
          />
          <p className="text-[10px] text-muted-foreground">{t('training.config.batchSizeHint')}</p>
        </div>

        {/* Image Size */}
        <div className="space-y-1.5">
          <Label>{t('training.config.imageSize')}</Label>
          <Select
            value={String(config.imgsz)}
            onValueChange={(v) => onChange({ imgsz: parseInt(v) })}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {[320, 416, 480, 640, 800, 1024, 1280].map((s) => (
                <SelectItem key={s} value={String(s)}>{s}px</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Optimizer */}
        <div className="space-y-1.5">
          <Label>{t('training.config.optimizer')}</Label>
          <Select
            value={config.optimizer}
            onValueChange={(v) => onChange({ optimizer: v })}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {OPTIMIZERS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Learning Rate */}
        <div className="space-y-1.5">
          <Label>{t('training.config.lr0')}</Label>
          <Input
            type="number"
            step={0.001}
            min={0.0001}
            max={1}
            value={config.lr0}
            onChange={(e) => onChange({ lr0: parseFloat(e.target.value) || 0.01 })}
          />
        </div>

        {/* LR Final */}
        <div className="space-y-1.5">
          <Label>{t('training.config.lrf')}</Label>
          <Input
            type="number"
            step={0.001}
            min={0.0001}
            max={1}
            value={config.lrf}
            onChange={(e) => onChange({ lrf: parseFloat(e.target.value) || 0.01 })}
          />
        </div>

        {/* Patience */}
        <div className="space-y-1.5">
          <Label>{t('training.config.patience')}</Label>
          <Input
            type="number"
            min={0}
            max={999}
            value={config.patience}
            onChange={(e) => onChange({ patience: parseInt(e.target.value) || 25 })}
          />
        </div>

        {/* Val Split */}
        <div className="space-y-1.5">
          <Label>{t('training.config.valSplit')}</Label>
          <Input
            type="number"
            step={0.05}
            min={0.05}
            max={0.5}
            value={config.valSplit}
            onChange={(e) => onChange({ valSplit: parseFloat(e.target.value) || 0.2 })}
          />
        </div>

        {/* Workers */}
        <div className="space-y-1.5">
          <Label>{t('training.config.workers')}</Label>
          <Input
            type="number"
            min={0}
            max={32}
            value={config.workers}
            onChange={(e) => onChange({ workers: parseInt(e.target.value) || 4 })}
          />
        </div>

        {/* Device */}
        <div className="space-y-1.5">
          <Label>{t('training.config.device')}</Label>
          <Select
            value={config.device}
            onValueChange={(v) => onChange({ device: v })}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Auto</SelectItem>
              <SelectItem value="cpu">CPU</SelectItem>
              <SelectItem value="cuda:0">CUDA:0</SelectItem>
              <SelectItem value="mps">MPS (Apple)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
