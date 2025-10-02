import React, { useEffect, useMemo, useRef, useState } from 'react';
import { EditorContent, useEditor, Editor } from '@tiptap/react';
import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import Bold from '@tiptap/extension-bold';
import Italic from '@tiptap/extension-italic';
import Underline from '@tiptap/extension-underline';
import Strike from '@tiptap/extension-strike';
import BulletList from '@tiptap/extension-bullet-list';
import OrderedList from '@tiptap/extension-ordered-list';
import ListItem from '@tiptap/extension-list-item';
import Heading from '@tiptap/extension-heading';
import TextAlign from '@tiptap/extension-text-align';
import Superscript from '@tiptap/extension-superscript';
import Subscript from '@tiptap/extension-subscript';
import { cn } from '@/lib/utils';
import { MarkdownProcessor } from '@/utils/markdownProcessor';
import { AlignLeft, AlignCenter, AlignRight, Bold as BoldIcon, Italic as ItalicIcon, Underline as UnderlineIcon, Strikethrough, List, ListOrdered, Heading as HeadingIcon, Superscript as SuperscriptIcon } from 'lucide-react';

interface OutlineRichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  editable?: boolean;
  showToolbar?: boolean;
  bubbleToolbar?: boolean;
  className?: string;
  footer?: React.ReactNode;
}

// Serialize a subset of TipTap JSON to plain text with simple list/heading prefixes
function serializeDocToPlainText(json: any): string {
  if (!json || !json.type || json.type !== 'doc' || !Array.isArray(json.content)) return '';
  const lines: string[] = [];

  const extractText = (node: any): string => {
    if (!node) return '';
    if (node.type === 'text') {
      return typeof node.text === 'string' ? node.text : '';
    }
    if (Array.isArray(node.content)) {
      return node.content.map(extractText).join('');
    }
    return '';
  };

  const walk = (node: any) => {
    if (!node) return;
    switch (node.type) {
      case 'paragraph':
        lines.push(extractText(node));
        break;
      case 'heading': {
        const level = Math.min(Math.max(node.attrs?.level || 1, 1), 6);
        const text = extractText(node);
        lines.push(`${'#'.repeat(level)} ${text}`);
        break;
      }
      case 'bulletList': {
        (node.content || []).forEach((li: any) => {
          // listItem with paragraph children
          const text = extractText(li);
          lines.push(`- ${text}`);
        });
        break;
      }
      case 'orderedList': {
        let index = 1;
        (node.content || []).forEach((li: any) => {
          const text = extractText(li);
          lines.push(`${index}. ${text}`);
          index += 1;
        });
        break;
      }
      default: {
        if (Array.isArray(node.content)) {
          node.content.forEach(walk);
        }
      }
    }
  };

  json.content.forEach(walk);
  return lines.join('\n').trimEnd();
}

// Normalize backend-escaped content (e.g., \n, \t, \u2022)
function normalizeInputText(raw: string): string {
  if (typeof raw !== 'string') return '';
  return raw
    .replace(/\\u2022/g, '•')
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\r/g, '\r');
}

