import { ReactNode, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useProjects } from '../hooks/useProjects';
import { ProjectTypeWizard } from './ProjectTypeWizard';
import { ClassManager } from './ClassManager';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ProjectType, ClassDefinition } from '@/lib/db';
import '@/styles/projects.css';

interface CreateProjectDialogProps {
  trigger?: ReactNode;
}

interface ProjectTypeOption {
  value: ProjectType;
  icon: string;
  colorClass: string;
}

const IMAGE_VIDEO_TYPES: ProjectTypeOption[] = [
  { value: 'bbox', icon: 'fa-vector-square', colorClass: 'bg-blue-100 text-blue-600' },
  { value: 'mask', icon: 'fa-paintbrush', colorClass: 'bg-purple-100 text-purple-600' },
  { value: 'polygon', icon: 'fa-draw-polygon', colorClass: 'bg-green-100 text-green-600' },
  { value: 'keypoints', icon: 'fa-sitemap', colorClass: 'bg-orange-100 text-orange-600' },
  { value: 'landmarks', icon: 'fa-location-dot', colorClass: 'bg-red-100 text-red-600' },
  { value: 'obb', icon: 'fa-rotate', colorClass: 'bg-indigo-100 text-indigo-600' },
  { value: 'classification', icon: 'fa-tag', colorClass: 'bg-yellow-100 text-yellow-600' },
  { value: 'multi-label-classification', icon: 'fa-tags', colorClass: 'bg-amber-100 text-amber-600' },
];

const TIMESERIES_TYPES: ProjectTypeOption[] = [
  { value: 'timeseries-classification', icon: 'fa-chart-line', colorClass: 'bg-cyan-100 text-cyan-600' },
  { value: 'timeseries-forecasting', icon: 'fa-chart-area', colorClass: 'bg-teal-100 text-teal-600' },
  { value: 'anomaly-detection', icon: 'fa-exclamation-triangle', colorClass: 'bg-rose-100 text-rose-600' },
  { value: 'timeseries-segmentation', icon: 'fa-layer-group', colorClass: 'bg-emerald-100 text-emerald-600' },
  { value: 'pattern-recognition', icon: 'fa-wave-square', colorClass: 'bg-violet-100 text-violet-600' },
  { value: 'event-detection', icon: 'fa-bolt', colorClass: 'bg-fuchsia-100 text-fuchsia-600' },
  { value: 'timeseries-regression', icon: 'fa-chart-simple', colorClass: 'bg-sky-100 text-sky-600' },
  { value: 'clustering', icon: 'fa-circle-nodes', colorClass: 'bg-lime-100 text-lime-600' },
  { value: 'imputation', icon: 'fa-fill-drip', colorClass: 'bg-pink-100 text-pink-600' },
];

const TABULAR_TYPES: ProjectTypeOption[] = [
  { value: 'tabular', icon: 'fa-table', colorClass: 'bg-emerald-100 text-emerald-600' },
];

const AUDIO_TYPES: ProjectTypeOption[] = [
  { value: 'speech-recognition', icon: 'fa-microphone', colorClass: 'bg-blue-100 text-blue-600' },
  { value: 'audio-classification', icon: 'fa-music', colorClass: 'bg-indigo-100 text-indigo-600' },
  { value: 'sound-event-detection', icon: 'fa-volume-high', colorClass: 'bg-orange-100 text-orange-600' },
];

type CategoryKey = 'imageVideo' | 'audio' | 'timeSeries' | 'tabular' | 'language' | '3d';

const CATEGORIES: { key: CategoryKey; types: ProjectTypeOption[]; icon: string; disabled?: boolean }[] = [
  { key: 'imageVideo', types: IMAGE_VIDEO_TYPES, icon: 'fa-photo-film' },
  { key: 'audio', types: AUDIO_TYPES, icon: 'fa-headphones' },
  { key: 'timeSeries', types: TIMESERIES_TYPES, icon: 'fa-chart-line' },
  { key: 'tabular', types: TABULAR_TYPES, icon: 'fa-table' },
  { key: 'language', types: [], icon: 'fa-language', disabled: true },
  { key: '3d', types: [], icon: 'fa-cube', disabled: true },
];

const TYPES_WITHOUT_CLASSES: ProjectType[] = ['tabular', 'speech-recognition', 'audio-classification', 'sound-event-detection'];

function needsClasses(type: ProjectType): boolean {
  return !TYPES_WITHOUT_CLASSES.includes(type);
}

