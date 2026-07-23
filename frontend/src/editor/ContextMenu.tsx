/**
 * ContextMenu.tsx — Right-click context menu
 * 
 * Rich, Figma + Canva + PowerPoint unified context menu using ListItem from @astryxdesign/core/List
 */

import React, { useEffect, useRef, useState } from "react";
import { ListItem } from "@astryxdesign/core/List";
import {
  Scissors,
  Copy,
  ClipboardPaste,
  CopyPlus,
  Trash2,
  ArrowUp,
  ArrowDown,
  BringToFront,
  SendToBack,
  Group,
  Ungroup,
  Type,
  Square,
  Circle,
  Minus,
  Triangle,
  Frame,
  Image as ImageIcon,
  Grid,
  Ruler,
  Magnet,
  Lock,
  Eye,
  AlignLeft,
  AlignCenterHorizontal,
  AlignRight,
  ArrowUpToLine,
  ArrowDownToLine,
  AlignCenterVertical,
  AlignHorizontalSpaceBetween,
  AlignVerticalSpaceBetween,
  ChevronRight,
  Download,
  Code,
  FileText,
  Replace,
} from "lucide-react";

export interface ContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  
  // Selection state
  hasSelection: boolean;
  selectionCount?: number;
  hasClipboard: boolean;
  selectedLayerType?: string;

  // Canvas settings
  showGrid?: boolean;
  showRulers?: boolean;
  snap?: boolean;

  // Handlers
  onCut?: () => void;
  onCopy?: () => void;
  onPaste?: () => void;
  onPasteToReplace?: () => void;
  onDelete?: () => void;
  onDuplicate?: () => void;
  onBringForward?: () => void;
  onSendBackward?: () => void;
  onBringToFront?: () => void;
  onSendToBack?: () => void;
  onGroup?: () => void;
  onUngroup?: () => void;
  onToggleLock?: () => void;
  onToggleVisibility?: () => void;
  onAlign?: (mode: "left" | "center-horizontal" | "right" | "top" | "center-vertical" | "bottom") => void;
  onSpaceEvenly?: (axis: "horizontal" | "vertical") => void;
  onAddText?: () => void;
  onAddShape?: (type: string) => void;
  onAddFrame?: () => void;
  onAddImage?: () => void;
  onToggleGrid?: () => void;
  onToggleRulers?: () => void;
  onToggleSnap?: () => void;
  onExport?: (format: "png" | "svg" | "pdf") => void;
  onEditText?: () => void;
  onSetAsBackground?: () => void;
}

interface MenuItemRowProps {
  onClick?: () => void;
  icon: React.ReactNode;
  label: string;
  description?: string;
  shortcut?: string;
  badge?: string;
  danger?: boolean;
  disabled?: boolean;
  hasSubmenu?: boolean;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

function MenuItemRow({
  onClick,
  icon,
  label,
  description,
  shortcut,
  badge,
  danger,
  disabled,
  hasSubmenu,
  onMouseEnter,
  onMouseLeave,
}: MenuItemRowProps): JSX.Element {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onClick={(e) => {
        if (disabled) return;
        e.stopPropagation();
        onClick?.();
      }}
      onMouseEnter={(e) => {
        setHovered(true);
        onMouseEnter?.();
      }}
      onMouseLeave={(e) => {
        setHovered(false);
        onMouseLeave?.();
      }}
      style={{
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.45 : 1,
        width: "100%",
        borderRadius: "6px",
        background: hovered
          ? danger
            ? "rgba(239, 68, 68, 0.18)"
            : "rgba(255, 255, 255, 0.09)"
          : "transparent",
        transition: "background 0.1s ease",
        margin: "1px 0",
      }}
    >
      <ListItem
        label={
          <span style={{ fontWeight: 500, fontSize: "13px", color: danger ? "#EF4444" : "#F8FAFC" }}>
            {label}
          </span>
        }
        description={
          description ? (
            <span style={{ fontSize: "11px", color: danger ? "#FCA5A5" : "#94A3B8", display: "block", marginTop: "1px" }}>
              {description}
            </span>
          ) : undefined
        }
        startContent={
          <span
            style={{
              fontSize: "15px",
              width: "20px",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              color: danger ? "#EF4444" : "#A1A1AA",
            }}
          >
            {icon}
          </span>
        }
        endContent={
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            {badge && (
              <span
                style={{
                  fontSize: "10px",
                  fontWeight: 600,
                  padding: "1px 6px",
                  borderRadius: "10px",
                  background: "rgba(59, 130, 246, 0.2)",
                  color: "#60A5FA",
                }}
              >
                {badge}
              </span>
            )}
            {shortcut && (
              <span style={{ fontSize: "11px", color: "#71717A", fontWeight: 400 }}>
                {shortcut}
              </span>
            )}
            {hasSubmenu && (
              <ChevronRight size={14} style={{ color: "#71717A" }} />
            )}
          </div>
        }
      />
    </div>
  );
}

