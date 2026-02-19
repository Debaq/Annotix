import { Group, Line, Circle } from 'react-konva';
import type { KeypointsData } from '@/lib/db';
import { skeletonPresets } from '../../data/skeletonPresets';

interface KeypointsRendererProps {
  data: KeypointsData;
  scale: number;
  imageOffset: { x: number; y: number };
  color: string;
  isSelected?: boolean;
  listening?: boolean;
  onClick?: () => void;
}

export function KeypointsRenderer({
  data,
  scale,
  imageOffset,
  color,
  isSelected = false,
  listening = true,
  onClick,
}: KeypointsRendererProps) {
  const preset = skeletonPresets[data.skeletonType];
  if (!preset) return null;

  const connectionStrokeWidth = isSelected ? 3 : 2;
  const keypointRadius = isSelected ? 6 : 5;
  const keypointStrokeWidth = isSelected ? 3 : 2;

  return (
    <Group listening={listening} onClick={onClick}>
      {/* Draw connections */}
      {preset.connections.map(([startIdx, endIdx], connIdx) => {
        const start = data.points[startIdx];
        const end = data.points[endIdx];
        if (!start || !end || !start.visible || !end.visible) return null;

        return (
          <Line
            key={`conn-${connIdx}`}
            points={[
              start.x * scale + imageOffset.x,
              start.y * scale + imageOffset.y,
              end.x * scale + imageOffset.x,
              end.y * scale + imageOffset.y,
            ]}
            stroke={color}
            strokeWidth={connectionStrokeWidth}
          />
        );
      })}

      {/* Draw keypoints */}
      {data.points.map((kp, idx) => {
        if (!kp.visible) return null;

        return (
          <Circle
            key={`kp-${idx}`}
            x={kp.x * scale + imageOffset.x}
            y={kp.y * scale + imageOffset.y}
            radius={keypointRadius}
            fill={color}
            stroke="white"
            strokeWidth={keypointStrokeWidth}
          />
        );
      })}
    </Group>
  );
}
