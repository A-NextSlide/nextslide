
import DOMPurify from 'dompurify';
import { v4 as uuidv4 } from 'uuid';
import { ComponentInstance } from '../types/components';

// In-memory clipboard storage to avoid browser clipboard API limitations
let clipboardData: ComponentInstance | null = null;
// Track number of times the same component has been pasted
let pasteCount = 0;

/**
 * Extract text content from a component for copying to system clipboard
 */
export const extractTextFromComponent = (component: ComponentInstance): string => {
  const textParts: string[] = [];
  const props = component.props || {};

  // For CustomComponent, parse the HTML render content
  if (component.type === 'CustomComponent' && props.render) {
    // Create a temporary DOM element to parse HTML
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = DOMPurify.sanitize(props.render);

    // Remove script and style tags
    tempDiv.querySelectorAll('script, style').forEach(el => el.remove());

    // Get text content, preserving some structure
    const getText = (element: Element): string => {
      const parts: string[] = [];

      element.childNodes.forEach(node => {
        if (node.nodeType === Node.TEXT_NODE) {
          const text = node.textContent?.trim();
          if (text) parts.push(text);
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          const el = node as Element;
          const tagName = el.tagName.toLowerCase();
          const childText = getText(el);

          if (childText) {
            // Add line breaks for block elements
            if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'div', 'li', 'br', 'header', 'section', 'article'].includes(tagName)) {
              parts.push(childText + '\n');
            } else {
              parts.push(childText);
            }
          }
        }
      });

      return parts.join(' ').replace(/\s+/g, ' ').trim();
    };

    const htmlText = getText(tempDiv);
    if (htmlText) textParts.push(htmlText);

    // Also include the label if present
    if (props.label && !htmlText.includes(props.label)) {
      textParts.unshift(props.label);
    }
  } else {
    // For standard components, extract common text properties
    const textProps = ['title', 'subtitle', 'text', 'content', 'label', 'heading', 'description', 'body'];

    for (const prop of textProps) {
      if (props[prop] && typeof props[prop] === 'string') {
        textParts.push(props[prop]);
      }
    }

    // Handle items array (for lists, etc.)
    if (Array.isArray(props.items)) {
      props.items.forEach((item: unknown) => {
        if (typeof item === 'string') {
          textParts.push(item);
        } else if (item && typeof item === 'object') {
          const itemObj = item as Record<string, unknown>;
          if (typeof itemObj.text === 'string') textParts.push(itemObj.text);
          if (typeof itemObj.title === 'string') textParts.push(itemObj.title);
          if (typeof itemObj.content === 'string') textParts.push(itemObj.content);
        }
      });
    }
  }

  // Clean up and join
  return textParts
    .filter(Boolean)
    .join('\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

/**
 * Copy text content to system clipboard
 */
export const copyTextToSystemClipboard = async (text: string): Promise<boolean> => {
  // 1. WebView bridge (React Native)
  try {
    if ((window as any).ReactNativeWebView) {
      (window as any).ReactNativeWebView.postMessage(
        JSON.stringify({ type: 'clipboard-write', text })
      );
      return true;
    }
  } catch {}

  // 2. Electron IPC bridge
  try {
    if ((window as any).electronAPI?.clipboard?.writeText) {
      await (window as any).electronAPI.clipboard.writeText(text);
      return true;
    }
  } catch {}

  // 3. Standard Clipboard API
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {}

  // 4. Legacy execCommand fallback
  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.style.position = 'fixed';
  textArea.style.left = '-9999px';
  document.body.appendChild(textArea);
  textArea.select();
  try {
    document.execCommand('copy');
    return true;
  } catch {
    return false;
  } finally {
    document.body.removeChild(textArea);
  }
};

export const copyToClipboard = (component: ComponentInstance): void => {
  // Create a deep copy of the component to avoid reference issues
  clipboardData = JSON.parse(JSON.stringify(component));
  // Reset paste counter when a new component is copied
  pasteCount = 0;
};

export const getFromClipboard = (): ComponentInstance | null => {
  return clipboardData ? JSON.parse(JSON.stringify(clipboardData)) : null;
};

export const pasteFromClipboard = (): ComponentInstance | null => {
  if (!clipboardData) {
    return null;
  }

  // Increment paste count
  pasteCount++;

  // Create a duplicate with a new ID
  const duplicate: ComponentInstance = {
    ...JSON.parse(JSON.stringify(clipboardData)),
    id: `${clipboardData.type}-${uuidv4().slice(0, 8)}`,
  };

  // Calculate offset based on paste count (staggered grid-like arrangement)
  // This creates a more organized pattern of pasted components
  if (duplicate.props.position) {
    const offsetX = (pasteCount % 3) * 5; // 0, 5, 10, then repeat
    const offsetY = Math.floor(pasteCount / 3) * 5; // 0 for first row, then 5, 10, etc.
    
    duplicate.props.position = {
      x: Math.min(95, clipboardData.props.position.x + offsetX),
      y: Math.min(95, clipboardData.props.position.y + offsetY)
    };
  }

  return duplicate;
};
