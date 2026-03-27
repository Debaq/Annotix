import { Rect } from 'react-konva';
import type { BBoxData } from '@/lib/db';

interface BBoxRendererProps {
  id?: string;
  data: BBoxData;
  scale: number;
  imageOffset: { x: number; y: number };
  color: string;
  isSelected?: boolean;
  draggable?: boolean;
  listening?: boolean;
  onClick?: (e?: any) => void;
  onDragEnd?: (e: any) => void;
  onTransformEnd?: (e: any) => void;
}

export function BBoxRenderer({
  id,
  data,
  scale,
  imageOffset,
  color,
  isSelected = false,
  draggable = false,
  listening = true,
  onClick,
  onDragEnd,
  onTransformEnd,
}: BBoxRendererProps) {
  return (
    <Rect
      id={id}
      x={data.x * scale + imageOffset.x}
      y={data.y * scale + imageOffset.y}
      width={data.width * scale}
      height={data.height * scale}
      fill={color + '20'}
      stroke={color}
      strokeWidth={2}
      draggable={draggable}
      listening={listening}
      onClick={onClick}
      onDragEnd={onDragEnd}
      onTransformEnd={onTransformEnd}
    />
  );
}
