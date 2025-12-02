import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowUp, X, Image as ImageIcon, Type, Layout } from 'lucide-react';

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
 * - Container/section selection
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

  /* Container elements - show pointer */
  .ns-editable-container {
    cursor: pointer !important;
    transition: outline 0.15s ease !important;
  }

  /* Hover effects - subtle */
  .ns-editable-text:hover,
  .ns-editable-image:hover,
  .ns-editable-container:hover {
    outline: 2px solid rgba(255, 67, 1, 0.5) !important;
    outline-offset: 2px !important;
  }

  /* Selected state */
  .ns-editable-text.ns-selected,
  .ns-editable-image.ns-selected,
  .ns-editable-container.ns-selected {
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

  /* Image loading placeholder */
  .ns-image-loading {
    position: relative !important;
    background: linear-gradient(135deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%) !important;
    background-size: 200% 200% !important;
    animation: ns-shimmer 1.5s ease-in-out infinite !important;
  }
  @keyframes ns-shimmer {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
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

    // Container/section elements - larger structural elements
    const containerSelectors = 'section, article, header, footer, main, aside, nav, div[class], div[id], ul, ol, table, figure, blockquote, form, fieldset, details, card, .card, [class*="card"], [class*="section"], [class*="container"], [class*="wrapper"], [class*="box"], [class*="panel"]';
    let containerIndex = 0;
    document.querySelectorAll(containerSelectors).forEach((el) => {
      // Skip if already processed or is text/image
      if (el.dataset.nsId) return;
      if (el.classList.contains('ns-editable-text')) return;
      if (el.classList.contains('ns-editable-image')) return;
      // Skip tiny containers
      const rect = el.getBoundingClientRect();
      if (rect.width < 80 || rect.height < 40) return;
      // Skip full-page containers
      if (rect.width >= window.innerWidth * 0.95 && rect.height >= window.innerHeight * 0.95) return;

      el.classList.add('ns-editable-container');
      el.dataset.nsId = 'container-' + containerIndex++;
      el.dataset.nsType = el.tagName.toLowerCase();
      // Store class name for better labeling
      if (el.className) {
        const classList = el.className.split(' ').filter(c => c && !c.startsWith('ns-'))[0];
        if (classList) el.dataset.nsClass = classList;
      }
    });

    // Icons and SVGs - make them clickable for replacement
    document.querySelectorAll('svg, i[class*="icon"], i[class*="fa-"], span[class*="icon"]').forEach((el, index) => {
      if (el.dataset.nsId) return;
      const rect = el.getBoundingClientRect();
      if (rect.width < 12 || rect.height < 12) return;
      if (rect.width > 200 || rect.height > 200) return; // Skip large decorative SVGs

      el.classList.add('ns-editable-container');
      el.dataset.nsId = 'icon-' + index;
      el.dataset.nsType = 'icon';
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

  // Handle container element click
  function handleContainerClick(el, e) {
    e.preventDefault();
    e.stopPropagation();

    // Check if container has exactly one image inside - if so, treat as image click
    var imagesInside = el.querySelectorAll('img');
    if (imagesInside.length === 1) {
      var singleImg = imagesInside[0];
      // Make sure the image is reasonably sized (not a tiny icon)
      var imgRect = singleImg.getBoundingClientRect();
      if (imgRect.width > 40 && imgRect.height > 40) {
        // Treat this as an image click
        if (!singleImg.classList.contains('ns-editable-image')) {
          singleImg.classList.add('ns-editable-image');
          singleImg.dataset.nsId = singleImg.dataset.nsId || 'img-in-container';
        }
        handleImageClick(singleImg, e);
        return;
      }
    }

    // Deselect previous
    if (selectedElement) {
      selectedElement.classList.remove('ns-selected');
      if (isTextEditing) {
        finishTextEdit(selectedElement);
      }
    }

    selectedElement = el;
    el.classList.add('ns-selected');
    isTextEditing = false;

    // Get text content preview
    const textContent = el.innerText || '';
    const preview = textContent.trim().slice(0, 100);

    // Get a nice label for the element
    let label = el.dataset.nsType || el.tagName.toLowerCase();
    if (el.dataset.nsClass) {
      label = el.dataset.nsClass;
    }
    if (el.dataset.nsType === 'icon') {
      label = 'Icon';
    }

    sendToParent('container-selected', {
      element: {
        id: el.dataset.nsId,
        type: 'container',
        tagName: label,
        content: preview,
        bounds: getElementBounds(el)
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

    // Check if clicked directly on an image (HIGHEST priority - even inside containers)
    if (target.tagName === 'IMG') {
      if (target.classList.contains('ns-editable-image')) {
        handleImageClick(target, e);
        return;
      }
      // Even if not marked editable, treat images as clickable
      target.classList.add('ns-editable-image');
      target.dataset.nsId = target.dataset.nsId || 'img-dynamic';
      handleImageClick(target, e);
      return;
    }

    // Check for editable image wrapper
    const imgEl = target.closest('.ns-editable-image');
    if (imgEl) {
      handleImageClick(imgEl, e);
      return;
    }

    // Check for editable text
    const textEl = target.closest('.ns-editable-text');
    if (textEl) {
      handleTextClick(textEl, e);
      return;
    }

    // Check for editable container (lower priority than text/image)
    const containerEl = target.closest('.ns-editable-container');
    if (containerEl) {
      handleContainerClick(containerEl, e);
      return;
    }

    // Notify parent that component was clicked (for any other click)
    sendToParent('component-clicked', {});

    // DON'T auto-deselect - let the parent handle deselection via toolbar close button
    // This prevents the toolbar from disappearing when clicking on it (since it's outside iframe)
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

      // First pass: check for images (highest priority)
      for (const el of elementsAtPoint) {
        if (el.tagName === 'IMG') {
          const fakeEvent = { preventDefault: function(){}, stopPropagation: function(){} };
          if (!el.classList.contains('ns-editable-image')) {
            el.classList.add('ns-editable-image');
            el.dataset.nsId = el.dataset.nsId || 'img-dynamic';
          }
          handleImageClick(el, fakeEvent);
          return;
        }
        if (el.classList.contains('ns-editable-image')) {
          const fakeEvent = { preventDefault: function(){}, stopPropagation: function(){} };
          handleImageClick(el, fakeEvent);
          return;
        }
      }

      // Second pass: check for text and containers
      for (const el of elementsAtPoint) {
        if (el.classList.contains('ns-editable-text')) {
          const fakeEvent = { preventDefault: function(){}, stopPropagation: function(){} };
          handleTextClick(el, fakeEvent);
          return;
        }

        if (el.classList.contains('ns-editable-container')) {
          const fakeEvent = { preventDefault: function(){}, stopPropagation: function(){} };
          handleContainerClick(el, fakeEvent);
          return;
        }
      }
    }

    // Handle image update with loading state
    if (e.data.type === 'update-image-with-placeholder') {
      const img = document.querySelector('img[data-ns-id="' + e.data.elementId + '"]');
      if (img) {
        // Add loading class
        img.classList.add('ns-image-loading');
        // Set the new src - browser will load it
        img.src = e.data.newSrc;
        // Remove loading class when loaded
        img.onload = function() {
          img.classList.remove('ns-image-loading');
          sendToParent('image-loaded', { elementId: e.data.elementId, newSrc: e.data.newSrc });
        };
        img.onerror = function() {
          img.classList.remove('ns-image-loading');
        };
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

      if (data.type === 'container-selected') {
        setSelectedElement(data.element);
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
      : selectedElement?.type === 'container'
      ? `${selectedElement.tagName || 'Section'}`
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

  // Calculate position for the floating chat - always stay within viewport
  const getFloatingPosition = () => {
    const iframe = document.querySelector(`iframe[title="Custom Component"]`);
    const iframeRect = iframe?.getBoundingClientRect();
    const overlayWidth = 300;
    const overlayHeight = 160; // Approximate height
    const padding = 16;

    if (!iframeRect) return { top: 100, left: padding };

    // Try to position to the right of the component
    let left = iframeRect.right + padding;
    let top = iframeRect.top + 20;

    // If it would go off the right edge, position to the left of component
    if (left + overlayWidth > window.innerWidth - padding) {
      left = iframeRect.left - overlayWidth - padding;
    }

    // If still off screen (component is wide), position inside at top-right
    if (left < padding) {
      left = Math.min(iframeRect.right - overlayWidth - padding, window.innerWidth - overlayWidth - padding);
      left = Math.max(padding, left);
    }

    // Ensure top stays within viewport
    top = Math.max(80, Math.min(top, window.innerHeight - overlayHeight - padding));

    return { top, left };
  };

  const position = getFloatingPosition();

  // Creative suggestions based on selection - more specific and actionable
  const suggestions = selectedElement?.type === 'text'
    ? [
        { label: 'Gradient text', prompt: 'Make this text a beautiful gradient from the theme colors' },
        { label: 'Bold + glow', prompt: 'Make this text bolder with a subtle glow effect' },
        { label: 'Animate in', prompt: 'Add a smooth fade-in animation to this text' },
      ]
    : selectedElement?.type === 'image'
    ? [
        { label: 'Swap image', prompt: 'Find and replace with a better, more professional image' },
        { label: 'Add frame', prompt: 'Add a modern rounded frame with subtle shadow' },
        { label: 'Overlay effect', prompt: 'Add a gradient overlay that matches the theme' },
      ]
    : selectedElement?.type === 'container'
    ? [
        { label: 'Glassmorphism', prompt: 'Apply a modern glassmorphism effect with blur and transparency' },
        { label: 'Card style', prompt: 'Transform into a clean card with shadow and rounded corners' },
        { label: 'Grid layout', prompt: 'Reorganize content into a clean grid layout' },
      ]
    : [
        { label: 'Modernize', prompt: 'Apply a modern, minimalist design with better spacing' },
        { label: 'Add depth', prompt: 'Add shadows, gradients, and layering for visual depth' },
        { label: 'Animate', prompt: 'Add smooth entrance animations to key elements' },
      ];

  // Get icon for element type
  const getElementIcon = () => {
    if (selectedElement?.type === 'image') return <ImageIcon size={12} className="text-[#FF4301]" />;
    if (selectedElement?.type === 'container') return <Layout size={12} className="text-[#FF4301]" />;
    return <Type size={12} className="text-[#FF4301]" />;
  };

  const getElementLabel = () => {
    if (selectedElement?.type === 'image') return 'Image';
    if (selectedElement?.type === 'container') return selectedElement.tagName || 'Section';
    if (selectedElement?.type === 'text') return selectedElement.content?.slice(0, 20) || 'Text';
    return 'Component';
  };

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 10, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 10, scale: 0.95 }}
        transition={{ duration: 0.15 }}
        className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden"
        style={{
          position: 'fixed',
          top: position.top,
          left: position.left,
          width: 300,
          zIndex: 9999,
        }}
      >
        {/* Compact header */}
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-100 bg-gray-50/50">
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-4 rounded bg-[#FF4301]/10 flex items-center justify-center">
              {getElementIcon()}
            </div>
            <span className="text-[11px] font-medium text-gray-600 truncate max-w-[180px]">
              {getElementLabel()}
            </span>
          </div>
          <button
            onClick={() => {
              const iframes = document.querySelectorAll('iframe');
              iframes.forEach(iframe => {
                iframe.contentWindow?.postMessage({
                  target: 'ns-custom-component-edit',
                  type: 'deselect'
                }, '*');
              });
              setSelectedElement(null);
            }}
            className="w-4 h-4 flex items-center justify-center text-gray-400 hover:text-gray-600 rounded hover:bg-gray-100 transition-colors"
          >
            <X size={12} />
          </button>
        </div>

        {/* Input and suggestions area - compact */}
        <div className="p-2.5 space-y-2">
          {/* Quick suggestions - compact row */}
          <div className="flex gap-1 overflow-x-auto scrollbar-none">
            {suggestions.map(({ label, prompt }) => (
              <button
                key={label}
                onClick={() => sendToChat(prompt)}
                className="px-2 py-0.5 text-[10px] font-medium text-gray-600 bg-gray-100 rounded-full hover:bg-[#FF4301]/10 hover:text-[#FF4301] transition-colors whitespace-nowrap flex-shrink-0"
              >
                {label}
              </button>
            ))}
          </div>

          {/* Input row with send button */}
          <div className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 focus-within:border-[#FF4301]/50 focus-within:bg-white transition-colors">
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Describe what to change..."
              className="flex-1 text-xs text-gray-800 placeholder-gray-400 bg-transparent border-0 focus:outline-none"
            />
            <button
              onClick={handleSubmit}
              disabled={!inputValue.trim()}
              className="w-5 h-5 rounded-full bg-[#FF4301] text-white flex items-center justify-center hover:bg-[#E63D00] disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex-shrink-0"
            >
              <ArrowUp size={12} />
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
};

export default CustomComponentEditOverlay;