function MenuDivider(): JSX.Element {
  return (
    <div
      style={{
        height: "1px",
        background: "rgba(255, 255, 255, 0.08)",
        margin: "4px 0",
      }}
    />
  );
}

export function ContextMenu({
  x,
  y,
  onClose,
  hasSelection,
  selectionCount = 0,
  hasClipboard,
  selectedLayerType,
  showGrid = false,
  showRulers = false,
  snap = true,
  onCut,
  onCopy,
  onPaste,
  onPasteToReplace,
  onDelete,
  onDuplicate,
  onBringForward,
  onSendBackward,
  onBringToFront,
  onSendToBack,
  onGroup,
  onUngroup,
  onToggleLock,
  onToggleVisibility,
  onAlign,
  onSpaceEvenly,
  onAddText,
  onAddShape,
  onAddFrame,
  onAddImage,
  onToggleGrid,
  onToggleRulers,
  onToggleSnap,
  onExport,
  onEditText,
  onSetAsBackground,
}: ContextMenuProps): JSX.Element {
  const menuRef = useRef<HTMLDivElement>(null);
  const [activeSubmenu, setActiveSubmenu] = useState<string | null>(null);

  // Close on click outside or Escape key
  useEffect(() => {
    function handleClickOutside(e: MouseEvent): void {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    }

    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  function handleAction(action: (() => void) | undefined): void {
    if (action) {
      action();
      onClose();
    }
  }

  // Position adjustments
  const menuWidth = 230;
  const menuHeight = 360;
  const adjustedX = x + menuWidth > window.innerWidth ? Math.max(10, x - menuWidth) : x;
  const adjustedY = y + menuHeight > window.innerHeight ? Math.max(10, y - menuHeight) : y;

  const renderSubmenu = () => {
    if (!activeSubmenu) return null;

    let items: JSX.Element[] = [];

    if (activeSubmenu === "addShape") {
      items = [
        <MenuItemRow
          key="rect"
          icon={<Square size={14} />}
          label="Rectangle"
          description="4-sided vector shape"
          shortcut="R"
          onClick={() => handleAction(() => onAddShape?.("rect"))}
        />,
        <MenuItemRow
          key="circle"
          icon={<Circle size={14} />}
          label="Circle / Ellipse"
          description="Round vector shape"
          shortcut="O"
          onClick={() => handleAction(() => onAddShape?.("circle"))}
        />,
        <MenuItemRow
          key="line"
          icon={<Minus size={14} />}
          label="Line"
          description="Straight path segment"
          shortcut="L"
          onClick={() => handleAction(() => onAddShape?.("line"))}
        />,
        <MenuItemRow
          key="triangle"
          icon={<Triangle size={14} />}
          label="Triangle"
          description="3-point polygon"
          onClick={() => handleAction(() => onAddShape?.("triangle"))}
        />,
      ];
    } else if (activeSubmenu === "layerOrder") {
      items = [
        <MenuItemRow
          key="front"
          icon={<BringToFront size={14} />}
          label="Bring to Front"
          shortcut="]"
          onClick={() => handleAction(onBringToFront)}
        />,
        <MenuItemRow
          key="forward"
          icon={<ArrowUp size={14} />}
          label="Bring Forward"
          shortcut="Ctrl+]"
          onClick={() => handleAction(onBringForward)}
        />,
        <MenuItemRow
          key="backward"
          icon={<ArrowDown size={14} />}
          label="Send Backward"
          shortcut="Ctrl+["
          onClick={() => handleAction(onSendBackward)}
        />,
        <MenuItemRow
          key="back"
          icon={<SendToBack size={14} />}
          label="Send to Back"
          shortcut="["
          onClick={() => handleAction(onSendToBack)}
        />,
      ];
    } else if (activeSubmenu === "align") {
      items = [
        <MenuItemRow
          key="left"
          icon={<AlignLeft size={14} />}
          label="Align Left"
          onClick={() => handleAction(() => onAlign?.("left"))}
        />,
        <MenuItemRow
          key="center-h"
          icon={<AlignCenterHorizontal size={14} />}
          label="Align Center (Horizontal)"
          onClick={() => handleAction(() => onAlign?.("center-horizontal"))}
        />,
        <MenuItemRow
          key="right"
          icon={<AlignRight size={14} />}
          label="Align Right"
          onClick={() => handleAction(() => onAlign?.("right"))}
        />,
        <MenuDivider key="div1" />,
        <MenuItemRow
          key="top"
          icon={<ArrowUpToLine size={14} />}
          label="Align Top"
          onClick={() => handleAction(() => onAlign?.("top"))}
        />,
        <MenuItemRow
          key="center-v"
          icon={<AlignCenterVertical size={14} />}
          label="Align Center (Vertical)"
          onClick={() => handleAction(() => onAlign?.("center-vertical"))}
        />,
        <MenuItemRow
          key="bottom"
          icon={<ArrowDownToLine size={14} />}
          label="Align Bottom"
          onClick={() => handleAction(() => onAlign?.("bottom"))}
        />,
      ];
    } else if (activeSubmenu === "spaceEvenly") {
      items = [
        <MenuItemRow
          key="space-h"
          icon={<AlignHorizontalSpaceBetween size={14} />}
          label="Distribute Horizontally"
          onClick={() => handleAction(() => onSpaceEvenly?.("horizontal"))}
        />,
        <MenuItemRow
          key="space-v"
          icon={<AlignVerticalSpaceBetween size={14} />}
          label="Distribute Vertically"
          onClick={() => handleAction(() => onSpaceEvenly?.("vertical"))}
        />,
      ];
    } else if (activeSubmenu === "export") {
      items = [
        <MenuItemRow
          key="png"
          icon={<ImageIcon size={14} />}
          label="Export as PNG"
          description="Raster image format"
          onClick={() => handleAction(() => onExport?.("png"))}
        />,
        <MenuItemRow
          key="svg"
          icon={<Code size={14} />}
          label="Export as SVG"
          description="Vector graphics format"
          onClick={() => handleAction(() => onExport?.("svg"))}
        />,
        <MenuItemRow
          key="pdf"
          icon={<FileText size={14} />}
          label="Export as PDF"
          description="Printable document format"
          onClick={() => handleAction(() => onExport?.("pdf"))}
        />,
      ];
    }

    const subX = adjustedX + menuWidth + 4 > window.innerWidth ? Math.max(10, adjustedX - 210) : adjustedX + menuWidth - 4;

    return (
      <div
        style={{
          position: "fixed",
          left: `${subX}px`,
          top: `${adjustedY + 20}px`,
          background: "#18181B",
          border: "1px solid rgba(255, 255, 255, 0.12)",
          borderRadius: "12px",
          boxShadow: "0 16px 36px rgba(0,0,0,0.5), 0 4px 12px rgba(0,0,0,0.3)",
          padding: "6px",
          minWidth: "210px",
          zIndex: 100000,
          animation: "scaleIn 0.12s ease-out",
        }}
      >
        {items}
      </div>
    );
  };

  return (
    <>
      <div
        ref={menuRef}
        role="menu"
        aria-orientation="vertical"
        style={{
          position: "fixed",
          left: `${adjustedX}px`,
          top: `${adjustedY}px`,
          background: "#18181B",
          border: "1px solid rgba(255, 255, 255, 0.12)",
          borderRadius: "12px",
          boxShadow: "0 16px 36px rgba(0,0,0,0.5), 0 4px 12px rgba(0,0,0,0.3)",
          padding: "6px",
          minWidth: `${menuWidth}px`,
          zIndex: 99999,
          fontSize: "13px",
          color: "#F8FAFC",
          animation: "scaleIn 0.15s cubic-bezier(0.16, 1, 0.3, 1)",
          transformOrigin: "top left",
          userSelect: "none",
        }}
      >
        <style>{`
          @keyframes scaleIn {
            from { opacity: 0; transform: scale(0.95); }
            to { opacity: 1; transform: scale(1); }
          }
        `}</style>

        {/* 1. NO SELECTION / CANVAS BACKGROUND RIGHT-CLICK */}
        {!hasSelection && (
          <>
            <MenuItemRow
              onClick={() => handleAction(onPaste)}
              icon={<ClipboardPaste size={14} />}
              label="Paste"
              description="Insert content from clipboard"
              shortcut="Ctrl+V"
              disabled={!hasClipboard}
            />
            <MenuItemRow
              onClick={() => handleAction(onPasteToReplace)}
              icon={<Replace size={14} />}
              label="Paste to Replace"
              description="Swap content with clipboard"
              shortcut="Ctrl+Shift+R"
              disabled={!hasClipboard}
            />

            <MenuDivider />

            <MenuItemRow
              onClick={() => handleAction(onAddText)}
              icon={<Type size={14} />}
              label="Add Text"
              description="Insert text element"
              shortcut="T"
            />
            <MenuItemRow
              onMouseEnter={() => setActiveSubmenu("addShape")}
              icon={<Square size={14} />}
              label="Add Shape"
              description="Insert vector shapes"
              hasSubmenu
            />
            <MenuItemRow
              onClick={() => handleAction(onAddFrame)}
              icon={<Frame size={14} />}
              label="Add Frame"
              description="Create layout container"
              shortcut="F"
            />
            <MenuItemRow
              onClick={() => handleAction(onAddImage)}
              icon={<ImageIcon size={14} />}
              label="Add Image"
              description="Place a photo asset"
              shortcut="I"
            />

            <MenuDivider />

            <MenuItemRow
              onClick={() => handleAction(onToggleGrid)}
              icon={<Grid size={14} />}
              label={showGrid ? "Hide Grid" : "Show Grid"}
              description="Toggle canvas grid overlay"
            />
            <MenuItemRow
              onClick={() => handleAction(onToggleRulers)}
              icon={<Ruler size={14} />}
              label={showRulers ? "Hide Rulers" : "Show Rulers"}
              description="Toggle layout rulers"
            />
            <MenuItemRow
              onClick={() => handleAction(onToggleSnap)}
              icon={<Magnet size={14} />}
              label={snap ? "Disable Snapping" : "Enable Snapping"}
              description="Toggle object alignment snapping"
            />
          </>
        )}

        {/* 2. SELECTION ACTIVE (1 OR MORE LAYERS) */}
        {hasSelection && (
          <>
            <MenuItemRow
              onClick={() => handleAction(onCut)}
              icon={<Scissors size={14} />}
              label="Cut"
              description="Remove and copy to clipboard"
              shortcut="Ctrl+X"
            />
            <MenuItemRow
              onClick={() => handleAction(onCopy)}
              icon={<Copy size={14} />}
              label="Copy"
              description="Copy selection to clipboard"
              shortcut="Ctrl+C"
            />
            {hasClipboard && (
              <MenuItemRow
                onClick={() => handleAction(onPaste)}
                icon={<ClipboardPaste size={14} />}
                label="Paste"
                shortcut="Ctrl+V"
              />
            )}
            <MenuItemRow
              onClick={() => handleAction(onDuplicate)}
              icon={<CopyPlus size={14} />}
              label="Duplicate"
              description="Create an exact copy"
              shortcut="Ctrl+D"
            />
            <MenuItemRow
              onClick={() => handleAction(onDelete)}
              icon={<Trash2 size={14} />}
              label={selectionCount > 1 ? "Delete Layers" : "Delete Layer"}
              shortcut="Del"
              danger
            />

            <MenuDivider />

            {selectionCount >= 2 && (
              <MenuItemRow
                onClick={() => handleAction(onGroup)}
                icon={<Group size={14} />}
                label="Group Selection"
                description="Combine items into one group"
                shortcut="Ctrl+G"
              />
            )}
            {selectionCount === 1 && selectedLayerType === "group" && (
              <MenuItemRow
                onClick={() => handleAction(onUngroup)}
                icon={<Ungroup size={14} />}
                label="Ungroup"
                description="Separate group into layers"
                shortcut="Ctrl+Shift+G"
              />
            )}

            <MenuItemRow
              onMouseEnter={() => setActiveSubmenu("layerOrder")}
              icon={<BringToFront size={14} />}
              label="Layer Order"
              description="Adjust z-index ordering"
              hasSubmenu
            />

            <MenuItemRow
              onMouseEnter={() => setActiveSubmenu("align")}
              icon={<AlignLeft size={14} />}
              label="Align Elements"
              description="Align to canvas or selection"
              hasSubmenu
            />

            {selectionCount >= 2 && (
              <MenuItemRow
                onMouseEnter={() => setActiveSubmenu("spaceEvenly")}
                icon={<AlignHorizontalSpaceBetween size={14} />}
                label="Space Evenly"
                description="Distribute spacing evenly"
                hasSubmenu
              />
            )}

            <MenuDivider />

            <MenuItemRow
              onClick={() => handleAction(onToggleLock)}
              icon={<Lock size={14} />}
              label="Lock / Unlock"
              shortcut="Ctrl+Shift+L"
            />
            <MenuItemRow
              onClick={() => handleAction(onToggleVisibility)}
              icon={<Eye size={14} />}
              label="Show / Hide"
              shortcut="Ctrl+Shift+H"
            />

            {selectedLayerType === "text" && (
              <>
                <MenuDivider />
                <MenuItemRow
                  onClick={() => handleAction(onEditText)}
                  icon={<Type size={14} />}
                  label="Edit Text"
                  description="Inline canvas text editing"
                  shortcut="Enter"
                />
              </>
            )}

            {selectedLayerType === "image" && (
              <>
                <MenuDivider />
                <MenuItemRow
                  onClick={() => handleAction(onSetAsBackground)}
                  icon={<ImageIcon size={14} />}
                  label="Set as Canvas Background"
                  description="Use image as background"
                />
              </>
            )}

            <MenuDivider />

            <MenuItemRow
              onMouseEnter={() => setActiveSubmenu("export")}
              icon={<Download size={14} />}
              label="Export Selection"
              description="Save as PNG, SVG, or PDF"
              hasSubmenu
            />
          </>
        )}
      </div>

      {renderSubmenu()}
    </>
  );
}
