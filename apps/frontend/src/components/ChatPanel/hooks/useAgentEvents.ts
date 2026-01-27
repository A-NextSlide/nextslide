import { useCallback, useRef } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { useDeckStore } from '@/stores/deckStore';
import { useEditorStore } from '@/stores/editorStore';
import { deckSyncService } from '@/lib/deckSyncService';
import type { DeckDiff } from '@/utils/apiUtils';
import { isValidDeckDiff } from '@/utils/deckDiffUtils';
import type AgentChatClient from '@/services/agentChat';
import type { ExtendedChatMessageProps } from '@/components/chat';
import { formatSelectionLabel, humanizeSystemPhrases } from '../utils/selectionLabelFormatter';
import { getFunToolName, formatSkillName, formatModelName } from '../utils/toolNameFormatter';

interface UseAgentEventsOptions {
  setMessages: Dispatch<SetStateAction<ExtendedChatMessageProps[]>>;
  applyDeckDiffRespectingEditMode: (diff: DeckDiff, isEditDiff?: boolean) => void;
  applyPreviewSlidesRespectingEditMode: (slides: any[], isAgentEdit?: boolean) => void;
  setCurrentSlideIndexSafe: (index: number) => void;
  agentClientRef: React.MutableRefObject<AgentChatClient | null>;
  agentSessionId: string | null;
}

