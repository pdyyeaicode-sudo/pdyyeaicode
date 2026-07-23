import React, { useState } from "react";
import { Search, ChevronsRight, ChevronRight, ChevronDown, Check } from "lucide-react";
import styles from "./MarketPanel.module.css";

// Basic tree node type
type MarketNode = {
  id: string;
  label: string;
  count: number;
  children?: MarketNode[];
};

const marketData: MarketNode[] = [
  {
    id: "perpetuals",
    label: "Perpetuals",
    count: 85,
    children: [
      { id: "open_interest", label: "Open Interest", count: 24 },
      {
        id: "funding_rates",
        label: "Funding Rates",
        count: 12,
        children: [
          { id: "positive_funding", label: "Positive Funding", count: 4 },
          { id: "negative_funding", label: "Negative Funding", count: 3 },
        ],
      },
      { id: "newly_listed", label: "Newly Listed Perps", count: 9 },
      { id: "low_liquidity", label: "Low Liquidity Perps", count: 8 },
      { id: "points_farming", label: "Points Farming Live", count: 7 },
      { id: "high_volatility", label: "High Volatility", count: 18 },
    ],
  },
  { id: "options", label: "Options", count: 42 },
  { id: "spot_only", label: "Spot Only", count: 110 },
  { id: "no_active", label: "No Active Market", count: 18 },
];

export function MarketPanel() {
  const [activeTab, setActiveTab] = useState("Market");
  // Default expanded match the screenshot
  const [expanded, setExpanded] = useState<Set<string>>(new Set(["perpetuals", "funding_rates"]));
  // Default checked match the screenshot
  const [checked, setChecked] = useState<Set<string>>(new Set(["open_interest"]));

  const toggleExpand = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleCheck = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const renderNode = (node: MarketNode, depth: number = 0) => {
    const isExpanded = expanded.has(node.id);
    const isChecked = checked.has(node.id);
    const hasChildren = node.children && node.children.length > 0;

    return (
      <div key={node.id}>
        <div
          className={styles.row}
          style={{ paddingLeft: `${depth * 24}px` }}
          onClick={(e) => toggleCheck(node.id, e)}
        >
          {depth > 0 && <div className={styles.indent} style={{ left: `${(depth - 1) * 24 + 11}px` }} />}
          
          <div
            className={`${styles.caret} ${hasChildren && isExpanded ? styles.caretExpanded : ""} ${
              !hasChildren ? styles.caretHidden : ""
            }`}
            onClick={(e) => hasChildren && toggleExpand(node.id, e)}
          >
            <ChevronRight size={14} />
          </div>

          <div className={`${styles.checkbox} ${isChecked ? styles.checkboxChecked : ""}`}>
            {isChecked && <Check size={12} className={styles.checkIcon} strokeWidth={3} />}
          </div>

          <span className={`${styles.label} ${isChecked ? styles.labelChecked : ""}`}>
            {node.label}
          </span>
          <span className={styles.count}>{node.count}</span>
        </div>
        
        {hasChildren && isExpanded && (
          <div className={styles.childrenContainer} style={{ position: "relative" }}>
            {node.children!.map((child) => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <div className={styles.tabs}>
          {["Market", "Insights", "Watchlists"].map((tab) => (
            <button
              key={tab}
              className={`${styles.tab} ${activeTab === tab ? styles.tabActive : ""}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </button>
          ))}
        </div>
        <div className={styles.headerIcons}>
          <button className={styles.iconBtn}>
            <Search size={16} />
          </button>
          <button className={styles.iconBtn}>
            <ChevronsRight size={16} />
          </button>
        </div>
      </div>

      <div className={styles.content}>
        <div className={styles.sectionHeader}>Market type</div>
        <div className={styles.tree}>
          {marketData.map((node) => renderNode(node, 0))}
        </div>
      </div>
    </div>
  );
}
