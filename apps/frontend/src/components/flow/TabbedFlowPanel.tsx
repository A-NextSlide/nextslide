import React, { useState, useEffect, useCallback } from 'react';
import PresentationFlowView from './PresentationFlowView';
import { NarrativeFlowView } from './NarrativeFlowView';
import { DeckOutline } from '@/types/SlideTypes';
import { cn } from '@/lib/utils';
import { Hand, Loader2 } from 'lucide-react';
import ThinkingProcess from '@/components/outline/ThinkingProcess';
import { useDeckStore } from '@/stores/deckStore';
import { useDeckWithNarrativeFlow } from '@/hooks/useDeckWithNarrativeFlow';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Save } from 'lucide-react';

interface TabbedFlowPanelProps {
  currentOutline: DeckOutline;
  onReorderFlow: (fromIndex: number, toIndex: number) => void;
  showNotesTab?: boolean;
  isNarrativeLoading?: boolean;
  researchEvents?: any[];
  showThinkingTab?: boolean;
}

export const TabbedFlowPanel: React.FC<TabbedFlowPanelProps> = ({ 
  currentOutline, 
  onReorderFlow,
  showNotesTab = true,
  isNarrativeLoading = false,
  researchEvents = [],
  showThinkingTab = true
}) => {
  const [showHint, setShowHint] = useState(false);
  const [hintDismissed, setHintDismissed] = useState(false);
  // Default tab depends on whether Thinking is available
  const [activeTab, setActiveTab] = useState<'narrative' | 'presentation' | 'notes' | 'thinking'>(showThinkingTab ? 'thinking' : 'presentation');
  // Track if user has manually selected a tab to prevent auto-switching
  const [userHasSelectedTab, setUserHasSelectedTab] = useState(false);
  // Fallback holder for events read from window if parent prop isn't provided
  const [globalEvents, setGlobalEvents] = useState<any[]>([]);
  
  // TEST: Add some test events to verify UI works
  const [showTestEvents, setShowTestEvents] = useState(false);
  const { deckData } = useDeckStore();
  
  // Use the new hook for progressive narrative flow loading
  const { narrativeFlow, isPollingForNarrative } = useDeckWithNarrativeFlow(deckData?.uuid);
  const outlineNarrative = (currentOutline as any)?.narrativeFlow;
  const effectiveNarrative = narrativeFlow || outlineNarrative || null;
  const loadingNarrative = isNarrativeLoading || isPollingForNarrative;

  // Prevent endless spinner: after a brief period, swap to a static info message
  const [showLongWait, setShowLongWait] = useState(false);
  useEffect(() => {
    let timer: any;
    if (loadingNarrative) {
      setShowLongWait(false);
      timer = setTimeout(() => setShowLongWait(true), 12000);
    } else {
      setShowLongWait(false);
    }
    return () => timer && clearTimeout(timer);
  }, [loadingNarrative]);

  // Compute visible events preferring prop over global fallback
  const visibleEvents = (researchEvents && researchEvents.length > 0) ? researchEvents : globalEvents;
  const researchEnabled = (typeof window !== 'undefined') ? (window as any).__outlineEnableResearch === true : false;
  
  // Debug log only on changes to avoid infinite loop
  useEffect(() => {
    console.warn('[TabbedFlowPanel] researchEvents prop:', researchEvents?.length || 0, 'first event:', researchEvents?.[0], 'globalEvents:', globalEvents?.length || 0, 'visibleEvents:', visibleEvents?.length || 0);
    // Also check window directly
    const windowEvents = (window as any).__DEBUG_RESEARCH_EVENTS__;
    console.warn('[TabbedFlowPanel] window.__DEBUG_RESEARCH_EVENTS__:', windowEvents?.length || 0, 'first:', windowEvents?.[0]);
  }, [researchEvents?.length, globalEvents?.length]);

  // Poll global debug var as a fallback to get research events from OutlineEditor
  useEffect(() => {
    let interval: any;
    const poll = () => {
      try {
        const globalEvents = (window as any).__DEBUG_RESEARCH_EVENTS__ as any[] | undefined;
        if (Array.isArray(globalEvents) && globalEvents.length !== (visibleEvents?.length || 0)) {
          setGlobalEvents(globalEvents);
        }
      } catch {}
    };
    // Initial hydrate
    poll(); // Run poll immediately to get initial events
    interval = setInterval(poll, 300);
    return () => interval && clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Compute a lightweight key representing which slides have content
  const contentPresenceKey = React.useMemo(() => {
    const slides = currentOutline.slides || [];
    if (slides.length === 0) return '';
    return slides.map(s => ((s.content || '').trim() ? '1' : '0')).join('');
  }, [currentOutline.slides]);

  // Auto-switch tab: show Thinking while researching (no slides or slides not populated yet),
  // switch to Presentation when all slides have content (but only if user hasn't manually selected)
  useEffect(() => {
    // Skip auto-switching if user has manually selected a tab
    if (userHasSelectedTab) return;
    
    // If thinking is disabled and currently selected, move to presentation
    if ((!showThinkingTab || !researchEnabled) && activeTab === 'thinking') {
      setActiveTab('presentation');
      return;
    }
    
    const hasSlides = (currentOutline.slides?.length || 0) > 0;
    const allSlidesHaveContent = hasSlides && contentPresenceKey !== '' && !contentPresenceKey.includes('0');

    // While researching or awaiting content, keep/show Thinking
    if (showThinkingTab && researchEnabled && !allSlidesHaveContent && (visibleEvents?.length || 0) > 0 && activeTab !== 'thinking') {
      setActiveTab('thinking');
    }
    // Once all slides populated, switch to Flow
    if (allSlidesHaveContent && activeTab === 'thinking') {
      setActiveTab('presentation');
    }
  }, [contentPresenceKey, currentOutline.slides?.length, visibleEvents?.length, activeTab, userHasSelectedTab, showThinkingTab, researchEnabled]);

  // User notes state persisted on the deck
  const [userNotes, setUserNotes] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);

  useEffect(() => {
    const initial = (deckData?.data as any)?.user_notes ?? '';
    setUserNotes(initial);
  }, [deckData?.uuid, deckData?.data]);

  const handleSaveNotes = useCallback(async () => {
    if (savingNotes) return;
    setSavingNotes(true);
    try {
      const updateDeckData = useDeckStore.getState().updateDeckData;
      const current = useDeckStore.getState().deckData;
      const nextData = {
        ...(current.data || {}),
        user_notes: userNotes
      };
      updateDeckData({ data: nextData });
    } finally {
      setSavingNotes(false);
    }
  }, [userNotes, savingNotes]);

  useEffect(() => {
    // Show hint when switching to presentation tab if not dismissed
    if (activeTab === 'presentation' && currentOutline.slides && currentOutline.slides.length > 0 && !hintDismissed) {
      // Show hint immediately when switching to presentation tab
      const timer = setTimeout(() => {
        setShowHint(true);
      }, 100);

      // Hide hint after 8 seconds (longer visibility)
      const hideTimer = setTimeout(() => {
        setShowHint(false);
      }, 8000);

      return () => {
        clearTimeout(timer);
        clearTimeout(hideTimer);
      };
    }
  }, [activeTab, currentOutline.slides?.length, hintDismissed]); // Re-run when tab changes or slides length changes

  const handleDismissHint = () => {
    setShowHint(false);
    setHintDismissed(true);
  };

  const handleReorderSlides = (fromIndex: number, toIndex: number) => {
    if (onReorderFlow) {
      onReorderFlow(fromIndex, toIndex);
    } else {
      console.error('[TabbedFlowPanel] onReorderFlow is not defined!');
    }
  };

  return (
    <div className="h-full flex flex-col relative">
      {/* Drag instruction overlay - only show for presentation tab and when slides exist */}
      {activeTab === 'presentation' && currentOutline.slides && currentOutline.slides.length > 0 && (
        <div 
          className={cn(
            "absolute inset-0 bg-black/50 backdrop-blur-sm rounded-lg flex items-center justify-center z-50 transition-all duration-500",
            showHint ? "opacity-100" : "opacity-0 pointer-events-none"
          )}
          onClick={handleDismissHint}
        >
          <div className={cn(
            "bg-white/90 dark:bg-zinc-900/90 rounded-lg p-6 max-w-sm text-center transform transition-all duration-500",
            showHint ? "scale-100" : "scale-95"
          )}>
            <Hand className="h-8 w-8 mx-auto mb-3 text-[#FF4301] animate-pulse" />
            <h3 className="font-semibold text-sm mb-2">Drag to Reorder</h3>
            <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
              Drag and drop slides in the Flow to reorganize your deck
            </p>
            <p className="text-[10px] text-gray-500 dark:text-gray-500">
              Click anywhere to dismiss
            </p>
          </div>
        </div>
      )}

      {/* Thin, elegant tabs - Thinking (optional) → Flow → Narrative */}
      <div className="flex border-b border-border/30">
        {showThinkingTab && researchEnabled && (
          <button
            onClick={() => {
              setActiveTab('thinking');
              setUserHasSelectedTab(true);
            }}
            className={cn(
              "flex-1 px-3 py-2 text-xs font-medium transition-all duration-200",
              "border-b-2 -mb-px",
              activeTab === 'thinking'
                ? "border-[#FF4301] text-[#FF4301]"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            Thinking
          </button>
        )}
        <button
          onClick={() => {
            setActiveTab('presentation');
            setUserHasSelectedTab(true);
          }}
          className={cn(
            "flex-1 px-3 py-2 text-xs font-medium transition-all duration-200",
            "border-b-2 -mb-px",
            activeTab === 'presentation'
              ? "border-[#FF4301] text-[#FF4301]"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          Flow
        </button>
        <button
          onClick={() => {
            setActiveTab('narrative');
            setUserHasSelectedTab(true);
          }}
          className={cn(
            "flex-1 px-3 py-2 text-xs font-medium transition-all duration-200",
            "border-b-2 -mb-px",
            activeTab === 'narrative'
              ? "border-[#FF4301] text-[#FF4301]"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          Narrative
        </button>
        {showNotesTab && (
          <button
            onClick={() => {
              setActiveTab('notes');
              setUserHasSelectedTab(true);
            }}
            className={cn(
              "flex-1 px-3 py-2 text-xs font-medium transition-all duration-200",
              "border-b-2 -mb-px",
              activeTab === 'notes'
                ? "border-[#FF4301] text-[#FF4301]"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            Notes
          </button>
        )}
      </div>

      {/* Tab content */}
      <div className="flex-1">
        {activeTab === 'narrative' ? (
          <div className="h-full overflow-y-auto">
            {effectiveNarrative ? (
              <NarrativeFlowView 
                narrativeFlow={effectiveNarrative} 
                className="pb-4"
              />
            ) : loadingNarrative && !showLongWait ? (
              <div className="flex items-center justify-center h-full p-4">
                <div className="text-center">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted/20 mb-4">
                    <Loader2 className="h-8 w-8 text-[#FF4301] animate-spin" />
                  </div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">Preparing narrative flow…</p>
                  <p className="text-xs text-muted-foreground/70">We'll attach it once your outline is ready</p>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full p-4">
                <div className="text-center">
                  <p className="text-sm font-medium text-muted-foreground mb-1">Narrative flow is still generating…</p>
                  <p className="text-xs text-muted-foreground/70">It will attach shortly or after deck creation</p>
                </div>
              </div>
            )}
          </div>
        ) : (showThinkingTab && researchEnabled && activeTab === 'thinking') ? (
          <div className="h-full overflow-y-auto p-2">
            {(visibleEvents?.length || 0) > 0 ? (
              <ThinkingProcess
                events={visibleEvents}
                isVisible={true}
                className="w-full"
              />
            ) : (
              <div className="text-xs text-muted-foreground p-3">Listening for research events…</div>
            )}
          </div>
        ) : activeTab === 'presentation' ? (
          <div className="h-full overflow-y-auto">
            <PresentationFlowView
              slides={currentOutline.slides}
              onReorderSlides={handleReorderSlides}
              className="pb-4"
            />
          </div>
        ) : (
          <div className="h-full overflow-y-auto p-2 space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold">Your Notes</h3>
              <Button size="sm" className="h-7 px-3" onClick={handleSaveNotes} disabled={savingNotes}>
                {savingNotes ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Save className="h-3 w-3 mr-1" />}
                Save
              </Button>
            </div>
            <Textarea
              value={userNotes}
              onChange={(e) => setUserNotes(e.target.value)}
              placeholder="Add your presentation notes here..."
              className="min-h-[200px] resize-none"
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default TabbedFlowPanel; 