export function useAgentEvents({
  setMessages,
  applyDeckDiffRespectingEditMode,
  applyPreviewSlidesRespectingEditMode,
  setCurrentSlideIndexSafe,
  agentClientRef,
  agentSessionId,
}: UseAgentEventsOptions) {
  const planMsgIdRef = useRef<string | null>(null);
  const planCreatedAtRef = useRef<number | null>(null);
  const planTimersRef = useRef<number[]>([]);
  const agentProgressMsgIdRef = useRef<string | null>(null);
  const agentFlowLockoutUntilRef = useRef<number>(0);
  const proposedDiffsRef = useRef<Map<string, any>>(new Map());
  const pendingDiffsByMessageIdRef = useRef<Map<string, DeckDiff>>(new Map());
  const pendingSlidesByMessageIdRef = useRef<Map<string, any[]>>(new Map());
  const toolDedupRef = useRef<Map<string, number>>(new Map());
  const TOOL_DEDUP_WINDOW_MS = 2500;
  const processedEditEventsRef = useRef<Set<string>>(new Set());
  const styleToolStateRef = useRef<{ active: boolean; name: string; lastStartTs: number; lastFinishTs: number }>({ active: false, name: '', lastStartTs: 0, lastFinishTs: 0 });
  const streamingAiMsgIdRef = useRef<string | null>(null);
  const agentEditTimeoutRef = useRef<number | null>(null);

  const clearPlanTimers = useCallback(() => {
    try {
      planTimersRef.current.forEach((id) => clearTimeout(id));
    } catch { }
    planTimersRef.current = [];
  }, []);

  const clearAgentEditTimeout = useCallback(() => {
    if (agentEditTimeoutRef.current) {
      clearTimeout(agentEditTimeoutRef.current);
      agentEditTimeoutRef.current = null;
    }
  }, []);

  const scheduleAgentEditTimeout = useCallback(() => {
    clearAgentEditTimeout();
    if (typeof window === 'undefined') return;
    agentEditTimeoutRef.current = window.setTimeout(() => {
      agentEditTimeoutRef.current = null;
      if ((window as any).__agentEditInProgress !== true) return;

      console.warn('[AgentChat] Agent edit appears stuck - forcing refresh');
      try {
        if ((window as any).__pendingPreviewTs) delete (window as any).__pendingPreviewTs;
        if ((window as any).__pendingPreviewEditId) delete (window as any).__pendingPreviewEditId;
        (window as any).__agentEditInProgress = false;
      } catch { }

      try {
        const deckStore = useDeckStore.getState();
        const deckIdToRefresh = deckStore.deckData?.uuid || (deckStore.deckData as any)?.id;
        if (!deckIdToRefresh) return;
        deckSyncService.getFullDeck(String(deckIdToRefresh))
          .then((latest) => {
            if (latest && (latest as any).slides) {
              deckStore.updateDeckData(latest as any, { skipBackend: true, isRealtimeUpdate: true });
            }
            if (typeof window !== 'undefined' && (window as any).__isEditMode) {
              const navContext = (window as any).__navigationContext;
              const currentSlideIdx = navContext?.currentSlideIndex || 0;
              const currentSlideId = deckStore.deckData?.slides?.[currentSlideIdx]?.id;
              if (currentSlideId) {
                const editorStore = useEditorStore.getState();
                editorStore.clearDraftComponents(currentSlideId);
                editorStore.initializeDraftComponents(currentSlideId);
              }
            }
          })
          .catch(() => {
            try {
              const deckStore = useDeckStore.getState();
              if ((deckStore as any).loadDeck) {
                (deckStore as any).loadDeck();
              }
            } catch { }
          });
      } catch { }
    }, 8000);
  }, [clearAgentEditTimeout]);

  const getCustomComponentUpdateTargets = useCallback((diff?: DeckDiff | null): Array<{ slideId: string; componentId: string }> => {
    if (!diff) return [];
    const targets: Array<{ slideId: string; componentId: string }> = [];
    (diff.slides_to_update || []).forEach((slideDiff: any) => {
      const slideId = slideDiff?.slide_id || slideDiff?.id;
      if (!slideId) return;
      (slideDiff.components_to_update || []).forEach((compDiff: any) => {
        if (!compDiff?.id) return;
        const hasRender = typeof compDiff?.props?.render === 'string';
        const isCustomType = compDiff?.type === 'CustomComponent';
        if (hasRender || isCustomType) {
          targets.push({ slideId, componentId: compDiff.id });
        }
      });
    });
    return targets;
  }, []);

  const schedulePostApplyRefresh = useCallback((options: {
    diff?: DeckDiff | null;
    editedSlideId?: string | null;
    preEditSnapshot?: any;
  }) => {
    const { diff, editedSlideId, preEditSnapshot } = options;
    const targets = getCustomComponentUpdateTargets(diff);
    if (targets.length === 0) return;

    setTimeout(async () => {
      try {
        const deckStore = useDeckStore.getState();
        const deckIdToRefresh = deckStore.deckData?.uuid || (deckStore.deckData as any)?.id;
        if (!deckIdToRefresh) return;

        const targetSlideId = editedSlideId || targets[0]?.slideId;
        const currentSlide = targetSlideId
          ? deckStore.deckData?.slides?.find((s: any) => s.id === targetSlideId)
          : null;
        const prevSlide = targetSlideId
          ? preEditSnapshot
          : null;

        let hasLocalChange = false;
        if (currentSlide && prevSlide) {
          targets.forEach((target) => {
            if (target.slideId !== currentSlide.id) return;
            const currentComp = currentSlide.components?.find((c: any) => c.id === target.componentId);
            const prevComp = prevSlide.components?.find((c: any) => c.id === target.componentId);
            if (!currentComp) return;
            if (!prevComp) {
              hasLocalChange = true;
              return;
            }
            if (currentComp.props?.render !== prevComp.props?.render) {
              hasLocalChange = true;
            }
          });
        }

        if (hasLocalChange) return;

        const latest = await deckSyncService.getFullDeck(String(deckIdToRefresh));
        if (latest && (latest as any).slides) {
          deckStore.updateDeckData(latest as any, { skipBackend: true, isRealtimeUpdate: true });
        }

        if (typeof window !== 'undefined' && (window as any).__isEditMode) {
          const navContext = (window as any).__navigationContext;
          const currentSlideIdx = navContext?.currentSlideIndex || 0;
          const refreshSlideId = targetSlideId || deckStore.deckData?.slides?.[currentSlideIdx]?.id;
          if (refreshSlideId) {
            const editorStore = useEditorStore.getState();
            editorStore.clearDraftComponents(refreshSlideId);
            editorStore.initializeDraftComponents(refreshSlideId);
          }
        }
      } catch { }
    }, 900);
  }, [getCustomComponentUpdateTargets]);

  const animatePlanMessage = useCallback((steps: string[]) => {
    if (!steps || steps.length === 0) return;
    clearPlanTimers();
    const now = Date.now();
    const createNew = !planMsgIdRef.current || (planCreatedAtRef.current !== null && (now - planCreatedAtRef.current) > 2000);
    if (createNew) {
      const id = `plan-${now}`;
      planMsgIdRef.current = id;
      planCreatedAtRef.current = now;
      setMessages(prev => [...prev, { id, type: 'system', message: 'Planning', timestamp: new Date(), feedback: null, metadata: { type: 'agent_plan', steps: [steps[0]] } }]);
    } else {
      const id = planMsgIdRef.current!;
      setMessages(prev => prev.map(m => {
        if (m.id !== id) return m;
        const existingSteps = Array.isArray(m.metadata?.steps) ? m.metadata.steps as string[] : [];
        const nextSteps = existingSteps.length > 0 ? existingSteps : [steps[0]];
        return { ...m, message: 'Planning', metadata: { ...m.metadata, type: 'agent_plan', steps: nextSteps } };
      }));
    }
    for (let i = 1; i < steps.length; i++) {
      const timeoutId = window.setTimeout(() => {
        const mid = planMsgIdRef.current;
        if (!mid) return;
        setMessages(prev => prev.map(m => m.id === mid ? { ...m, metadata: { ...m.metadata, steps: steps.slice(0, i + 1) } } : m));
      }, i * 1500);
      planTimersRef.current.push(timeoutId);
    }
  }, [clearPlanTimers, setMessages]);

  const appendSelectionRow = useCallback((label: string) => {
    const now = Date.now();
    const friendly = formatSelectionLabel(label);
    setMessages(prev => [...prev, {
      id: `sel-${now}-${Math.random().toString(36).slice(2, 6)}`, type: 'system', message: `Using selection: ${friendly}`,
      timestamp: new Date(), feedback: null, metadata: { type: 'agent_selection', compactRow: true }
    }]);
  }, [setMessages]);

  const appendToolRow = useCallback((tool: string, status: string) => {
    const now = Date.now();
    if (now < agentFlowLockoutUntilRef.current) return;
    const key = `${status}:${tool}`;
    const last = toolDedupRef.current.get(key) || 0;
    if (now - last < TOOL_DEDUP_WINDOW_MS) return;
    toolDedupRef.current.set(key, now);
    toolDedupRef.current.forEach((t, k) => { if (now - t > TOOL_DEDUP_WINDOW_MS * 3) toolDedupRef.current.delete(k); });

    if (status === 'start' && tool) {
      const funName = getFunToolName(tool);
      setMessages(prev => [...prev, {
        id: `tool-${now}-${Math.random().toString(36).slice(2, 6)}`,
        type: 'system',
        message: funName,
        timestamp: new Date(),
        feedback: null,
        metadata: { type: 'agent_tool', tool, status }
      }]);
    }
  }, [setMessages]);

  const upsertAgentProgressRow = useCallback((phase?: string, percent?: number, respectLockout = false) => {
    if (respectLockout && Date.now() < agentFlowLockoutUntilRef.current) return;
    const existingId = agentProgressMsgIdRef.current;
    const text = `${phase || 'Working'}… ${percent ?? 0}%`;
    if (existingId) {
      setMessages(prev => prev.map(m => m.id === existingId ? { ...m, message: text, metadata: { ...m.metadata, type: 'progress', compactRow: true, phase, percent } } : m));
    } else {
      const id = `progress-${Date.now()}`;
      agentProgressMsgIdRef.current = id;
      setMessages(prev => [...prev, { id, type: 'system', message: text, timestamp: new Date(), feedback: null, metadata: { type: 'progress', compactRow: true, phase, percent } }]);
    }
  }, [setMessages]);

  const handleAssistantMessageDelta = useCallback((evt: any): boolean => {
    if (evt?.type !== 'assistant.message.delta') return false;
    const rawDelta = (evt as any).data?.delta || '';
    const trimmed = String(rawDelta).trim();
    if (!streamingAiMsgIdRef.current && (trimmed === '' || /^\d+$/.test(trimmed))) {
      return true;
    }
    const id = streamingAiMsgIdRef.current || `ai-stream-${Date.now()}`;
    if (!streamingAiMsgIdRef.current) {
      streamingAiMsgIdRef.current = id;
      setMessages(prev => [...prev, {
        id,
        type: 'ai',
        message: '',
        timestamp: new Date(),
        feedback: null,
        metadata: { isStreamingUpdate: true, streamed: true }
      }]);
    }
    setMessages(prev => prev.map(m => {
      if (m.id !== id) return m;
      const current = String(m.message || '');
      if (current.trim().length === 0 && /^\d+$/.test(trimmed)) {
        return m;
      }
      const next = humanizeSystemPhrases(current + rawDelta);
      return { ...m, message: next, metadata: { ...m.metadata, isStreamingUpdate: true, streamed: true } };
    }));
    return true;
  }, [setMessages]);

  const finalizeStreamingAiMessage = useCallback((preferredId?: string) => {
    const initialId = preferredId || streamingAiMsgIdRef.current;
    setMessages(prev => {
      let resolvedId = initialId;
      let target = resolvedId ? prev.find(m => m.id === resolvedId) : undefined;

      if (!target) {
        const fallback = [...prev].reverse().find(m => m.type === 'ai' && m.metadata?.isStreamingUpdate);
        if (!fallback) return prev;
        resolvedId = fallback.id;
        target = fallback;
      }

      const text = String(target.message ?? '').trim();

      // Don't delete empty/numeric messages - just mark them as finalized
      // The edit_applied message will be associated with this AI message
      // and ChatMessageList will handle display appropriately
      const humanized = text && !/^\d+$/.test(text) ? humanizeSystemPhrases(text) : '';

      return prev.map(m => m.id === resolvedId ? {
        ...m,
        message: humanized,
        metadata: { ...m.metadata, isStreamingUpdate: false, streamed: true }
      } : m);
    });

    streamingAiMsgIdRef.current = null;
  }, [setMessages]);

  const handleAssistantMessageComplete = useCallback((evt: any): boolean => {
    if (evt?.type !== 'assistant.message.complete') return false;
    const doneId = (evt as any).data?.messageId;
    finalizeStreamingAiMessage(doneId);

    clearPlanTimers();
    if (planMsgIdRef.current) {
      const planId = planMsgIdRef.current;
      setMessages(prev => prev.filter(m => m.id !== planId));
      planMsgIdRef.current = null;
      planCreatedAtRef.current = null;
    }
    return true;
  }, [clearPlanTimers, finalizeStreamingAiMessage, setMessages]);

  const handleLinkedInProfiles = useCallback((evt: any, source: 'primary' | 'secondary'): boolean => {
    if (evt?.type !== 'assistant.linkedin_profiles') return false;
    const { query, profiles: rawProfiles, isLoading, note, error } = (evt as any).data || {};
    const profiles = rawProfiles || [];
    const prefix = source === 'secondary' ? '[LinkedIn-Secondary]' : '[LinkedIn]';
    console.log(`${prefix} Event received:`, { query, profileCount: profiles.length, isLoading, profiles, note, error });
    const linkedinMsgId = `linkedin-${Date.now()}`;

    if (isLoading) {
      setMessages(prev => [...prev, {
        id: linkedinMsgId,
        type: 'ai',
        message: `Searching LinkedIn for "${query}"...`,
        timestamp: new Date(),
        feedback: null,
        metadata: {
          type: 'linkedin_profiles',
          query,
          profiles: [],
          isLoading: true
        }
      }]);
      return true;
    }

    setMessages(prev => {
      const loadingMsgIndex = prev.findIndex(m =>
        m.metadata?.type === 'linkedin_profiles' &&
        m.metadata?.query === query &&
        m.metadata?.isLoading === true
      );

      const resultMsg = {
        id: loadingMsgIndex >= 0 ? prev[loadingMsgIndex].id : linkedinMsgId,
        type: 'ai' as const,
        message: profiles.length > 0
          ? `Found ${profiles.length} profile${profiles.length === 1 ? '' : 's'} for "${query}"`
          : `No profiles found for "${query}"`,
        timestamp: new Date(),
        feedback: null,
        metadata: {
          type: 'linkedin_profiles',
          query,
          profiles,
          isLoading: false
        }
      };

      if (loadingMsgIndex >= 0) {
        return prev.map((m, i) => i === loadingMsgIndex ? resultMsg : m);
      }
      return [...prev, resultMsg];
    });
    return true;
  }, [setMessages]);

  const isStyleTool = useCallback((toolName?: string): boolean => {
    const t = (toolName || '').toLowerCase();
    return (
      t.includes('style') && (t.includes('slide') || t.includes('deck') || t.includes('theme'))
    ) || t === 'style_slide' || t === 'style_slides' || t === 'apply_style' || t === 'apply_theme';
  }, []);

  const handleToolEvent = useCallback((evt: any, source: 'primary' | 'secondary'): boolean => {
    if (!evt?.type?.startsWith('agent.tool.')) return false;
    const { tool } = (evt as any).data || {};
    const statusFromType = evt.type.replace('agent.tool.', '');
    const status = (evt as any).data?.status || statusFromType;
    const logLabel = source === 'secondary' ? '[ChatPanel] Tool event (secondary):' : '[ChatPanel] Tool event:';
    console.log(logLabel, { type: evt.type, tool, status });
    appendToolRow(tool, status);
    if (isStyleTool(tool)) {
      if (status === 'start') {
        styleToolStateRef.current = { active: true, name: tool, lastStartTs: Date.now(), lastFinishTs: styleToolStateRef.current.lastFinishTs };
      } else if (status === 'finish' || status === 'error') {
        styleToolStateRef.current = { active: false, name: tool, lastStartTs: styleToolStateRef.current.lastStartTs, lastFinishTs: Date.now() };
      }
    }
    return true;
  }, [appendToolRow, isStyleTool]);

  const handleAgentStatusEvent = useCallback((evt: any, source: 'primary' | 'secondary'): boolean => {
    // Handle granular status events: verifying, verification_warning
    // NOTE: agent.analyzing removed - was too noisy
    const statusEvents = ['agent.verifying', 'agent.verification_warning'];
    if (!evt?.type || !statusEvents.includes(evt.type)) return false;

    const logLabel = source === 'secondary' ? '[ChatPanel] Status event (secondary):' : '[ChatPanel] Status event:';
    console.log(logLabel, { type: evt.type, data: evt.data });

    // Show these as compact tool rows using the fun names from toolNameFormatter
    const now = Date.now();
    const key = evt.type;
    const last = toolDedupRef.current.get(key) || 0;
    if (now - last < TOOL_DEDUP_WINDOW_MS) return true; // Deduplicate
    toolDedupRef.current.set(key, now);

    const funName = getFunToolName(evt.type);
    setMessages(prev => [...prev, {
      id: `status-${now}-${Math.random().toString(36).slice(2, 6)}`,
      type: 'system',
      message: funName,
      timestamp: new Date(),
      feedback: null,
      metadata: { type: 'agent_status', eventType: evt.type, compactRow: true }
    }]);

    return true;
  }, [setMessages]);

  // Append inline thinking/action step (brown text, no bubble)
  const appendInlineStep = useCallback((step: string, type: 'thinking' | 'action') => {
    const now = Date.now();
    // Deduplicate rapid events
    const key = `${type}:${step}`;
    const last = toolDedupRef.current.get(key) || 0;
    if (now - last < 1000) return; // 1s dedup
    toolDedupRef.current.set(key, now);

    setMessages(prev => [...prev, {
      id: `${type}-${now}-${Math.random().toString(36).slice(2, 6)}`,
      type: 'system',
      message: step,
      timestamp: new Date(),
      feedback: null,
      metadata: {
        type: `agent_${type}` as const,
        compactRow: true,
        inlineStep: true
      }
    }]);
  }, [setMessages]);

  const handleCommonAgentEvent = useCallback((
    evt: any,
    source: 'primary' | 'secondary',
    options?: { respectProgressLockout?: boolean }
  ): boolean => {
    if (!evt || !evt.type) return false;
    if (handleAssistantMessageDelta(evt)) return true;
    if (handleAssistantMessageComplete(evt)) return true;
    if (handleLinkedInProfiles(evt, source)) return true;

    // Helper to clean raw context patterns from displayed text
    const cleanRawContext = (text: string): string => {
      if (!text) return text;
      return text
        .replace(/\[USER_SELECTIONS?\]?[^\n]*/gi, '')  // Remove [USER_SELECTION] and everything after
        .replace(/\[SLIDE_CONTEXT[^\]]*\]?/gi, '')
        .replace(/\[CONTEXT[^\]]*\]?/gi, '')
        .replace(/@slide-[a-zA-Z0-9-]+/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    };

    // Handle new inline events (agent.thinking, agent.action)
    if (evt.type === 'agent.thinking') {
      const data = (evt as any).data || {};
      const step = cleanRawContext(data.step || '');
      // Simplified display - just show step or "Processing"
      // (removed skill/model display for cleaner UI)
      const displayStep = step || 'Processing';
      appendInlineStep(displayStep, 'thinking');
      return true;
    }
    if (evt.type === 'agent.action') {
      const data = (evt as any).data || {};
      const action = cleanRawContext(data.action || 'Processing');
      const tool = data.tool;
      // Skip if action is empty after cleaning
      if (!action) return true;
      // Include tool info if available
      let displayAction = action;
      if (tool) {
        displayAction = `${getFunToolName(tool)}: ${action}`;
      }
      appendInlineStep(displayAction, 'action');
      return true;
    }

    // Legacy plan update - still supported but can be replaced with inline steps
    if (evt.type === 'agent.plan.update') {
      const steps: string[] = (evt as any).data?.plan?.map((s: any) => s.title) || [];
      // Instead of animatePlanMessage (bubble), emit as inline steps
      steps.forEach((step, i) => {
        setTimeout(() => appendInlineStep(step, 'action'), i * 200);
      });
      return true;
    }
    if (evt.type === 'agent.selection.using' || evt.type === 'agent.selection') {
      const label = (evt as any).data?.label || (evt as any).data?.selection || 'selection';
      appendSelectionRow(label);
      return true;
    }
    if (handleToolEvent(evt, source)) return true;
    if (handleAgentStatusEvent(evt, source)) return true; // Handle analyzing, verifying, etc.
    if (evt.type === 'progress.update') {
      const { phase, percent } = (evt as any).data || {};
      upsertAgentProgressRow(phase, percent, options?.respectProgressLockout === true);
      return true;
    }
    return false;
  }, [appendInlineStep, appendSelectionRow, handleAssistantMessageComplete, handleAssistantMessageDelta, handleLinkedInProfiles, handleToolEvent, handleAgentStatusEvent, upsertAgentProgressRow]);

  const normalizeSlidesPayload = useCallback((payloadSlides: any[]): any[] => {
    if (!Array.isArray(payloadSlides) || payloadSlides.length === 0) return [];
    try {
      return payloadSlides
        .map((entry: any) => {
          if (!entry) return null;
          if (entry.slide && typeof entry.slide === 'object') return entry.slide;
          return typeof entry === 'object' ? entry : null;
        })
        .filter((slide: any) => slide && typeof slide.id === 'string');
    } catch {
      return [];
    }
  }, []);

  const captureImmediateSnapshot = useCallback((options: {
    isNewSlide: boolean;
    diffSlidesToAdd: any[];
    editedSlideId?: string | null;
  }) => {
    const { isNewSlide, diffSlidesToAdd, editedSlideId } = options;
    try {
      const deckStore = useDeckStore.getState();
      const slides = deckStore.deckData?.slides || [];

      if (isNewSlide && diffSlidesToAdd[0]) {
        return JSON.parse(JSON.stringify(diffSlidesToAdd[0]));
      }

      const editedSlide = editedSlideId ? slides.find((s: any) => s.id === editedSlideId) : null;
      const currentIdx = deckStore.currentSlideIndex || 0;
      const targetSlide = editedSlide || slides[currentIdx] || slides[0];
      if (targetSlide) {
        return JSON.parse(JSON.stringify(targetSlide));
      }
    } catch (e) {
      console.error('[AgentChat] Snapshot capture failed:', e);
    }
    return null;
  }, []);

  const insertEditAppliedMessage = useCallback((options: {
    messageId: string;
    immediateSnapshot: any;
    preEditSnapshot: any;
    editId?: string;
    editSummary: string;
  }) => {
    const { messageId, immediateSnapshot, preEditSnapshot, editId, editSummary } = options;
    setMessages(prev => {
      const newMsg = {
        id: messageId,
        type: 'system' as const,
        message: `✅ Edit applied`,
        timestamp: new Date(),
        feedback: null,
        metadata: {
          type: 'edit_applied',
          compactRow: false,
          showIcon: false,
          slideSnapshot: immediateSnapshot,
          preEditSnapshot,
          editId,
          editSummary
        }
      };

      let lastAiIndex = -1;
      for (let i = prev.length - 1; i >= 0; i--) {
        if (prev[i].type === 'ai') {
          lastAiIndex = i;
          break;
        }
      }

      if (lastAiIndex >= 0) {
        const result = [...prev];
        result.splice(lastAiIndex + 1, 0, newMsg);
        return result;
      }
      return [...prev, newMsg];
    });
  }, [setMessages]);

  const insertEditAppliedFallbackMessage = useCallback((editId?: string) => {
    setMessages(prev => [...prev, {
      id: `applied-error-${Date.now()}`,
      type: 'system',
      message: `✅ Edit applied`,
      timestamp: new Date(),
      feedback: null,
      metadata: {
        type: 'edit_applied',
        compactRow: false,
        slideSnapshot: null,
        preEditSnapshot: null,
        editId
      }
    }]);
  }, [setMessages]);

  const handleDeckEditApplied = useCallback((evt: any, source: 'primary' | 'secondary'): boolean => {
    if (evt?.type !== 'deck.edit.applied') return false;
    const isPrimary = source === 'primary';
    let appliedDiff: DeckDiff | null = null;

    try {
      clearAgentEditTimeout();
      if (!isPrimary) {
        console.warn('[ChatPanel:secondary] 🎯🎯🎯 deck.edit.applied EVENT RECEIVED (secondary)! 🎯🎯🎯', evt);
      }

      clearPlanTimers();
      if (planMsgIdRef.current) {
        const planId = planMsgIdRef.current;
        setMessages(prev => prev.filter(m => m.id !== planId));
        planMsgIdRef.current = null;
        planCreatedAtRef.current = null;
      }

      finalizeStreamingAiMessage();

      if (!processedEditEventsRef.current) {
        processedEditEventsRef.current = new Set();
      }
      const eventKey = `${(evt as any).data?.editId || ''}-${(evt as any).timestamp || Date.now()}`;
      if (processedEditEventsRef.current.has(eventKey)) {
        return true;
      }
      processedEditEventsRef.current.add(eventKey);
      setTimeout(() => processedEditEventsRef.current?.delete(eventKey), 10000);

      const appliedEditId = (evt as any).data?.editId;
      const appliedMessageId = (evt as any).messageId;
      let normalizedAppliedSlides = normalizeSlidesPayload((evt as any).data?.slides);

      const deckDiff = (evt as any).data?.deck_diff;
      // DEBUG: Log font props in incoming deck_diff
      if (deckDiff) {
        try {
          const slidesToUpdate = deckDiff.slides_to_update || [];
          slidesToUpdate.forEach((slideDiff: any) => {
            const compUpdates = slideDiff.components_to_update || [];
            compUpdates.forEach((compDiff: any) => {
              const allProps = compDiff.props || {};
              const fontKeys = Object.keys(allProps).filter((k: string) => k.toLowerCase().includes('font'));
              if (fontKeys.length > 0) {
                console.log('[DeckEditApplied] 📨 SSE deck_diff has font props:', {
                  slideId: slideDiff.slide_id,
                  componentId: compDiff.id?.slice(0, 12),
                  fontProps: fontKeys.map((k: string) => `${k}=${allProps[k]}`),
                });
              }
            });
          });
        } catch (e) {
          console.warn('[DeckEditApplied] DEBUG log failed:', e);
        }
      }
      if (deckDiff && isValidDeckDiff(deckDiff)) {
        appliedDiff = deckDiff;
        applyDeckDiffRespectingEditMode(deckDiff, true);
      }

      // Handle theme_updates (for font/color changes) - same logic as in handleDeckPreviewDiff
      const themeUpdates = (evt as any).data?.theme_updates;
      if (themeUpdates) {
        console.log('[DeckEditApplied] Applying theme_updates:', themeUpdates);
        try {
          const deckStore = useDeckStore.getState();
          const currentDeck = deckStore.deckData;
          if (currentDeck) {
            const currentTheme = currentDeck.theme || {};
            const updatedTheme = { ...currentTheme };

            if (themeUpdates.typography) {
              updatedTheme.typography = {
                ...(updatedTheme.typography || {}),
                ...themeUpdates.typography
              };
              console.log('[DeckEditApplied] Updated typography:', updatedTheme.typography);
            }

            if (themeUpdates.color_palette) {
              updatedTheme.color_palette = {
                ...(updatedTheme.color_palette || {}),
                ...themeUpdates.color_palette
              };
            }

            const updatedDeck = { ...currentDeck, theme: updatedTheme };

            // Also update palette at deck level for consistency
            if (themeUpdates.typography) {
              const currentPalette = currentDeck.palette || {};
              const fonts = [
                themeUpdates.typography.hero_font,
                themeUpdates.typography.body_font
              ].filter(Boolean);
              if (fonts.length > 0) {
                (updatedDeck as any).palette = { ...currentPalette, fonts };
              }
            }

            // Update deck data (skipBackend: true since backend already saved)
            deckStore.updateDeckData(updatedDeck, { skipBackend: true });
            console.log('[DeckEditApplied] Theme update applied successfully');
          }
        } catch (e) {
          console.error('[DeckEditApplied] Failed to apply theme_updates:', e);
        }
      }

      if (appliedMessageId) {
        pendingDiffsByMessageIdRef.current.delete(appliedMessageId);
        if (normalizedAppliedSlides.length === 0) {
          const cachedSlides = pendingSlidesByMessageIdRef.current.get(appliedMessageId);
          if (Array.isArray(cachedSlides) && cachedSlides.length > 0) {
            normalizedAppliedSlides = cachedSlides;
          }
        }
        pendingSlidesByMessageIdRef.current.delete(appliedMessageId);
      }
      const preEditSnapshot = (window as any).__preEditSlideSnapshot || null;
      (window as any).__preEditSlideSnapshot = null;

      const editSummary = (evt as any).data?.summary || '';

      const diffSlidesToUpdate = (evt as any).data?.deck_diff?.slides_to_update || [];
      const diffSlidesToAdd = (evt as any).data?.deck_diff?.slides_to_add || [];
      const editedSlideId = diffSlidesToAdd[0]?.id || diffSlidesToUpdate[0]?.slide_id || diffSlidesToUpdate[0]?.id || preEditSnapshot?.id;
      const isNewSlide = diffSlidesToAdd.length > 0;

      const messageId = `applied-${Date.now()}`;
      if (isPrimary) {
        (window as any).__pendingPostEditCapture = {
          messageId,
          editedSlideId,
          preEditSnapshot,
          editId: appliedEditId,
          editSummary
        };
      }

      const immediateSnapshot = captureImmediateSnapshot({
        isNewSlide,
        diffSlidesToAdd,
        editedSlideId,
      });

      if (isNewSlide && editedSlideId) {
        setTimeout(() => {
          try {
            const deckStore = useDeckStore.getState();
            const slides = deckStore.deckData?.slides || [];
            const newSlideIndex = slides.findIndex((s: any) => s.id === editedSlideId);
            if (newSlideIndex >= 0) {
              setCurrentSlideIndexSafe(newSlideIndex);
            }
          } catch (e) {
            console.warn('[AgentChat] Failed to auto-navigate to new slide:', e);
          }
        }, 700);
      }

      const logPrefix = isPrimary ? '[AgentChat:primary]' : '[AgentChat:secondary]';
      console.log(`${logPrefix} Creating edit_applied message:`, {
        hasImmediateSnapshot: !!immediateSnapshot,
        immediateSnapshotId: immediateSnapshot?.id,
        componentCount: immediateSnapshot?.components?.length || 0,
        hasPreEditSnapshot: !!preEditSnapshot,
        editId: appliedEditId
      });

      insertEditAppliedMessage({
        messageId,
        immediateSnapshot,
        preEditSnapshot,
        editId: appliedEditId,
        editSummary
      });

      if (immediateSnapshot && agentClientRef.current && agentSessionId) {
        if (isPrimary) {
          setTimeout(() => {
            const pendingCapture = (window as any).__pendingPostEditCapture;
            if (pendingCapture && pendingCapture.messageId === messageId) {
              agentClientRef.current?.saveSlideSnapshot(agentSessionId, immediateSnapshot, editSummary, appliedEditId, preEditSnapshot)
                .catch(err => console.warn('[AgentChat] Failed to persist immediate slideSnapshot:', err));
            }
          }, 500);
        } else {
          agentClientRef.current.saveSlideSnapshot(agentSessionId, immediateSnapshot, editSummary, appliedEditId, preEditSnapshot)
            .catch(err => console.warn('[AgentChat] Failed to persist slideSnapshot (secondary):', err));
        }
      }

      if (isPrimary) {
        agentFlowLockoutUntilRef.current = Date.now() + 1500;

        try {
          const editId = appliedEditId;
          let diff = editId ? proposedDiffsRef.current.get(editId) : undefined;

          if (!diff && (evt as any).data?.deck_diff) {
            diff = (evt as any).data.deck_diff;
          }

          if (diff) {
            appliedDiff = diff as DeckDiff;
            applyDeckDiffRespectingEditMode(diff, true);

            setTimeout(() => {
              const after = useDeckStore.getState().deckData;
              const pendingCapture = (window as any).__pendingPostEditCapture;
              if (pendingCapture) {
                const { messageId, editedSlideId, preEditSnapshot, editId: capturedEditId, editSummary } = pendingCapture;
                delete (window as any).__pendingPostEditCapture;

                const slides = after?.slides || [];
                const postEditSlide = editedSlideId
                  ? slides.find((s: any) => s.id === editedSlideId)
                  : slides[0];

                if (postEditSlide) {
                  const postEditSnapshot = JSON.parse(JSON.stringify(postEditSlide));

                  setMessages(prev => prev.map(msg =>
                    msg.id === messageId
                      ? {
                          ...msg,
                          metadata: {
                            ...msg.metadata,
                            slideSnapshot: postEditSnapshot,
                            preEditSnapshot,
                          }
                        }
                      : msg
                  ));

                  if (agentClientRef.current && agentSessionId) {
                    agentClientRef.current.saveSlideSnapshot(agentSessionId, postEditSnapshot, editSummary, capturedEditId, preEditSnapshot)
                      .catch(err => console.warn('[AgentChat] Failed to persist slideSnapshot:', err));
                  }
                }
              }
            }, 100);

            proposedDiffsRef.current.delete(editId);

            try {
              const editorStore = useEditorStore.getState();
              ((diff as any).slides_to_update || []).forEach((slideDiff: any) => {
                if (slideDiff?.slide_id && typeof editorStore.markSlideAsUnchanged === 'function') {
                  editorStore.markSlideAsUnchanged(slideDiff.slide_id);
                }
              });
            } catch { }

            try {
              (window as any).__lastAgentEditTs = Date.now();
              (window as any).__agentEditInProgress = false;

              if ((window as any).__enteredEditModeDuringAgentEdit && (window as any).__isEditMode) {
                const freshEditorStore = useEditorStore.getState();
                const freshDeckData = useDeckStore.getState().deckData;
                const navContext = (window as any).__navigationContext;
                const currentSlideIdx = navContext?.currentSlideIndex || 0;
                const currentSlide = freshDeckData.slides?.[currentSlideIdx];
                if (currentSlide?.id) {
                  freshEditorStore.clearDraftComponents(currentSlide.id);
                  freshEditorStore.initializeDraftComponents(currentSlide.id);
                }
                delete (window as any).__enteredEditModeDuringAgentEdit;
              }

              setTimeout(() => {
                if ((window as any).__pendingPreviewTs) delete (window as any).__pendingPreviewTs;
                if ((window as any).__pendingPreviewEditId) delete (window as any).__pendingPreviewEditId;
              }, 2000);
            } catch { }
          } else {
            if (!diff && appliedMessageId) {
              diff = pendingDiffsByMessageIdRef.current.get(appliedMessageId);
              if (diff) {
                pendingDiffsByMessageIdRef.current.delete(appliedMessageId);
              }
            }
            if (!diff && (evt as any).data?.deck_diff) {
              diff = (evt as any).data.deck_diff;
            }
            if (diff) {
              appliedDiff = diff as DeckDiff;
              applyDeckDiffRespectingEditMode(diff, true);

              try {
                const editorStore = useEditorStore.getState();
                ((diff as any).slides_to_update || []).forEach((slideDiff: any) => {
                  if (slideDiff?.slide_id && typeof editorStore.markSlideAsUnchanged === 'function') {
                    editorStore.markSlideAsUnchanged(slideDiff.slide_id);
                  }
                });
              } catch { }

              try {
                (window as any).__lastAgentEditTs = Date.now();
                (window as any).__agentEditInProgress = false;

                if ((window as any).__enteredEditModeDuringAgentEdit && (window as any).__isEditMode) {
                  const freshEditorStore = useEditorStore.getState();
                  const freshDeckData = useDeckStore.getState().deckData;
                  const navContext = (window as any).__navigationContext;
                  const currentSlideIdx = navContext?.currentSlideIndex || 0;
                  const currentSlide = freshDeckData.slides?.[currentSlideIdx];
                  if (currentSlide?.id) {
                    freshEditorStore.clearDraftComponents(currentSlide.id);
                    freshEditorStore.initializeDraftComponents(currentSlide.id);
                  }
                  delete (window as any).__enteredEditModeDuringAgentEdit;
                }

                setTimeout(() => {
                  if ((window as any).__pendingPreviewTs) delete (window as any).__pendingPreviewTs;
                  if ((window as any).__pendingPreviewEditId) delete (window as any).__pendingPreviewEditId;
                }, 2000);
              } catch { }
            } else {
              try {
                if ((window as any).__pendingPreviewTs) delete (window as any).__pendingPreviewTs;
                if ((window as any).__pendingPreviewEditId) delete (window as any).__pendingPreviewEditId;
                (window as any).__agentEditInProgress = false;

                if ((window as any).__enteredEditModeDuringAgentEdit && (window as any).__isEditMode) {
                  const freshEditorStore = useEditorStore.getState();
                  const freshDeckData = useDeckStore.getState().deckData;
                  const navContext = (window as any).__navigationContext;
                  const currentSlideIdx = navContext?.currentSlideIndex || 0;
                  const currentSlide = freshDeckData.slides?.[currentSlideIdx];
                  if (currentSlide?.id) {
                    freshEditorStore.clearDraftComponents(currentSlide.id);
                    freshEditorStore.initializeDraftComponents(currentSlide.id);
                  }
                  delete (window as any).__enteredEditModeDuringAgentEdit;
                }

              } catch { }

              if (normalizedAppliedSlides.length > 0) {
                applyPreviewSlidesRespectingEditMode(normalizedAppliedSlides, true);
              } else {
                setTimeout(() => {
                  (async () => {
                    try {
                      const deckStore = useDeckStore.getState();
                      const deckIdToRefresh = deckStore.deckData?.uuid || (deckStore.deckData as any)?.id;
                      if (!deckIdToRefresh) return;
                      const latest = await deckSyncService.getFullDeck(String(deckIdToRefresh));
                      if (latest && (latest as any).slides) {
                        deckStore.updateDeckData(latest as any, { skipBackend: true, isRealtimeUpdate: true });
                        return;
                      }
                    } catch (e) {
                      console.warn('[Realtime][edit.applied] Forced refetch failed (non-fatal)', e);
                    }
                    try {
                      const deckStore = useDeckStore.getState();
                      if ((deckStore as any).loadDeck) {
                        (deckStore as any).loadDeck();
                      }
                    } catch { }
                  })();
                }, 500);
              }
            }
          }
        } catch { }

        try {
          const deckStore = useDeckStore.getState();
          const deckIdToRefresh = deckStore.deckData?.uuid || (deckStore.deckData as any)?.id;
          const editId = appliedEditId;
          const diffMaybe = editId ? proposedDiffsRef.current.get(editId) : undefined;
          const needsStructuralRefresh =
            !!(diffMaybe as any)?.slides_to_add?.length ||
            !!(diffMaybe as any)?.slides_to_remove?.length ||
            !!(diffMaybe as any)?.slide_order;

          if (deckIdToRefresh && needsStructuralRefresh) {
            setTimeout(async () => {
              try {
                const latest = await deckSyncService.getFullDeck(String(deckIdToRefresh));
                if (latest && (latest as any).slides) {
                  deckStore.updateDeckData(latest as any, { skipBackend: true, isRealtimeUpdate: true });
                }
              } catch (e) {
                console.warn('[Realtime][edit.applied] Structural refetch failed (non-fatal)', e);
              }
            }, 600);
          }
        } catch { }
      } else {
        try {
          const isEditing = typeof window !== 'undefined' && (window as any).__isEditMode === true;
          if (isEditing) {
            const editorStore = useEditorStore.getState();
            if (typeof editorStore.applyDraftChanges === 'function') {
              editorStore.applyDraftChanges();
            }
          }
        } catch { }
      }

      if (isPrimary) {
        schedulePostApplyRefresh({ diff: appliedDiff, editedSlideId, preEditSnapshot });
      }
      return true;
    } catch (handlerError) {
      const errorLabel = isPrimary ? '[ChatPanel:primary]' : '[ChatPanel:secondary]';
      console.error(`${errorLabel} ❌❌❌ deck.edit.applied HANDLER CRASHED!`, handlerError);

      try {
        insertEditAppliedFallbackMessage((evt as any).data?.editId);
      } catch { }
      return true;
    }
  }, [
    agentClientRef,
    agentSessionId,
    applyDeckDiffRespectingEditMode,
    applyPreviewSlidesRespectingEditMode,
    captureImmediateSnapshot,
    clearAgentEditTimeout,
    clearPlanTimers,
    finalizeStreamingAiMessage,
    insertEditAppliedFallbackMessage,
    insertEditAppliedMessage,
    normalizeSlidesPayload,
    schedulePostApplyRefresh,
    setCurrentSlideIndexSafe,
    setMessages,
  ]);

  const handleDeckEditProposed = useCallback((evt: any, source: 'primary' | 'secondary') => {
    if (evt?.type !== 'deck.edit.proposed') return false;
    if (source === 'secondary') {
      const summary = (evt as any).data?.edit?.summary || 'Proposed edit available';
      setMessages(prev => [...prev, { id: `proposed-${Date.now()}`, type: 'system', message: `✨ ${summary}`, timestamp: new Date(), feedback: null, metadata: { type: 'edit_proposed' } }]);
      return true;
    }

    const edit = (evt as any).data?.edit;
    const summary = edit?.summary || 'Proposed edit available';
    if (edit?.id && edit?.diff) {
      try {
        proposedDiffsRef.current.set(edit.id, edit.diff);
      } catch (e) {
        console.warn('[AgentChat] Failed to store proposed diff', e);
      }
      try {
        applyDeckDiffRespectingEditMode(edit.diff, true);
      } catch { }
    }
    setMessages(prev => [...prev, { id: `proposed-${Date.now()}`, type: 'system', message: `✨ ${summary}`, timestamp: new Date(), feedback: null, metadata: { type: 'edit_proposed', compactRow: true } }]);
    return true;
  }, [applyDeckDiffRespectingEditMode, setMessages]);

  const handleDeckPreviewDiff = useCallback((evt: any, source: 'primary' | 'secondary') => {
    if (evt?.type !== 'deck.preview.diff' && evt?.type !== 'deck.edit.proposed') return false;
    if (source === 'secondary' && evt?.type !== 'deck.preview.diff') return false;
    const payloadData = (evt as any).data || {};
    const diff = payloadData.diff;
    const editId = payloadData.editId || payloadData.edit?.id;
    const previewSlidesPayload = payloadData.slides;
    const previewMessageId = (evt as any).messageId;
    const themeUpdates = payloadData.theme_updates;

    // Handle theme_updates (for font/color changes)
    if (themeUpdates) {
      console.log('[DeckDiff] Applying theme_updates:', themeUpdates);
      try {
        const deckStore = useDeckStore.getState();
        const currentDeck = deckStore.deckData;
        if (currentDeck) {
          const currentTheme = currentDeck.theme || {};
          const updatedTheme = { ...currentTheme };

          // Apply typography updates (hero_font, body_font)
          if (themeUpdates.typography) {
            updatedTheme.typography = {
              ...(updatedTheme.typography || {}),
              ...themeUpdates.typography
            };
            console.log('[DeckDiff] Updated typography:', updatedTheme.typography);
          }

          // Apply color_palette updates
          if (themeUpdates.color_palette) {
            updatedTheme.color_palette = {
              ...(updatedTheme.color_palette || {}),
              ...themeUpdates.color_palette
            };
            console.log('[DeckDiff] Updated color_palette:', updatedTheme.color_palette);
          }

          // Update the deck with new theme
          const updatedDeck = {
            ...currentDeck,
            theme: updatedTheme
          };

          // Also update palette at deck level for consistency
          if (themeUpdates.typography) {
            const currentPalette = currentDeck.palette || {};
            const fonts = [
              themeUpdates.typography.hero_font,
              themeUpdates.typography.body_font
            ].filter(Boolean);
            if (fonts.length > 0) {
              (updatedDeck as any).palette = {
                ...currentPalette,
                fonts: fonts
              };
            }
          }

          // Use updateDeckData to update local state only (skipBackend: true)
          // Backend already saves the theme_updates along with the deck_diff, so we don't want
          // the frontend to save prematurely and overwrite the backend's HTML changes
          deckStore.updateDeckData(updatedDeck, { skipBackend: true });
          console.log('[DeckDiff] Theme update applied to local state (backend saves separately)');
          // DEBUG: Verify the update was applied
          setTimeout(() => {
            const verifyDeck = useDeckStore.getState().deckData;
            console.log('[DeckDiff] VERIFY after update - typography:', verifyDeck?.theme?.typography);
          }, 100);
        }
      } catch (e) {
        console.error('[DeckDiff] Failed to apply theme_updates:', e);
      }
    }

    if (source === 'secondary') {
      const diffSecondary = (evt as any).data?.diff;
      try {
        try {
          const deckStore = useDeckStore.getState();
          const slides = deckStore.deckData?.slides || [];

          const slidesToUpdate = diffSecondary?.slides_to_update || [];
          const modifiedSlideIds = slidesToUpdate.map((s: any) => s.slide_id || s.id).filter(Boolean);

          if (modifiedSlideIds.length > 0) {
            const targetSlideId = modifiedSlideIds[0];
            const originalSlide = slides.find((s: any) => s.id === targetSlideId);
            if (originalSlide) {
              (window as any).__preEditSlideSnapshot = JSON.parse(JSON.stringify(originalSlide));
            } else {
              console.warn('[AgentChat] Could not find slide with id:', targetSlideId, 'in deck slides:', slides.map((s: any) => s.id));
            }
          } else {
            const navContext = (window as any).__navigationContext;
            const currentSlideIdx = navContext?.currentSlideIndex || 0;
            const currentSlide = slides[currentSlideIdx];
            if (currentSlide) {
              (window as any).__preEditSlideSnapshot = JSON.parse(JSON.stringify(currentSlide));
            }
          }
        } catch (e) {
          console.warn('[AgentChat] Failed to capture pre-edit snapshot:', e);
        }

        try {
          (window as any).__pendingPreviewTs = Date.now();
          (window as any).__agentEditInProgress = true;
        } catch { }
        scheduleAgentEditTimeout();
        if (diffSecondary) {
          applyDeckDiffRespectingEditMode(diffSecondary, true);
        }
      } catch { }
      return true;
    }

    if (previewMessageId && diff) {
      pendingDiffsByMessageIdRef.current.set(previewMessageId, diff);
    }
    try {
      try {
        const deckStore = useDeckStore.getState();
        const slides = deckStore.deckData?.slides || [];

        const slidesToUpdate = diff?.slides_to_update || [];
        const modifiedSlideIds = slidesToUpdate.map((s: any) => s.slide_id || s.id).filter(Boolean);

        const previewSlideIds = (previewSlidesPayload || []).map((s: any) => s.id).filter(Boolean);
        const targetSlideIds = modifiedSlideIds.length > 0 ? modifiedSlideIds : previewSlideIds;

        if (targetSlideIds.length > 0) {
          const targetSlideId = targetSlideIds[0];
          const originalSlide = slides.find((s: any) => s.id === targetSlideId);
          if (originalSlide) {
            (window as any).__preEditSlideSnapshot = JSON.parse(JSON.stringify(originalSlide));
          } else {
            console.warn('[AgentChat] Could not find slide with id:', targetSlideId, 'in deck slides:', slides.map((s: any) => s.id));
          }
        } else {
          const navContext = (window as any).__navigationContext;
          const currentSlideIdx = navContext?.currentSlideIndex || 0;
          const currentSlide = slides[currentSlideIdx];
          if (currentSlide) {
            (window as any).__preEditSlideSnapshot = JSON.parse(JSON.stringify(currentSlide));
          }
        }
      } catch (e) {
        console.warn('[AgentChat] Failed to capture pre-edit snapshot:', e);
      }

      const now = Date.now();
      (window as any).__pendingPreviewTs = now;
      if (editId) (window as any).__pendingPreviewEditId = editId;
      (window as any).__agentEditInProgress = true;
      scheduleAgentEditTimeout();

      const normalizedPreviewSlides = normalizeSlidesPayload(previewSlidesPayload);
      if (previewMessageId && normalizedPreviewSlides.length > 0) {
        pendingSlidesByMessageIdRef.current.set(previewMessageId, normalizedPreviewSlides);
      }
      if (normalizedPreviewSlides.length > 0) {
        applyPreviewSlidesRespectingEditMode(normalizedPreviewSlides, true);

        if (diff && (diff.deck_properties || diff.slides_to_remove)) {
          const deckLevelOnlyDiff = {
            ...diff,
            slides_to_update: [],
            slides_to_add: []
          } as DeckDiff;
          applyDeckDiffRespectingEditMode(deckLevelOnlyDiff, true);
        }
        return true;
      }

      if (diff) {
        // DEBUG: Log font props in handleDeckPreviewDiff
        try {
          const slidesToUpdate = diff.slides_to_update || [];
          slidesToUpdate.forEach((slideDiff: any) => {
            const compUpdates = slideDiff.components_to_update || [];
            compUpdates.forEach((compDiff: any) => {
              const allProps = compDiff.props || {};
              const fontKeys = Object.keys(allProps).filter((k: string) => k.toLowerCase().includes('font'));
              if (fontKeys.length > 0) {
                console.log('[handleDeckPreviewDiff] 📨 diff has font props:', {
                  slideId: slideDiff.slide_id,
                  componentId: compDiff.id?.slice(0, 12),
                  fontProps: fontKeys.map((k: string) => `${k}=${allProps[k]}`),
                });
              }
            });
          });
        } catch (e) {
          console.warn('[handleDeckPreviewDiff] DEBUG log failed:', e);
        }
        applyDeckDiffRespectingEditMode(diff, true);
      } else {
        console.warn('[Realtime][preview.diff] No diff or slides in payload', { editId });
      }
    } catch (e) {
      console.error('[Realtime][preview.diff] Error applying preview', e);
    }

    // Fallback: finalize streaming message after a short delay
    // In case assistant.message.complete is not received
    setTimeout(() => {
      finalizeStreamingAiMessage();
      clearPlanTimers();
    }, 500);

    return true;
  }, [applyDeckDiffRespectingEditMode, applyPreviewSlidesRespectingEditMode, clearPlanTimers, finalizeStreamingAiMessage, normalizeSlidesPayload, scheduleAgentEditTimeout]);

  return {
    handleCommonAgentEvent,
    handleDeckEditApplied,
    handleDeckEditProposed,
    handleDeckPreviewDiff,
    clearPlanTimers,
  };
}
