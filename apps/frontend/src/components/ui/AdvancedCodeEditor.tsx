import React, { useRef, useState, useMemo, useCallback } from 'react';
import Editor, { Monaco } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';

interface AdvancedCodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  minHeight?: string;
  maxHeight?: string;
}

/**
 * Pretty-print HTML code with proper indentation
 */
function prettyPrintHtml(html: string): string {
  if (!html || typeof html !== 'string') return html;
  
  // Check if this is HTML content
  const trimmed = html.trim();
  if (!trimmed.startsWith('<!') && !trimmed.startsWith('<html') && !trimmed.startsWith('<')) {
    return html; // Not HTML, return as-is
  }
  
  let formatted = '';
  let indent = 0;
  const indentStr = '  '; // 2 spaces
  
  // Split by tags while preserving them
  const tokens = html.split(/(<[^>]+>)/g).filter(Boolean);
  
  for (const token of tokens) {
    const trimmedToken = token.trim();
    if (!trimmedToken) continue;
    
    if (trimmedToken.startsWith('</')) {
      // Closing tag - decrease indent first
      indent = Math.max(0, indent - 1);
      formatted += indentStr.repeat(indent) + trimmedToken + '\n';
    } else if (trimmedToken.startsWith('<') && trimmedToken.endsWith('>')) {
      // Opening or self-closing tag
      const isSelfClosing = trimmedToken.endsWith('/>') || 
        /^<(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr|!DOCTYPE|!doctype)/i.test(trimmedToken);
      const isVoidElement = /^<(script|style|link|meta|title|head|body|html)/i.test(trimmedToken) === false &&
        /^<\w+[^>]*>[^<]*$/i.test(trimmedToken);
      
      formatted += indentStr.repeat(indent) + trimmedToken + '\n';
      
      if (!isSelfClosing && !trimmedToken.startsWith('<!')) {
        indent++;
      }
    } else {
      // Text content
      const lines = trimmedToken.split('\n').map(l => l.trim()).filter(Boolean);
      for (const line of lines) {
        if (line) {
          formatted += indentStr.repeat(indent) + line + '\n';
        }
      }
    }
  }
  
  return formatted.trim();
}

const AdvancedCodeEditor: React.FC<AdvancedCodeEditorProps> = ({
  value,
  onChange,
  onBlur,
  minHeight = '200px',
  maxHeight = '400px',
}) => {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const [isFormatted, setIsFormatted] = useState(false);
  
  // Detect language based on content
  const language = useMemo(() => {
    const trimmed = (value || '').trim().toLowerCase();
    if (trimmed.startsWith('<!doctype') || trimmed.startsWith('<html')) {
      return 'html';
    }
    return 'javascript';
  }, [value]);
  
  // Pretty-print the value on first load if it's minified HTML
  const displayValue = useMemo(() => {
    if (isFormatted) return value;
    
    // Check if code is minified (no newlines in a long string)
    const isMinified = value && value.length > 100 && !value.includes('\n');
    if (isMinified && language === 'html') {
      return prettyPrintHtml(value);
    }
    return value;
  }, [value, language, isFormatted]);

  const handleEditorMount = useCallback((editor: editor.IStandaloneCodeEditor, monaco: Monaco) => {
    editorRef.current = editor;
    
    // Ensure onBlur works similarly to a textarea
    editor.onDidBlurEditorWidget(() => onBlur?.());
    editor.onDidBlurEditorText(() => onBlur?.());
    
    // If value was pretty-printed, update the parent with formatted version
    if (displayValue !== value) {
      onChange(displayValue);
      setIsFormatted(true);
    }
  }, [onBlur, displayValue, value, onChange]);

  const handleFormat = useCallback(() => {
    if (editorRef.current) {
      // Use Monaco's built-in formatter
      editorRef.current.getAction('editor.action.formatDocument')?.run();
    }
  }, []);

  const height = `min(calc(${maxHeight}), 70vh)`;
  
  return (
    <div className="relative">
      {/* Format button */}
      <button
        onClick={handleFormat}
        className="absolute top-2 right-2 z-10 px-2 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded"
        title="Format code (Alt+Shift+F)"
      >
        Format
      </button>
      
      <div
        style={{
          minHeight,
          height,
          overflow: 'auto',
          overscrollBehavior: 'contain',
          overscrollBehaviorY: 'contain',
          WebkitOverflowScrolling: 'auto'
        }}
      >
        <Editor
          height="100%"
          language={language}
          theme="vs-dark"
          value={displayValue}
          onChange={(val) => {
            setIsFormatted(true);
            onChange(val || '');
          }}
          onMount={handleEditorMount}
          options={{
            fontSize: 12,
            minimap: { enabled: false },
            wordWrap: 'on',
            scrollBeyondLastLine: false,
            tabSize: 2,
            automaticLayout: true,
            formatOnType: true,
            formatOnPaste: true,
            suggest: { preview: true },
          }}
        />
      </div>
    </div>
  );
};

export default AdvancedCodeEditor; 