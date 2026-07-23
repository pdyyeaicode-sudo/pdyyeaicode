interface FeatureFlags {
  enableGrid: boolean;
  enableRulers: boolean;
  enableGroupIsolation: boolean;
  enableAdvancedKeyboardShortcuts: boolean;
  enableToastNotifications: boolean;
  enableSmartGuides: boolean;
  enableAccessibilityMode: boolean;
}

const defaultFlags: FeatureFlags = {
  enableGrid: true,
  enableRulers: true,
  enableGroupIsolation: true,
  enableAdvancedKeyboardShortcuts: true,
  enableToastNotifications: true,
  enableSmartGuides: true,
  enableAccessibilityMode: true,
};

// Read from environment variables or localStorage
const getFeatureFlags = (): FeatureFlags => {
  // Check localStorage first (allows runtime toggling)
  if (typeof window !== 'undefined') {
    const storedFlags = localStorage.getItem('featureFlags');
    if (storedFlags) {
      try {
        return { ...defaultFlags, ...JSON.parse(storedFlags) };
      } catch (e) {
        console.warn('Failed to parse feature flags from localStorage');
      }
    }
  }

  // Fallback to environment variables
  return {
    enableGrid: import.meta.env?.VITE_FEATURE_GRID !== 'false',
    enableRulers: import.meta.env?.VITE_FEATURE_RULERS !== 'false',
    enableGroupIsolation: import.meta.env?.VITE_FEATURE_GROUP_ISOLATION !== 'false',
    enableAdvancedKeyboardShortcuts: import.meta.env?.VITE_FEATURE_KEYBOARD_SHORTCUTS !== 'false',
    enableToastNotifications: import.meta.env?.VITE_FEATURE_TOASTS !== 'false',
    enableSmartGuides: import.meta.env?.VITE_FEATURE_SMART_GUIDES !== 'false',
    enableAccessibilityMode: import.meta.env?.VITE_FEATURE_ACCESSIBILITY !== 'false',
  };
};

export const featureFlags = getFeatureFlags();

// Helper to toggle feature at runtime (for testing)
export function setFeatureFlag(flag: keyof FeatureFlags, enabled: boolean) {
  const current = getFeatureFlags();
  const updated = { ...current, [flag]: enabled };
  localStorage.setItem('featureFlags', JSON.stringify(updated));
  window.location.reload(); // Reload to apply changes
}
