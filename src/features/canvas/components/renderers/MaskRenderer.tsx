import { useState, useEffect } from 'react';
import { Image as KonvaImage } from 'react-konva';
import type { MaskData } from '@/lib/db';

interface MaskRendererProps {
  data: MaskData;
  scale: number;
  imageOffset: { x: number; y: number };
  opacity?: number;
  listening?: boolean;
  onClick?: () => void;
}

export function MaskRenderer({ data, scale, imageOffset, opacity = 0.6, listening = true, onClick }: MaskRendererProps) {
  const [maskImg, setMaskImg] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    const img = new window.Image();
    img.src = data.base64png;
    img.onload = () => setMaskImg(img);
  }, [data.base64png]);

  if (!maskImg) return null;

  return (
    <KonvaImage
      image={maskImg}
      x={imageOffset.x}
      y={imageOffset.y}
      scaleX={scale}
      scaleY={scale}
      opacity={opacity}
      listening={listening}
      onClick={onClick}
    />
  );
}
