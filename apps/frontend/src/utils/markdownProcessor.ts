/**
 * Utility class to process markdown formatted text and remove unwanted formatting
 */
export class MarkdownProcessor {
  /**
   * Removes all markdown formatting from text
   * @param text The input text containing markdown
   * @returns Clean text without markdown formatting
   */
  static removeMarkdown(text: string): string {
    if (!text) return '';
    
    let cleanText = text;
    
    // Remove asterisks for bold/italic
    cleanText = cleanText.replace(/\*\*(.*?)\*\*/g, "$1"); // Bold: **text**
    cleanText = cleanText.replace(/\*(.*?)\*/g, "$1"); // Italic: *text*
    
    // Remove underscores for bold/italic
    cleanText = cleanText.replace(/__(.*?)__/g, "$1"); // Bold: __text__
    cleanText = cleanText.replace(/_(.*?)_/g, "$1"); // Italic: _text_
    
    // Remove bullet points
    cleanText = cleanText.replace(/^\s*[\*\-\+]\s+/gm, ""); // * item, - item, + item
    
    // Convert markdown links to plain text links
    cleanText = cleanText.replace(/\[(.*?)\]\((.*?)\)/g, "$1 ($2)");
    
    return cleanText;
  }
  
  /**
   * Properly formats bullet points to use numbers or letters instead of markdown symbols
   * @param text The input text
   * @returns Formatted text with proper bullets
   */
  static formatBullets(text: string): string {
    if (!text) return '';
    
    // Split by lines
    const lines = text.split('\n');
    const result: string[] = [];
    let listIndex = 1;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Check if line is a bullet point
      if (line.match(/^\s*[\*\-\+]\s+/)) {
        // Replace with numbered format
        result.push(line.replace(/^\s*[\*\-\+]\s+/, `${listIndex}. `));
        listIndex++;
      } else {
        // Reset counter when leaving a list
        if (i > 0 && lines[i-1].match(/^\s*[\*\-\+]\s+/) && !line.match(/^\s*[\*\-\+]\s+/)) {
          listIndex = 1;
        }
        result.push(line);
      }
    }
    
    return result.join('\n');
  }
  
  /**
   * Process text to ensure proper formatting for slides
   * @param text The input text
   * @returns Properly formatted text
   */
  static processForSlides(text: string): string {
    if (!text) return '';
    
    // First format bullets to use numbers
    let processed = this.formatBullets(text);
    
    // Then remove any remaining markdown
    processed = this.removeMarkdown(processed);
    
    return processed;
  }
}