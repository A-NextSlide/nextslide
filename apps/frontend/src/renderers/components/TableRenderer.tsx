import React, { useState, useRef, useEffect, useMemo } from "react";
import { ComponentInstance } from "../../types/components";
import { registerRenderer } from '../utils';
import type { RendererFunction } from '../index';
import { getFontFamilyWithFallback } from '../../utils/fontUtils';
import { useEditor, EditorContent } from '@tiptap/react';
import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import Bold from '@tiptap/extension-bold';
import Italic from '@tiptap/extension-italic';
import Underline from '@tiptap/extension-underline';
import Strike from '@tiptap/extension-strike';
import TextAlign from '@tiptap/extension-text-align';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableHeader from '@tiptap/extension-table-header';
import TableCell from '@tiptap/extension-table-cell';
import Highlight from '@tiptap/extension-highlight';
import Color from '@tiptap/extension-color';
import TextStyle from '@tiptap/extension-text-style';
import Link from '@tiptap/extension-link';
import { useActiveSlide } from '@/context/ActiveSlideContext';
import { useEditorSettingsStore } from '../../stores/editorSettingsStore';
import '../../styles/TiptapStyles.css';
import { Plus, Minus } from 'lucide-react';
import { createPortal } from 'react-dom';
import { DEFAULT_SLIDE_WIDTH } from '@/utils/deckUtils';

interface TableRendererProps {
  component: ComponentInstance;
  styles?: React.CSSProperties;
  containerRef: React.RefObject<HTMLDivElement>;
  slideId?: string;
  isEditing?: boolean;
  isSelected?: boolean;
  isThumbnail?: boolean;
  onUpdate?: (update: Partial<ComponentInstance>, addToHistory?: boolean) => void;
}

/**
 * Enhanced Table Renderer using official Tiptap Table extension
 */