// Create initial HTML content from plain text (basic paragraphs only)
function createInitialHtmlFromText(text: string): string {
  const t = (text || '').trim();
  if (!t) return '<p></p>';
  // Normalize and coalesce list items that are separated by blank lines
  // This fixes cases like "Sources:" where items are written as "1. ..." with blank lines between them
  let normalized = normalizeInputText(t);
  // Collapse blank lines between ordered list items (e.g., 1. ItemA \n\n 1. ItemB → 1. ItemA \n 1. ItemB)
  normalized = normalized.replace(/(^\s*\d+[\.)]\s+.+)\n\s*\n(?=\s*\d+[\.)]\s+)/gm, '$1\n');
  // Collapse blank lines between unordered list items (e.g., • ItemA \n\n • ItemB → • ItemA \n • ItemB)
  normalized = normalized.replace(/(^\s*(?:[-*+]|•)\s+.+)\n\s*\n(?=\s*(?:[-*+]|•)\s+)/gm, '$1\n');
  // Preserve markdown formatting into HTML (basic)
  // Bold/italic
  let html = escapeHtml(normalized)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>');
  // Headings (#, ##, ###)
  html = html.replace(/^###\s+(.+)$/gm, '<h3>$1<\/h3>')
             .replace(/^##\s+(.+)$/gm, '<h2>$1<\/h2>')
             .replace(/^#\s+(.+)$/gm, '<h1>$1<\/h1>');
  // Lists
  // Convert unordered lists (support hyphen, asterisk, plus, and bullet character •)
  // Greedy match to capture contiguous list items in one block
  html = html.replace(/^(?:(?:[-*+]|•)\s+.+(?:\n|$))+/gm, (block) => {
    const items = block
      .trim()
      .split(/\n/)
      .map(li => li.replace(/^(?:[-*+]|•)\s+/, '').trim())
      .filter(i => i.length > 0);
    if (items.length === 0) return '';
    return `<ul>${items.map(i => `<li>${i}</li>`).join('')}</ul>`;
  });
  // Convert ordered lists
  // Greedy match to capture contiguous list items in one block
  html = html.replace(/^(?:\d+[\.)]\s+.+(?:\n|$))+/gm, (block) => {
    const items = block
      .trim()
      .split(/\n/)
      .map(li => li.replace(/^\d+[\.)]\s+/, '').trim())
      .filter(i => i.length > 0);
    if (items.length === 0) return '';
    return `<ol>${items.map(i => `<li>${i}</li>`).join('')}</ol>`;
  });
  // Wrap remaining lines as paragraphs
  html = html
    .split(/\n{2,}/)
    .map(seg => seg.match(/^\s*<(h\d|ul|ol)/) ? seg : `<p>${seg.replace(/\n/g, ' ')}</p>`)
    .join('');
  return html;
}

// Normalize simple HTML paragraphs that represent lists into semantic <ol>/<ul>
function normalizeHtmlListsInHtml(html: string): string {
  if (!html || typeof html !== 'string') return html;
  let out = html;
  // Only attempt normalization if no lists are present yet
  const hasOrdered = /<ol\b/i.test(out);
  const hasUnordered = /<ul\b/i.test(out);

  // Convert paragraph lines that look like ordered list items <p>1. text</p> → <li>text</li>
  if (!hasOrdered) {
    out = out.replace(/<p[^>]*>\s*\d+[\.)]\s+([\s\S]*?)<\/p>/gi, '<li>$1</li>');
    // Remove empty paragraphs which can break contiguous <li> grouping
    out = out.replace(/<p[^>]*>\s*(?:<br\s*\/?>)?\s*<\/p>/gi, '');
    // Wrap consecutive <li>...</li> into <ol> blocks
    out = out.replace(/(?:\s*<li>[\s\S]*?<\/li>\s*){1,}/gi, (block) => {
      // Avoid double-wrapping if already inside an <ol>
      if (/^\s*<ol\b[\s\S]*<\/ol>\s*$/.test(block)) return block;
      return `<ol>${block}</ol>`;
    });
  }

  // Convert paragraph lines that look like unordered list items <p>• text</p> or <p>- text</p> → <li>text</li>
  if (!hasUnordered) {
    out = out.replace(/<p[^>]*>\s*(?:[•\-*+])\s+([\s\S]*?)<\/p>/gi, '<li>$1</li>');
    // Remove empty paragraphs which can break contiguous <li> grouping
    out = out.replace(/<p[^>]*>\s*(?:<br\s*\/?>)?\s*<\/p>/gi, '');
    // Wrap consecutive <li>...</li> into <ul> blocks where not already wrapped by <ol>
    out = out.replace(/(?:\s*<li>[\s\S]*?<\/li>\s*){1,}/gi, (block) => {
      if (/^\s*<ol\b[\s\S]*<\/ol>\s*$/.test(block)) return block; // leave ordered blocks intact
      if (/^\s*<ul\b[\s\S]*<\/ul>\s*$/.test(block)) return block; // already unordered
      return `<ul>${block}</ul>`;
    });
  }

  return out;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

