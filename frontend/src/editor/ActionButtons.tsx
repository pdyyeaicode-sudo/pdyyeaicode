/**
 * ActionButtons.tsx — Visible action buttons for beginners
 * 
 * Provides clickable buttons for common actions instead of relying on keyboard shortcuts.
 */

export interface ActionButtonsProps {
  hasSelection: boolean;
  hasClipboard: boolean;
  canUndo: boolean;
  canRedo: boolean;
  selectionCount: number;
  
  onCopy?: () => void;
  onCut?: () => void;
  onPaste?: () => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onGroup?: () => void;
  onUngroup?: () => void;
  onBringForward?: () => void;
  onSendBackward?: () => void;
}

export function ActionButtons({
  hasSelection,
  hasClipboard,
  canUndo,
  canRedo,
  selectionCount,
  onCopy,
  onCut,
  onPaste,
  onDuplicate,
  onDelete,
  onUndo,
  onRedo,
  onGroup,
  onUngroup,
  onBringForward,
  onSendBackward,
}: ActionButtonsProps): JSX.Element {
  return (
    <div style={{ padding: "12px", borderBottom: "1px solid var(--border-color)" }}>
      <div style={{ fontSize: "11px", fontWeight: 600, marginBottom: "8px", color: "var(--text-secondary)" }}>
        ACTIONS
      </div>
      
      {/* Undo/Redo */}
      <div style={{ display: "flex", gap: "6px", marginBottom: "8px" }}>
        <ActionButton
          onClick={onUndo}
          disabled={!canUndo}
          title="Undo last action"
        >
          ↶ Undo
        </ActionButton>
        <ActionButton
          onClick={onRedo}
          disabled={!canRedo}
          title="Redo last action"
        >
          ↷ Redo
        </ActionButton>
      </div>
      
      {/* Clipboard Actions */}
      <div style={{ display: "flex", gap: "6px", marginBottom: "8px", flexWrap: "wrap" }}>
        <ActionButton
          onClick={onCopy}
          disabled={!hasSelection}
          title="Copy selected layers"
        >
          📋 Copy
        </ActionButton>
        <ActionButton
          onClick={onCut}
          disabled={!hasSelection}
          title="Cut selected layers"
        >
          ✂️ Cut
        </ActionButton>
        <ActionButton
          onClick={onPaste}
          disabled={!hasClipboard}
          title="Paste from clipboard"
        >
          📄 Paste
        </ActionButton>
        <ActionButton
          onClick={onDuplicate}
          disabled={!hasSelection}
          title="Duplicate selected layers"
        >
          ⎘ Duplicate
        </ActionButton>
        <ActionButton
          onClick={onDelete}
          disabled={!hasSelection}
          title="Delete selected layers"
        >
          🗑️ Delete
        </ActionButton>
      </div>
      
      {/* Layer Order */}
      <div style={{ display: "flex", gap: "6px", marginBottom: "8px" }}>
        <ActionButton
          onClick={onBringForward}
          disabled={!hasSelection}
          title="Bring forward"
        >
          ⬆ Forward
        </ActionButton>
        <ActionButton
          onClick={onSendBackward}
          disabled={!hasSelection}
          title="Send backward"
        >
          ⬇ Backward
        </ActionButton>
      </div>
      
      {/* Group Actions */}
      {selectionCount >= 2 && (
        <div style={{ display: "flex", gap: "6px" }}>
          <ActionButton
            onClick={onGroup}
            title="Group selected layers"
          >
            🔗 Group
          </ActionButton>
          <ActionButton
            onClick={onUngroup}
            disabled={selectionCount !== 1}
            title="Ungroup selected group"
          >
            ⛓️‍💥 Ungroup
          </ActionButton>
        </div>
      )}
    </div>
  );
}

interface ActionButtonProps {
  onClick?: () => void;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
}

function ActionButton({ onClick, disabled, title, children }: ActionButtonProps): JSX.Element {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        padding: "6px 12px",
        border: "1px solid var(--border-color)",
        borderRadius: "4px",
        background: disabled ? "var(--panel-bg)" : "var(--input-bg)",
        color: disabled ? "var(--text-secondary)" : "var(--text-primary)",
        cursor: disabled ? "not-allowed" : "pointer",
        fontSize: "12px",
        opacity: disabled ? 0.5 : 1,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </button>
  );
}
