import { Group, Line } from 'react-konva';
import type { PolygonData } from '@/lib/db';

interface PolygonRendererProps {
  id?: string;
  data: PolygonData;
  scale: number;
  imageOffset: { x: number; y: number };
  color: string;
  isSelected?: boolean;
  draggable?: boolean;
  listening?: boolean;
  onClick?: (e?: any) => void;
  onDragEnd?: (e: any) => void;
}

export function PolygonRenderer({
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
}: PolygonRendererProps) {
  const points = data.points.flatMap(p => [
    p.x * scale + imageOffset.x,
    p.y * scale + imageOffset.y
  ]);

  return (
    <Group
      id={id}
      draggable={draggable}
      listening={listening}
      onClick={onClick}
      onDragEnd={onDragEnd}
    >
      <Line
        points={points}
        fill={color + '20'}
        stroke={color}
        strokeWidth={2}
        closed={true}
      />
    </Group>
  );
}
