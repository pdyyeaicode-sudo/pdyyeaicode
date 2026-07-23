import { createPortal } from 'react-dom';
import { Toast } from './Toast';

export interface ToastContainerProps {
  toasts: Array<{ id: string; message: string; type: 'info' | 'success' | 'error' }>;
  onDismiss: (id: string) => void;
}

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  if (typeof document === 'undefined') return null;
  
  return createPortal(
    <div style={{
      position: 'fixed',
      bottom: 20,
      right: 20,
      zIndex: 10000,
      display: 'flex',
      flexDirection: 'column-reverse'
    }}>
      {toasts.slice(0, 3).map(toast => (
        <Toast key={toast.id} {...toast} onDismiss={onDismiss} />
      ))}
    </div>,
    document.body
  );
}
