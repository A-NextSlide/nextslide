/**
 * JavaScript Array Image Parser
 *
 * Parses JavaScript arrays in HTML to extract images that are stored in data arrays
 * (e.g., for tabbed components, carousels, sliders) rather than as DOM <img> elements.
 *
 * Example JS structure:
 * const items = [
 *   { title: 'World 1-1', image: 'https://...', imageAlt: 'mario level 1' },
 *   { title: 'World 1-2', image: 'https://...', imageAlt: 'mario underground' },
 * ]
 */

export interface JsArrayImage {
  /** Unique identifier for this image */
  id: string;
  /** The image URL */
  src: string;
  /** Label/alt text for display */
  label: string;
  /** The property name (e.g., 'image', 'src', 'thumbnail') */
  propName: string;
  /** Index within the array */
  arrayIndex: number;
  /** The full object text containing this image (for replacement) */
  objectText: string;
  /** Start position in the HTML for replacement */
  startPos: number;
  /** End position in the HTML for replacement */
  endPos: number;
}

/**
 * Iterate through all JS objects in text using brace matching.
 * Returns array of (start, end, objectText) tuples.
 */
function iterJsObjects(text: string): Array<{ start: number; end: number; text: string }> {
  const objects: Array<{ start: number; end: number; text: string }> = [];
  let depth = 0;
  let start: number | null = null;
  let inString: string | null = null;
  let escape = false;

  for (let idx = 0; idx < text.length; idx++) {
    const ch = text[idx];

    if (inString) {
      if (escape) {
        escape = false;
      } else if (ch === '\\') {
        escape = true;
      } else if (ch === inString) {
        inString = null;
      }
    } else {
      if (ch === "'" || ch === '"' || ch === '`') {
        inString = ch;
      } else if (ch === '{') {
        if (depth === 0) {
          start = idx;
        }
        depth++;
      } else if (ch === '}') {
        if (depth > 0) {
          depth--;
          if (depth === 0 && start !== null) {
            objects.push({
              start,
              end: idx + 1,
              text: text.slice(start, idx + 1)
            });
            start = null;
          }
        }
      }
    }
  }

  return objects;
}

/**
 * Check if a value looks like a valid image URL
 */
function isImageUrl(value: string): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  return (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('data:image') ||
    trimmed.startsWith('blob:')
  );
}

/**
 * Extract label from a JS object for display purposes
 */
function extractLabel(objText: string): string {
  // Priority: imageAlt > alt > title > name > label > description
  const labelFields = ['imageAlt', 'thumbAlt', 'alt', 'title', 'name', 'label', 'heading', 'description'];

  for (const field of labelFields) {
    const match = objText.match(new RegExp(`\\b${field}\\s*:\\s*(['"\`])([^'"\`]*?)\\1`, 'i'));
    if (match && match[2] && match[2].length > 2) {
      return match[2].trim();
    }
  }

  return '';
}

/**
 * Parse HTML content to find all images stored in JavaScript arrays.
 * These are images that won't be detected by DOM scanning because they're
 * rendered dynamically (e.g., tab content, carousel slides).
 */
export function parseJsArrayImages(html: string): JsArrayImage[] {
  const images: JsArrayImage[] = [];

  if (!html) return images;

  // Find all script blocks
  const scriptPattern = /<script[^>]*>([\s\S]*?)<\/script>/gi;
  let scriptMatch;

  while ((scriptMatch = scriptPattern.exec(html)) !== null) {
    const scriptContent = scriptMatch[1];
    const scriptOffset = scriptMatch.index + scriptMatch[0].indexOf(scriptContent);

    // Find all JS objects in the script
    const jsObjects = iterJsObjects(scriptContent);

    // Track which arrays we've seen to assign indices
    const arrayIndices = new Map<string, number>();

    for (const obj of jsObjects) {
      // Look for image-related properties with URLs
      const imageProps = [
        'image', 'img', 'src', 'photo', 'picture', 'thumbnail', 'thumb',
        'backgroundImage', 'bgImage', 'coverImage', 'heroImage'
      ];

      for (const prop of imageProps) {
        // Match property: 'url' or property: "url"
        const propPattern = new RegExp(
          `\\b(${prop})\\s*:\\s*(['"\`])([^'"\`]+?)\\2`,
          'gi'
        );

        let propMatch;
        while ((propMatch = propPattern.exec(obj.text)) !== null) {
          const propName = propMatch[1];
          const url = propMatch[3];

          // Only include if it's a valid image URL
          if (!isImageUrl(url)) continue;

          // Get or increment array index for this property type
          const key = propName.toLowerCase();
          const arrayIndex = arrayIndices.get(key) || 0;
          arrayIndices.set(key, arrayIndex + 1);

          // Extract label for display
          const label = extractLabel(obj.text) || `${propName} ${arrayIndex + 1}`;

          images.push({
            id: `js-${propName}-${arrayIndex}`,
            src: url,
            label,
            propName,
            arrayIndex,
            objectText: obj.text,
            startPos: scriptOffset + obj.start,
            endPos: scriptOffset + obj.end,
          });
        }
      }
    }
  }

  return images;
}

/**
 * Update an image URL in a JavaScript array within HTML.
 * Returns the updated HTML.
 */
export function updateJsArrayImage(
  html: string,
  imageId: string,
  newSrc: string,
  jsImages: JsArrayImage[]
): string {
  const image = jsImages.find(img => img.id === imageId);
  if (!image) {
    console.warn('[jsArrayImageParser] Image not found:', imageId);
    return html;
  }

  console.log('[jsArrayImageParser] Attempting to update:', {
    id: imageId,
    propName: image.propName,
    oldSrc: image.src.slice(0, 80),
    newSrc: newSrc.slice(0, 80),
  });

  // Direct find-and-replace approach - find the exact URL in a property context
  // Match: propName: 'oldUrl' or propName: "oldUrl"
  const escapedOldSrc = escapeRegExp(image.src);
  const directPattern = new RegExp(
    `(\\b${image.propName}\\s*:\\s*)(['"\`])(${escapedOldSrc})\\2`,
    'g'
  );

  let updatedHtml = html;
  let matchFound = false;

  updatedHtml = html.replace(directPattern, (match, prefix, quote, url) => {
    matchFound = true;
    console.log('[jsArrayImageParser] Found match, replacing');
    return `${prefix}${quote}${newSrc}${quote}`;
  });

  if (!matchFound) {
    // Fallback: try to find just the URL anywhere and replace it
    console.warn('[jsArrayImageParser] Direct pattern failed, trying fallback');
    const fallbackPattern = new RegExp(escapeRegExp(image.src), 'g');
    const beforeReplace = updatedHtml;
    updatedHtml = updatedHtml.replace(fallbackPattern, newSrc);
    matchFound = updatedHtml !== beforeReplace;
  }

  if (!matchFound) {
    console.warn('[jsArrayImageParser] Could not replace image:', image.propName, image.src.slice(0, 50));
    return html;
  }

  console.log('[jsArrayImageParser] Successfully updated JS array image');
  return updatedHtml;
}

/**
 * Escape special regex characters in a string
 */
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
