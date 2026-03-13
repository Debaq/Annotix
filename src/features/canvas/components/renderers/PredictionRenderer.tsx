import { Rect, Group, Text, Line } from 'react-konva';
import type { PredictionEntry, BboxData } from '@/features/inference/types';

interface PredictionRendererProps {
  prediction: PredictionEntry;
  scale: number;
  imageOffset: { x: number; y: number };
  imageWidth: number;
  imageHeight: number;
  color: string;
  onClick?: () => void;
}

export function PredictionRenderer({
  prediction,
  scale,
  imageOffset,
  imageWidth,
  imageHeight,
  color,
  onClick,
}: PredictionRendererProps) {
  const data = prediction.data as BboxData;
  if (!data || data.x == null || data.y == null) return null;

  // Predicciones están en coordenadas normalizadas (0..1), convertir a píxeles de imagen
  const px = data.x * imageWidth;
  const py = data.y * imageHeight;
  const pw = data.width * imageWidth;
  const ph = data.height * imageHeight;

  // Convertir a coordenadas canvas
  const x = px * scale + imageOffset.x;
  const y = py * scale + imageOffset.y;
  const w = pw * scale;
  const h = ph * scale;

  const isPending = prediction.status === 'pending';
  const isAccepted = prediction.status === 'accepted';
  const isRejected = prediction.status === 'rejected';

  const strokeColor = isRejected ? '#ef4444' : isAccepted ? '#22c55e' : color;
  const fillOpacity = isRejected ? '10' : '15';
  const conf = Math.round(prediction.confidence * 100);
  const label = `${prediction.className} ${conf}%`;

  return (
    <Group onClick={onClick} listening={!!onClick}>
      {/* Bbox con borde punteado */}
      <Rect
        x={x}
        y={y}
        width={w}
        height={h}
        fill={strokeColor + fillOpacity}
        stroke={strokeColor}
        strokeWidth={isPending ? 2 : 1.5}
        dash={isPending ? [6, 3] : undefined}
        opacity={isRejected ? 0.4 : 1}
      />

      {/* Etiqueta */}
      {w > 30 && h > 20 && (
        <Group x={x} y={y - 16}>
          <Rect
            width={Math.min(label.length * 6.5 + 8, w)}
            height={16}
            fill={strokeColor}
            cornerRadius={[2, 2, 0, 0]}
            opacity={0.85}
          />
          <Text
            text={label}
            fontSize={10}
            fontFamily="monospace"
            fill="white"
            x={4}
            y={2}
            width={Math.min(label.length * 6.5, w - 8)}
            ellipsis={true}
          />
        </Group>
      )}

      {/* Indicador de estado */}
      {isAccepted && (
        <Group x={x + w - 14} y={y + 2}>
          <Rect width={12} height={12} fill="#22c55e" cornerRadius={2} />
          <Line points={[2, 6, 5, 9, 10, 3]} stroke="white" strokeWidth={1.5} />
        </Group>
      )}
      {isRejected && (
        <Group x={x + w - 14} y={y + 2}>
          <Rect width={12} height={12} fill="#ef4444" cornerRadius={2} />
          <Line points={[3, 3, 9, 9]} stroke="white" strokeWidth={1.5} />
          <Line points={[9, 3, 3, 9]} stroke="white" strokeWidth={1.5} />
        </Group>
      )}
    </Group>
  );
}
