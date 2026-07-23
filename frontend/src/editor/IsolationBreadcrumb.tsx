import React from 'react';
import { Icon } from './Icon';

interface IsolationBreadcrumbProps {
  parentPath: string[];
  onNavigate: (index: number) => void;  // index -1 = exit to artboard
}

export function IsolationBreadcrumb({ parentPath, onNavigate }: IsolationBreadcrumbProps) {
  return (
    <div
      className="isolation-breadcrumb"
      style={{
        position: 'absolute',
        top: 12,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 1000,
        background: 'var(--panel-bg)',
        padding: '8px 16px',
        borderRadius: '8px',
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        boxShadow: '0 2px 12px rgba(0, 0, 0, 0.15)',
        fontSize: '13px',
        fontWeight: 500,
        userSelect: 'none',
        border: '1px solid var(--border-color)'
      }}
    >
      <Icon name="layers" size={16} />
      
      {parentPath.map((name, index) => (
        <React.Fragment key={index}>
          {index > 0 && (
            <span style={{ color: 'var(--text-tertiary)', padding: '0 4px' }}>
              /
            </span>
          )}
          <button
            onClick={() => onNavigate(index === 0 ? -1 : index)}
            style={{
              background: index === parentPath.length - 1 ? 'var(--hover-bg)' : 'transparent',
              border: 'none',
              color: index === parentPath.length - 1 ? 'var(--text-primary)' : 'var(--text-secondary)',
              fontWeight: index === parentPath.length - 1 ? 600 : 400,
              cursor: 'pointer',
              padding: '4px 8px',
              borderRadius: '4px',
              transition: 'all 0.15s ease',
              fontSize: '13px'
            }}
          >
            {name}
          </button>
        </React.Fragment>
      ))}
      
      <button
        onClick={() => onNavigate(-1)}
        style={{
          background: 'transparent',
          border: 'none',
          color: 'var(--text-tertiary)',
          cursor: 'pointer',
          padding: '4px',
          marginLeft: '8px',
          display: 'flex',
          alignItems: 'center',
          borderRadius: '4px'
        }}
        title="Exit isolation (Esc)"
      >
        <Icon name="x" size={16} />
      </button>
    </div>
  );
}
