import { useEffect, useState } from 'react';

export interface ToastProps {
  id: string;
  message: string;
  type: 'info' | 'success' | 'error';
  onDismiss: (id: string) => void;
}

export function Toast({ id, message, type, onDismiss }: ToastProps) {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const hideTimer = setTimeout(() => setIsVisible(false), 2000);
    const removeTimer = setTimeout(() => onDismiss(id), 2300); // 300ms for fade out
    return () => {
      clearTimeout(hideTimer);
      clearTimeout(removeTimer);
    };
  }, [id, onDismiss]);

  const bgColor = type === 'error' ? 'var(--error)' : type === 'success' ? 'var(--success)' : 'var(--panel-bg)';

  return (
    <div
      style={{
        background: bgColor,
        color: 'var(--text-primary)',
        padding: '12px 16px',
        borderRadius: '8px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
        marginBottom: '8px',
        transition: 'all 0.3s ease-out',
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? 'translateY(0)' : 'translateY(20px)',
        animation: 'slideIn 0.2s ease-out',
        maxWidth: '300px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        border: '1px solid var(--border-color)',
        fontSize: '14px'
      }}
    >
      <span>{message}</span>
      <button
        onClick={() => setIsVisible(false)}
        style={{ marginLeft: '12px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
      >
        ×
      </button>
    </div>
  );
}
