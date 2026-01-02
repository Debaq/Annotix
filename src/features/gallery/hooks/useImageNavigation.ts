import { useImages } from './useImages';
import { useUIStore } from '../../core/store/uiStore';

export function useImageNavigation() {
  const { images } = useImages();
  const { currentImageId, setCurrentImageId } = useUIStore();

  const currentIndex = images.findIndex((img) => img.id === currentImageId);
  const total = images.length;

  const canNavigatePrevious = currentIndex > 0;
  const canNavigateNext = currentIndex < total - 1;

  const navigatePrevious = () => {
    if (canNavigatePrevious) {
      setCurrentImageId(images[currentIndex - 1].id!);
    }
  };

  const navigateNext = () => {
    if (canNavigateNext) {
      setCurrentImageId(images[currentIndex + 1].id!);
    }
  };

  return {
    currentIndex,
    total,
    canNavigatePrevious,
    canNavigateNext,
    navigatePrevious,
    navigateNext,
  };
}
