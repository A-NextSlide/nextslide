import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ImageIcon, MessageSquare, Type, Sparkles, RefreshCw, X, Send } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MediaHub } from '@/components/media/MediaHub';

// Types for detected elements
export interface DetectedElement {
  id: string;
  type: 'text' | 'image' | 'container' | 'other';
  tagName: string;
  bounds: { x: number; y: number; width: number; height: number };
  content?: string;
  src?: string;
  alt?: string;
  selector?: string;
}

interface CustomComponentEditOverlayProps {
  componentId: string;
  isEditing: boolean;
  isSelected: boolean;
  srcDoc: string;
  scale: number;
  onHtmlUpdate: (newHtml: string) => void;
  onImageSelect: (element: DetectedElement) => void;
}

// Brand colors
const BRAND_ORANGE = '#FF4301';

/**
 * Generate the edit mode script to inject into the iframe
 * This script handles:
 * - Hover outlines on elements
 * - Click detection and element selection
 * - Text editing in place
 * - Communication with parent via postMessage
 */
export function generateEditModeScript(componentId: string): string {
  return `
<!-- NEXTSLIDE EDIT MODE -->
<div id="ns-edit-mode-indicator" style="position:fixed;top:8px;right:8px;background:#FF4301;color:white;padding:4px 10px;border-radius:4px;font-size:11px;font-weight:600;font-family:system-ui;z-index:99999;pointer-events:none;opacity:0.9;">
  ✏️ Edit Mode
</div>

<style id="ns-edit-mode-styles">
  /* Edit mode hover effects */
  .ns-editable-text,
  .ns-editable-image {
    cursor: pointer !important;
    transition: outline 0.15s ease, background-color 0.15s ease !important;
  }

  .ns-editable-text:hover,
  .ns-editable-image:hover {
    outline: 2px solid rgba(255, 67, 1, 0.6) !important;
    outline-offset: 2px !important;
    background-color: rgba(255, 67, 1, 0.05) !important;
  }

  .ns-editable-text.ns-selected,
  .ns-editable-image.ns-selected {
    outline: 2px solid #FF4301 !important;
    outline-offset: 2px !important;
    background-color: rgba(255, 67, 1, 0.1) !important;
  }

  .ns-editable-image {
    position: relative !important;
  }

  .ns-image-overlay {
    position: absolute !important;
    inset: 0 !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    background: rgba(0, 0, 0, 0.4) !important;
    opacity: 0 !important;
    transition: opacity 0.2s ease !important;
    pointer-events: none !important;
  }

  .ns-editable-image:hover .ns-image-overlay {
    opacity: 1 !important;
  }

  .ns-image-overlay-text {
    color: white !important;
    font-size: 12px !important;
    font-weight: 600 !important;
    background: #FF4301 !important;
    padding: 6px 12px !important;
    border-radius: 6px !important;
    font-family: system-ui, -apple-system, sans-serif !important;
  }

  /* Text being edited */
  .ns-text-editing {
    outline: 2px solid #FF4301 !important;
    outline-offset: 2px !important;
    background-color: rgba(255, 255, 255, 0.95) !important;
    min-width: 50px !important;
    min-height: 1em !important;
  }

  /* Type indicator badges */
  .ns-type-badge {
    position: absolute !important;
    top: -20px !important;
    left: 0 !important;
    background: #FF4301 !important;
    color: white !important;
    font-size: 10px !important;
    padding: 2px 6px !important;
    border-radius: 4px !important;
    font-family: system-ui, -apple-system, sans-serif !important;
    font-weight: 600 !important;
    pointer-events: none !important;
    opacity: 0 !important;
    transition: opacity 0.15s ease !important;
    z-index: 10000 !important;
  }

  .ns-editable-text:hover .ns-type-badge,
  .ns-editable-image:hover .ns-type-badge {
    opacity: 1 !important;
  }
</style>
<script>
(function() {
  const COMPONENT_ID = '${componentId}';
  let selectedElement = null;
  let isTextEditing = false;

  // Mark text elements as editable
  function setupEditableElements() {
    // Text elements
    const textSelectors = 'h1, h2, h3, h4, h5, h6, p, span, a, li, td, th, label, button, div';
    document.querySelectorAll(textSelectors).forEach((el, index) => {
      // Skip if already processed or has no direct text
      if (el.classList.contains('ns-editable-text') || el.classList.contains('ns-editable-image')) return;
      if (el.classList.contains('ns-type-badge') || el.classList.contains('ns-image-overlay')) return;

      const directText = Array.from(el.childNodes)
        .filter(node => node.nodeType === Node.TEXT_NODE)
        .map(node => node.textContent?.trim())
        .join('')
        .trim();

      if (directText && directText.length > 0) {
        el.classList.add('ns-editable-text');
        el.dataset.nsId = 'text-' + index;
        el.dataset.nsOriginal = directText;
        el.style.position = el.style.position || 'relative';

        // Add type badge
        const badge = document.createElement('span');
        badge.className = 'ns-type-badge';
        badge.textContent = el.tagName.toLowerCase();
        el.appendChild(badge);
      }
    });

    // Image elements
    document.querySelectorAll('img').forEach((img, index) => {
      if (img.classList.contains('ns-editable-image')) return;
      if (img.width < 30 || img.height < 30) return; // Skip tiny images

      img.classList.add('ns-editable-image');
      img.dataset.nsId = 'img-' + index;

      // Wrap image if not already wrapped
      if (!img.parentElement?.classList.contains('ns-image-wrapper')) {
        const wrapper = document.createElement('div');
        wrapper.className = 'ns-image-wrapper';
        wrapper.style.position = 'relative';
        wrapper.style.display = 'inline-block';
        wrapper.style.width = img.style.width || (img.width + 'px');
        wrapper.style.height = img.style.height || (img.height + 'px');

        img.parentElement?.insertBefore(wrapper, img);
        wrapper.appendChild(img);

        // Add overlay
        const overlay = document.createElement('div');
        overlay.className = 'ns-image-overlay';
        overlay.innerHTML = '<span class="ns-image-overlay-text">Click to edit</span>';
        wrapper.appendChild(overlay);

        // Add type badge
        const badge = document.createElement('span');
        badge.className = 'ns-type-badge';
        badge.textContent = 'image';
        wrapper.appendChild(badge);
      }
    });
  }

  // Get element bounds relative to viewport
  function getElementBounds(el) {
    const rect = el.getBoundingClientRect();
    return {
      x: rect.left,
      y: rect.top,
      width: rect.width,
      height: rect.height
    };
  }

  // Send message to parent
  function sendToParent(type, data) {
    window.parent.postMessage({
      source: 'ns-custom-component-edit',
      componentId: COMPONENT_ID,
      type: type,
      ...data
    }, '*');
  }

  // Handle text element click
  function handleTextClick(el, e) {
    e.preventDefault();
    e.stopPropagation();

    // Deselect previous
    if (selectedElement) {
      selectedElement.classList.remove('ns-selected');
      if (isTextEditing) {
        finishTextEdit(selectedElement);
      }
    }

    selectedElement = el;
    el.classList.add('ns-selected');

    // Enter text edit mode
    isTextEditing = true;
    el.classList.add('ns-text-editing');
    el.contentEditable = 'true';
    el.focus();

    // Select all text
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);

    sendToParent('element-selected', {
      element: {
        id: el.dataset.nsId,
        type: 'text',
        tagName: el.tagName.toLowerCase(),
        content: el.dataset.nsOriginal || el.textContent,
        bounds: getElementBounds(el)
      }
    });
  }

  // Handle image element click
  function handleImageClick(el, e) {
    e.preventDefault();
    e.stopPropagation();

    // Find the actual img element
    const img = el.tagName === 'IMG' ? el : el.querySelector('img');
    if (!img) return;

    // Deselect previous
    if (selectedElement) {
      selectedElement.classList.remove('ns-selected');
      if (isTextEditing) {
        finishTextEdit(selectedElement);
      }
    }

    const wrapper = img.closest('.ns-image-wrapper') || img;
    selectedElement = wrapper;
    wrapper.classList.add('ns-selected');

    sendToParent('element-selected', {
      element: {
        id: img.dataset.nsId,
        type: 'image',
        tagName: 'img',
        src: img.src,
        alt: img.alt,
        bounds: getElementBounds(wrapper)
      }
    });

    sendToParent('image-clicked', {
      element: {
        id: img.dataset.nsId,
        type: 'image',
        src: img.src,
        alt: img.alt,
        bounds: getElementBounds(wrapper)
      }
    });
  }

  // Finish text editing
  function finishTextEdit(el) {
    if (!el || !isTextEditing) return;

    el.classList.remove('ns-text-editing');
    el.contentEditable = 'false';
    isTextEditing = false;

    const newText = el.textContent?.trim();
    const originalText = el.dataset.nsOriginal;

    if (newText && newText !== originalText) {
      el.dataset.nsOriginal = newText;
      sendToParent('text-changed', {
        elementId: el.dataset.nsId,
        oldText: originalText,
        newText: newText
      });
    }
  }

  // Handle double-clicks for editing (like text blocks)
  document.addEventListener('dblclick', function(e) {
    const target = e.target;

    // Check for editable text
    const textEl = target.closest('.ns-editable-text');
    if (textEl) {
      handleTextClick(textEl, e);
      return;
    }

    // Check for editable image
    const imgWrapper = target.closest('.ns-image-wrapper');
    const imgEl = target.closest('.ns-editable-image');
    if (imgWrapper || imgEl) {
      handleImageClick(imgWrapper || imgEl, e);
      return;
    }
  });

  // Single click - notify parent for component selection
  document.addEventListener('click', function(e) {
    // Always notify parent that the component was clicked (for selection)
    sendToParent('component-clicked', {});

    const target = e.target;

    // If clicking on an editable element, don't deselect (wait for double-click)
    const textEl = target.closest('.ns-editable-text');
    const imgWrapper = target.closest('.ns-image-wrapper');
    const imgEl = target.closest('.ns-editable-image');
    if (textEl || imgWrapper || imgEl) {
      return;
    }

    // Click outside editable element - deselect current element
    if (selectedElement) {
      selectedElement.classList.remove('ns-selected');
      if (isTextEditing) {
        finishTextEdit(selectedElement);
      }
      selectedElement = null;
    }
  });

  // Handle blur for text editing
  document.addEventListener('focusout', function(e) {
    if (isTextEditing && selectedElement) {
      // Delay to allow click handling
      setTimeout(() => {
        if (isTextEditing && selectedElement) {
          finishTextEdit(selectedElement);
          selectedElement.classList.remove('ns-selected');
          selectedElement = null;
        }
      }, 200);
    }
  });

  // Handle Enter key to finish editing
  document.addEventListener('keydown', function(e) {
    if (isTextEditing && e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (selectedElement) {
        finishTextEdit(selectedElement);
        selectedElement.classList.remove('ns-selected');
        selectedElement = null;
      }
    }
    if (e.key === 'Escape') {
      if (selectedElement) {
        // Restore original text
        if (isTextEditing) {
          selectedElement.textContent = selectedElement.dataset.nsOriginal;
          selectedElement.classList.remove('ns-text-editing');
          selectedElement.contentEditable = 'false';
          isTextEditing = false;
        }
        selectedElement.classList.remove('ns-selected');
        selectedElement = null;
      }
    }
  });

  // Listen for messages from parent
  window.addEventListener('message', function(e) {
    if (e.data?.target !== 'ns-custom-component-edit') return;

    if (e.data.type === 'update-image') {
      const img = document.querySelector('img[data-ns-id="' + e.data.elementId + '"]');
      if (img) {
        img.src = e.data.newSrc;
        sendToParent('image-updated', { elementId: e.data.elementId, newSrc: e.data.newSrc });
      }
    }

    if (e.data.type === 'update-text') {
      const el = document.querySelector('[data-ns-id="' + e.data.elementId + '"]');
      if (el) {
        el.textContent = e.data.newText;
        el.dataset.nsOriginal = e.data.newText;
        sendToParent('text-updated', { elementId: e.data.elementId, newText: e.data.newText });
      }
    }

    if (e.data.type === 'deselect') {
      if (selectedElement) {
        selectedElement.classList.remove('ns-selected');
        if (isTextEditing) {
          finishTextEdit(selectedElement);
        }
        selectedElement = null;
      }
    }
  });

  // Initialize on load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupEditableElements);
  } else {
    setupEditableElements();
  }

  // Re-run after dynamic content might load
  setTimeout(setupEditableElements, 100);
  setTimeout(setupEditableElements, 500);
  setTimeout(setupEditableElements, 1000);

  // Notify parent that edit mode is ready
  sendToParent('edit-mode-ready', {});
})();
</script>`;
}