export function CreateProjectDialog({ trigger }: CreateProjectDialogProps) {
  const { t } = useTranslation();
  const { createProject } = useProjects();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<ProjectType>('bbox');
  const [activeCategory, setActiveCategory] = useState<CategoryKey>('imageVideo');
  const [classes, setClasses] = useState<ClassDefinition[]>([
    { id: 0, name: 'Object', color: '#ff0000' },
  ]);
  const [isCreating, setIsCreating] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);

  const selectedTypeInfo = useMemo(() => {
    for (const cat of CATEGORIES) {
      const found = cat.types.find(t => t.value === type);
      if (found) return found;
    }
    return IMAGE_VIDEO_TYPES[0];
  }, [type]);

  const resetForm = () => {
    setStep(1);
    setName('');
    setDescription('');
    setType('bbox');
    setActiveCategory('imageVideo');
    setClasses([{ id: 0, name: 'Object', color: '#ff0000' }]);
  };

  const handleOpenChange = (value: boolean) => {
    setOpen(value);
    if (!value) resetForm();
  };

  const handleSelectType = (newType: ProjectType) => {
    setType(newType);
  };

  const handleNext = () => {
    setStep(2);
  };

  const handleBack = () => {
    setStep(1);
  };

  const handleCreate = async () => {
    if (!name.trim() || (needsClasses(type) && classes.length === 0)) {
      return;
    }

    setIsCreating(true);
    try {
      await createProject({
        name: name.trim(),
        type,
        classes: needsClasses(type) ? classes : [],
      });
      handleOpenChange(false);
    } catch (error) {
      console.error('Failed to create project:', error);
    } finally {
      setIsCreating(false);
    }
  };

  const activeTypes = useMemo(() => {
    const cat = CATEGORIES.find(c => c.key === activeCategory);
    return cat?.types ?? [];
  }, [activeCategory]);

  const handleCategoryChange = (newCat: string) => {
    const catKey = newCat as CategoryKey;
    const cat = CATEGORIES.find(c => c.key === catKey);
    setActiveCategory(catKey);
    if (cat && cat.types.length > 0 && !cat.types.some(t => t.value === type)) {
      setType(cat.types[0].value);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger || (
          <Button>
            <i className="fas fa-plus mr-2"></i>
            {t('projects.create')}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="w-[85vw] h-[85vh] max-w-none max-h-none" closeLabel={t('common.close')}>
        <DialogHeader className="shrink-0">
          <DialogTitle>{t('projects.create')}</DialogTitle>
          <DialogDescription>{t('projects.createDescription')}</DialogDescription>
        </DialogHeader>

        {step === 1 ? (
          <div className="flex-1 min-h-0 flex flex-col py-2">
            <div className="shrink-0 flex items-center justify-between mb-3">
              <Label className="text-base font-semibold">{t('projects.type.label')}</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-auto py-1 px-2 text-xs text-primary"
                onClick={() => setWizardOpen(true)}
              >
                <i className="fas fa-wand-magic-sparkles mr-1.5"></i>
                {t('wizard.trigger')}
              </Button>
            </div>

            <Tabs className="shrink-0" value={activeCategory} onValueChange={handleCategoryChange}>
              <TabsList className="w-full grid grid-cols-6">
                {CATEGORIES.map(cat => (
                  <TabsTrigger
                    key={cat.key}
                    value={cat.key}
                    disabled={cat.disabled}
                    className={`gap-1.5 text-xs sm:text-sm ${cat.disabled ? 'opacity-40' : ''}`}
                  >
                    <i className={`fas ${cat.icon}`}></i>
                    <span className="hidden sm:inline">{t(`project.categories.${cat.key}`)}</span>
                    {cat.disabled && (
                      <span className="hidden lg:inline text-[9px] font-medium leading-none rounded-full bg-orange-500/15 text-orange-600 dark:text-orange-400 px-1.5 py-0.5">
                        {t('project.categories.comingSoon')}
                      </span>
                    )}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>

            <div className="flex flex-1 min-h-0 mt-3 border rounded-lg overflow-hidden">
              {/* Lista de tipos */}
              <div className="w-[30%] shrink-0 border-r overflow-y-auto bg-muted/20 divide-y divide-border/50">
                {activeTypes.map(option => {
                  const isActive = type === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors border-l-2 ${
                        isActive
                          ? 'border-l-primary bg-primary/10 font-medium'
                          : 'border-l-transparent hover:bg-accent/50'
                      }`}
                      onClick={() => handleSelectType(option.value)}
                    >
                      <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${option.colorClass}`}>
                        <i className={`fas ${option.icon} text-xs`} />
                      </div>
                      <span className="text-sm truncate">{t(`project.types.${option.value}.name`)}</span>
                    </button>
                  );
                })}
              </div>

              {/* Detalle del tipo seleccionado */}
              <div className="flex-1 overflow-y-auto p-6 flex flex-col">
                <div className="flex items-center gap-4 mb-4">
                  <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-xl ${selectedTypeInfo.colorClass}`}>
                    <i className={`fas ${selectedTypeInfo.icon} text-2xl`} />
                  </div>
                  <h3 className="text-xl font-semibold">{t(`project.types.${type}.name`)}</h3>
                </div>

                <p className="text-muted-foreground mb-5 leading-relaxed">
                  {t(`projectDetail.types.${type}.detailAbout`)}
                </p>

                <div className="mb-5">
                  <h4 className="font-medium mb-2.5 flex items-center gap-2">
                    <i className="fas fa-list-check text-primary text-sm" />
                    {t('projectDetail.whatCanYouDo')}
                  </h4>
                  <ul className="space-y-2 ml-1">
                    {[1, 2, 3, 4].map(i => {
                      const key = `projectDetail.types.${type}.canDo${i}`;
                      const text = t(key);
                      if (text === key) return null;
                      return (
                        <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                          <i className="fas fa-check text-primary mt-0.5 text-xs shrink-0" />
                          <span>{text}</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>

                <div className="rounded-lg bg-muted/40 border p-4">
                  <h4 className="font-medium mb-1.5 flex items-center gap-2 text-sm">
                    <i className="fas fa-lightbulb text-amber-500" />
                    {t('projectDetail.exampleUse')}
                  </h4>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {t(`projectDetail.types.${type}.exampleUse`)}
                  </p>
                </div>

                <div className="mt-auto flex justify-end pt-4">
                  <Button onClick={handleNext}>
                    {t('common.next')}
                    <i className="fas fa-arrow-right ml-2" />
                  </Button>
                </div>
              </div>
            </div>

            <ProjectTypeWizard
              open={wizardOpen}
              onOpenChange={setWizardOpen}
              onSelectType={(newType) => {
                setType(newType);
                for (const cat of CATEGORIES) {
                  if (cat.types.some(t => t.value === newType)) {
                    setActiveCategory(cat.key);
                    break;
                  }
                }
              }}
            />
          </div>
        ) : (
          <>
            <div className="flex-1 space-y-4 py-2 min-h-0 overflow-y-auto pr-2">
              {/* Tipo seleccionado (resumen) */}
              <div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-3">
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${selectedTypeInfo.colorClass}`}>
                  <i className={`fas ${selectedTypeInfo.icon}`}></i>
                </div>
                <div className="flex-1">
                  <p className="font-medium text-sm">{t(`project.types.${type}.name`)}</p>
                  <p className="text-xs text-muted-foreground">
                    {t(`project.types.${type}.description`)}
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={handleBack} className="text-xs">
                  <i className="fas fa-pen mr-1.5"></i>
                  {t('common.change')}
                </Button>
              </div>

              {/* Nombre */}
              <div className="space-y-2">
                <Label htmlFor="project-name">{t('projects.name')}</Label>
                <Input
                  id="project-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t('projects.namePlaceholder')}
                  autoFocus
                />
              </div>

              {/* Descripción */}
              <div className="space-y-2">
                <Label htmlFor="project-description">
                  {t('projects.descriptionLabel')}
                  <span className="text-muted-foreground font-normal ml-1">({t('common.optional')})</span>
                </Label>
                <Input
                  id="project-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t('projects.descriptionPlaceholder')}
                />
              </div>

              {/* Clases */}
              {needsClasses(type) && (
                <div className="space-y-2">
                  <Label>{t('projects.classes')}</Label>
                  <ClassManager classes={classes} onChange={setClasses} />
                </div>
              )}
            </div>

            <DialogFooter className="shrink-0 flex-row justify-between sm:justify-between">
              <Button variant="outline" onClick={handleBack}>
                <i className="fas fa-arrow-left mr-2"></i>
                {t('common.back')}
              </Button>
              <Button
                onClick={handleCreate}
                disabled={isCreating || !name.trim() || (needsClasses(type) && classes.length === 0)}
              >
                {isCreating ? (
                  <>
                    <i className="fas fa-spinner fa-spin mr-2"></i>
                    {t('common.creating')}
                  </>
                ) : (
                  <>
                    <i className="fas fa-plus mr-2"></i>
                    {t('common.create')}
                  </>
                )}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
