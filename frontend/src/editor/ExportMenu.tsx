import { useState, useRef, useEffect } from "react";
import { Download, Share2, ChevronDown } from "lucide-react";
import styles from "./CreativeStudio.module.css";

export interface ExportMenuProps {
  onExportSVG: () => void;
  onExportPNG: () => void;
  onExportPDF: () => void;
  buttonClassName?: string;
}

function Dropdown({ 
  value, 
  options, 
  onChange 
}: { 
  value: string; 
  options: string[]; 
  onChange: (val: string) => void 
}) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          padding: "6px 10px",
          backgroundColor: "var(--bg-panel, #262626)",
          color: "var(--fg-default, #fff)",
          border: "1px solid var(--border-subtle, #404040)",
          borderRadius: "6px",
          fontSize: "12px",
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        {value} <ChevronDown size={14} />
      </button>

      {isOpen && (
        <div style={{
          position: "absolute",
          top: "100%",
          left: 0,
          marginTop: "4px",
          backgroundColor: "var(--bg-panel, #262626)",
          border: "1px solid var(--border-subtle, #404040)",
          borderRadius: "6px",
          boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
          zIndex: 1000,
          minWidth: "100%",
          padding: "4px"
        }}>
          {options.map(opt => (
            <button
              key={opt}
              type="button"
              onClick={() => { onChange(opt); setIsOpen(false); }}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "6px 12px",
                backgroundColor: "transparent",
                border: "none",
                borderRadius: "4px",
                color: "var(--fg-default, #fff)",
                fontSize: "12px",
                cursor: "pointer",
              }}
              onMouseOver={(e) => e.currentTarget.style.backgroundColor = "var(--bg-hover, #404040)"}
              onMouseOut={(e) => e.currentTarget.style.backgroundColor = "transparent"}
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function ExportMenu({ onExportSVG, onExportPNG, onExportPDF, buttonClassName }: ExportMenuProps): JSX.Element {
  const [scale, setScale] = useState("1x");
  const [format, setFormat] = useState("PNG");

  const handleExport = () => {
    // Check if user is logged in
    const isLoggedIn = typeof window !== "undefined" && (
      localStorage.getItem("Pdyye_user_logged_in") === "true" ||
      document.cookie.includes("__session") ||
      document.cookie.includes("__clerk")
    );

    if (!isLoggedIn) {
      window.location.href = "/login";
      return;
    }

    if (format === "PNG") onExportPNG();
    else if (format === "SVG") onExportSVG();
    else if (format === "PDF") onExportPDF();
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
      <Dropdown 
        value={scale} 
        options={["1x", "2x", "3x", "4x"]} 
        onChange={setScale} 
      />
      
      <Dropdown 
        value={format} 
        options={["PNG", "SVG", "PDF"]} 
        onChange={setFormat} 
      />

      <button
        type="button"
        className={buttonClassName}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "32px",
          height: "32px",
          backgroundColor: "var(--bg-panel, #262626)",
          color: "var(--fg-default, #fff)",
          border: "1px solid var(--border-subtle, #404040)",
          borderRadius: "6px",
          cursor: "pointer",
        }}
        title="Share"
      >
        <Share2 size={14} />
      </button>

      <button
        type="button"
        className={buttonClassName}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "6px 16px",
          backgroundColor: "#a3e635", /* Primary brand color from reference */
          color: "#000",
          border: "none",
          borderRadius: "6px",
          fontWeight: 600,
          fontSize: "13px",
          cursor: "pointer",
          transition: "opacity 0.2s"
        }}
        onClick={handleExport}
        title={`Export ${format}`}
      >
        <Download size={14} /> Export {format}
      </button>
    </div>
  );
}
