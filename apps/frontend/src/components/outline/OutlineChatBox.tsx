import React, { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Send, Loader2, ChevronDown } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface OutlineChatBoxProps {
  onSendMessage: (message: string, targetSlideIndex?: number | 'all') => Promise<void>;
  isLoading?: boolean;
  currentSlideIndex?: number;
  totalSlides?: number;
  placeholder?: string;
}

const OutlineChatBox: React.FC<OutlineChatBoxProps> = ({
  onSendMessage,
  isLoading = false,
  currentSlideIndex = 0,
  totalSlides = 1,
  placeholder = "Edit the outline or ask questions..."
}) => {
  const [message, setMessage] = useState('');
  const [selectedTarget, setSelectedTarget] = useState<number | 'all'>(currentSlideIndex);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    
    if (message.trim() && !isLoading) {
      await onSendMessage(message, selectedTarget);
      setMessage('');
      
      // Reset textarea height
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
    }
  }, [message]);

  // Update selected target when current slide changes
  useEffect(() => {
    setSelectedTarget(currentSlideIndex);
  }, [currentSlideIndex]);

  return (
    <div className="w-full bg-white/50 dark:bg-zinc-900/50 backdrop-blur-sm rounded-lg border border-[#FF4301] p-2 relative">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <div className="flex-1 relative">
          <Textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={isLoading}
            className={cn(
              "min-h-[36px] max-h-[80px] resize-none",
              "bg-transparent border-0 focus:ring-0",
              "text-sm placeholder:text-zinc-400",
              "pr-2 py-1"
            )}
            rows={1}
          />
        </div>
        
        <Button
          type="submit"
          size="icon"
          disabled={!message.trim() || isLoading}
          className="h-8 w-8 rounded-full bg-[#FF4301] hover:bg-[#FF4301]/90 text-white"
        >
          {isLoading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Send className="h-3.5 w-3.5" />
          )}
        </Button>
      </form>
      
      {/* Slide selection dropdown - positioned at bottom right */}
      <div className="absolute bottom-1 right-1">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-5 px-1.5 text-[10px] text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              {selectedTarget === 'all' ? 'All slides' : `Slide ${selectedTarget + 1}`}
              <ChevronDown className="h-2.5 w-2.5 ml-0.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[80px]">
            <DropdownMenuItem onClick={() => setSelectedTarget('all')} className="text-xs">
              All slides
            </DropdownMenuItem>
            {Array.from({ length: totalSlides }, (_, i) => (
              <DropdownMenuItem key={i} onClick={() => setSelectedTarget(i)} className="text-xs">
                Slide {i + 1}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      
      <div className="mt-2 flex gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => setMessage("Make all bullet points more concise")}
          className="text-[10px] px-2 py-1 rounded-md bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
        >
          Make concise
        </button>
        <button
          type="button"
          onClick={() => setMessage("Add more details and examples")}
          className="text-[10px] px-2 py-1 rounded-md bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
        >
          Add details
        </button>
        <button
          type="button"
          onClick={() => setMessage("Add engaging statistics and data points")}
          className="text-[10px] px-2 py-1 rounded-md bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
        >
          Add data
        </button>
        <button
          type="button"
          onClick={() => setMessage("Make this more engaging and impactful")}
          className="text-[10px] px-2 py-1 rounded-md bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
        >
          Make impactful
        </button>
      </div>
    </div>
  );
};

export default OutlineChatBox; 