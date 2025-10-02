import React from 'react';
import Editor from '@monaco-editor/react';

interface AdvancedCodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  minHeight?: string;
  maxHeight?: string;
}

const AdvancedCodeEditor: React.FC<AdvancedCodeEditorProps> = ({
  value,
  onChange,
  onBlur,
  minHeight = '200px',
  maxHeight = '400px',
}) => {
  const height = `min(calc(${maxHeight}), 70vh)`;
  return (
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
        defaultLanguage="javascript"
        theme="vs-dark"
        value={value}
        onChange={(val) => onChange(val || '')}
        onMount={(editor) => {
          // Ensure onBlur works similarly to a textarea
          editor.onDidBlurEditorWidget(() => onBlur?.());
          editor.onDidBlurEditorText(() => onBlur?.());
        }}
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
  );
};

export default AdvancedCodeEditor; 