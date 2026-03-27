import { Group, Circle } from 'react-konva';
import type { LandmarksData } from '@/lib/db';

interface LandmarksRendererProps {
  data: LandmarksData;
  scale: number;
  imageOffset: { x: number; y: number };
  color: string;
  isSelected?: boolean;
  listening?: boolean;
  onClick?: (e?: any) => void;
}

export function LandmarksRenderer({
  data,
  scale,
  imageOffset,
  color,
  isSelected = false,
  listening = true,
  onClick,
}: LandmarksRendererProps) {
  return (
    <Group listening={listening} onClick={onClick}>
      {data.points.map((lm, idx) => (
        <Circle
          key={`lm-${idx}`}
          x={lm.x * scale + imageOffset.x}
          y={lm.y * scale + imageOffset.y}
          radius={5}
          fill={color}
          stroke="white"
          strokeWidth={2}
        />
      ))}
    </Group>
  );
}
