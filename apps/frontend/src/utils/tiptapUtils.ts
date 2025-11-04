import { JSONContent, Content } from '@tiptap/core'; // Use Tiptap types if available, else any

// Define the custom format structure
export interface StyledTextSegment {
  type: 'text'; // Explicitly add type
  text: string;
  style: Record<string, any>; // e.g., { bold?: boolean, italic?: boolean, color?: string }
}

export interface CustomParagraph {
  type: 'paragraph';
  content: StyledTextSegment[];
}

// New interface for heading
export interface CustomHeading {
  type: 'heading';
  level: 1 | 2 | 3;
  content: StyledTextSegment[];
}

// Union type for content allowed inside a list item
// Now includes nested lists alongside paragraphs
export type CustomListItemContent = CustomParagraph | CustomBulletList | CustomOrderedList;

export interface CustomListItem {
  type: 'listItem';
  // Update content type to allow paragraphs OR nested lists
  content: CustomListItemContent[];
}

export interface CustomBulletList {
  type: 'bulletList';
  content: CustomListItem[];
}

// Add the new interface for ordered lists
export interface CustomOrderedList {
  type: 'orderedList';
  content: CustomListItem[];
}

// Union type for block-level nodes in our custom format
export type CustomBlockNode = CustomParagraph | CustomBulletList | CustomOrderedList | CustomHeading;

// The root document structure for our custom format
export interface CustomDoc {
  type: 'doc';
  content: CustomBlockNode[];
}

// Keep the alias for backwards compatibility where simple text might still be expected,
// although the main functions will now work with CustomDoc.
// Consider migrating away from this simple array format entirely later.
type SimpleCustomTextFormat = { text: string; style: Record<string, any> }[];


// --- Transformation from Custom Format (CustomDoc) to Tiptap JSON ---

/**
 * Transforms the custom document structure (CustomDoc) into Tiptap's JSON format.
 * Handles paragraphs, bullet lists, list items, and basic text marks.
 *
 * @param customDocInput - The CustomDoc object or SimpleCustomTextFormat array.
 * @returns Tiptap/ProseMirror compatible JSON object.
 */
