import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import AdminLayoutV2 from '@/components/admin/AdminLayoutV2';
import { adminApi } from '@/services/adminApi';
import type { PlaygroundRunSummary, PlaygroundRunDetail } from '@/services/adminApi';
import { API_CONFIG } from '@/config/environment';
import { useAuth } from '@/context/SupabaseAuthContext';
import {
  FlaskConical,
  Play,
  Loader2,
  CheckCircle2,
  XCircle,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  X,
  Maximize2,
  Sparkles,
  Eye,
  RotateCcw,
  Columns2,
  List,
  RefreshCw,
  Clock,
  Trash2,
  Check,
  Save,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Types ──────────────────────────────────────────────────────────────────
interface PlaygroundModel {
  id: string;
  name: string;
  provider: string;
}

interface PlaygroundSlide {
  title: string;
  content: string;
  key_points: string[];
  speaker_notes: string;
}

interface PlaygroundOutline {
  title: string;
  subtitle: string;
  slides: PlaygroundSlide[];
}

interface PlaygroundThemeSummary {
  accent_color: string;
  secondary_color: string;
  background_color: string;
  text_color: string;
  heading_font: string;
  body_font: string;
  design_philosophy: string;
}

interface ModelResult {
  modelId: string;
  modelName: string;
  phase: 'waiting' | 'generating' | 'complete' | 'error';
  statusMessage: string;
  slideHtmls: (string | null)[];
  previousHtmls?: (string | null)[];  // old slides shown dimmed during regen
  elapsedSeconds: number | null;
  error: string | null;
  genId: number;  // generation counter — ignore stale SSE events
}

// ── Provider accent colors ────────────────────────────────────────────────
const PROVIDER_DOT: Record<string, string> = {
  anthropic: 'bg-amber-500',
  gemini: 'bg-blue-500',
  google: 'bg-blue-500',
  openai: 'bg-emerald-500',
  xai: 'bg-slate-400',
  mistral: 'bg-orange-500',
  deepseek: 'bg-cyan-500',
};

const getDot = (provider: string) => PROVIDER_DOT[provider] || 'bg-gray-400';

// ── Relative time helper ────────────────────────────────────────────────────
function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

// All models selected by default — initialized from API response in useEffect

// ── Image placeholder handler (injected into each iframe) ──────────────────
const IFRAME_IMAGE_HANDLER = `
<style>
img[src="placeholder"], img[src=""], img:not([src]) {
  background: linear-gradient(135deg, rgba(255,67,1,0.12) 0%, rgba(30,41,59,0.25) 100%);
  min-height: 80px;
  border-radius: 8px;
  display: block;
}
</style>
<script>
document.addEventListener('error', function(e) {
  if (e.target.tagName === 'IMG') {
    e.target.style.background = 'linear-gradient(135deg, rgba(255,67,1,0.12), rgba(30,41,59,0.25))';
    e.target.style.minHeight = '80px';
    e.target.style.borderRadius = '8px';
    e.target.style.display = 'block';
    e.target.removeAttribute('src');
  }
}, true);
</script>`;

function injectImageHandler(html: string): string {
  if (!html) return html;
  if (html.includes('</head>')) return html.replace('</head>', IFRAME_IMAGE_HANDLER + '</head>');
  if (html.includes('</body>')) return html.replace('</body>', IFRAME_IMAGE_HANDLER + '</body>');
  return html + IFRAME_IMAGE_HANDLER;
}

// ── Main Component ─────────────────────────────────────────────────────────
type Phase = 'input' | 'previewing' | 'ready' | 'generating';
type ViewMode = 'list' | 'compare';

const AdminPlayground: React.FC = () => {
  const { session } = useAuth();
  const [models, setModels] = useState<PlaygroundModel[]>([]);
  const [selectedModels, setSelectedModels] = useState<Set<string>>(new Set());
  const [prompt, setPrompt] = useState('');
  const [slideMode, setSlideMode] = useState<'interactive' | 'static'>('interactive');
  const [temperature, setTemperature] = useState(0.8);

  // Phase 1: Preview state
  const [phase, setPhase] = useState<Phase>('input');
  const [sharedOutline, setSharedOutline] = useState<PlaygroundOutline | null>(null);
  const [sharedThemeSummary, setSharedThemeSummary] = useState<PlaygroundThemeSummary | null>(null);
  const [fullTheme, setFullTheme] = useState<Record<string, any> | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Phase 2: Generation state
  const [results, setResults] = useState<Map<string, ModelResult>>(new Map());
  const [presentingModel, setPresentingModel] = useState<string | null>(null);
  const [presentingSlideIdx, setPresentingSlideIdx] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  // Per-model abort controllers for single-model regeneration
  const modelAbortRefs = useRef<Map<string, AbortController>>(new Map());
  // Generation ID counter per model — used to ignore stale SSE events
  const genIdRef = useRef<Map<string, number>>(new Map());

  // View state
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [expandedModels, setExpandedModels] = useState<Set<string>>(new Set());
  const [compareSlideIdx, setCompareSlideIdx] = useState(0);
  const [visibleModels, setVisibleModels] = useState<Set<string> | null>(null); // null = show all

  // Persistence state
  const [currentRunId, setCurrentRunId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [showHistory, setShowHistory] = useState(false);
  const [savedRuns, setSavedRuns] = useState<PlaygroundRunSummary[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [loadingRunId, setLoadingRunId] = useState<string | null>(null);

  // Fetch available models on mount — select all by default
  useEffect(() => {
    (async () => {
      try {
        const res = await adminApi.getPlaygroundModels();
        setModels(res);
        setSelectedModels(new Set(res.map(m => m.id)));
      } catch (e) {
        console.error('Failed to fetch playground models', e);
      }
    })();
  }, []);

  const toggleModel = (id: string) => {
    setSelectedModels(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const getModelName = useCallback(
    (id: string) => models.find(m => m.id === id)?.name || id,
    [models],
  );

  const getProvider = useCallback(
    (id: string) => models.find(m => m.id === id)?.provider || 'unknown',
    [models],
  );

  // ── SSE stream processor (shared by generate-all and regenerate-one) ────
  const processSSEStream = useCallback(async (
    modelIds: string[],
    signal: AbortSignal,
    expectedGenIds: Map<string, number>,
  ) => {
    const token = session?.access_token;
    const res = await fetch(`${API_CONFIG.BASE_URL}/admin/playground/generate-batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        outline: sharedOutline,
        theme: fullTheme,
        model_ids: modelIds,
        slide_mode: slideMode,
        temperature,
        prompt,
      }),
      signal,
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const reader = res.body?.getReader();
    if (!reader) throw new Error('No readable stream');

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const event = JSON.parse(line.slice(6));
          if (event.type === 'all_complete') continue;

          const modelId = event.model_id as string;
          if (!modelId) continue;

          // Ignore stale events from a previous generation
          const currentGenId = genIdRef.current.get(modelId) || 0;
          const expectedGenId = expectedGenIds.get(modelId) || 0;
          if (currentGenId !== expectedGenId) continue;

          setResults(prev => {
            const next = new Map(prev);
            const existing = next.get(modelId);
            if (!existing || existing.genId !== expectedGenId) return prev;

            if (event.type === 'status') {
              next.set(modelId, { ...existing, phase: 'generating', statusMessage: event.message });
            } else if (event.type === 'slide_html') {
              const htmls = [...existing.slideHtmls];
              htmls[event.index] = event.html;
              // Clear previousHtml for this slot since we have a fresh one
              const prevHtmls = existing.previousHtmls ? [...existing.previousHtmls] : undefined;
              if (prevHtmls) prevHtmls[event.index] = null;
              next.set(modelId, { ...existing, phase: 'generating', slideHtmls: htmls, previousHtmls: prevHtmls });
            } else if (event.type === 'complete') {
              next.set(modelId, { ...existing, phase: 'complete', statusMessage: 'Done', elapsedSeconds: event.elapsed_seconds, previousHtmls: undefined });
            } else if (event.type === 'error') {
              next.set(modelId, { ...existing, phase: 'error', statusMessage: 'Failed', elapsedSeconds: event.elapsed_seconds, error: event.message });
            }
            return next;
          });
        } catch { /* ignore parse errors */ }
      }
    }
  }, [sharedOutline, fullTheme, session, slideMode, temperature, prompt]);

  // ── Auto-save: fires when all models reach a terminal state ─────────────
  useEffect(() => {
    if (phase !== 'generating' || results.size === 0 || !sharedOutline || !fullTheme) return;

    const allTerminal = Array.from(results.values()).every(
      r => r.phase === 'complete' || r.phase === 'error',
    );
    if (!allTerminal) return;

    // Already saved this run
    if (currentRunId) return;

    let cancelled = false;
    (async () => {
      setSaveStatus('saving');
      try {
        const totalElapsed = Math.max(
          ...Array.from(results.values())
            .map(r => r.elapsedSeconds ?? 0),
        );
        const res = await adminApi.savePlaygroundRun({
          prompt,
          temperature,
          slide_mode: slideMode,
          slide_count: sharedOutline.slides.length,
          outline: sharedOutline,
          theme: fullTheme,
          theme_summary: sharedThemeSummary ?? undefined,
          model_ids: Array.from(results.keys()),
          total_elapsed_seconds: totalElapsed || null,
          model_results: Array.from(results.values()).map(r => ({
            model_id: r.modelId,
            model_name: r.modelName,
            status: r.phase,
            slide_htmls: r.slideHtmls,
            elapsed_seconds: r.elapsedSeconds,
            error: r.error,
          })),
        });
        if (!cancelled) {
          setCurrentRunId(res.id);
          setSaveStatus('saved');
        }
      } catch (err) {
        console.error('Auto-save failed', err);
        if (!cancelled) setSaveStatus('error');
      }
    })();
    return () => { cancelled = true; };
  }, [phase, results, sharedOutline, fullTheme, sharedThemeSummary, prompt, temperature, slideMode, currentRunId]);

  // ── Auto-upsert on single model regen completion ─────────────────────────
  const prevResultsRef = useRef<Map<string, ModelResult>>(new Map());
  useEffect(() => {
    if (!currentRunId) return;
    const prev = prevResultsRef.current;
    for (const [modelId, result] of results) {
      const prevResult = prev.get(modelId);
      if (
        prevResult &&
        (prevResult.phase === 'generating' || prevResult.phase === 'waiting') &&
        (result.phase === 'complete' || result.phase === 'error') &&
        result.genId !== prevResult.genId
      ) {
        // This model just finished a regen — upsert
        adminApi.upsertPlaygroundModelResult(currentRunId, modelId, {
          model_name: result.modelName,
          status: result.phase,
          slide_htmls: result.slideHtmls,
          elapsed_seconds: result.elapsedSeconds,
          error: result.error,
        }).catch(err => console.error('Upsert model result failed', err));
      }
    }
    prevResultsRef.current = new Map(results);
  }, [results, currentRunId]);

  // ── Load history ─────────────────────────────────────────────────────────
  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await adminApi.listPlaygroundRuns(1, 50);
      setSavedRuns(res.runs);
    } catch (err) {
      console.error('Failed to load history', err);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  // ── Restore a saved run ──────────────────────────────────────────────────
  const restoreRun = useCallback(async (runId: string) => {
    setLoadingRunId(runId);
    try {
      const run: PlaygroundRunDetail = await adminApi.getPlaygroundRun(runId);

      // Restore all state
      setPrompt(run.prompt);
      setTemperature(run.temperature);
      setSlideMode(run.slide_mode as 'interactive' | 'static');
      setSharedOutline(run.outline as any);
      setFullTheme(run.theme);
      setSharedThemeSummary(run.theme_summary as any);
      setCurrentRunId(run.id);
      setSaveStatus('saved');

      // Rebuild results map
      const restored = new Map<string, ModelResult>();
      for (const mr of run.model_results) {
        restored.set(mr.model_id, {
          modelId: mr.model_id,
          modelName: mr.model_name,
          phase: mr.status as ModelResult['phase'],
          statusMessage: mr.status === 'complete' ? 'Done' : mr.status === 'error' ? 'Failed' : '',
          slideHtmls: mr.slide_htmls,
          elapsedSeconds: mr.elapsed_seconds,
          error: mr.error,
          genId: 0,
        });
      }
      setResults(restored);
      setPhase('generating'); // show results view
      setSelectedModels(new Set(run.model_ids));
      setShowHistory(false);
      setExpandedModels(new Set());
      setVisibleModels(null);
    } catch (err) {
      console.error('Failed to restore run', err);
    } finally {
      setLoadingRunId(null);
    }
  }, []);

  // ── Delete a saved run ───────────────────────────────────────────────────
  const deleteRun = useCallback(async (runId: string) => {
    try {
      await adminApi.deletePlaygroundRun(runId);
      setSavedRuns(prev => prev.filter(r => r.id !== runId));
      if (currentRunId === runId) {
        setCurrentRunId(null);
        setSaveStatus('idle');
      }
    } catch (err) {
      console.error('Failed to delete run', err);
    }
  }, [currentRunId]);

  // ── Phase 1: Generate preview (outline + theme) ─────────────────────────
  const handlePreview = useCallback(async () => {
    if (!prompt.trim()) return;
    setPhase('previewing');
    setPreviewError(null);
    setSharedOutline(null);
    setSharedThemeSummary(null);
    setFullTheme(null);
    setResults(new Map());

    try {
      const token = session?.access_token;
      const res = await fetch(`${API_CONFIG.BASE_URL}/admin/playground/generate-preview`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ prompt }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text}`);
      }

      const data = await res.json();
      setSharedOutline(data.outline as PlaygroundOutline);
      setSharedThemeSummary(data.theme_summary as PlaygroundThemeSummary);
      setFullTheme(data.theme);
      setPhase('ready');
    } catch (err: any) {
      console.error('Preview generation error', err);
      setPreviewError(err.message || 'Preview generation failed');
      setPhase('input');
    }
  }, [prompt, session]);

  // ── Phase 2: Fan out slide generation to all models ─────────────────────
  const handleGenerate = useCallback(async () => {
    if (!sharedOutline || !fullTheme || selectedModels.size === 0) return;

    // Cancel all existing work
    abortRef.current?.abort();
    modelAbortRefs.current.forEach(c => c.abort());
    modelAbortRefs.current.clear();

    const controller = new AbortController();
    abortRef.current = controller;

    const slideCount = sharedOutline.slides.length;
    const initial = new Map<string, ModelResult>();
    const newGenIds = new Map<string, number>();
    for (const id of selectedModels) {
      const genId = (genIdRef.current.get(id) || 0) + 1;
      genIdRef.current.set(id, genId);
      newGenIds.set(id, genId);
      initial.set(id, {
        modelId: id,
        modelName: getModelName(id),
        phase: 'waiting',
        statusMessage: 'Starting...',
        slideHtmls: new Array(slideCount).fill(null),
        elapsedSeconds: null,
        error: null,
        genId,
      });
    }
    setResults(initial);
    setPhase('generating');
    setVisibleModels(null);
    setExpandedModels(new Set());
    setCurrentRunId(null);
    setSaveStatus('idle');

    try {
      await processSSEStream(Array.from(selectedModels), controller.signal, newGenIds);
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      console.error('Batch generation error', err);
    }
  }, [sharedOutline, fullTheme, selectedModels, getModelName, processSSEStream]);

  // ── Regenerate single model ─────────────────────────────────────────────
  const handleRegenerateModel = useCallback(async (modelId: string) => {
    if (!sharedOutline || !fullTheme) return;

    // Cancel any previous SSE stream for this specific model
    const prevController = modelAbortRefs.current.get(modelId);
    if (prevController) prevController.abort();

    const controller = new AbortController();
    modelAbortRefs.current.set(modelId, controller);

    // Bump generation ID — old SSE events for this model will be ignored
    const genId = (genIdRef.current.get(modelId) || 0) + 1;
    genIdRef.current.set(modelId, genId);
    const expectedGenIds = new Map([[modelId, genId]]);

    const slideCount = sharedOutline.slides.length;

    // Preserve old slides as previousHtmls so they show dimmed during regen
    setResults(prev => {
      const next = new Map(prev);
      const existing = next.get(modelId);
      next.set(modelId, {
        modelId,
        modelName: getModelName(modelId),
        phase: 'generating',
        statusMessage: 'Regenerating...',
        slideHtmls: new Array(slideCount).fill(null),
        previousHtmls: existing?.slideHtmls,  // keep old slides visible
        elapsedSeconds: null,
        error: null,
        genId,
      });
      return next;
    });

    try {
      await processSSEStream([modelId], controller.signal, expectedGenIds);
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      console.error(`Regeneration error for ${modelId}`, err);
    } finally {
      modelAbortRefs.current.delete(modelId);
    }
  }, [sharedOutline, fullTheme, getModelName, processSSEStream]);

  // ── Reset ───────────────────────────────────────────────────────────────
  const handleReset = () => {
    abortRef.current?.abort();
    setPhase('input');
    setSharedOutline(null);
    setSharedThemeSummary(null);
    setFullTheme(null);
    setResults(new Map());
    setPreviewError(null);
    setExpandedModels(new Set());
    setVisibleModels(null);
    setCompareSlideIdx(0);
    setCurrentRunId(null);
    setSaveStatus('idle');
  };

  // ── Presentation mode ──────────────────────────────────────────────────
  const presentingResult = presentingModel ? results.get(presentingModel) : null;

  const openPresentation = (modelId: string, slideIdx = 0) => {
    setPresentingModel(modelId);
    setPresentingSlideIdx(slideIdx);
  };

  const closePresentation = () => {
    setPresentingModel(null);
    setPresentingSlideIdx(0);
  };

  useEffect(() => {
    if (!presentingModel || !sharedOutline) return;
    const total = sharedOutline.slides.length;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closePresentation();
      if (e.key === 'ArrowRight' || e.key === ' ') setPresentingSlideIdx(i => Math.min(i + 1, total - 1));
      if (e.key === 'ArrowLeft') setPresentingSlideIdx(i => Math.max(i - 1, 0));
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [presentingModel, sharedOutline]);

  // ── Expand / collapse ─────────────────────────────────────────────────
  const toggleExpand = (id: string) => {
    setExpandedModels(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const expandAll = () => setExpandedModels(new Set(results.keys()));
  const collapseAll = () => setExpandedModels(new Set());

  // ── Visible models for filtering ──────────────────────────────────────
  const toggleVisibleModel = (id: string) => {
    setVisibleModels(prev => {
      const all = new Set(results.keys());
      const current = prev || all;
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filteredResults = useMemo(() => {
    const all = Array.from(results.values());
    if (!visibleModels) return all;
    return all.filter(r => visibleModels.has(r.modelId));
  }, [results, visibleModels]);

  // ── Derived state ─────────────────────────────────────────────────────
  const activeCount = Array.from(results.values()).filter(r => r.phase === 'generating' || r.phase === 'waiting').length;
  const isGenerating = phase === 'generating' && activeCount > 0;
  const slideCount = sharedOutline?.slides.length || 0;

  return (
    <AdminLayoutV2>
      <div className="space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-md bg-[#FF4301]/10">
              <FlaskConical className="h-4 w-4 text-[#FF4301]" />
            </div>
            <div>
              <h1 className="text-sm font-semibold text-black dark:text-white tracking-tight">Playground</h1>
              <p className="text-[10px] text-[#888] leading-none mt-0.5">Compare slide generation across models</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {/* Save indicator */}
            {saveStatus === 'saving' && (
              <span className="inline-flex items-center gap-1 text-[10px] text-[#999]">
                <Save className="h-2.5 w-2.5 animate-pulse" />
                Saving...
              </span>
            )}
            {saveStatus === 'saved' && (
              <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400">
                <Check className="h-2.5 w-2.5" />
                Saved
              </span>
            )}
            {saveStatus === 'error' && (
              <span className="inline-flex items-center gap-1 text-[10px] text-red-500">
                <XCircle className="h-2.5 w-2.5" />
                Save failed
              </span>
            )}

            {/* History button */}
            <button
              onClick={() => { setShowHistory(prev => !prev); if (!showHistory) loadHistory(); }}
              className={cn(
                'inline-flex items-center gap-1 px-2 py-1 text-[10px] border rounded-md transition-colors',
                showHistory
                  ? 'text-[#FF4301] border-[#FF4301]/30 bg-[#FF4301]/5'
                  : 'text-[#888] hover:text-black dark:hover:text-white border-[#eaeaea] dark:border-[#333] hover:bg-[#fafafa] dark:hover:bg-[#1a1a1a]'
              )}
            >
              <Clock className="h-2.5 w-2.5" />
              History
            </button>

            {phase !== 'input' && (
              <button
                onClick={handleReset}
                className="inline-flex items-center gap-1 px-2 py-1 text-[10px] text-[#888] hover:text-black dark:hover:text-white border border-[#eaeaea] dark:border-[#333] rounded-md hover:bg-[#fafafa] dark:hover:bg-[#1a1a1a] transition-colors"
              >
                <RotateCcw className="h-2.5 w-2.5" />
                New
              </button>
            )}
          </div>
        </div>

        {/* ── Input Section ──────────────────────────────────────────────── */}
        <div className="bg-white dark:bg-[#111] border border-[#eaeaea] dark:border-[#333] rounded-lg p-2.5 space-y-2">
          <textarea
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder="Describe the presentation you want to generate..."
            rows={2}
            disabled={phase !== 'input'}
            className="w-full px-2.5 py-1.5 text-xs bg-[#fafafa] dark:bg-[#0a0a0a] border border-[#eaeaea] dark:border-[#333] rounded-md text-black dark:text-white placeholder:text-[#999] focus:outline-none focus:ring-1 focus:ring-[#FF4301]/40 focus:border-[#FF4301]/40 resize-none disabled:opacity-60"
            onKeyDown={e => {
              if (e.key === 'Enter' && e.metaKey && phase === 'input') handlePreview();
            }}
          />

          {/* Model chips */}
          <div className="flex flex-wrap gap-1">
            {models.map(model => {
              const selected = selectedModels.has(model.id);
              return (
                <button
                  key={model.id}
                  onClick={() => toggleModel(model.id)}
                  disabled={phase === 'generating'}
                  className={cn(
                    'inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium transition-all border disabled:opacity-40',
                    selected
                      ? 'bg-[#fafafa] dark:bg-[#1a1a1a] border-[#ddd] dark:border-[#444] text-black dark:text-white'
                      : 'bg-transparent border-transparent text-[#bbb] dark:text-[#555] hover:text-[#888]'
                  )}
                >
                  <span className={cn('w-1.5 h-1.5 rounded-full', selected ? getDot(model.provider) : 'bg-[#ddd] dark:bg-[#444]')} />
                  {model.name}
                </button>
              );
            })}
          </div>

          {/* Controls row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-[#999]">
                {selectedModels.size} model{selectedModels.size !== 1 ? 's' : ''}
                {isGenerating && <span className="ml-1.5 text-[#FF4301]">{activeCount} active</span>}
              </span>
              <div className="flex items-center rounded border border-[#eaeaea] dark:border-[#333] overflow-hidden">
                {(['interactive', 'static'] as const).map(mode => (
                  <button
                    key={mode}
                    onClick={() => setSlideMode(mode)}
                    className={cn(
                      'px-2 py-0.5 text-[9px] font-medium transition-colors',
                      slideMode === mode ? 'bg-[#FF4301] text-white' : 'text-[#999] hover:text-[#666]'
                    )}
                  >
                    {mode === 'interactive' ? 'Next-Gen' : 'Traditional'}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1 border border-[#eaeaea] dark:border-[#333] rounded px-1.5 py-0.5">
                <span className="text-[9px] text-[#999]">Temp</span>
                <input
                  type="number"
                  min={0}
                  max={2}
                  step={0.1}
                  value={temperature}
                  onChange={e => setTemperature(Math.min(2, Math.max(0, parseFloat(e.target.value) || 0)))}
                  className="w-[38px] text-[10px] text-center bg-transparent text-black dark:text-white focus:outline-none tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
              </div>
            </div>

            {phase === 'input' && (
              <button
                onClick={handlePreview}
                disabled={!prompt.trim()}
                className="inline-flex items-center gap-1 px-3 py-1 rounded-md text-[11px] font-medium bg-[#FF4301] text-white hover:bg-[#e63d00] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <Eye className="h-3 w-3" />
                Preview
              </button>
            )}
          </div>

          {previewError && (
            <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800/40 rounded p-2">
              <p className="text-[10px] text-red-600 dark:text-red-400">{previewError}</p>
            </div>
          )}
        </div>

        {/* ── Previewing Loader ──────────────────────────────────────────── */}
        {phase === 'previewing' && (
          <div className="bg-white dark:bg-[#111] border border-[#eaeaea] dark:border-[#333] rounded-lg p-6">
            <div className="flex flex-col items-center gap-2">
              <div className="relative">
                <div className="w-8 h-8 rounded-full border-2 border-[#eaeaea] dark:border-[#333] border-t-[#FF4301] animate-spin" />
                <Sparkles className="h-3 w-3 text-[#FF4301] absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
              </div>
              <p className="text-xs text-black dark:text-white font-medium">Generating outline & theme...</p>
              <p className="text-[10px] text-[#999]">Same pipeline as /app</p>
            </div>
          </div>
        )}

        {/* ── Preview Card (outline + theme) ─────────────────────────────── */}
        {(phase === 'ready' || phase === 'generating') && sharedOutline && (
          <div className="bg-white dark:bg-[#111] border border-[#eaeaea] dark:border-[#333] rounded-lg overflow-hidden">
            <div className="px-3 py-2 border-b border-[#eaeaea] dark:border-[#333] flex items-center justify-between gap-3">
              <div className="min-w-0 flex items-center gap-2">
                <h2 className="text-xs font-semibold text-black dark:text-white truncate">{sharedOutline.title}</h2>
                <span className="text-[10px] text-[#999] flex-shrink-0">{slideCount} slides</span>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {sharedThemeSummary && (
                  <div className="flex items-center gap-0.5">
                    {[sharedThemeSummary.background_color, sharedThemeSummary.accent_color, sharedThemeSummary.secondary_color].map((c, i) => (
                      <span key={i} className="w-3 h-3 rounded-sm border border-black/5" style={{ background: c }} />
                    ))}
                    <span className="text-[9px] text-[#999] ml-1">{sharedThemeSummary.heading_font}</span>
                  </div>
                )}

                {phase === 'ready' && (
                  <>
                    <div className="flex items-center gap-1 border border-[#eaeaea] dark:border-[#333] rounded px-1.5 py-0.5">
                      <span className="text-[9px] text-[#999]">Temp</span>
                      <input
                        type="number"
                        min={0}
                        max={2}
                        step={0.1}
                        value={temperature}
                        onChange={e => setTemperature(Math.min(2, Math.max(0, parseFloat(e.target.value) || 0)))}
                        className="w-[38px] text-[10px] text-center bg-transparent text-black dark:text-white focus:outline-none tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                    </div>
                    <button
                      onClick={handleGenerate}
                      disabled={selectedModels.size === 0}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium bg-[#FF4301] text-white hover:bg-[#e63d00] disabled:opacity-40 transition-colors"
                    >
                      <Play className="h-3 w-3" />
                      Generate All
                    </button>
                  </>
                )}
                {phase === 'generating' && (
                  <span className="inline-flex items-center gap-1 text-[10px] text-[#FF4301]">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    {activeCount > 0 ? `${activeCount} running` : 'Done'}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Results ───────────────────────────────────────────────────── */}
        {results.size > 0 && (
          <div className="space-y-1.5">
            {/* Results toolbar */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                {/* View mode toggle */}
                <div className="flex items-center rounded border border-[#eaeaea] dark:border-[#333] overflow-hidden">
                  <button
                    onClick={() => setViewMode('list')}
                    className={cn(
                      'p-1 transition-colors',
                      viewMode === 'list' ? 'bg-[#fafafa] dark:bg-[#222] text-black dark:text-white' : 'text-[#bbb] hover:text-[#888]'
                    )}
                    title="List view"
                  >
                    <List className="h-3 w-3" />
                  </button>
                  <button
                    onClick={() => setViewMode('compare')}
                    className={cn(
                      'p-1 transition-colors',
                      viewMode === 'compare' ? 'bg-[#fafafa] dark:bg-[#222] text-black dark:text-white' : 'text-[#bbb] hover:text-[#888]'
                    )}
                    title="Compare view"
                  >
                    <Columns2 className="h-3 w-3" />
                  </button>
                </div>

                {viewMode === 'list' && (
                  <div className="flex items-center gap-1">
                    <button onClick={expandAll} className="text-[9px] text-[#999] hover:text-[#666] dark:hover:text-[#ccc] transition-colors">
                      Expand all
                    </button>
                    <span className="text-[#ddd] dark:text-[#444]">·</span>
                    <button onClick={collapseAll} className="text-[9px] text-[#999] hover:text-[#666] dark:hover:text-[#ccc] transition-colors">
                      Collapse
                    </button>
                  </div>
                )}
              </div>

              {/* Model filter chips */}
              <div className="flex items-center gap-1 overflow-x-auto">
                <button
                  onClick={() => setVisibleModels(null)}
                  className={cn(
                    'text-[9px] px-1.5 py-0.5 rounded transition-colors',
                    visibleModels === null ? 'text-[#FF4301] font-medium' : 'text-[#bbb] hover:text-[#888]'
                  )}
                >
                  All
                </button>
                {Array.from(results.values()).map(r => (
                  <button
                    key={r.modelId}
                    onClick={() => toggleVisibleModel(r.modelId)}
                    className={cn(
                      'inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded transition-colors',
                      (visibleModels === null || visibleModels.has(r.modelId))
                        ? 'text-black dark:text-white font-medium'
                        : 'text-[#ccc] dark:text-[#555]'
                    )}
                  >
                    <span className={cn('w-1 h-1 rounded-full', getDot(getProvider(r.modelId)))} />
                    {r.modelName.split(' ').slice(-2).join(' ')}
                  </button>
                ))}
              </div>
            </div>

            {/* ── List View ─────────────────────────────────────────────── */}
            {viewMode === 'list' && (
              <div className="border border-[#eaeaea] dark:border-[#333] rounded-lg overflow-hidden divide-y divide-[#eaeaea] dark:divide-[#333]">
                {filteredResults.map(result => (
                  <ModelRow
                    key={result.modelId}
                    result={result}
                    slideCount={slideCount}
                    provider={getProvider(result.modelId)}
                    expanded={expandedModels.has(result.modelId)}
                    onToggleExpand={() => toggleExpand(result.modelId)}
                    onPresent={(idx) => openPresentation(result.modelId, idx)}
                    onRegenerate={() => handleRegenerateModel(result.modelId)}
                  />
                ))}
              </div>
            )}

            {/* ── Compare View ──────────────────────────────────────────── */}
            {viewMode === 'compare' && (
              <CompareView
                results={filteredResults}
                slideCount={slideCount}
                slideIndex={compareSlideIdx}
                onSlideChange={setCompareSlideIdx}
                slideTitles={sharedOutline?.slides.map(s => s.title) || []}
                getProvider={getProvider}
                onPresent={(modelId, idx) => openPresentation(modelId, idx)}
                onRegenerate={handleRegenerateModel}
              />
            )}
          </div>
        )}
      </div>

      {/* ── History Slide-out Panel ──────────────────────────────────────── */}
      {showHistory && (
        <div className="fixed inset-y-0 right-0 z-40 w-[340px] bg-white dark:bg-[#111] border-l border-[#eaeaea] dark:border-[#333] shadow-xl flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-[#eaeaea] dark:border-[#333]">
            <div className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-[#FF4301]" />
              <span className="text-xs font-semibold text-black dark:text-white">Run History</span>
            </div>
            <button
              onClick={() => setShowHistory(false)}
              className="p-0.5 rounded hover:bg-[#eee] dark:hover:bg-[#333] transition-colors text-[#999] hover:text-black dark:hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {historyLoading && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-4 w-4 animate-spin text-[#FF4301]" />
              </div>
            )}
            {!historyLoading && savedRuns.length === 0 && (
              <div className="flex flex-col items-center justify-center py-8 gap-1">
                <Clock className="h-5 w-5 text-[#ddd] dark:text-[#444]" />
                <p className="text-[10px] text-[#999]">No saved runs yet</p>
              </div>
            )}
            {!historyLoading && savedRuns.map(run => {
              const completeCount = run.model_results.filter(r => r.status === 'complete').length;
              const errorCount = run.model_results.filter(r => r.status === 'error').length;
              const isActive = currentRunId === run.id;

              return (
                <div
                  key={run.id}
                  className={cn(
                    'px-3 py-2 border-b border-[#eaeaea] dark:border-[#333] hover:bg-[#fafafa] dark:hover:bg-[#161616] transition-colors cursor-pointer group',
                    isActive && 'bg-[#FF4301]/5 border-l-2 border-l-[#FF4301]'
                  )}
                  onClick={() => restoreRun(run.id)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      {/* Prompt */}
                      <p className="text-[11px] font-medium text-black dark:text-white line-clamp-2 leading-tight">
                        {run.prompt}
                      </p>
                      {/* Meta row */}
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className="text-[9px] text-[#999] tabular-nums">
                          {run.model_results.length} model{run.model_results.length !== 1 ? 's' : ''}
                        </span>
                        {completeCount > 0 && (
                          <span className="inline-flex items-center gap-0.5 text-[9px] text-emerald-600 dark:text-emerald-400">
                            <CheckCircle2 className="h-2 w-2" />{completeCount}
                          </span>
                        )}
                        {errorCount > 0 && (
                          <span className="inline-flex items-center gap-0.5 text-[9px] text-red-500">
                            <XCircle className="h-2 w-2" />{errorCount}
                          </span>
                        )}
                        {/* Theme color dots */}
                        {run.theme_summary && (
                          <div className="flex items-center gap-0.5 ml-auto">
                            {[run.theme_summary.background_color, run.theme_summary.accent_color, run.theme_summary.secondary_color].filter(Boolean).map((c, i) => (
                              <span key={i} className="w-2 h-2 rounded-sm border border-black/5" style={{ background: c as string }} />
                            ))}
                          </div>
                        )}
                      </div>
                      {/* Time */}
                      <p className="text-[9px] text-[#bbb] dark:text-[#555] mt-0.5">{timeAgo(run.created_at)}</p>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      {loadingRunId === run.id && (
                        <Loader2 className="h-3 w-3 animate-spin text-[#FF4301]" />
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteRun(run.id); }}
                        className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-950/30 text-[#ccc] dark:text-[#555] hover:text-red-500 transition-colors"
                        title="Delete run"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Presentation overlay */}
      {presentingModel && presentingResult && sharedOutline && (
        <PresentationOverlay
          result={presentingResult}
          outline={sharedOutline}
          modelName={presentingResult.modelName}
          currentIndex={presentingSlideIdx}
          onChangeIndex={setPresentingSlideIdx}
          onClose={closePresentation}
        />
      )}
    </AdminLayoutV2>
  );
};

// ── Model Row (List View) ──────────────────────────────────────────────────
const ModelRow: React.FC<{
  result: ModelResult;
  slideCount: number;
  provider: string;
  expanded: boolean;
  onToggleExpand: () => void;
  onPresent: (slideIdx: number) => void;
  onRegenerate: () => void;
}> = ({ result, slideCount, provider, expanded, onToggleExpand, onPresent, onRegenerate }) => {
  const slidesReady = result.slideHtmls.filter(h => h != null).length;
  const isActive = result.phase === 'waiting' || result.phase === 'generating';
  const progress = slideCount > 0 ? slidesReady / slideCount : 0;

  return (
    <div className="bg-white dark:bg-[#111]">
      {/* Collapsed row */}
      <div
        className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-[#fafafa] dark:hover:bg-[#161616] transition-colors"
        onClick={onToggleExpand}
      >
        {/* Provider dot */}
        <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', isActive && 'animate-pulse', getDot(provider))} />

        {/* Model name */}
        <span className="text-[11px] font-medium text-black dark:text-white truncate min-w-[120px]">
          {result.modelName}
        </span>

        {/* Progress bar */}
        <div className="flex-1 max-w-[200px]">
          {isActive || result.phase === 'complete' ? (
            <div className="h-1 bg-[#eee] dark:bg-[#333] rounded-full overflow-hidden">
              <div
                className={cn(
                  'h-full rounded-full transition-all duration-500',
                  result.phase === 'complete' ? 'bg-emerald-500' : 'bg-[#FF4301]'
                )}
                style={{ width: `${progress * 100}%` }}
              />
            </div>
          ) : result.phase === 'error' ? (
            <div className="h-1 bg-red-200 dark:bg-red-900/40 rounded-full" />
          ) : null}
        </div>

        {/* Status */}
        <div className="flex items-center gap-1.5 flex-shrink-0 min-w-[80px] justify-end">
          {isActive && (
            <span className="inline-flex items-center gap-0.5 text-[10px] text-[#999] tabular-nums">
              <Loader2 className="h-2.5 w-2.5 animate-spin text-[#FF4301]" />
              {slidesReady}/{slideCount}
            </span>
          )}
          {result.phase === 'complete' && (
            <span className="inline-flex items-center gap-0.5 text-[10px] text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-2.5 w-2.5" />
              {slideCount}
            </span>
          )}
          {result.phase === 'error' && (
            <span className="inline-flex items-center gap-0.5 text-[10px] text-red-500">
              <XCircle className="h-2.5 w-2.5" />
              Error
            </span>
          )}
          {result.elapsedSeconds != null && (
            <span className="text-[10px] text-[#999] tabular-nums">
              {result.elapsedSeconds}s
            </span>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-0.5 flex-shrink-0">
          {result.phase !== 'waiting' && (
            <button
              onClick={(e) => { e.stopPropagation(); onRegenerate(); }}
              className={cn(
                'p-1 rounded hover:bg-[#eee] dark:hover:bg-[#333] transition-colors text-[#999] hover:text-[#666] dark:hover:text-[#ccc]',
                isActive && 'text-[#FF4301] hover:text-[#e63d00]'
              )}
              title={isActive ? 'Cancel & regenerate' : 'Regenerate'}
            >
              <RefreshCw className={cn('h-2.5 w-2.5', isActive && 'animate-spin')} />
            </button>
          )}
          {slidesReady > 0 && (
            <button
              onClick={(e) => { e.stopPropagation(); onPresent(0); }}
              className="p-1 rounded hover:bg-[#eee] dark:hover:bg-[#333] transition-colors text-[#999] hover:text-[#FF4301]"
              title="Present"
            >
              <Maximize2 className="h-2.5 w-2.5" />
            </button>
          )}
          <span className="text-[#ccc] dark:text-[#444]">
            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </span>
        </div>
      </div>

      {/* Expanded: slide strip */}
      {expanded && (
        <div className="px-3 pb-2 pt-0.5">
          {result.phase === 'error' && result.error && (
            <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800/40 rounded p-1.5 mb-1.5">
              <p className="text-[9px] text-red-500 break-words line-clamp-2">{result.error}</p>
            </div>
          )}
          {slidesReady > 0 || isActive || result.previousHtmls ? (
            <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
              {result.slideHtmls.map((html, idx) => {
                const prevHtml = result.previousHtmls?.[idx];
                const displayHtml = html || prevHtml;
                const isDimmed = !html && !!prevHtml;
                return (
                  <SlideThumbnail
                    key={idx}
                    html={displayHtml}
                    index={idx}
                    onClick={() => onPresent(idx)}
                    size="sm"
                    dimmed={isDimmed}
                  />
                );
              })}
            </div>
          ) : result.phase === 'waiting' ? (
            <div className="flex items-center justify-center py-3">
              <Loader2 className="h-3 w-3 animate-spin text-[#FF4301]" />
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
};

// ── Compare View ────────────────────────────────────────────────────────────
const CompareView: React.FC<{
  results: ModelResult[];
  slideCount: number;
  slideIndex: number;
  onSlideChange: (idx: number) => void;
  slideTitles: string[];
  getProvider: (id: string) => string;
  onPresent: (modelId: string, slideIdx: number) => void;
  onRegenerate: (modelId: string) => void;
}> = ({ results, slideCount, slideIndex, onSlideChange, slideTitles, getProvider, onPresent, onRegenerate }) => {
  // Grid cols based on result count — fill width with tight spacing
  const cols = results.length <= 2 ? 'grid-cols-2' : results.length <= 3 ? 'grid-cols-3' : results.length <= 4 ? 'grid-cols-2 lg:grid-cols-4' : 'grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5';

  return (
    <div className="space-y-1.5">
      {/* Slide navigation bar */}
      <div className="bg-white dark:bg-[#111] border border-[#eaeaea] dark:border-[#333] rounded-lg px-3 py-1.5 flex items-center justify-between">
        <button
          onClick={() => onSlideChange(Math.max(0, slideIndex - 1))}
          disabled={slideIndex === 0}
          className="p-0.5 rounded hover:bg-[#eee] dark:hover:bg-[#333] transition-colors text-[#999] disabled:opacity-20"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>

        <div className="flex items-center gap-1 overflow-x-auto px-2">
          {Array.from({ length: slideCount }, (_, i) => (
            <button
              key={i}
              onClick={() => onSlideChange(i)}
              className={cn(
                'flex-shrink-0 px-1.5 py-0.5 rounded text-[9px] tabular-nums transition-colors',
                i === slideIndex
                  ? 'bg-[#FF4301] text-white font-medium'
                  : 'text-[#999] hover:text-[#666] hover:bg-[#f5f5f5] dark:hover:bg-[#222]'
              )}
            >
              {i + 1}
            </button>
          ))}
        </div>

        <button
          onClick={() => onSlideChange(Math.min(slideCount - 1, slideIndex + 1))}
          disabled={slideIndex === slideCount - 1}
          className="p-0.5 rounded hover:bg-[#eee] dark:hover:bg-[#333] transition-colors text-[#999] disabled:opacity-20"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>

      {slideTitles[slideIndex] && (
        <p className="text-[10px] text-[#999] text-center truncate px-4">
          Slide {slideIndex + 1}: {slideTitles[slideIndex]}
        </p>
      )}

      {/* Grid of slides */}
      <div className={cn('grid gap-1', cols)}>
        {results.map(result => {
          const html = result.slideHtmls[slideIndex];
          const prevHtml = result.previousHtmls?.[slideIndex];
          const displayHtml = html || prevHtml;
          const isRegen = !html && !!prevHtml;
          const isActive = result.phase === 'waiting' || result.phase === 'generating';
          const provider = getProvider(result.modelId);

          return (
            <div key={result.modelId} className="bg-white dark:bg-[#111] border border-[#eaeaea] dark:border-[#333] rounded-lg overflow-hidden">
              {/* Label bar */}
              <div className="flex items-center justify-between px-2 py-1 border-b border-[#eaeaea] dark:border-[#333]">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', isActive && 'animate-pulse', getDot(provider))} />
                  <span className="text-[10px] font-medium text-black dark:text-white truncate">{result.modelName}</span>
                </div>
                <div className="flex items-center gap-0.5 flex-shrink-0">
                  {isActive && <Loader2 className="h-2.5 w-2.5 animate-spin text-[#FF4301]" />}
                  {result.phase === 'complete' && result.elapsedSeconds != null && (
                    <span className="text-[9px] text-[#999] tabular-nums">{result.elapsedSeconds}s</span>
                  )}
                  {result.phase === 'error' && <XCircle className="h-2.5 w-2.5 text-red-500" />}
                  {result.phase !== 'waiting' && (
                    <button
                      onClick={() => onRegenerate(result.modelId)}
                      className="p-0.5 rounded hover:bg-[#eee] dark:hover:bg-[#333] transition-colors text-[#bbb] hover:text-[#666]"
                      title={isActive ? 'Cancel & regenerate' : 'Regenerate'}
                    >
                      <RefreshCw className="h-2.5 w-2.5" />
                    </button>
                  )}
                  {displayHtml && (
                    <button
                      onClick={() => onPresent(result.modelId, slideIndex)}
                      className="p-0.5 rounded hover:bg-[#eee] dark:hover:bg-[#333] transition-colors text-[#bbb] hover:text-[#FF4301]"
                      title="Present"
                    >
                      <Maximize2 className="h-2.5 w-2.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Slide content */}
              <div className="aspect-video bg-[#0f172a] relative">
                {displayHtml ? (
                  <>
                    <CompareSlideIframe html={displayHtml} index={slideIndex} />
                    {isRegen && (
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center z-10">
                        <Loader2 className="h-5 w-5 animate-spin text-[#FF4301]" />
                      </div>
                    )}
                  </>
                ) : isActive ? (
                  <div className="w-full h-full flex items-center justify-center">
                    <Loader2 className="h-4 w-4 animate-spin text-[#FF4301]" />
                  </div>
                ) : result.phase === 'error' ? (
                  <div className="w-full h-full flex items-center justify-center">
                    <XCircle className="h-4 w-4 text-red-500/50" />
                  </div>
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <span className="text-[10px] text-white/20">No slide</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ── Compare slide iframe (responsive scaling) ───────────────────────────────
const CompareSlideIframe: React.FC<{ html: string; index: number }> = ({ html, index }) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.2);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const { width } = el.getBoundingClientRect();
      setScale(width / 1920);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || !html) return;
    const doc = iframe.contentDocument;
    if (!doc) return;
    doc.open();
    doc.write(injectImageHandler(html));
    doc.close();
  }, [html]);

  return (
    <div ref={containerRef} className="w-full h-full overflow-hidden relative">
      <iframe
        ref={iframeRef}
        className="border-0 absolute top-0 left-0"
        style={{ width: 1920, height: 1080, transform: `scale(${scale})`, transformOrigin: 'top left' }}
        tabIndex={-1}
        sandbox="allow-same-origin allow-scripts"
        title={`Slide ${index + 1}`}
      />
    </div>
  );
};

// ── Slide Thumbnail ─────────────────────────────────────────────────────────
const SlideThumbnail: React.FC<{
  html: string | null;
  index: number;
  onClick: () => void;
  size?: 'sm' | 'md';
  dimmed?: boolean;
}> = ({ html, index, onClick, size = 'md', dimmed = false }) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const dims = size === 'sm' ? 'w-[240px] h-[135px]' : 'w-[320px] h-[180px]';
  const iframeScale = size === 'sm' ? 0.125 : 0.1667;

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || !html) return;
    const doc = iframe.contentDocument;
    if (!doc) return;
    doc.open();
    doc.write(injectImageHandler(html));
    doc.close();
  }, [html]);

  return (
    <button onClick={onClick} className="flex-shrink-0 group">
      <div className={cn(dims, 'rounded overflow-hidden border border-[#eaeaea] dark:border-[#333] group-hover:border-[#FF4301]/50 transition-all cursor-pointer relative bg-[#0f172a]')}>
        {html ? (
          <>
            <iframe
              ref={iframeRef}
              className="pointer-events-none border-0"
              style={{ width: 1920, height: 1080, transform: `scale(${iframeScale})`, transformOrigin: 'top left' }}
              tabIndex={-1}
              sandbox="allow-same-origin allow-scripts"
              title={`Slide ${index + 1}`}
            />
            {dimmed && (
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                <div className="w-3 h-3 rounded-full border border-white/30 border-t-[#FF4301] animate-spin" />
              </div>
            )}
          </>
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <div className="w-3 h-3 rounded-full border border-[#334155] border-t-[#FF4301] animate-spin" />
          </div>
        )}
      </div>
    </button>
  );
};

// ── Full-size slide renderer (for presentation overlay) ─────────────────────
const FullSlide: React.FC<{ html: string | null; index: number }> = ({ html, index }) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const { width, height } = el.getBoundingClientRect();
      setScale(Math.min(width / 1920, height / 1080));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || !html) return;
    const doc = iframe.contentDocument;
    if (!doc) return;
    doc.open();
    doc.write(injectImageHandler(html));
    doc.close();
  }, [html]);

  if (!html) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-[#0f172a]">
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="h-5 w-5 text-[#FF4301] animate-spin" />
          <span className="text-white/30 text-xs">Generating slide {index + 1}...</span>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="w-full h-full overflow-hidden">
      <iframe
        ref={iframeRef}
        className="border-0"
        style={{ width: 1920, height: 1080, transform: `scale(${scale})`, transformOrigin: 'top left' }}
        tabIndex={-1}
        sandbox="allow-same-origin allow-scripts"
        title={`Slide ${index + 1}`}
      />
    </div>
  );
};

// ── Presentation Overlay ────────────────────────────────────────────────────
const PresentationOverlay: React.FC<{
  result: ModelResult;
  outline: PlaygroundOutline;
  modelName: string;
  currentIndex: number;
  onChangeIndex: (idx: number) => void;
  onClose: () => void;
}> = ({ result, outline, modelName, currentIndex, onChangeIndex, onClose }) => {
  const total = outline.slides.length;
  if (!total) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      <div className="flex items-center justify-between px-4 py-1.5 bg-black/90 border-b border-white/10 z-10">
        <div className="flex items-center gap-2">
          <span className="text-white/60 text-[11px] font-medium">{modelName}</span>
          <span className="text-white/20 text-[10px]">|</span>
          <span className="text-white/30 text-[10px] truncate max-w-[300px]">{outline.title}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-white/40 text-[10px] tabular-nums">{currentIndex + 1}/{total}</span>
          <button onClick={onClose} className="p-0.5 rounded hover:bg-white/10 transition-colors text-white/50 hover:text-white">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-2 bg-black min-h-0">
        <div className="relative w-full h-full max-w-[1280px]" style={{ aspectRatio: '16/9', maxHeight: 'calc(100vh - 80px)' }}>
          <div className="absolute inset-0 rounded-lg overflow-hidden shadow-2xl shadow-black/60">
            <FullSlide html={result.slideHtmls[currentIndex]} index={currentIndex} />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between px-4 py-1.5 bg-black/90 border-t border-white/10">
        <button
          onClick={() => onChangeIndex(Math.max(0, currentIndex - 1))}
          disabled={currentIndex === 0}
          className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded text-[10px] text-white/50 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-20"
        >
          <ChevronLeft className="h-3 w-3" />
          Prev
        </button>

        <div className="flex items-center gap-0.5 max-w-[400px] overflow-x-auto">
          {outline.slides.map((_, idx) => (
            <button
              key={idx}
              onClick={() => onChangeIndex(idx)}
              className={cn(
                'rounded-full transition-all flex-shrink-0',
                idx === currentIndex ? 'w-4 h-1 bg-[#FF4301]' : 'w-1 h-1 bg-white/15 hover:bg-white/30'
              )}
            />
          ))}
        </div>

        <button
          onClick={() => onChangeIndex(Math.min(total - 1, currentIndex + 1))}
          disabled={currentIndex === total - 1}
          className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded text-[10px] text-white/50 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-20"
        >
          Next
          <ChevronRight className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
};

export default AdminPlayground;
