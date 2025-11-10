import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Sparkles, Image, Presentation, Layers } from 'lucide-react';

interface CreateWithAIPanelProps {
  onSubmit: (prompt: string, options: CreateOptions) => void;
  isLoading?: boolean;
}

export interface CreateOptions {
  autoSelectImages: boolean;
  autoSlides: boolean;
  presentationMode: boolean;
}

const CreateWithAIPanel: React.FC<CreateWithAIPanelProps> = ({ onSubmit, isLoading }) => {
  const [prompt, setPrompt] = useState('');
  const [options, setOptions] = useState<CreateOptions>({
    autoSelectImages: true,
    autoSlides: true,
    presentationMode: true,
  });

  const handleSubmit = () => {
    if (prompt.trim()) {
      onSubmit(prompt.trim(), options);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      handleSubmit();
    }
  };

  return (
    <div className="w-full max-w-3xl mx-auto p-6 bg-card border border-border rounded-lg shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <Sparkles className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-semibold">Create with AI</h3>
      </div>

      <div className="space-y-4">
        {/* Main prompt input */}
        <div>
          <Label htmlFor="ai-prompt" className="text-sm font-medium mb-2">
            What would you like to create?
          </Label>
          <Textarea
            id="ai-prompt"
            placeholder="e.g., Create a pitch deck for my AI startup that helps developers..."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            className="min-h-[100px] resize-none"
            disabled={isLoading}
          />
          <p className="text-xs text-muted-foreground mt-1">
            Press ⌘+Enter (Mac) or Ctrl+Enter (Windows) to create
          </p>
        </div>

        {/* Options toggles */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
          <div className="flex items-center justify-between space-x-2 p-3 border border-border rounded-md">
            <div className="flex items-center gap-2 flex-1">
              <Image className="h-4 w-4 text-muted-foreground" />
              <Label htmlFor="auto-images" className="text-sm cursor-pointer">
                Auto Images
              </Label>
            </div>
            <Switch
              id="auto-images"
              checked={options.autoSelectImages}
              onCheckedChange={(checked) =>
                setOptions({ ...options, autoSelectImages: checked })
              }
              disabled={isLoading}
            />
          </div>

          <div className="flex items-center justify-between space-x-2 p-3 border border-border rounded-md">
            <div className="flex items-center gap-2 flex-1">
              <Layers className="h-4 w-4 text-muted-foreground" />
              <Label htmlFor="auto-slides" className="text-sm cursor-pointer">
                Auto Slides
              </Label>
            </div>
            <Switch
              id="auto-slides"
              checked={options.autoSlides}
              onCheckedChange={(checked) =>
                setOptions({ ...options, autoSlides: checked })
              }
              disabled={isLoading}
            />
          </div>

          <div className="flex items-center justify-between space-x-2 p-3 border border-border rounded-md">
            <div className="flex items-center gap-2 flex-1">
              <Presentation className="h-4 w-4 text-muted-foreground" />
              <Label htmlFor="presentation-mode" className="text-sm cursor-pointer">
                Presentation
              </Label>
            </div>
            <Switch
              id="presentation-mode"
              checked={options.presentationMode}
              onCheckedChange={(checked) =>
                setOptions({ ...options, presentationMode: checked })
              }
              disabled={isLoading}
            />
          </div>
        </div>

        {/* Create button */}
        <Button
          onClick={handleSubmit}
          disabled={!prompt.trim() || isLoading}
          className="w-full"
          size="lg"
        >
          {isLoading ? (
            <>
              <span className="animate-spin mr-2">⏳</span>
              Creating...
            </>
          ) : (
            <>
              <Sparkles className="mr-2 h-4 w-4" />
              Create Presentation
            </>
          )}
        </Button>
      </div>
    </div>
  );
};

export default CreateWithAIPanel;
