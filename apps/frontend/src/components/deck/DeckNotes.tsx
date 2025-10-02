import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { NotepadText, Save, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { NarrativeFlow } from '@/types/SlideTypes';
import { useDeckWithNarrativeFlow } from '@/hooks/useDeckWithNarrativeFlow';
import { useDeckStore } from '@/stores/deckStore';

interface DeckNotesProps {
  deckId: string;
  className?: string;
  isGenerating?: boolean;
  hideTrigger?: boolean;
}

const DeckNotes: React.FC<DeckNotesProps> = ({ deckId, className, isGenerating, hideTrigger = false }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [notes, setNotes] = useState('');
  const [originalNotes, setOriginalNotes] = useState('');
  const updateDeckData = useDeckStore.getState().updateDeckData;
  const { toast } = useToast();
  
  // Use the new hook for progressive narrative flow loading
  const { narrativeFlow, isPollingForNarrative } = useDeckWithNarrativeFlow(deckId);

  // Load initial user notes from deck.data when deck changes
  useEffect(() => {
    try {
      const current = useDeckStore.getState().deckData;
      const initial = (current?.data as any)?.user_notes ?? '';
      setNotes(initial);
      setOriginalNotes(initial);
    } catch {
      setNotes('');
      setOriginalNotes('');
    }
  }, [deckId]);

  // Open notes from a global event dispatched by the header actions menu
  useEffect(() => {
    const handler = () => setIsOpen(true);
    window.addEventListener('notes:open', handler);
    return () => window.removeEventListener('notes:open', handler);
  }, []);

  const saveNotes = async () => {
    if (notes === originalNotes) {
      toast({
        title: "No changes",
        description: "Notes haven't been modified",
      });
      return;
    }

    setIsSaving(true);
    try {
      // Persist user notes into deck.data.user_notes
      const current = useDeckStore.getState().deckData;
      const nextData = {
        ...(current.data || {}),
        user_notes: notes
      };
      await updateDeckData({ data: nextData });
      setOriginalNotes(notes);
      toast({
        title: "Success",
        description: "Notes saved successfully",
      });
    } catch (error) {
      console.error('Error saving notes:', error);
      toast({
        title: "Error",
        description: "Failed to save notes",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const renderNarrativeSection = () => {
    if (!narrativeFlow) {
      if (isPollingForNarrative || isGenerating) {
        return (
          <div className="flex items-center justify-center p-8">
            <div className="text-center">
              <Loader2 className="h-6 w-6 animate-spin text-[#FF4301] mx-auto mb-2" />
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Analyzing narrative flow...
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                This takes about 1-3 seconds
              </p>
            </div>
          </div>
        );
      }
      
      return (
        <div className="text-center p-8">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No narrative flow available
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            The story structure will be generated with your presentation
          </p>
        </div>
      );
    }

    return (
      <div className="space-y-4 p-4">
        {/* Story Arc */}
        <div>
          <h4 className="text-sm font-semibold mb-2">Story Arc</h4>
          <div className="bg-gray-50 dark:bg-zinc-800/50 rounded-lg p-3 space-y-2">
            <p className="text-xs font-medium text-[#FF4301]">
              {narrativeFlow.story_arc.type.replace('-', ' ').toUpperCase()}
            </p>
            <p className="text-xs text-gray-600 dark:text-gray-400">
              {narrativeFlow.story_arc.description}
            </p>
            
            {/* Story Arc Phases */}
            {narrativeFlow.story_arc.phases && (
              <div className="mt-3 space-y-2">
                {narrativeFlow.story_arc.phases.map((phase, index) => (
                  <div key={index} className="border-l-2 border-[#FF4301]/30 pl-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium">{phase.name}</span>
                      <span className="text-xs text-gray-500">
                        {Math.round(phase.suggested_duration / 60)} min
                      </span>
                    </div>
                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                      {phase.purpose}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Key Themes */}
        <div>
          <h4 className="text-sm font-semibold mb-2">Key Themes</h4>
          <div className="space-y-2">
            {narrativeFlow.key_themes.slice(0, 3).map((theme, index) => (
              <div key={index} className="bg-gray-50 dark:bg-zinc-800/50 rounded-lg p-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium">{theme.theme}</span>
                  <span className={cn(
                    "text-xs px-1.5 py-0.5 rounded-full",
                    theme.importance === 'high' && "bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-300",
                    theme.importance === 'medium' && "bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300",
                    theme.importance === 'low' && "bg-gray-100 text-gray-700 dark:bg-gray-900/20 dark:text-gray-300"
                  )}>
                    {theme.importance}
                  </span>
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                  {theme.description}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Tone & Style */}
        <div>
          <h4 className="text-sm font-semibold mb-2">Tone & Style</h4>
          <div className="bg-gray-50 dark:bg-zinc-800/50 rounded-lg p-3 space-y-2">
            <p className="text-xs">
              <span className="font-medium">Overall Tone:</span>{' '}
              <span className="text-gray-600 dark:text-gray-400">
                {narrativeFlow.tone_and_style.overall_tone}
              </span>
            </p>
            <p className="text-xs">
              <span className="font-medium">Language Level:</span>{' '}
              <span className="text-gray-600 dark:text-gray-400">
                {narrativeFlow.tone_and_style.language_level}
              </span>
            </p>
            {narrativeFlow.tone_and_style.engagement_techniques && (
              <p className="text-xs">
                <span className="font-medium">Engagement Techniques:</span>{' '}
                <span className="text-gray-600 dark:text-gray-400">
                  {narrativeFlow.tone_and_style.engagement_techniques.join(', ')}
                </span>
              </p>
            )}
          </div>
        </div>

        {/* Presentation Tips */}
        {narrativeFlow.presentation_tips && narrativeFlow.presentation_tips.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold mb-2">Presentation Tips</h4>
            <div className="space-y-2">
              {narrativeFlow.presentation_tips.slice(0, 5).map((tip, index) => (
                <div key={index} className="bg-gray-50 dark:bg-zinc-800/50 rounded-lg p-2">
                  <div className="flex items-start gap-2">
                    <span className={cn(
                      "text-xs px-1.5 py-0.5 rounded-full flex-shrink-0",
                      tip.category === 'delivery' && "bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300",
                      tip.category === 'content' && "bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-300",
                      tip.category === 'visual' && "bg-purple-100 text-purple-700 dark:bg-purple-900/20 dark:text-purple-300",
                      tip.category === 'interaction' && "bg-orange-100 text-orange-700 dark:bg-orange-900/20 dark:text-orange-300"
                    )}>
                      {tip.category}
                    </span>
                    <p className="text-xs text-gray-600 dark:text-gray-400">
                      {tip.tip}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        {!hideTrigger && (
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "h-8 w-8 rounded-lg",
                "hover:bg-[#FF4301]/10 hover:text-[#FF4301]",
                "transition-colors",
                className
              )}
              title="Deck Notes"
            >
              <NotepadText className="h-4 w-4" />
            </Button>
          </SheetTrigger>
        )}
        <SheetContent className="w-[460px] sm:w-[600px]">
          <SheetHeader>
            <SheetTitle>Presentation Notes</SheetTitle>
            <SheetDescription>
              Review narrative flow and add your own notes
            </SheetDescription>
          </SheetHeader>
          
          <div className="mt-6 h-full min-h-0 flex flex-col" style={{ height: 'calc(100vh - 120px)' }}>
            <Tabs defaultValue="narrative" className="flex-1 flex flex-col overflow-hidden">
              <TabsList className="w-fit bg-muted/40 rounded-md">
                <TabsTrigger value="narrative">Narrative</TabsTrigger>
                <TabsTrigger value="notes">Notes</TabsTrigger>
              </TabsList>

              <TabsContent value="narrative" className="flex-1 min-h-0">
                <ScrollArea className="h-full border border-border/40 rounded-lg bg-background/60">
                  <div className="p-4 pr-6">
                    {renderNarrativeSection()}
                  </div>
                </ScrollArea>
              </TabsContent>

              <TabsContent value="notes" className="flex-1 min-h-0">
                <ScrollArea className="h-full border border-border/30 rounded-lg p-3 overflow-visible">
                  <div className="h-full flex flex-col">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-semibold">Your Notes</h3>
                      <Button
                        size="sm"
                        onClick={saveNotes}
                        disabled={isSaving || notes === originalNotes}
                        className="h-7 px-3 bg-[#FF4301] text-white hover:bg-[#FF4301]/90 disabled:opacity-60"
                      >
                        {isSaving ? (
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        ) : (
                          <Save className="h-3 w-3 mr-1" />
                        )}
                        Save
                      </Button>
                    </div>
                    <Textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Add your presentation notes here..."
                      className="min-h-[320px] resize-none border border-border/20 rounded-xl bg-background shadow-inner font-sans text-sm leading-6 focus-visible:ring-2 focus-visible:ring-[#FF4301]/20 focus-visible:border-[#FF4301]/40"
                    />
                    {notes !== originalNotes && (
                      <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                        You have unsaved changes
                      </p>
                    )}
                    <p className="text-[11px] text-muted-foreground mt-1">These notes are saved with your presentation (private).</p>
                  </div>
                </ScrollArea>
              </TabsContent>
            </Tabs>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
};

export default DeckNotes; 