const Toolbar: React.FC<{ editor: Editor | null; visible: boolean; bubble?: boolean; isFocused?: boolean; compact?: boolean }> = ({ editor, visible, bubble = false, isFocused = false, compact = false }) => {
  if (!editor || !visible) return null;
  if (bubble && !isFocused) return null;
  
  return (
    <div
      className={cn(
        'flex items-center gap-1.5 px-2 py-1.5',
        bubble
          ? isFocused
            ? 'absolute left-1/2 -translate-x-1/2 -top-14 w-auto min-w-[320px] rounded-md border border-[#FF4301]/80 bg-white/98 dark:bg-zinc-900/98 shadow-2xl z-[99999] transition-all duration-200'
            : 'absolute left-1/2 -translate-x-1/2 -top-14 w-auto min-w-[320px] rounded-md border border-[#FF4301]/80 bg-white/98 dark:bg-zinc-900/98 shadow-2xl z-[99999] transition-all duration-200 opacity-0 translate-y-2'
          : 'border-b border-zinc-200 dark:border-zinc-700 bg-white/60 dark:bg-zinc-900/60 sticky top-1 z-10 rounded-t-md'
      )}
      style={bubble ? { 
        backdropFilter: 'blur(10px)',
        transform: isFocused ? 'translateX(-50%) translateY(0)' : 'translateX(-50%) translateY(8px)',
        opacity: isFocused ? 1 : 0,
        pointerEvents: isFocused ? 'auto' : 'none'
      } : undefined}
    >
      <button
        className={cn('px-1.5 py-0.5 text-[11px] rounded hover:bg-zinc-100 dark:hover:bg-zinc-800', editor.isActive('bold') && 'bg-zinc-200 dark:bg-zinc-700')}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor.chain().focus().toggleBold().run()}
        title="Bold"
      >
        <BoldIcon className="h-3.5 w-3.5" />
      </button>
      <button
        className={cn('px-1.5 py-0.5 text-[11px] rounded hover:bg-zinc-100 dark:hover:bg-zinc-800', editor.isActive('italic') && 'bg-zinc-200 dark:bg-zinc-700')}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        title="Italic"
      >
        <ItalicIcon className="h-3.5 w-3.5" />
      </button>
      <button
        className={cn('px-1.5 py-0.5 text-[11px] rounded hover:bg-zinc-100 dark:hover:bg-zinc-800', editor.isActive('underline') && 'bg-zinc-200 dark:bg-zinc-700')}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        title="Underline"
      >
        <UnderlineIcon className="h-3.5 w-3.5" />
      </button>
      <button
        className={cn('px-1.5 py-0.5 text-[11px] rounded hover:bg-zinc-100 dark:hover:bg-zinc-800', editor.isActive('strike') && 'bg-zinc-200 dark:bg-zinc-700')}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor.chain().focus().toggleStrike().run()}
        title="Strikethrough"
      >
        <Strikethrough className="h-3.5 w-3.5" />
      </button>

      <div className="w-px h-5 bg-zinc-300 dark:bg-zinc-600 mx-1" />

      <button
        className={cn('px-1.5 py-0.5 text-[11px] rounded hover:bg-zinc-100 dark:hover:bg-zinc-800', editor.isActive('superscript') && 'bg-zinc-200 dark:bg-zinc-700')}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor.chain().focus().toggleSuperscript().run()}
        title="Superscript"
      >
        <SuperscriptIcon className="h-3.5 w-3.5" />
      </button>

      <button
        className={cn('px-1.5 py-0.5 text-[11px] rounded hover:bg-zinc-100 dark:hover:bg-zinc-800', editor.isActive({ textAlign: 'left' }) && 'bg-zinc-200 dark:bg-zinc-700')}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor.chain().focus().setTextAlign('left').run()}
        title="Align Left"
      >
        <AlignLeft className="h-3.5 w-3.5" />
      </button>
      <button
        className={cn('px-1.5 py-0.5 text-[11px] rounded hover:bg-zinc-100 dark:hover:bg-zinc-800', editor.isActive({ textAlign: 'center' }) && 'bg-zinc-200 dark:bg-zinc-700')}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor.chain().focus().setTextAlign('center').run()}
        title="Align Center"
      >
        <AlignCenter className="h-3.5 w-3.5" />
      </button>
      <button
        className={cn('px-1.5 py-0.5 text-[11px] rounded hover:bg-zinc-100 dark:hover:bg-zinc-800', editor.isActive({ textAlign: 'right' }) && 'bg-zinc-200 dark:bg-zinc-700')}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor.chain().focus().setTextAlign('right').run()}
        title="Align Right"
      >
        <AlignRight className="h-3.5 w-3.5" />
      </button>

      <div className="w-px h-5 bg-zinc-300 dark:bg-zinc-600 mx-1" />

      <button
        className={cn('px-1.5 py-0.5 text-[11px] rounded hover:bg-zinc-100 dark:hover:bg-zinc-800', editor.isActive('bulletList') && 'bg-zinc-200 dark:bg-zinc-700')}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        title="Bullet List"
      >
        <List className="h-3.5 w-3.5" />
      </button>
      <button
        className={cn('px-1.5 py-0.5 text-[11px] rounded hover:bg-zinc-100 dark:hover:bg-zinc-800', editor.isActive('orderedList') && 'bg-zinc-200 dark:bg-zinc-700')}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        title="Numbered List"
      >
        <ListOrdered className="h-3.5 w-3.5" />
      </button>
    </div>
  );
};

