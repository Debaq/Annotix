import { Group, Rect } from 'react-konva';
import type { OBBData } from '@/lib/db';

interface OBBRendererProps {
  id?: string;
  data: OBBData;
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

export function OBBRenderer({
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
}: OBBRendererProps) {
  const x = data.x * scale + imageOffset.x;
  const y = data.y * scale + imageOffset.y;
  const w = data.width * scale;
  const h = data.height * scale;
  const rot = data.rotation;

  return (
    <Group
      id={id}
      x={x}
      y={y}
      rotation={rot}
      draggable={draggable}
      listening={listening}
      onClick={onClick}
      onDragEnd={onDragEnd}
      onTransformEnd={onTransformEnd}
    >
      <Rect
        x={-w / 2}
        y={-h / 2}
        width={w}
        height={h}
        fill={color + '20'}
        stroke={color}
        strokeWidth={2}
        strokeScaleEnabled={false}
      />
    </Group>
  );
}