export function transformMyFormatToTiptap(customDocInput: CustomDoc | SimpleCustomTextFormat | null | undefined): JSONContent {
  // Define default empty Tiptap doc structure
  const defaultTiptapDoc: JSONContent = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text: ' ' }],
      },
    ],
  };

  // Handle null or undefined input immediately
  if (!customDocInput) {
      return defaultTiptapDoc;
  }

  let customDoc: CustomDoc; // Variable to hold the guaranteed CustomDoc format

  // --- Backward compatibility check and type narrowing ---
  if (Array.isArray(customDocInput)) {
    // Silently handle legacy format conversion
    const paragraphContent: StyledTextSegment[] = customDocInput.map(segment => ({
      type: 'text',
      text: segment.text || '',
      style: segment.style || {},
    }));
    const filteredContent = paragraphContent.filter(seg => seg.text !== '');
    if (filteredContent.length === 0) {
         filteredContent.push({ type: 'text', text: ' ', style: {} });
    }
    customDoc = { type: 'doc', content: [{ type: 'paragraph', content: filteredContent }] };
  } else if (customDocInput.type === 'doc' && Array.isArray(customDocInput.content)) {
    // Input is already in CustomDoc format
    customDoc = customDocInput;
  } else {
    // Invalid format, return default without logging
    return defaultTiptapDoc;
  }
  // --- End backward compatibility check and type narrowing ---

  // Handle empty content after potential conversion
  if (!customDoc.content || customDoc.content.length === 0) {
    return defaultTiptapDoc;
  }

  // Recursive function to transform custom nodes to Tiptap nodes
  // Explicitly type the return as JSONContent | null
  function transformNode(node: CustomBlockNode | CustomListItem | CustomParagraph | StyledTextSegment | CustomListItemContent): JSONContent | null {
    if (!node || !node.type) return null;

    switch (node.type) {
      case 'paragraph': {
        const paragraphNode = node as CustomParagraph;
        const content: JSONContent[] = (paragraphNode.content || []) // Specify JSONContent[]
                                      .map(segment => transformNode(segment))
                                      .filter((n): n is JSONContent => n !== null); // Type guard filter
        if (content.length === 0) {
          // Drop empty paragraphs to avoid stray blank lines
          return null;
        }
        return { type: 'paragraph', content };
      }
      case 'heading': {
        const headingNode = node as CustomHeading;
        const content: JSONContent[] = (headingNode.content || [])
                                      .map(segment => transformNode(segment))
                                      .filter((n): n is JSONContent => n !== null);
        if (content.length === 0) {
          // Drop empty headings
          return null;
        }
        return { 
          type: 'heading', 
          attrs: { level: headingNode.level || 1 },
          content 
        };
      }
      case 'bulletList': {
        const listNode = node as CustomBulletList;
        const content: JSONContent[] = (listNode.content || []) // Specify JSONContent[]
                                    .map(item => transformNode(item))
                                    .filter((n): n is JSONContent => n !== null); // Type guard filter
        if (content.length === 0) {
          return null;
        }
        return { type: 'bulletList', content };
      }
      case 'orderedList': {
        const listNode = node as CustomOrderedList;
        const content: JSONContent[] = (listNode.content || [])
                                    .map(item => transformNode(item))
                                    .filter((n): n is JSONContent => n !== null);
        if (content.length === 0) {
          return null;
        }
        return { type: 'orderedList', content };
      }
      case 'listItem': {
         const listItemNode = node as CustomListItem;
         const content: JSONContent[] = (listItemNode.content || [])
                                     .map(itemContent => transformNode(itemContent))
                                     .filter((n): n is JSONContent => n !== null);
         if (content.length === 0) {
           // Drop empty list items
           return null;
         }
         return { type: 'listItem', content };
      }
      case 'text': {
        const textSegment = node as StyledTextSegment;
        if (typeof textSegment.text !== 'string') return null;

        const marks: any[] = []; // Tiptap marks are objects with a type and sometimes attrs
        const style = textSegment.style || {};
        
        // Basic formatting marks
        if (style.bold) marks.push({ type: 'bold' });
        if (style.italic) marks.push({ type: 'italic' });
        if (style.underline) marks.push({ type: 'underline' });
        if (style.strike) marks.push({ type: 'strike' });
        
        // Advanced formatting marks
        if (style.highlight) marks.push({ type: 'highlight' });
        if (style.subscript) marks.push({ type: 'subscript' });
        if (style.superscript) marks.push({ type: 'superscript' });
        
        // Link mark - ensure href is a valid string to prevent "uri.replace is not a function" error
        if (style.link && typeof style.link === 'string' && style.link.length > 0) {
          marks.push({ 
            type: 'link', 
            attrs: { 
              href: style.link, 
              target: '_blank'
            }
          });
        }
        
        // Text color mark
        if (style.color) {
          marks.push({
            type: 'textStyle',
            attrs: { color: style.color }
          });
        }

        // Font size mark
        if (style.fontSize) {
          // Find existing textStyle mark or create new one
          const textStyleMark = marks.find(m => m.type === 'textStyle');
          if (textStyleMark) {
            textStyleMark.attrs.fontSize = style.fontSize;
          } else {
            marks.push({
              type: 'textStyle',
              attrs: { fontSize: style.fontSize }
            });
          }
        }

        // Drop text nodes that are purely whitespace and have no marks
        const originalText = textSegment.text || '';
        const isOnlyWhitespace = originalText.trim().length === 0;
        if (isOnlyWhitespace && marks.length === 0) {
          return null;
        }

        const textNode: JSONContent = { type: 'text', text: originalText };
        if (marks.length > 0) {
          textNode.marks = marks;
        }
        return textNode;
      }
      default:
        return null;
    }
  }

  const tiptapContent: JSONContent[] = customDoc.content // Use the narrowed customDoc
                                    .map(blockNode => transformNode(blockNode))
                                    .filter((n): n is JSONContent => n !== null); // Type guard filter

  if (tiptapContent.length === 0) {
      tiptapContent.push({ type: 'paragraph', content: [{ type: 'text', text: ' ' }] });
  }

  return {
    type: 'doc',
    content: tiptapContent,
  };
}


