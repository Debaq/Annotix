import { useMemo } from 'react';
import { VideoTrack } from '@/lib/db';
import { interpolateBBoxesForFrame } from '../utils/interpolation';

export function useInterpolation(tracks: VideoTrack[], frameIndex: number) {
  const interpolatedBBoxes = useMemo(() => {
    return interpolateBBoxesForFrame(tracks, frameIndex);
  }, [tracks, frameIndex]);

  return { interpolatedBBoxes };
}
