import React, { useState, useEffect, useRef, useCallback } from 'react';
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
import { useDeckStore } from '@/stores/deckStore';
import { API_BASE } from '@/config/environment';

interface DeckNotesProps {
  deckId: string;
  className?: string;
  isGenerating?: boolean;
  hideTrigger?: boolean;
}

const POLL_INTERVAL_MS = 4000;
const MAX_POLL_ATTEMPTS = 15; // ~60 seconds max polling

const DeckNotes: React.FC<DeckNotesProps> = ({ deckId, className, isGenerating, hideTrigger = false }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [notes, setNotes] = useState('');
  const [originalNotes, setOriginalNotes] = useState('');
  const [narrativeFlow, setNarrativeFlow] = useState<NarrativeFlow | null>(null);
  const [isPollingForNarrative, setIsPollingForNarrative] = useState(false);
  const pollCountRef = useRef(0);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevIsGeneratingRef = useRef(isGenerating);
  const updateDeckData = useDeckStore.getState().updateDeckData;
  const { toast } = useToast();

  // Read narrative from deck store whenever deckId changes
  useEffect(() => {
    const deckData = useDeckStore.getState().deckData;
    const storeNarrative = deckData?.notes as NarrativeFlow | null | undefined;
    if (storeNarrative && storeNarrative.story_arc) {
      setNarrativeFlow(storeNarrative);
    } else {
      setNarrativeFlow(null);
    }
  }, [deckId]);

  // Subscribe to store changes so narrative shows up when background task writes it
  useEffect(() => {
    const unsub = useDeckStore.subscribe((state) => {
      const storeNarrative = state.deckData?.notes as NarrativeFlow | null | undefined;
      if (storeNarrative && storeNarrative.story_arc) {
        setNarrativeFlow(storeNarrative);
      }
    });
    return unsub;
  }, []);

  // Fetch narrative from the backend API.
  // On the first call (generate=true), the backend will kick off generation
  // if no narrative exists yet. Subsequent polls just check for the result.
  const fetchNarrativeFromApi = useCallback(async (triggerGenerate: boolean): Promise<NarrativeFlow | null> => {
    if (!deckId) return null;
    try {
      const qs = triggerGenerate ? '?generate=true' : '';
      const res = await fetch(`${API_BASE}/deck/${deckId}/notes${qs}`);
      if (!res.ok) return null;
      const data = await res.json();
      if (data.success && data.notes && data.notes.story_arc) {
        return data.notes as NarrativeFlow;
      }
    } catch {
      // Silently fail - narrative may not be ready yet
    }
    return null;
  }, [deckId]);

  // When generation finishes (isGenerating: true → false), fetch narrative once
  // even if the panel is closed, so it's ready when the user opens it.
  useEffect(() => {
    const wasGenerating = prevIsGeneratingRef.current;
    prevIsGeneratingRef.current = isGenerating;

    if (wasGenerating && !isGenerating && !narrativeFlow && deckId) {
      // Generation just completed — narrative should be in DB now.
      // Do a quick fetch (no generate=true since it was already generated).
      const fetchAfterGeneration = async () => {
        const result = await fetchNarrativeFromApi(false);
        if (result) {
          setNarrativeFlow(result);
        }
      };
      // Small delay to allow the DB write to propagate
      const timer = setTimeout(fetchAfterGeneration, 1500);
      return () => clearTimeout(timer);
    }
  }, [isGenerating, narrativeFlow, deckId, fetchNarrativeFromApi]);

  // Poll for narrative when panel is open and no narrative is available
  useEffect(() => {
    if (!isOpen || narrativeFlow || !deckId) {
      // Stop polling if panel closed, narrative found, or no deck
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      setIsPollingForNarrative(false);
      pollCountRef.current = 0;
      return;
    }

    // Start polling
    setIsPollingForNarrative(true);
    pollCountRef.current = 0;

    const poll = async () => {
      pollCountRef.current += 1;
      // First request triggers generation; subsequent ones just poll.
      // If deck is currently generating, don't trigger on-demand generation
      // since the background task is already running.
      const isFirstAttempt = pollCountRef.current === 1 && !isGenerating;
      const result = await fetchNarrativeFromApi(isFirstAttempt);
      if (result) {
        setNarrativeFlow(result);
        setIsPollingForNarrative(false);
        pollCountRef.current = 0;
        return;
      }
      if (pollCountRef.current < MAX_POLL_ATTEMPTS) {
        pollTimerRef.current = setTimeout(poll, POLL_INTERVAL_MS);
      } else {
        // If still generating, keep polling — don't give up
        if (isGenerating) {
          pollCountRef.current = 0;
          pollTimerRef.current = setTimeout(poll, POLL_INTERVAL_MS);
        } else {
          setIsPollingForNarrative(false);
        }
      }
    };

    // First poll immediately
    poll();

    return () => {
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [isOpen, narrativeFlow, deckId, isGenerating, fetchNarrativeFromApi]);

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
                This runs in the background and will appear shortly
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
      <div className="space-y-5 p-4">
        {/* Story Arc */}
        <div>
          <h4 className="text-sm font-semibold mb-2">Story Arc</h4>
          <p className="text-[10px] uppercase tracking-wider font-medium text-[#FF4301] mb-1">
            {narrativeFlow.story_arc.type.replace('-', ' ')}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed mb-3">
            {narrativeFlow.story_arc.description}
          </p>

          {/* Story Arc Phases */}
          {narrativeFlow.story_arc.phases && (
            <div className="space-y-1">
              {narrativeFlow.story_arc.phases.map((phase, index) => (
                <div key={index} className="border-l-2 border-[#FF4301]/30 pl-3 py-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium">{phase.name}</span>
                    <span className="text-[10px] text-gray-400 dark:text-zinc-500 tabular-nums">
                      {Math.round(phase.suggested_duration / 60)} min
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">
                    {phase.purpose}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Key Themes */}
        <div>
          <h4 className="text-sm font-semibold mb-2">Key Themes</h4>
          <div className="space-y-1">
            {narrativeFlow.key_themes.slice(0, 3).map((theme, index) => (
              <div key={index} className={cn(
                "border-l-2 pl-3 py-2",
                theme.importance === 'high' && "border-[#FF4301]",
                theme.importance === 'medium' && "border-[#FF4301]/50",
                theme.importance === 'low' && "border-gray-300 dark:border-zinc-600"
              )}>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium">{theme.theme}</span>
                  <span className={cn(
                    "text-[10px] uppercase tracking-wider font-medium",
                    theme.importance === 'high' && "text-[#FF4301]",
                    theme.importance === 'medium' && "text-[#FF4301]/70",
                    theme.importance === 'low' && "text-gray-400 dark:text-zinc-500"
                  )}>
                    {theme.importance}
                  </span>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">
                  {theme.description}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Tone & Style */}
        <div>
          <h4 className="text-sm font-semibold mb-2">Tone & Style</h4>
          <div className="space-y-1.5">
            <div className="flex items-baseline gap-2">
              <span className="text-[10px] uppercase tracking-wider font-medium text-[#FF4301] w-20 flex-shrink-0">Tone</span>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {narrativeFlow.tone_and_style.overall_tone}
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-[10px] uppercase tracking-wider font-medium text-[#FF4301] w-20 flex-shrink-0">Level</span>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {narrativeFlow.tone_and_style.language_level}
              </span>
            </div>
            {narrativeFlow.tone_and_style.engagement_techniques && (
              <div className="flex items-baseline gap-2">
                <span className="text-[10px] uppercase tracking-wider font-medium text-[#FF4301] w-20 flex-shrink-0">Engage</span>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {narrativeFlow.tone_and_style.engagement_techniques.join(', ')}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Flow Recommendations */}
        {narrativeFlow.flow_recommendations && narrativeFlow.flow_recommendations.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold mb-2">Flow Recommendations</h4>
            <div className="space-y-1">
              {narrativeFlow.flow_recommendations.slice(0, 4).map((rec, index) => (
                <div key={index} className={cn(
                  "border-l-2 pl-3 py-2",
                  rec.priority === 'high' && "border-[#FF4301]",
                  rec.priority === 'medium' && "border-[#FF4301]/50",
                  rec.priority === 'low' && "border-gray-300 dark:border-zinc-600"
                )}>
                  <span className="text-[10px] uppercase tracking-wider font-medium text-[#FF4301]">
                    {rec.type}
                  </span>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">
                    {rec.recommendation}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Presentation Tips */}
        {narrativeFlow.presentation_tips && narrativeFlow.presentation_tips.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold mb-2">Presentation Tips</h4>
            <div className="space-y-1">
              {narrativeFlow.presentation_tips.slice(0, 5).map((tip, index) => (
                <div key={index} className="border-l-2 border-[#FF4301]/30 pl-3 py-2">
                  <span className="text-[10px] uppercase tracking-wider font-medium text-[#FF4301]/80">
                    {tip.category}
                  </span>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">
                    {tip.tip}
                  </p>
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
