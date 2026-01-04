import React from 'react';
import { useTranslation } from 'react-i18next';

interface FloatingZoomControlsProps {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
}

export const FloatingZoomControls: React.FC<FloatingZoomControlsProps> = ({
  zoom,
  onZoomIn,
  onZoomOut,
  onZoomReset,
}) => {
  const { t } = useTranslation();

  return (
    <div className="annotix-floating" style={{ top: '20px', right: '20px' }}>
      <div className="flex flex-col gap-2">
        <h4 className="text-[0.7em] uppercase font-semibold tracking-wider mb-1 text-center" style={{ color: 'var(--annotix-gray)' }}>
          {t('canvas.zoom')}
        </h4>
        <div className="flex items-center gap-1">
          <button
            onClick={onZoomIn}
            className="w-9 h-9 rounded flex items-center justify-center transition-colors"
            style={{
              background: 'var(--annotix-white)',
              border: 'none',
              color: 'var(--annotix-dark)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--annotix-primary)';
              e.currentTarget.style.color = 'white';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'var(--annotix-white)';
              e.currentTarget.style.color = 'var(--annotix-dark)';
            }}
            title={t('canvas.zoomIn')}
          >
            <i className="fas fa-plus"></i>
          </button>
          <div
            className="px-2 py-1 text-xs font-bold text-center min-w-[3.5rem]"
            style={{ color: 'var(--annotix-primary)' }}
          >
            {Math.round(zoom * 100)}%
          </div>
          <button
            onClick={onZoomOut}
            className="w-9 h-9 rounded flex items-center justify-center transition-colors"
            style={{
              background: 'var(--annotix-white)',
              border: 'none',
              color: 'var(--annotix-dark)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--annotix-primary)';
              e.currentTarget.style.color = 'white';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'var(--annotix-white)';
              e.currentTarget.style.color = 'var(--annotix-dark)';
            }}
            title={t('canvas.zoomOut')}
          >
            <i className="fas fa-minus"></i>
          </button>
        </div>
        <button
          onClick={onZoomReset}
          className="w-full px-3 py-1.5 rounded text-xs font-medium transition-colors"
          style={{
            background: 'var(--annotix-white)',
            border: 'none',
            color: 'var(--annotix-dark)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--annotix-primary)';
            e.currentTarget.style.color = 'white';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'var(--annotix-white)';
            e.currentTarget.style.color = 'var(--annotix-dark)';
          }}
          title={t('canvas.resetZoom')}
        >
          <i className="fas fa-expand mr-1"></i>
          {t('canvas.reset')}
        </button>
      </div>
    </div>
  );
};
