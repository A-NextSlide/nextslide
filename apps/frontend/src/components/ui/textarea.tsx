
import * as React from "react"
import { useRef, useEffect } from "react"
import { cn } from "@/lib/utils"

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);
    
    // Function to auto-resize the textarea
    const adjustHeight = () => {
      const textarea = ref ? (ref as React.RefObject<HTMLTextAreaElement>).current : textareaRef.current;
      
      if (textarea) {
        // Reset height to auto to get the correct scrollHeight
        textarea.style.height = 'auto';
        // Set the height to match content (scrollHeight)
        textarea.style.height = `${textarea.scrollHeight}px`;
      }
    };
    
    // Adjust height on mount and when content changes
    useEffect(() => {
      adjustHeight();
      
      // Create a MutationObserver to watch for content changes
      const textarea = ref ? (ref as React.RefObject<HTMLTextAreaElement>).current : textareaRef.current;
      if (textarea) {
        const observer = new MutationObserver(adjustHeight);
        observer.observe(textarea, { childList: true, characterData: true, subtree: true });
        
        return () => observer.disconnect();
      }
    }, []);
    
    return (
      <textarea
        className={cn(
          "flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={(node) => {
          // Handle both external and internal refs
          if (typeof ref === 'function') {
            ref(node);
          } else if (ref) {
            (ref as React.MutableRefObject<HTMLTextAreaElement | null>).current = node;
          }
          textareaRef.current = node;
          
          // Initial height adjustment when the ref is set
          if (node) {
            setTimeout(adjustHeight, 0);
          }
        }}
        onChange={(e) => {
          if (props.onChange) {
            props.onChange(e);
          }
          adjustHeight();
        }}
        rows={1}
        style={{ minHeight: 'auto', overflow: 'hidden' }}
        {...props}
      />
    )
  }
)
Textarea.displayName = "Textarea"

export { Textarea }