const OutlineRichTextEditor: React.FC<OutlineRichTextEditorProps> = ({
  value,
  onChange,
  onBlur,
  placeholder = 'Enter slide content...',
  editable = true,
  showToolbar = true,
  bubbleToolbar = false,
  className,
  footer,
}) => {
  const initialHtml = useMemo(() => {
    // Always treat the value as HTML since it comes from the editor
    // The content is already HTML from previous edits
    if (!value || value === '') return '<p></p>';
    if (typeof value !== 'string') return '<p></p>';
    
    // If it already looks like HTML (has tags), use it directly
    // Check for common HTML tags to avoid false positives
    const hasHtmlTags = /<(p|div|span|h[1-6]|ul|ol|li|strong|em|br)\b[^>]*>/i.test(value);
    
    if (hasHtmlTags) {
      return value;
    }
    
    // Only convert to HTML if it's truly plain text (no HTML tags at all)
    return createInitialHtmlFromText(value);
  }, [value]);

  const editor = useEditor({
    extensions: [
      Document,
      Paragraph.configure({ HTMLAttributes: { style: 'margin: 0; padding: 0;' } }),
      Text,
      Bold,
      Italic,
      Underline,
      Strike,
      BulletList,
      OrderedList,
      ListItem,
      Heading.configure({ levels: [1, 2, 3] }),
      TextAlign.configure({ types: ['paragraph', 'heading'] }),
      Superscript,
      Subscript
    ],
    content: normalizeHtmlListsInHtml(initialHtml),
    editable,
    editorProps: {
      attributes: {
        class: cn(
          'outline-none h-full w-full focus:outline-none',
          // Use custom text sizing to match the actual small size in view mode
          'text-[0.7rem] leading-relaxed',
          '[&_p]:text-[0.7rem]',
          '[&_li]:text-[0.7rem]',
          // Less aggressive superscript position and size in outline view
          '[&_sup]:align-[0.2em] [&_sup]:text-[0.75em]',
          '[&_h1]:text-[0.85rem] [&_h1]:font-semibold',
          '[&_h2]:text-[0.8rem] [&_h2]:font-semibold', 
          '[&_h3]:text-[0.75rem] [&_h3]:font-semibold',
          // Colors
          'text-zinc-700 dark:text-neutral-300',
          // List styles
          '[&_ul]:list-disc [&_ul]:pl-4',
          '[&_ol]:list-decimal [&_ol]:pl-4',
          '[&_li]:ml-2',
          // Remove all focus styling
          '[&:focus]:outline-none [&:focus]:ring-0 [&:focus-visible]:outline-none'
        )
      }
    },
    onBlur: () => {
      if (!editor) return;
      const html = editor.getHTML();
      onChange(html);
      onBlur?.();
    },
    onUpdate: ({ editor }) => {
      if (!editor) return;
      const html = editor.getHTML();
      scheduleChange(html);
    },
  });

  // Keep editor editable state in sync
  useEffect(() => {
    if (editor) {
      editor.setEditable(editable);
    }
  }, [editor, editable]);

  // Debounce change propagation
  const debounceRef = useRef<number | null>(null);
  const scheduleChange = (text: string) => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      onChange(text);
    }, 400);
  };

  // Update editor content if external value changes (when not focused)
  const [isFocused, setIsFocused] = useState(false);
  useEffect(() => {
    if (!editor) return;
    const onFocus = () => setIsFocused(true);
    const onBlur = () => setIsFocused(false);
    editor.on('focus', onFocus);
    editor.on('blur', onBlur);
    return () => {
      editor.off('focus', onFocus);
      editor.off('blur', onBlur);
    };
  }, [editor]);

  useEffect(() => {
    if (!editor) return;
    // Only reset content if not actively focused (avoid cursor jumps)
    if (!isFocused) {
      if (!value || value === '') {
        editor.commands.setContent('<p></p>', false);
        return;
      }
      
      // Check for common HTML tags to avoid false positives
      const hasHtmlTags = /<(p|div|span|h[1-6]|ul|ol|li|strong|em|br)\b[^>]*>/i.test(value);
      const html = hasHtmlTags ? value : createInitialHtmlFromText(value);
      editor.commands.setContent(normalizeHtmlListsInHtml(html), false);
    }
  }, [value, editor, isFocused]);

  // Auto-focus when component mounts in bubble mode
  useEffect(() => {
    if (bubbleToolbar && editor && editable) {
      setTimeout(() => {
        editor.commands.focus();
      }, 100);
    }
  }, [bubbleToolbar, editor, editable]);

  return (
    <div className={cn('relative flex flex-col h-full', bubbleToolbar ? '' : 'rounded-md border border-zinc-300/50 dark:border-neutral-700/50 bg-white/60 dark:bg-zinc-900/40', className)}>
      {bubbleToolbar && <Toolbar editor={editor} visible={true} bubble={true} isFocused={isFocused} />}
      {!bubbleToolbar && <Toolbar editor={editor} visible={showToolbar} bubble={false} isFocused={isFocused} compact={true} />}
      <div className={cn("flex-1 overflow-y-auto cursor-text", bubbleToolbar ? '' : 'p-3')}>
        <div
          onClick={() => {
            if (editor && !editor.isFocused) {
              editor.chain().focus('end').run();
            }
          }}
        >
          {!value && !isFocused && (
            <div className="pointer-events-none select-none text-xs text-zinc-400 dark:text-neutral-500 mb-1">{placeholder}</div>
          )}
          <EditorContent editor={editor} className="min-h-full outline-none" />
        </div>
        {footer && (
          <div className="mt-2 border-t border-zinc-200/70 dark:border-zinc-700/60 pt-2 text-[0.68rem] leading-relaxed text-zinc-600 dark:text-neutral-400">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};

export default OutlineRichTextEditor;
