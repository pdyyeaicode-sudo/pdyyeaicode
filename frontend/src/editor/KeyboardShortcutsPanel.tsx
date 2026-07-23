export function KeyboardShortcutsPanel({ onClose }: { onClose: () => void }) {
  const shortcuts = [
    { category: 'Selection', items: [
      { keys: 'Tab / Shift+Tab', action: 'Cycle layer focus' },
      { keys: 'Enter', action: 'Select focused layer' },
      { keys: 'Cmd+A', action: 'Select all layers' },
      { keys: 'Escape', action: 'Clear selection' }
    ]},
    { category: 'Editing', items: [
      { keys: 'Space', action: 'Edit focused text layer' },
      { keys: 'Cmd+C/X/V', action: 'Copy/Cut/Paste' },
      { keys: 'Cmd+D', action: 'Duplicate' },
      { keys: 'Delete', action: 'Delete selected layers' }
    ]},
    { category: 'Grouping', items: [
      { keys: 'Cmd+G', action: 'Group selection' },
      { keys: 'Cmd+Shift+G', action: 'Ungroup' },
      { keys: 'Double-click group', action: 'Enter isolation mode' }
    ]},
    { category: 'View', items: [
      { keys: "Cmd+'", action: 'Toggle grid' },
      { keys: 'Cmd+R', action: 'Toggle rulers' },
      { keys: 'Cmd+0', action: 'Reset zoom' },
      { keys: 'Cmd+1', action: 'Fit to screen' }
    ]}
  ];

  return (
    <div style={{
      position: 'fixed',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      background: 'var(--bg-primary, #ffffff)',
      border: '1px solid var(--border-color, #e0e0e0)',
      borderRadius: '8px',
      padding: '24px',
      maxWidth: '600px',
      maxHeight: '80vh',
      overflow: 'auto',
      zIndex: 10000,
      boxShadow: '0 8px 32px rgba(0,0,0,0.2)'
    }}>
      <h2 style={{ marginTop: 0 }}>Keyboard Shortcuts</h2>
      
      {shortcuts.map(section => (
        <div key={section.category} style={{ marginBottom: '24px' }}>
          <h3 style={{ 
            fontSize: '14px', 
            fontWeight: 600, 
            color: 'var(--text-secondary)',
            marginBottom: '8px' 
          }}>
            {section.category}
          </h3>
          
          {section.items.map((item, i) => (
            <div key={i} style={{
              display: 'flex',
              justifyContent: 'space-between',
              padding: '8px 0',
              borderBottom: '1px solid var(--border-light, #f0f0f0)'
            }}>
              <span>{item.action}</span>
              <kbd style={{
                background: 'var(--bg-tertiary, #f5f5f5)',
                padding: '2px 8px',
                borderRadius: '4px',
                fontSize: '12px',
                fontFamily: 'monospace',
                border: '1px solid var(--border-color, #e0e0e0)'
              }}>
                {item.keys}
              </kbd>
            </div>
          ))}
        </div>
      ))}
      
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
        <button
          onClick={onClose}
          style={{
            padding: '8px 16px',
            background: 'var(--accent-primary, var(--accent))',
            color: 'var(--bg-primary, #ffffff)',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Close
        </button>
      </div>
    </div>
  );
}