// --- Transformation from Tiptap JSON to Custom Format (CustomDoc) ---

/**
 * Transforms Tiptap's JSON format into the custom document structure (CustomDoc).
 * Handles paragraphs, bullet lists, list items, and basic text marks.
 *
 * @param tiptapDoc - Tiptap/ProseMirror JSON object.
 * @returns CustomDoc object.
 */
export function transformTiptapToMyFormat(tiptapDoc: JSONContent | null | undefined): CustomDoc {
  const defaultEmptyDoc: CustomDoc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '', style: {} }] }] };

  if (!tiptapDoc || tiptapDoc.type !== 'doc' || !tiptapDoc.content) {
    return defaultEmptyDoc; // Return standard empty doc
  }

  function transformTiptapNode(node: JSONContent): CustomBlockNode | CustomListItem | CustomParagraph | StyledTextSegment | null {
    if (!node || !node.type) return null;

    switch (node.type) {
      case 'paragraph': {
        const content: StyledTextSegment[] = (node.content || [])
          .map(childNode => transformTiptapNode(childNode) as StyledTextSegment)
          .filter(segment => segment !== null && segment.type === 'text'); // Only allow text segments directly in paragraphs for our format

        // Drop empty paragraphs to avoid adding blank lines to our model format
        if (content.length === 0 || content.every(seg => (seg.text || '').trim() === '')) {
          return null;
        }
        return { type: 'paragraph', content };
      }
      case 'heading': {
        const level = node.attrs?.level as (1 | 2 | 3) || 1;
        const content: StyledTextSegment[] = (node.content || [])
          .map(childNode => transformTiptapNode(childNode) as StyledTextSegment)
          .filter(segment => segment !== null && segment.type === 'text');
          
        // Drop empty headings
        if (content.length === 0 || content.every(seg => (seg.text || '').trim() === '')) {
          return null;
        }
        return { type: 'heading', level, content };
      }
      case 'bulletList': {
        const content: CustomListItem[] = (node.content || [])
          .map(childNode => transformTiptapNode(childNode) as CustomListItem)
          .filter(item => item !== null && item.type === 'listItem'); // Only listItems in bulletList
        if (content.length === 0) {
          return null;
        }
        return { type: 'bulletList', content };
      }
      case 'orderedList': {
        const content: CustomListItem[] = (node.content || [])
          .map(childNode => transformTiptapNode(childNode) as CustomListItem)
          .filter(item => item !== null && item.type === 'listItem');
        if (content.length === 0) {
          return null;
        }
        return { type: 'orderedList', content };
      }
      case 'listItem': {
         // Allow paragraphs OR nested lists within list items
         const content: CustomListItemContent[] = (node.content || [])
           .map(childNode => transformTiptapNode(childNode)) // Transform children
           // Keep paragraphs AND nested lists (bullet or ordered)
           .filter((item): item is CustomListItemContent =>
             item !== null && (item.type === 'paragraph' || item.type === 'bulletList' || item.type === 'orderedList')
           );

         // Drop empty list items
         if (content.length === 0) {
           return null;
         }
         // Return type now matches the updated CustomListItem definition
         return { type: 'listItem', content };
      }
      case 'text': {
        if (typeof node.text !== 'string') return null; // Skip invalid text nodes

        const style: Record<string, any> = {};
        if (node.marks) {
          node.marks.forEach(mark => {
            if (!mark || !mark.type) return;
            switch (mark.type) {
              // Basic formatting
              case 'bold': style.bold = true; break;
              case 'italic': style.italic = true; break;
              case 'underline': style.underline = true; break;
              case 'strike': style.strike = true; break;
              
              // Advanced formatting
              case 'highlight': style.highlight = true; break;
              case 'subscript': style.subscript = true; break;
              case 'superscript': style.superscript = true; break;
              
              // Link - store href in style.link for consistency with transform direction
              case 'link': 
                const href = mark.attrs?.href;
                // Only store valid string hrefs to prevent errors
                if (typeof href === 'string' && href.length > 0) {
                  style.link = href;
                }
                break;
                
              // Text color
              case 'textStyle':
                if (mark.attrs?.color) {
                  style.color = mark.attrs.color;
                }
                if (mark.attrs?.fontSize) {
                  style.fontSize = mark.attrs.fontSize;
                }
                break;
                
              default: break;
            }
          });
        }
        // Drop structural spaces with no marks
        if ((node.text || '').trim().length === 0 && (!node.marks || node.marks.length === 0)) {
          return null;
        }
        return { type: 'text', text: node.text, style };
      }
      default:
        // Silently ignore unsupported node types
        return null;
    }
  }

  const customContent: CustomBlockNode[] = (tiptapDoc.content || [])
    .map(node => transformTiptapNode(node) as CustomBlockNode)
    .filter(blockNode => blockNode !== null && (
      blockNode.type === 'paragraph' || 
      blockNode.type === 'bulletList' || 
      blockNode.type === 'orderedList' ||
      blockNode.type === 'heading'
    )); // Filter for supported block types

  // If the entire document conversion resulted in nothing, return the default empty doc
  if (customContent.length === 0) {
    return defaultEmptyDoc;
  }

  // Final check: Ensure paragraphs that became empty *except* for a structural space get cleaned up
  customContent.forEach(block => {
      if (block.type === 'paragraph' && block.content.length === 1 && block.content[0].text === ' ' && Object.keys(block.content[0].style).length === 0) {
         block.content[0].text = ''; // Convert structural space back to empty string for storage
      }
      if (block.type === 'bulletList') {
          block.content.forEach(listItem => {
              listItem.content.forEach(para => {
                  // Ensure para is a paragraph before checking its content
                  if (para.type === 'paragraph' && para.content.length === 1 && para.content[0].text === ' ' && Object.keys(para.content[0].style).length === 0) {
                     para.content[0].text = '';
                  }
              });
              // Remove empty paragraphs from list items if desired? Maybe not, Tiptap might need them.
          });
      }
      if (block.type === 'orderedList') {
          block.content.forEach(listItem => {
              listItem.content.forEach(para => {
                  // Ensure para is a paragraph before checking its content
                  if (para.type === 'paragraph' && para.content.length === 1 && para.content[0].text === ' ' && Object.keys(para.content[0].style).length === 0) {
                     para.content[0].text = '';
                  }
              });
          });
      }
  });


  return {
    type: 'doc',
    content: customContent,
  };
}

// --- Function to extract plain text from CustomDoc ---

/**
 * Recursively extracts all text content from a CustomDoc structure.
 *
 * @param doc - The CustomDoc object.
 * @returns A single string containing all concatenated text.
 */
export function extractTextFromCustomDoc(doc: CustomDoc | null | undefined): string {
  if (!doc || !doc.content) {
    return '';
  }

  let text = '';

  function traverse(node: CustomBlockNode | CustomListItem | CustomParagraph | StyledTextSegment) {
    if (!node) return;

    switch (node.type) {
      case 'paragraph':
        (node.content || []).forEach(traverse);
        // Don't add newlines - keep inline formatting intact
        break;
      case 'bulletList':
        (node.content || []).forEach(traverse);
        break;
      case 'orderedList':
        (node.content || []).forEach(traverse);
        break;
      case 'listItem':
        (node.content || []).forEach(traverse);
        // Don't add extra formatting - preserve inline structure
        break;
      case 'text':
        text += node.text || '';
        break;
      default:
        // Handle potential unknown node types gracefully
        break;
    }
  }

  doc.content.forEach(traverse);

  return text.trim(); // Trim leading/trailing whitespace
}