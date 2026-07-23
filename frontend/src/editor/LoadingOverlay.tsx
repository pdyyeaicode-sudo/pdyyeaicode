interface LoadingOverlayProps {
  message?: string;
  progress?: number; // 0-100
}

export function LoadingOverlay({ message = 'Loading...', progress }: LoadingOverlayProps) {
  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 10000,
      backdropFilter: 'blur(4px)'
    }}>
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
      <div style={{
        background: 'var(--bg-primary, #ffffff)',
        padding: '32px',
        borderRadius: '12px',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
        textAlign: 'center',
        minWidth: '240px'
      }}>
        <div className="loading-spinner" style={{
          width: '48px',
          height: '48px',
          border: '4px solid var(--border-color, #e0e0e0)',
          borderTopColor: 'var(--accent-primary, #4a9eff)',
          borderRadius: '50%',
          margin: '0 auto 16px',
          animation: 'spin 1s linear infinite'
        }} />
        
        <div style={{ 
          fontSize: '14px', 
          color: 'var(--text-secondary, #666666)',
          marginBottom: progress !== undefined ? '12px' : 0
        }}>
          {message}
        </div>

        {progress !== undefined && (
          <div style={{
            width: '100%',
            height: '4px',
            background: 'var(--bg-tertiary, #f0f0f0)',
            borderRadius: '2px',
            overflow: 'hidden'
          }}>
            <div style={{
              width: `${progress}%`,
              height: '100%',
              background: 'var(--accent-primary, #4a9eff)',
              transition: 'width 0.3s ease'
            }} />
          </div>
        )}
      </div>
    </div>
  );
}
