import React from 'react';
import i18n from '@/lib/i18n';

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<
  React.PropsWithChildren,
  ErrorBoundaryState
> {
  constructor(props: React.PropsWithChildren) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  handleReload = () => {
    window.location.reload();
  };

  handleCopyError = () => {
    const { error } = this.state;
    if (!error) return;
    const text = `${error.name}: ${error.message}\n\n${error.stack ?? ''}`;
    navigator.clipboard.writeText(text);
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const { error } = this.state;

    return (
      <div className="error-boundary">
        <div className="error-boundary-card">
          <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.8 }}>
            <i className="fas fa-exclamation-triangle" style={{ color: '#e74c3c' }} />
          </div>

          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#2c3e50', marginBottom: 8 }}>
            {i18n.t('common.errorTitle')}
          </h2>

          <p style={{ color: '#7f8c8d', fontSize: 14, marginBottom: 24 }}>
            {i18n.t('common.errorMessage')}
          </p>

          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginBottom: 24 }}>
            <button
              onClick={this.handleReload}
              style={{
                padding: '10px 24px',
                borderRadius: 8,
                border: 'none',
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                color: 'white',
                fontWeight: 600,
                fontSize: 14,
                cursor: 'pointer',
              }}
            >
              <i className="fas fa-redo" style={{ marginRight: 8 }} />
              {i18n.t('common.reloadApp')}
            </button>
            <button
              onClick={this.handleCopyError}
              style={{
                padding: '10px 24px',
                borderRadius: 8,
                border: '1px solid #ddd',
                background: 'white',
                color: '#2c3e50',
                fontWeight: 500,
                fontSize: 14,
                cursor: 'pointer',
              }}
            >
              <i className="fas fa-copy" style={{ marginRight: 8 }} />
              {i18n.t('common.copyError')}
            </button>
          </div>

          {error && (
            <details
              style={{
                textAlign: 'left',
                background: '#f8f9fa',
                borderRadius: 8,
                padding: 12,
                fontSize: 12,
              }}
            >
              <summary style={{ cursor: 'pointer', fontWeight: 600, color: '#7f8c8d', marginBottom: 8 }}>
                {i18n.t('common.technicalDetails')}
              </summary>
              <pre
                style={{
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  margin: 0,
                  color: '#e74c3c',
                  fontFamily: 'monospace',
                  maxHeight: 200,
                  overflow: 'auto',
                }}
              >
                {error.name}: {error.message}
                {'\n\n'}
                {error.stack}
              </pre>
            </details>
          )}
        </div>
      </div>
    );
  }
}
