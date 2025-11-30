import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Upload, ChevronUp, X, Image as ImageIcon } from 'lucide-react';

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
  slideId?: string;
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
<style id="ns-edit-mode-styles">
  /* Text elements - show text cursor */
  .ns-editable-text {
    cursor: text !important;
    transition: outline 0.15s ease !important;
  }

  /* Image elements - show pointer */
  .ns-editable-image {
    cursor: pointer !important;
    transition: outline 0.15s ease !important;
  }

  /* Hover effects - subtle */
  .ns-editable-text:hover,
  .ns-editable-image:hover {
    outline: 2px solid rgba(255, 67, 1, 0.5) !important;
    outline-offset: 2px !important;
  }

  /* Selected state */
  .ns-editable-text.ns-selected,
  .ns-editable-image.ns-selected {
    outline: 2px solid #FF4301 !important;
    outline-offset: 2px !important;
  }

  /* Text being actively edited */
  .ns-text-editing {
    outline: 2px solid #FF4301 !important;
    outline-offset: 2px !important;
    background-color: rgba(255, 255, 255, 0.95) !important;
    min-width: 50px !important;
    cursor: text !important;
  }
</style>
<script>
(function() {
  const COMPONENT_ID = '${componentId}';
  let selectedElement = null;
  let isTextEditing = false;

  // Mark text elements as editable (no badges or overlays - keep it clean)
  let setupRan = false;
  function setupEditableElements() {
    // Only run once per iframe load
    if (setupRan) return;
    setupRan = true;

    // Text elements - only process leaf elements with direct text
    const textSelectors = 'h1, h2, h3, h4, h5, h6, p, span, a, li, td, th, label, button';
    document.querySelectorAll(textSelectors).forEach((el, index) => {
      // Skip if already processed
      if (el.dataset.nsId) return;

      // Only get direct text nodes (not from children)
      const directText = Array.from(el.childNodes)
        .filter(node => node.nodeType === Node.TEXT_NODE)
        .map(node => node.textContent || '')
        .join('')
        .trim();

      // Only mark as editable if it has meaningful text
      if (directText && directText.length > 1) {
        el.classList.add('ns-editable-text');
        el.dataset.nsId = 'text-' + index;
        el.dataset.nsOriginal = directText;
      }
    });

    // Image elements
    document.querySelectorAll('img').forEach((img, index) => {
      if (img.dataset.nsId) return;
      if (img.width < 30 || img.height < 30) return;

      img.classList.add('ns-editable-image');
      img.dataset.nsId = 'img-' + index;
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
    // If already editing this element, let normal click behavior position cursor
    if (selectedElement === el && isTextEditing) {
      // Don't prevent default - let the click position the cursor naturally
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    // Deselect previous element if different
    if (selectedElement && selectedElement !== el) {
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

    // Position cursor at click location instead of selecting all
    // Get click position relative to element
    const range = document.caretRangeFromPoint(e.clientX, e.clientY);
    if (range) {
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }

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

    selectedElement = img;
    img.classList.add('ns-selected');
    isTextEditing = false;

    // Send image-selected event (different from element-selected)
    // This triggers the image settings editor in parent
    sendToParent('image-selected', {
      element: {
        id: img.dataset.nsId,
        type: 'image',
        tagName: 'img',
        src: img.src,
        alt: img.alt || '',
        bounds: getElementBounds(img)
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

  // Single click - select element and start editing immediately
  document.addEventListener('click', function(e) {
    const target = e.target;

    // Check for editable text - single click to select and edit
    const textEl = target.closest('.ns-editable-text');
    if (textEl) {
      handleTextClick(textEl, e);
      return;
    }

    // Check for editable image - single click to select and notify parent
    const imgWrapper = target.closest('.ns-image-wrapper');
    const imgEl = target.closest('.ns-editable-image');
    if (imgWrapper || imgEl) {
      handleImageClick(imgWrapper || imgEl, e);
      return;
    }

    // Notify parent that component was clicked (for any other click)
    sendToParent('component-clicked', {});

    // Click outside editable element - deselect current element
    if (selectedElement) {
      selectedElement.classList.remove('ns-selected');
      if (isTextEditing) {
        finishTextEdit(selectedElement);
      }
      selectedElement = null;
      sendToParent('element-deselected', {});
    }
  });

  // Handle blur for text editing - only finish editing, don't deselect
  // (deselection is handled by clicking outside or pressing Escape)
  document.addEventListener('focusout', function(e) {
    if (isTextEditing && selectedElement) {
      // Delay to allow click handling on parent toolbar
      setTimeout(() => {
        if (isTextEditing && selectedElement) {
          // Only finish the text editing, keep element selected
          finishTextEdit(selectedElement);
          // Keep ns-selected class so outline stays visible
        }
      }, 300);
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

    // Handle trigger-element-select from parent (when user double-clicks overlay)
    if (e.data.type === 'trigger-element-select') {
      const x = e.data.x;
      const y = e.data.y;

      // Find element at the clicked position
      const elementsAtPoint = document.elementsFromPoint(x, y);

      for (const el of elementsAtPoint) {
        // Check for editable text
        if (el.classList.contains('ns-editable-text')) {
          const fakeEvent = { preventDefault: function(){}, stopPropagation: function(){} };
          handleTextClick(el, fakeEvent);
          return;
        }

        // Check for editable image wrapper
        if (el.classList.contains('ns-image-wrapper') || el.classList.contains('ns-editable-image')) {
          const fakeEvent = { preventDefault: function(){}, stopPropagation: function(){} };
          handleImageClick(el, fakeEvent);
          return;
        }
      }
    }
  });

  // Initialize on load - only once
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      setupEditableElements();
      sendToParent('edit-mode-ready', {});
    });
  } else {
    setupEditableElements();
    sendToParent('edit-mode-ready', {});
  }
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
 * Renders a sleek floating chat input for editing custom components.
 * Design inspired by modern AI-assisted editing interfaces.
 */
export const CustomComponentEditOverlay: React.FC<CustomComponentEditOverlayProps> = ({
  componentId,
  slideId,
  isEditing,
  isSelected,
  srcDoc,
  scale,
  onHtmlUpdate,
  onImageSelect
}) => {
  const [selectedElement, setSelectedElement] = useState<DetectedElement | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

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

      if (data.type === 'image-selected') {
        setSelectedElement(data.element);
        // Trigger image picker/settings for this custom component image
        onImageSelect(data.element);
      }

      if (data.type === 'element-deselected') {
        setSelectedElement(null);
      }

      if (data.type === 'text-changed') {
        handleTextUpdate(data.elementId, data.oldText, data.newText);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [isEditing, isSelected, componentId, onImageSelect]);

  // Handle text update in HTML
  const handleTextUpdate = useCallback((elementId: string, oldText: string, newText: string) => {
    if (!srcDoc || !oldText || !newText) return;

    const escapedOld = oldText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(escapedOld, 'g');
    const updatedHtml = srcDoc.replace(pattern, newText);

    if (updatedHtml !== srcDoc) {
      onHtmlUpdate(updatedHtml);
    }
  }, [srcDoc, onHtmlUpdate]);

  // Send message to chat panel
  const sendToChat = useCallback((prompt: string) => {
    const label = selectedElement?.type === 'text'
      ? `Text: "${(selectedElement.content || '').slice(0, 20)}..."`
      : selectedElement?.type === 'image'
      ? 'Image'
      : 'Custom Component';

    window.dispatchEvent(new CustomEvent('chat:prefill_with_component', {
      detail: {
        componentId,
        slideId,
        label,
        prompt,
        elementType: 'CustomComponent'
      }
    }));
    setInputValue('');
  }, [componentId, slideId, selectedElement]);

  const handleSubmit = useCallback(() => {
    if (inputValue.trim()) {
      sendToChat(inputValue.trim());
    }
  }, [inputValue, sendToChat]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }, [handleSubmit]);

  if (!isEditing || !isSelected) return null;

  // Calculate position for the floating chat
  const getFloatingPosition = () => {
    const iframe = document.querySelector(`iframe[title="Custom Component"]`);
    const iframeRect = iframe?.getBoundingClientRect();

    if (!iframeRect) return { top: 100, right: 20 };

    // Position at top-right of the component with some offset
    return {
      top: Math.max(80, iframeRect.top + 20),
      right: Math.max(20, window.innerWidth - iframeRect.right + 20)
    };
  };

  const position = getFloatingPosition();

  // Quick suggestions based on selection
  const suggestions = selectedElement?.type === 'text'
    ? [
        { label: 'Try new fonts', prompt: 'Change the font to something more modern and professional' },
        { label: 'Rearrange layout', prompt: 'Improve the layout and spacing of this section' },
        { label: 'Copy edit', prompt: 'Fix any grammar or spelling issues and improve clarity' },
      ]
    : selectedElement?.type === 'image'
    ? [
        { label: 'Replace image', prompt: 'Find a better image for this' },
        { label: 'Add effects', prompt: 'Add subtle visual effects to enhance this image' },
        { label: 'Adjust size', prompt: 'Resize this image to better fit the layout' },
      ]
    : [
        { label: 'Improve design', prompt: 'Improve the overall design and visual appeal' },
        { label: 'Change colors', prompt: 'Update the color scheme to be more cohesive' },
        { label: 'Add animation', prompt: 'Add subtle animations to make it more engaging' },
      ];

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -10, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -10, scale: 0.95 }}
        transition={{ duration: 0.15 }}
        className="bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden"
        style={{
          position: 'fixed',
          top: position.top,
          right: position.right,
          width: 340,
          zIndex: 9999,
        }}
      >
        {/* Close button */}
        <button
          onClick={() => {
            // Deselect element in iframe
            const iframes = document.querySelectorAll('iframe');
            iframes.forEach(iframe => {
              iframe.contentWindow?.postMessage({
                target: 'ns-custom-component-edit',
                type: 'deselect'
              }, '*');
            });
            setSelectedElement(null);
          }}
          className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 z-10"
        >
          <X size={16} />
        </button>

        {/* Input area */}
        <div className="p-4">
          <div className="relative">
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="What can I help with?"
              className="w-full pr-20 py-2 text-sm text-gray-800 placeholder-gray-400 bg-transparent border-0 focus:outline-none focus:ring-0"
            />

            {/* Action buttons */}
            <div className="absolute right-0 top-1/2 -translate-y-1/2 flex items-center gap-1">
              <button
                onClick={() => {
                  // Trigger file upload for image
                  window.dispatchEvent(new CustomEvent('image:select-placeholder', {
                    detail: {
                      componentId,
                      slideId,
                      isCustomComponentProp: true
                    }
                  }));
                }}
                className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                title="Upload image"
              >
                <Upload size={16} />
              </button>
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className={`p-1.5 rounded-lg transition-colors ${
                  isExpanded
                    ? 'text-[#FF4301] bg-orange-50'
                    : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
                }`}
                title={isExpanded ? 'Collapse' : 'Expand'}
              >
                <ChevronUp size={16} className={`transition-transform ${isExpanded ? '' : 'rotate-180'}`} />
              </button>
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-gray-100 mt-3 pt-3">
            {/* Selection indicator */}
            {selectedElement && (
              <div className="flex items-center gap-2 mb-3">
                <div className="flex items-center gap-1.5 px-2 py-1 bg-gray-50 rounded-full text-xs text-gray-500">
                  {selectedElement.type === 'image' ? (
                    <ImageIcon size={12} className="text-gray-400" />
                  ) : (
                    <span className="w-3 h-3 rounded bg-[#FF4301]/20 flex items-center justify-center text-[8px] text-[#FF4301] font-bold">T</span>
                  )}
                  <span className="max-w-[150px] truncate">
                    {selectedElement.type === 'image'
                      ? 'Image selected'
                      : selectedElement.content?.slice(0, 30) || 'Text selected'
                    }
                  </span>
                </div>
              </div>
            )}

            {/* Suggestions */}
            <p className="text-xs text-gray-400 mb-2">You can try something like:</p>
            <div className="flex flex-wrap gap-2">
              {suggestions.map(({ label, prompt }) => (
                <button
                  key={label}
                  onClick={() => sendToChat(prompt)}
                  className="px-3 py-1.5 text-xs font-medium text-[#FF4301] bg-white border border-[#FF4301]/30 rounded-full hover:bg-[#FF4301]/5 hover:border-[#FF4301]/50 transition-colors"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Expanded area - AI quick actions */}
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="border-t border-gray-100 bg-gray-50/50"
            >
              <div className="p-4 space-y-3">
                <p className="text-xs font-medium text-gray-600">Quick AI Actions</p>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { icon: <Sparkles size={14} />, label: 'Enhance', prompt: 'Enhance and improve this' },
                    { icon: <span className="text-xs">Aa</span>, label: 'Fix text', prompt: 'Fix any grammar or typos' },
                    { icon: <span className="text-xs">🎨</span>, label: 'Restyle', prompt: 'Improve the visual style' },
                    { icon: <span className="text-xs">📐</span>, label: 'Layout', prompt: 'Improve the layout and spacing' },
                  ].map(({ icon, label, prompt }) => (
                    <button
                      key={label}
                      onClick={() => sendToChat(prompt)}
                      className="flex items-center gap-2 px-3 py-2 text-xs text-gray-600 bg-white rounded-lg border border-gray-200 hover:border-[#FF4301]/30 hover:text-[#FF4301] transition-colors"
                    >
                      {icon}
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
};

export default CustomComponentEditOverlay;