/**
 * Inject edit mode into HTML
 */
export function injectEditMode(html: string, componentId: string): string {
  if (!html) return html;

  const editScript = generateEditModeScript(componentId);

  // Inject before </body> or at end
  if (html.includes('</body>')) {
    return html.replace('</body>', editScript + '</body>');
  } else if (html.includes('</html>')) {
    return html.replace('</html>', editScript + '</html>');
  } else {
    return html + editScript;
  }
}

/**
 * CustomComponentEditOverlay
 *
 * Renders floating UI elements for editing custom components.
 * The actual element detection happens inside the iframe via injected script.
 */
export const CustomComponentEditOverlay: React.FC<CustomComponentEditOverlayProps> = ({
  componentId,
  isEditing,
  isSelected,
  srcDoc,
  scale,
  onHtmlUpdate,
  onImageSelect
}) => {
  const [selectedElement, setSelectedElement] = useState<DetectedElement | null>(null);
  const [showChat, setShowChat] = useState(false);
  const [chatMessage, setChatMessage] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  // Listen for messages from iframe
  useEffect(() => {
    if (!isEditing || !isSelected) return;

    const handleMessage = (event: MessageEvent) => {
      const data = event.data;
      if (data?.source !== 'ns-custom-component-edit') return;
      if (data?.componentId !== componentId) return;

      console.log('[EditOverlay] Message from iframe:', data.type, data);

      if (data.type === 'element-selected') {
        setSelectedElement(data.element);
      }

      if (data.type === 'image-clicked') {
        setSelectedElement(data.element);
        onImageSelect(data.element);
      }

      if (data.type === 'text-changed') {
        // Update the HTML with new text
        handleTextUpdate(data.elementId, data.oldText, data.newText);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [isEditing, isSelected, componentId, onImageSelect]);

  // Handle text update in HTML
  const handleTextUpdate = useCallback((elementId: string, oldText: string, newText: string) => {
    if (!srcDoc || !oldText || !newText) return;

    // Simple text replacement (this is a basic approach)
    const escapedOld = oldText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(escapedOld, 'g');
    const updatedHtml = srcDoc.replace(pattern, newText);

    if (updatedHtml !== srcDoc) {
      onHtmlUpdate(updatedHtml);
    }
  }, [srcDoc, onHtmlUpdate]);

  // Handle AI chat message
  const handleChatSubmit = useCallback(async () => {
    if (!chatMessage.trim() || !selectedElement) return;

    setIsProcessing(true);

    try {
      if (selectedElement.type === 'text') {
        // Transform text via AI
        const response = await fetch('/api/chat/quick', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: `Transform this text according to the instruction. Only output the transformed text, nothing else.\n\nOriginal: "${selectedElement.content}"\n\nInstruction: ${chatMessage}`
          })
        });

        if (response.ok) {
          const data = await response.json();
          const newText = (data.text || data.content || data.message || '').trim();
          if (newText) {
            handleTextUpdate(selectedElement.id, selectedElement.content || '', newText);

            // Also tell iframe to update
            const iframes = document.querySelectorAll('iframe');
            iframes.forEach(iframe => {
              iframe.contentWindow?.postMessage({
                target: 'ns-custom-component-edit',
                type: 'update-text',
                elementId: selectedElement.id,
                newText: newText
              }, '*');
            });
          }
        }
      }
    } catch (error) {
      console.error('AI edit failed:', error);
    } finally {
      setIsProcessing(false);
      setChatMessage('');
    }
  }, [chatMessage, selectedElement, handleTextUpdate]);

  if (!isEditing || !isSelected) return null;

  return (
    <>
      {/* Floating chat for text elements */}
      <AnimatePresence>
        {showChat && selectedElement && selectedElement.type === 'text' && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="absolute z-[100] w-72 bg-white rounded-lg border shadow-xl"
            style={{
              top: Math.max(8, (selectedElement.bounds.y * scale) - 8),
              right: 8
            }}
          >
            <div
              className="flex items-center justify-between px-3 py-2 border-b text-white rounded-t-lg"
              style={{ backgroundColor: BRAND_ORANGE }}
            >
              <div className="flex items-center gap-2">
                <Sparkles size={14} />
                <span className="text-xs font-semibold">AI Edit Text</span>
              </div>
              <button onClick={() => setShowChat(false)} className="text-white/80 hover:text-white">
                <X size={14} />
              </button>
            </div>

            <div className="p-3 space-y-2">
              <div className="text-xs text-gray-500 truncate">
                "{selectedElement.content?.slice(0, 50)}{(selectedElement.content?.length || 0) > 50 ? '...' : ''}"
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={chatMessage}
                  onChange={(e) => setChatMessage(e.target.value)}
                  placeholder="e.g., Make it shorter..."
                  className="flex-1 px-2 py-1.5 text-xs border rounded focus:outline-none focus:border-orange-300"
                  onKeyDown={(e) => e.key === 'Enter' && handleChatSubmit()}
                  disabled={isProcessing}
                />
                <button
                  onClick={handleChatSubmit}
                  disabled={!chatMessage.trim() || isProcessing}
                  className={cn(
                    "px-2 py-1.5 rounded text-white",
                    chatMessage.trim() && !isProcessing ? "bg-orange-500 hover:bg-orange-600" : "bg-gray-300"
                  )}
                >
                  <Send size={12} />
                </button>
              </div>

              <div className="flex flex-wrap gap-1">
                {['Shorten', 'Expand', 'Professional', 'Casual'].map(label => (
                  <button
                    key={label}
                    onClick={() => setChatMessage(`Make it more ${label.toLowerCase()}`)}
                    className="px-2 py-0.5 text-[10px] rounded-full border text-gray-600 hover:bg-orange-50 hover:border-orange-200"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Action buttons when element is selected */}
      <AnimatePresence>
        {selectedElement && selectedElement.type === 'text' && (
          <motion.div
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            className="absolute z-[90] flex items-center gap-1"
            style={{
              top: Math.max(8, (selectedElement.bounds.y * scale) - 32),
              left: Math.max(8, selectedElement.bounds.x * scale)
            }}
          >
            <button
              onClick={() => setShowChat(!showChat)}
              className={cn(
                "flex items-center gap-1 px-2 py-1 rounded text-xs font-medium shadow-md",
                showChat ? "bg-orange-500 text-white" : "bg-white text-gray-700 hover:bg-orange-50"
              )}
            >
              <Sparkles size={12} />
              AI Edit
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default CustomComponentEditOverlay;