export const renderTable: RendererFunction = (props) => {
  const { 
    component, 
    styles: baseStyles = {}, 
    containerRef,
    slideId,
    isEditing: globalIsEditing = false,
    isSelected = false,
    isThumbnail = false,
  } = props as TableRendererProps;

  const { updateComponent } = useActiveSlide();
  const isTextEditingGlobal = useEditorSettingsStore(state => state.isTextEditing);
  const setTextEditingGlobal = useEditorSettingsStore(state => state.setTextEditing);
  
  const componentProps = component.props;
  const {
    data = [],
    headers = [],
    showHeader = true,
    tableStyles = {},
  } = componentProps;

  // Enhanced default styles for better appearance
  const defaultTableStyles = {
    fontFamily: "Inter, system-ui, sans-serif",
    fontSize: 12,
    borderColor: "#e1e5e9",
    borderWidth: 1,
    cellPadding: 4,
    rowHeight: 32,
    headerBackgroundColor: "#f8fafc",
    headerTextColor: "#1f2937",
    cellBackgroundColor: "#ffffff",
    textColor: "#374151",
    alignment: "left",
    borderRadius: 8,
    boxShadow: "0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)",
    stripedRows: false,
    hoverEffect: true,
  };

  // Merge with custom styles
  const finalTableStyles = {
    ...defaultTableStyles,
    ...tableStyles
  };

  const {
    fontFamily,
    fontSize,
    borderColor,
    borderWidth,
    cellPadding,
    rowHeight,
    headerBackgroundColor,
    headerTextColor,
    cellBackgroundColor,
    textColor,
    alignment,
    borderRadius,
    boxShadow,
    stripedRows,
    hoverEffect,
  } = finalTableStyles;

  // Scale pixel-based table metrics to match slide scale in editor view.
  // Keep thumbnails unscaled (transform handles it there).
  const [pixelScale, setPixelScale] = useState(1);

  useEffect(() => {
    if (!containerRef?.current) return;
    const slideContainer = containerRef.current.closest('.slide-container') as HTMLElement | null;
    if (!slideContainer) return;

    const logicalWidthAttr = slideContainer.getAttribute('data-slide-width');
    const logicalWidth = Number(logicalWidthAttr) || DEFAULT_SLIDE_WIDTH;

    const computeScale = () => {
      const actualWidth = slideContainer.clientWidth || logicalWidth;
      const scale = actualWidth / (logicalWidth || DEFAULT_SLIDE_WIDTH);
      setPixelScale(scale || 1);
    };

    computeScale();

    const ro = new ResizeObserver(() => computeScale());
    ro.observe(slideContainer);
    return () => ro.disconnect();
  }, [containerRef]);

  const effectivePixelScale = isThumbnail ? 1 : pixelScale;

  // State management
  const [isDragging, setIsDragging] = useState(false);
  const [mouseDownPos, setMouseDownPos] = useState<{ x: number, y: number } | null>(null);
  const updateTimeoutRef = useRef<NodeJS.Timeout>();
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    row: number;
    col: number;
  } | null>(null);

  // Determine editing states
  const showTableControls = globalIsEditing && isSelected && !isTextEditingGlobal;
  const isTableEditable = globalIsEditing && isSelected && isTextEditingGlobal;

  // Convert data to HTML table format for Tiptap
  const generateTableHTML = useMemo(() => {
    if (!data || data.length === 0) {
      // Default table with content
      return `
        <table>
          ${showHeader ? `
          <thead>
            <tr>
              <th>Item</th>
              <th>Value</th>
              <th>Change</th>
            </tr>
          </thead>
          ` : ''}
          <tbody>
            <tr>
              <td>Monthly Revenue</td>
              <td>$125,000</td>
              <td>+12.5%</td>
            </tr>
            <tr>
              <td>Active Users</td>
              <td>8,420</td>
              <td>+5.2%</td>
            </tr>
            <tr>
              <td>Growth Rate</td>
              <td>23.5%</td>
              <td>+2.1%</td>
            </tr>
          </tbody>
        </table>
      `;
    }

    // Normalize data to 2D array to prevent runtime errors
    const rows: any[] = Array.isArray(data) ? data : [];
    const firstRow = Array.isArray(rows[0]) ? rows[0] : [];

    // Convert existing data to HTML
    let html = '<table>';
    
    // Add header only if showHeader is true
    if (showHeader) {
      const tableHeaders = Array.isArray(headers) && headers.length > 0
        ? headers
        : (Array.isArray(firstRow) && firstRow.length > 0
          ? firstRow.map((_: any, index: number) => `Column ${index + 1}`)
          : ['Column 1', 'Column 2', 'Column 3']);
      
      html += '<thead><tr>';
      tableHeaders.forEach(header => {
        html += `<th>${header || ''}</th>`;
      });
      html += '</tr></thead>';
    }
    
    // Add body
    html += '<tbody>';
    rows.forEach((row: any) => {
      html += '<tr>';
      const cells = Array.isArray(row) ? row : [row];
      cells.forEach((cell: any) => {
        const value = (cell === null || typeof cell === 'undefined') ? '' : String(cell);
        html += `<td>${value}</td>`;
      });
      html += '</tr>';
    });
    html += '</tbody></table>';
    
    return html;
  }, [data, headers, showHeader]);

  // Tiptap editor configuration with rich text support
  const editor = useEditor({
    extensions: [
      Document,
      Paragraph.configure({
        HTMLAttributes: {
          style: `margin: 0; padding: 0;`
        }
      }),
      Text,
      Bold,
      Italic,
      Underline,
      Strike,
      TextStyle,
      Color,
      Highlight.configure({
        multicolor: true,
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-blue-600 underline',
        },
      }),
      TextAlign.configure({
        types: ['paragraph', 'heading'],
        alignments: ['left', 'center', 'right', 'justify'],
        defaultAlignment: alignment,
      }),
      Table.configure({
        resizable: true,
        handleWidth: 5,
        cellMinWidth: 100,
        lastColumnResizable: true,
        allowTableNodeSelection: false,
      }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: generateTableHTML,
    editable: isTableEditable,
    autofocus: false,
    editorProps: {
      attributes: {
        class: 'tiptap-table-editor'
      },
      handleDOMEvents: {
        contextmenu: (view, event) => {
          // Let the event bubble up to be handled by React
          return false;
        }
      }
    },
    onUpdate: ({ editor }) => {
      if (!editor || editor.isDestroyed) return;
      
      // Don't update if we're not in table editing mode
      if (!isTableEditable) return;
      
      // Debounce updates to prevent resetting while typing
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
      
      updateTimeoutRef.current = setTimeout(() => {
        // Skip update if editor is no longer editable (user clicked away)
        if (!editor.isEditable) return;
        
        // Extract table data from editor
        const html = editor.getHTML();
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const table = doc.querySelector('table');
        
        if (table) {
          const newHeaders: string[] = [];
          const newData: string[][] = [];
          
          // Extract headers (preserve HTML)
          const headerRows = table.querySelectorAll('thead tr');
          if (headerRows.length > 0) {
            const headerCells = headerRows[0].querySelectorAll('th');
            headerCells.forEach(cell => {
              newHeaders.push(cell.innerHTML || '');
            });
          }
          
          // Extract data (preserve HTML)
          const bodyRows = table.querySelectorAll('tbody tr');
          bodyRows.forEach(row => {
            const rowData: string[] = [];
            const cells = row.querySelectorAll('td');
            cells.forEach(cell => {
              rowData.push(cell.innerHTML || '');
            });
            if (rowData.length > 0) {
              newData.push(rowData);
            }
          });
          
          // Only update if data has actually changed
          const dataChanged = JSON.stringify(newData) !== JSON.stringify(componentProps.data) || 
                            JSON.stringify(newHeaders) !== JSON.stringify(componentProps.headers);
          
          if (dataChanged) {
            // Update component
            safeUpdateComponent({
              props: {
                ...componentProps,
                headers: newHeaders,
                data: newData
              }
            });
          }
        }
      }, 1500); // Increased to 1.5 seconds for very slow typing
    },
    onBlur: ({ event }) => {
      if (isTableEditable) {
        // Check if the blur is happening because we're clicking another cell
        const relatedTarget = event.relatedTarget as HTMLElement;
        const isTableCell = relatedTarget?.closest?.('td, th');
        const isWithinTable = relatedTarget?.closest?.('.tiptap-table-editor');
        
        // If we're clicking within the table, don't clear updates
        if (isTableCell || isWithinTable) {
          return;
        }
        
        // Clear any pending updates only if we're truly leaving the table
        if (updateTimeoutRef.current) {
          clearTimeout(updateTimeoutRef.current);
        }
      }
    },
  }, [generateTableHTML, isTableEditable]);

  // Update editor editability when state changes
  useEffect(() => {
    if (editor) {
      // Store current column widths before changing editability
      const table = editor.view.dom.querySelector('table') as HTMLTableElement;
      const columnWidths: string[] = [];
      
      if (table) {
        const firstRowCells = table.querySelectorAll('thead tr th, tbody tr:first-child td');
        firstRowCells.forEach((cell: any) => {
          columnWidths.push(cell.style.width || '');
        });
      }
      
      // Change editability
      editor.setEditable(isTableEditable);
      
      // Restore column widths after changing editability
      if (columnWidths.length > 0) {
        setTimeout(() => {
          const newTable = editor.view.dom.querySelector('table') as HTMLTableElement;
          if (newTable) {
            const cells = newTable.querySelectorAll('thead tr th, tbody tr:first-child td');
            cells.forEach((cell: any, index: number) => {
              if (columnWidths[index]) {
                cell.style.width = columnWidths[index];
              }
            });
          }
        }, 0);
      }
    }
  }, [editor, isTableEditable]);

  // Handle click outside to exit edit mode
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      // Ignore right-clicks (context menu)
      if (e.button === 2) return;
      
      // Only handle if this component is in text editing mode
      if (isTextEditingGlobal && isSelected && containerRef.current) {
        const target = e.target as HTMLElement;
        
        // Check if click is outside the table container and not on the context menu
        if (!containerRef.current.contains(target) && !target.closest('.table-context-menu')) {
          // Force save any pending updates before exiting
          if (updateTimeoutRef.current) {
            clearTimeout(updateTimeoutRef.current);
            // Execute the update immediately if there's pending content
            if (editor && !editor.isDestroyed) {
              const html = editor.getHTML();
              const parser = new DOMParser();
              const doc = parser.parseFromString(html, 'text/html');
              const table = doc.querySelector('table');
              
              if (table) {
                const newHeaders: string[] = [];
                const newData: string[][] = [];
                
                // Extract headers
                const headerRows = table.querySelectorAll('thead tr');
                if (headerRows.length > 0) {
                  const headerCells = headerRows[0].querySelectorAll('th');
                  headerCells.forEach(cell => {
                    newHeaders.push(cell.innerHTML || '');
                  });
                }
                
                // Extract data
                const bodyRows = table.querySelectorAll('tbody tr');
                bodyRows.forEach(row => {
                  const rowData: string[] = [];
                  const cells = row.querySelectorAll('td');
                  cells.forEach(cell => {
                    rowData.push(cell.innerHTML || '');
                  });
                  if (rowData.length > 0) {
                    newData.push(rowData);
                  }
                });
                
                // Update component
                safeUpdateComponent({
                  props: {
                    ...componentProps,
                    headers: newHeaders,
                    data: newData
                  }
                });
              }
            }
          }
          
          // Now exit text editing mode
          setTextEditingGlobal(false);
        }
      }
    };

    // Add event listener with a small delay to avoid conflicts with table click
    if (isTextEditingGlobal && isSelected) {
      const timeoutId = setTimeout(() => {
        document.addEventListener('mousedown', handleClickOutside);
      }, 0);

      return () => {
        clearTimeout(timeoutId);
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [isTextEditingGlobal, isSelected, setTextEditingGlobal, editor, componentProps]);

  // Re-render table when showHeader changes
  useEffect(() => {
    if (editor && !editor.isDestroyed) {
      // Only update if showHeader actually changed, not on every render
      const currentHTML = editor.getHTML();
      const newHTML = generateTableHTML;
      
      // Parse both to check if structure is different (ignoring column widths)
      const parser = new DOMParser();
      const currentDoc = parser.parseFromString(currentHTML, 'text/html');
      const newDoc = parser.parseFromString(newHTML, 'text/html');
      
      const currentTable = currentDoc.querySelector('table');
      const newTable = newDoc.querySelector('table');
      
      // Check if the basic structure is different
      const currentHeaders = currentTable?.querySelectorAll('thead').length || 0;
      const newHeaders = newTable?.querySelectorAll('thead').length || 0;
      const currentRows = currentTable?.querySelectorAll('tbody tr').length || 0;
      const newRows = newTable?.querySelectorAll('tbody tr').length || 0;
      
      // Only set content if structure has actually changed
      if (currentHeaders !== newHeaders || currentRows !== newRows) {
        editor.commands.setContent(newHTML);
      }
    }
  }, [showHeader]); // Only depend on showHeader, not generateTableHTML

  // Auto-adjust component height based on table content
  useEffect(() => {
    if (editor && containerRef.current) {
      const updateHeight = () => {
        const tableElement = containerRef.current?.querySelector('table');
        if (tableElement) {
          const tableHeight = tableElement.offsetHeight;
          const padding = Math.max(8, Math.round(20 * effectivePixelScale)); // Scale padding to avoid excess space
          const newHeight = Math.max(200, tableHeight + padding);
          
          // Update component height if it has grown
          const currentHeight = component.props.height || 200;
          if (newHeight > currentHeight) {
            safeUpdateComponent({
              props: {
                ...component.props,
                height: newHeight
              }
            });
          }
        }
      };

      // Update height after editor updates
      editor.on('update', updateHeight);
      
      // Initial height check
      setTimeout(updateHeight, 100);

      return () => {
        editor.off('update', updateHeight);
      };
    }
  }, [editor, containerRef, component.props.height, effectivePixelScale]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
    };
  }, []);

  // Mouse event handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0) {
      setMouseDownPos({ x: e.clientX, y: e.clientY });
      setIsDragging(false);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (mouseDownPos && e.buttons === 1 && !isDragging) {
      const dx = Math.abs(e.clientX - mouseDownPos.x);
      const dy = Math.abs(e.clientY - mouseDownPos.y);
      
      if (dx > 10 || dy > 10) {
        setIsDragging(true);
      }
    }
  };

  const handleMouseUp = () => {
    setMouseDownPos(null);
  };

  // Handle table click to enter text editing mode
  const handleTableClick = (e: React.MouseEvent) => {
    // Don't stop propagation - let normal event flow happen
    // Only enter edit mode if not dragging
    if (globalIsEditing && isSelected && !isTextEditingGlobal && !isDragging) {
      const target = e.target as HTMLElement;
      const clickedCell = target.closest('td, th');
      
      // Enter text editing mode
      setTextEditingGlobal(true);
      
      // If clicked on a cell, focus it after entering edit mode
      if (clickedCell && editor) {
        setTimeout(() => {
          if (editor && !editor.isDestroyed) {
            try {
              const pos = editor.view.posAtDOM(clickedCell, 0);
              editor.commands.setTextSelection(pos + 1);
              editor.commands.focus();
            } catch (err) {
              // If position finding fails, just focus the editor
              editor.commands.focus();
            }
          }
        }, 50); // Small delay to ensure edit mode is activated
      }
    }
    
    setMouseDownPos(null);
    setIsDragging(false);
  };

  // Helper function to safely update component
  const safeUpdateComponent = (updates: Partial<ComponentInstance>) => {
    try {
      updateComponent(component.id, updates);
    } catch (error) {
      console.warn('Failed to update table component:', error);
    }
  };

  // Table control buttons
  const TableControls = () => {
    if (!showTableControls || !editor) return null;

    const handleAddColumn = (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      
      if (!editor || editor.isDestroyed) return;
      
      // Get current table width before adding
      const table = editor.view.dom.querySelector('table') as HTMLTableElement;
      const originalTableWidth = table?.offsetWidth || 0;
      
      // Force editor to be editable temporarily
      const wasEditable = editor.isEditable;
      if (!wasEditable) {
        editor.setEditable(true);
      }
      
      // Add column
      editor.chain().focus().addColumnAfter().run();
      
      // Ensure the table maintains a reasonable width after adding column
      setTimeout(() => {
        const newTable = editor.view.dom.querySelector('table') as HTMLTableElement;
        if (newTable && originalTableWidth > 0) {
          // If the table width decreased significantly, expand it
          const newTableWidth = newTable.offsetWidth;
          if (newTableWidth < originalTableWidth) {
            // Expand table to accommodate new column
            const expandedWidth = originalTableWidth + 100; // Add minimum column width
            
            // Update component width if needed
            if (component.props.width && expandedWidth > component.props.width) {
              safeUpdateComponent({
                props: {
                  ...component.props,
                  width: expandedWidth + 40 // Add padding
                }
              });
            }
          }
        }
      }, 50);
      
      // Restore original editable state
      if (!wasEditable) {
        editor.setEditable(false);
      }
    };

    const handleAddRow = (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      
      if (!editor || editor.isDestroyed) return;
      
      // Force editor to be editable temporarily
      const wasEditable = editor.isEditable;
      if (!wasEditable) {
        editor.setEditable(true);
      }
      
      // Add row
      editor.chain().focus().addRowAfter().run();
      
      // Restore original editable state
      if (!wasEditable) {
        editor.setEditable(false);
      }
    };

    const handleDeleteColumn = (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      
      if (!editor || editor.isDestroyed) return;
      
      const table = editor.view.dom.querySelector('table');
      const columnCount = table?.querySelector('tr')?.children.length || 0;
      if (columnCount > 1) {
        // Force editor to be editable temporarily
        const wasEditable = editor.isEditable;
        if (!wasEditable) {
          editor.setEditable(true);
        }
        
        // Delete column
        editor.chain().focus().deleteColumn().run();
        
        // Restore original editable state
        if (!wasEditable) {
          editor.setEditable(false);
        }
      }
    };

    const handleDeleteRow = (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      
      if (!editor || editor.isDestroyed) return;
      
      const table = editor.view.dom.querySelector('table');
      const bodyRowCount = table?.querySelectorAll('tbody tr').length || 0;
      if (bodyRowCount > 1) {
        // Force editor to be editable temporarily
        const wasEditable = editor.isEditable;
        if (!wasEditable) {
          editor.setEditable(true);
        }
        
        // Delete row
        editor.chain().focus().deleteRow().run();
        
        // Restore original editable state
        if (!wasEditable) {
          editor.setEditable(false);
        }
      }
    };

    const buttonStyle = {
      padding: '3px 6px',
      fontSize: '11px',
      fontWeight: '500' as const,
      border: '1px solid #e5e7eb',
      borderRadius: '4px',
      background: 'white',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      transition: 'all 0.15s ease',
      color: '#6b7280',
      minWidth: '24px',
      height: '24px',
    };

    const deleteButtonStyle = {
      ...buttonStyle,
      borderColor: '#fecaca',
      color: '#ef4444',
    };

    return (
      <div 
        style={{
          position: 'absolute',
          top: -36,
          left: 0,
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          background: 'white',
          padding: '4px 6px',
          borderRadius: '6px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          border: '1px solid #e5e7eb',
          zIndex: 1000,
        }}
        onMouseDown={(e) => {
          e.stopPropagation();
          e.preventDefault();
        }}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
        }}
      >
        {/* Column controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ fontSize: '11px', color: '#6b7280', marginRight: '2px' }}>Col</span>
          <button
            onClick={handleDeleteColumn}
            onMouseDown={(e) => {
              e.stopPropagation();
              e.preventDefault();
            }}
            style={deleteButtonStyle}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#fee2e2';
              e.currentTarget.style.borderColor = '#fca5a5';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'white';
              e.currentTarget.style.borderColor = '#fecaca';
            }}
            title="Delete column"
          >
            <Minus className="h-3 w-3" />
          </button>
          <button
            onClick={handleAddColumn}
            onMouseDown={(e) => {
              e.stopPropagation();
              e.preventDefault();
            }}
            style={buttonStyle}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#f3f4f6';
              e.currentTarget.style.borderColor = '#d1d5db';
              e.currentTarget.style.color = '#374151';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'white';
              e.currentTarget.style.borderColor = '#e5e7eb';
              e.currentTarget.style.color = '#6b7280';
            }}
            title="Add column"
          >
            <Plus className="h-3 w-3" />
          </button>
        </div>

        {/* Row controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ fontSize: '11px', color: '#6b7280', marginRight: '2px' }}>Row</span>
          <button
            onClick={handleDeleteRow}
            onMouseDown={(e) => {
              e.stopPropagation();
              e.preventDefault();
            }}
            style={deleteButtonStyle}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#fee2e2';
              e.currentTarget.style.borderColor = '#fca5a5';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'white';
              e.currentTarget.style.borderColor = '#fecaca';
            }}
            title="Delete row"
          >
            <Minus className="h-3 w-3" />
          </button>
          <button
            onClick={handleAddRow}
            onMouseDown={(e) => {
              e.stopPropagation();
              e.preventDefault();
            }}
            style={buttonStyle}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#f3f4f6';
              e.currentTarget.style.borderColor = '#d1d5db';
              e.currentTarget.style.color = '#374151';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'white';
              e.currentTarget.style.borderColor = '#e5e7eb';
              e.currentTarget.style.color = '#6b7280';
            }}
            title="Add row"
          >
            <Plus className="h-3 w-3" />
          </button>
        </div>
      </div>
    );
  };

  // Apply dynamic styles
  const tableContainerStyle: React.CSSProperties = {
    ...baseStyles,
    position: 'relative',
    width: '100%',
    height: '100%',
    cursor: globalIsEditing && isSelected && !isTextEditingGlobal ? 'text' : 'default',
    '--table-font-family': fontFamily,
    '--table-font-size': `${fontSize * effectivePixelScale}px`,
    '--table-border-color': borderColor,
    '--table-border-width': `${borderWidth * effectivePixelScale}px`,
    '--table-cell-padding': `${cellPadding * effectivePixelScale}px`,
    '--table-row-height': `${rowHeight * effectivePixelScale}px`,
    '--table-header-bg': headerBackgroundColor,
    '--table-header-color': headerTextColor,
    '--table-cell-bg': cellBackgroundColor,
    '--table-text-color': textColor,
    '--table-border-radius': `${borderRadius * effectivePixelScale}px`,
    '--table-box-shadow': boxShadow,
    '--table-text-align': alignment,
    '--table-cell-min-width': `${Math.max(60, Math.round(100 * effectivePixelScale))}px`,
  } as React.CSSProperties;

  // Handle context menu
  const handleContextMenu = (e: React.MouseEvent, row: number, col: number) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Adjust position to ensure menu doesn't go off-screen
    const menuWidth = 180; // Approximate width of context menu
    const menuHeight = 250; // Approximate height of context menu
    
    let x = e.clientX;
    let y = e.clientY;
    
    // Check if menu would go off right edge
    if (x + menuWidth > window.innerWidth) {
      x = window.innerWidth - menuWidth - 10;
    }
    
    // Check if menu would go off bottom edge
    if (y + menuHeight > window.innerHeight) {
      y = window.innerHeight - menuHeight - 10;
    }
    
    console.log('Context menu triggered at row:', row, 'col:', col, 'x:', x, 'y:', y);
    
    setContextMenu({
      x,
      y,
      row,
      col
    });
  };

  // Close context menu when clicking outside
  useEffect(() => {
    if (!contextMenu) return;

    const handleClick = (e: MouseEvent) => {
      // Ignore right-clicks to allow opening new context menus
      if (e.button === 2) return;
      
      // Always close the menu on any left-click outside
      const target = e.target as HTMLElement;
      const isContextMenu = target.closest('.table-context-menu');
      
      if (!isContextMenu) {
        setContextMenu(null);
      }
    };
    
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setContextMenu(null);
      }
    };

    // Use a small delay to ensure the context menu has rendered
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClick);
      document.addEventListener('keydown', handleEscape);
    }, 10);
    
    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [contextMenu]);

  // Context menu actions
  const handleContextMenuAction = (action: string) => {
    if (!editor || !contextMenu) return;

    console.log('Executing context menu action:', action);

    // Close the context menu first
    setContextMenu(null);

    // Keep the editor in text editing mode
    setTextEditingGlobal(true);

    // Make sure editor is editable
    if (!editor.isEditable) {
      editor.setEditable(true);
    }

    // Execute the action immediately
    requestAnimationFrame(() => {
      const table = editor.view.dom.querySelector('table');
      if (!table) {
        console.warn('Table not found in editor');
        return;
      }

      // Find the cell to focus on
      let targetCell: Element | null = null;
      
      if (contextMenu.row === -1) {
        // Header row
        const thead = table.querySelector('thead');
        if (thead) {
          const headerRow = thead.querySelector('tr');
          if (headerRow) {
            targetCell = headerRow.children[contextMenu.col];
          }
        }
      } else {
        // Body row
        const tbody = table.querySelector('tbody');
        if (tbody) {
          const rows = tbody.querySelectorAll('tr');
          if (rows[contextMenu.row]) {
            targetCell = rows[contextMenu.row].children[contextMenu.col];
          }
        }
      }
      
      if (!targetCell) {
        console.warn('Target cell not found');
        return;
      }

      try {
        // Get the position of the cell in the editor
        const pos = editor.view.posAtDOM(targetCell, 0);
        const $pos = editor.view.state.doc.resolve(pos);
        
        // Find the table node
        let depth = $pos.depth;
        while (depth >= 0 && $pos.node(depth).type.name !== 'table') {
          depth--;
        }
        
        if (depth < 0) {
          console.warn('Table node not found in document');
          return;
        }

        // Set selection inside the table
        editor.commands.setTextSelection(pos);
        
        // Execute the action
        switch (action) {
          case 'addRowAbove':
            editor.commands.addRowBefore();
            break;
          case 'addRowBelow':
            editor.commands.addRowAfter();
            break;
          case 'addColumnLeft':
            editor.commands.addColumnBefore();
            break;
          case 'addColumnRight':
            editor.commands.addColumnAfter();
            break;
          case 'deleteRow':
            // Check if we have more than one row
            const bodyRows = table.querySelectorAll('tbody tr');
            if (bodyRows.length > 1) {
              editor.commands.deleteRow();
            }
            break;
          case 'deleteColumn':
            // Check if we have more than one column
            const firstRow = table.querySelector('tr');
            if (firstRow && firstRow.children.length > 1) {
              editor.commands.deleteColumn();
            }
            break;
        }
        
        // Keep focus in the editor
        editor.commands.focus();
        
      } catch (error) {
        console.error('Error executing table action:', error);
      }
    });
  };

  return (
    <>
      {/* Table-specific styles */}
      <style>{`
        .tiptap-table-editor table {
          width: 100% !important;
          table-layout: auto !important;
        }
        
        .tiptap-table-editor th,
        .tiptap-table-editor td {
          min-width: var(--table-cell-min-width, 100px) !important;
          word-wrap: break-word;
          overflow-wrap: break-word;
          position: relative;
        }
        
        /* Preserve column widths during state changes */
        .tiptap-table-editor table.resizing {
          table-layout: fixed !important;
        }
        
        /* Column resize handle styling */
        .tiptap-table-editor .column-resize-handle {
          position: absolute;
          right: -2px;
          top: 0;
          bottom: -2px;
          width: 4px;
          background-color: #ced4da;
          pointer-events: none;
          cursor: col-resize;
        }
        
        .tiptap-table-editor .resize-cursor {
          cursor: col-resize;
        }
        
        /* Prevent layout shift when editing */
        .tiptap-table-editor .ProseMirror {
          min-height: 100%;
        }
        
        /* Ensure cells maintain focus styling when switching between them */
        .tiptap-table-editor .ProseMirror-selectednode {
          outline: none !important;
        }
        
        .tiptap-table-editor .selectedCell::after {
          content: none !important;
        }
        
        /* Better focus indication */
        .tiptap-table-editor.ProseMirror-focused td:focus,
        .tiptap-table-editor.ProseMirror-focused th:focus,
        .tiptap-table-editor td.ProseMirror-selectednode,
        .tiptap-table-editor th.ProseMirror-selectednode {
          outline: 2px solid #4287f5 !important;
          outline-offset: -2px;
          background-color: rgba(66, 135, 245, 0.05);
        }
      `}</style>
      
      {/* Editing indicator outside the component */}
      {isTableEditable && (
        <div
          style={{
            position: 'absolute',
            top: -20,
            right: 0,
            color: '#6b7280',
            fontSize: '11px',
            fontStyle: 'italic',
            pointerEvents: 'none',
            zIndex: 10,
          }}
        >
          Right-click to edit
        </div>
      )}
      
      <div 
        ref={containerRef} 
        style={tableContainerStyle}
        className={`table-renderer ${finalTableStyles.stripedRows ? 'striped-rows' : ''} ${finalTableStyles.hoverEffect ? 'hover-effect' : ''}`}
        onClick={handleTableClick}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onContextMenu={(e) => {
          console.log('Table right-clicked. isTableEditable:', isTableEditable, 'isTextEditingGlobal:', isTextEditingGlobal);
          if (isTableEditable) {
            e.preventDefault();
            e.stopPropagation();
            
            const target = e.target as HTMLElement;
            const cell = target.closest('td, th');
            if (cell) {
              const table = cell.closest('table');
              const row = cell.parentElement as HTMLTableRowElement;
              if (table && row) {
                // Get tbody rows for proper indexing
                const tbody = table.querySelector('tbody');
                if (tbody) {
                  const bodyRows = Array.from(tbody.querySelectorAll('tr'));
                  const rowIndex = bodyRows.indexOf(row);
                  // If not in tbody, check if it's a header row
                  if (rowIndex === -1) {
                    const thead = table.querySelector('thead');
                    if (thead && thead.contains(row)) {
                      // It's a header row, set index to -1
                      const colIndex = Array.from(row.children).indexOf(cell as HTMLTableCellElement);
                      handleContextMenu(e, -1, colIndex);
                      return;
                    }
                  } else {
                    const colIndex = Array.from(row.children).indexOf(cell as HTMLTableCellElement);
                    handleContextMenu(e, rowIndex, colIndex);
                  }
                }
              }
            }
          }
        }}
      >
        <TableControls />
        
        <div 
          style={{
            width: '100%',
            height: '100%',
            overflow: 'auto',
            borderRadius: `${borderRadius}px`,
          }}
          className="tiptap-table-container"
        >
          <EditorContent 
            editor={editor} 
            style={{
              width: '100%',
              height: '100%',
            }}
          />
        </div>
      
      {/* Context Menu - Rendered in Portal */}
      {contextMenu && isTableEditable && createPortal(
        <div 
          className="table-context-menu"
          style={{
            position: 'fixed',
            left: `${contextMenu.x}px`,
            top: `${contextMenu.y}px`,
            zIndex: 9999,
          }}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.preventDefault()}
        >
          <button 
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              handleContextMenuAction('addRowAbove');
            }}
            onMouseDown={(e) => e.preventDefault()}
          >
            Insert Row Above
          </button>
          <button 
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              handleContextMenuAction('addRowBelow');
            }}
            onMouseDown={(e) => e.preventDefault()}
          >
            Insert Row Below
          </button>
          <div className="separator" />
          <button 
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              handleContextMenuAction('addColumnLeft');
            }}
            onMouseDown={(e) => e.preventDefault()}
          >
            Insert Column Left
          </button>
          <button 
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              handleContextMenuAction('addColumnRight');
            }}
            onMouseDown={(e) => e.preventDefault()}
          >
            Insert Column Right
          </button>
          <div className="separator" />
          <button 
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              handleContextMenuAction('deleteRow');
            }}
            onMouseDown={(e) => e.preventDefault()}
          >
            Delete Row
          </button>
          <button 
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              handleContextMenuAction('deleteColumn');
            }}
            onMouseDown={(e) => e.preventDefault()}
          >
            Delete Column
          </button>
        </div>,
        document.body
      )}
      
      </div>
    </>
  );
};

// Register the renderer
registerRenderer('Table', renderTable); 