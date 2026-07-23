import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { vi, describe, it, expect } from 'vitest';
import { ContextMenu } from './ContextMenu';

describe('ContextMenu Integration', () => {
  it('should render ContextMenu at given coordinates', () => {
    const handleClose = vi.fn();
    render(
      <ContextMenu 
        x={100} 
        y={150} 
        onClose={handleClose} 
        hasSelection={true} 
        hasClipboard={false} 
      />
    );
    
    // Check if the menu is positioned correctly
    const menu = screen.getByText('Copy').closest('div');
    expect(menu).toBeInTheDocument();
  });

  it('should trigger action and close when clicked', () => {
    const handleClose = vi.fn();
    const handleCopy = vi.fn();
    
    render(
      <ContextMenu 
        x={100} 
        y={150} 
        onClose={handleClose} 
        hasSelection={true} 
        hasClipboard={false} 
        onCopy={handleCopy}
      />
    );
    
    fireEvent.click(screen.getByText('Copy'));
    
    expect(handleCopy).toHaveBeenCalled();
    expect(handleClose).toHaveBeenCalled();
  });

  it('should close when clicking outside', () => {
    const handleClose = vi.fn();
    
    render(
      <div>
        <div data-testid="outside">Outside</div>
        <ContextMenu 
          x={100} 
          y={150} 
          onClose={handleClose} 
          hasSelection={true} 
          hasClipboard={false} 
        />
      </div>
    );
    
    fireEvent.mouseDown(screen.getByTestId('outside'));
    
    expect(handleClose).toHaveBeenCalled();
  });

  it('should close when pressing Escape', () => {
    const handleClose = vi.fn();
    
    render(
      <ContextMenu 
        x={100} 
        y={150} 
        onClose={handleClose} 
        hasSelection={true} 
        hasClipboard={false} 
      />
    );
    
    fireEvent.keyDown(document, { key: 'Escape' });
    
    expect(handleClose).toHaveBeenCalled();
  });
});
