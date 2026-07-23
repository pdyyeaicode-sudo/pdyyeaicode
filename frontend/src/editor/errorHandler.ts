type ErrorLevel = 'warning' | 'error' | 'fatal';

interface ErrorInfo {
  code: string;
  message: string;
  level: ErrorLevel;
  userMessage: string;
  action?: () => void;
}

const errorMessages: Record<string, ErrorInfo> = {
  PASTE_FAILED: {
    code: 'PASTE_FAILED',
    message: 'Failed to deserialize clipboard data',
    level: 'error',
    userMessage: 'Could not paste layers. The clipboard data may be corrupted.',
  },
  UNDO_FAILED: {
    code: 'UNDO_FAILED',
    message: 'Failed to apply undo command',
    level: 'error',
    userMessage: 'Could not undo the last action. The history may be corrupted.',
  },
  LAYER_NOT_FOUND: {
    code: 'LAYER_NOT_FOUND',
    message: 'Layer not found in document',
    level: 'warning',
    userMessage: 'The layer you are trying to edit no longer exists.',
  },
  SAVE_FAILED: {
    code: 'SAVE_FAILED',
    message: 'Failed to save document to server',
    level: 'fatal',
    userMessage: 'Could not save your work. Please check your connection and try again.',
    action: () => {
      // Retry save or show recovery options
    }
  },
  INVALID_LAYER_DATA: {
    code: 'INVALID_LAYER_DATA',
    message: 'Layer data validation failed',
    level: 'error',
    userMessage: 'This layer has invalid data and cannot be rendered.',
  },
  PERFORMANCE_WARNING: {
    code: 'PERFORMANCE_WARNING',
    message: 'Frame rate dropped below 30 FPS',
    level: 'warning',
    userMessage: 'Performance is degraded. Consider reducing layer count or complexity.',
  }
};

export function handleError(
  errorCode: keyof typeof errorMessages,
  context?: any,
  showToast?: (message: string, type: 'error' | 'warning' | 'info') => void
) {
  const error = errorMessages[errorCode];
  
  // Log to console with context
  console.error(`[${error.code}] ${error.message}`, context);

  // Show user-friendly message
  if (showToast) {
    showToast(error.userMessage, error.level === 'warning' ? 'warning' : 'error');
  }

  // Execute action if provided
  if (error.action) {
    error.action();
  }

  // Send to error tracking service (Sentry, LogRocket, etc.)
  if (error.level === 'fatal') {
    // window.Sentry?.captureException(new Error(error.message), { extra: context });
  }

  return error;
}

// Wrap async operations with error handling
export async function withErrorHandling<T>(
  operation: () => Promise<T>,
  errorCode: keyof typeof errorMessages,
  showToast?: (message: string, type: 'error' | 'warning' | 'info') => void
): Promise<T | null> {
  try {
    return await operation();
  } catch (error) {
    handleError(errorCode, error, showToast);
    return null;
  }
}
