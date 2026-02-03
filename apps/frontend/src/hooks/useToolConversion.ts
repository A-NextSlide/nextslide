import { useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/SupabaseAuthContext';
import {
  fileToBase64,
  analyzeFiles,
  type FileInput,
  type FileAnalysisResponse,
} from '@/services/fileAnalysisService';
import { outlineApi } from '@/services/outlineApi';
import type { ToolPageConfig } from '@/config/toolPages';
import type { SlideData } from '@/types/SlideTypes';
import { API_BASE } from '@/config/environment';

export type ConversionState = 'idle' | 'processing' | 'generating' | 'generated' | 'complete' | 'error';

export interface GenerationProgress {
  totalSlides: number;
  completedSlides: number;
  slideTitles: string[];
  title: string;
  /** Current backend phase (initialization, theme_generation, layout_design, image_collection, slide_generation, finalization). */
  phase: string;
  /** Human-readable message from the backend. */
  phaseMessage: string;
  /** 0-100 overall progress from the backend compose pipeline. */
  backendProgress: number;
  /** Index of the slide currently being generated (0-based), or null. */
  activeSlideIndex: number | null;
}

interface UseToolConversionReturn {
  state: ConversionState;
  progress: number;
  error: string | null;
  analysisResult: FileAnalysisResponse | null;
  fileName: string | null;
  deckId: string | null;
  /** Slides streamed from the tool generation endpoint. */
  slides: SlideData[];
  /** Index after which slides are locked (0-based). */
  lockedAfter: number;
  /** Progress info during generation. */
  generationProgress: GenerationProgress;
  handleFileUpload: (file: File) => Promise<void>;
  handleUrlSubmit: (url: string) => void;
  handleTextSubmit: (text: string) => void;
  navigateToApp: () => void;
  reset: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation helpers
// ─────────────────────────────────────────────────────────────────────────────

function validateFileType(file: File, config: ToolPageConfig): boolean {
  if (!config.acceptedFileTypes) return true;
  const extensions = config.acceptedFileTypes.split(',').map((e) => e.trim().toLowerCase());
  return extensions.some((ext) => file.name.toLowerCase().endsWith(ext));
}

function validateUrl(url: string): boolean {
  try {
    const parsed = new URL(
      url.startsWith('http://') || url.startsWith('https://') ? url : `https://${url}`
    );
    return !!parsed.hostname && parsed.hostname.includes('.');
  } catch {
    return false;
  }
}

function buildSeedPrompt(config: ToolPageConfig, extra?: string): string {
  const prompts: Record<string, string> = {
    'pdf-to-ppt': 'Convert my PDF into a professional presentation',
    'doc-to-ppt': 'Convert my Word document into a presentation',
    'notes-to-presentation': '',
    'pitch-deck-generator': '',
    'website-to-ppt': `Create a presentation from this website: ${extra || ''}`,
    'google-slides-to-ppt': 'Improve and enhance my Google Slides presentation',
    'improve-my-slides': 'Analyze and improve the design of my slides',
    'text-to-ppt': '',
    'csv-to-ppt': 'Create a data presentation with charts from my spreadsheet',
    'image-to-ppt': 'Create a presentation using my uploaded images',
  };
  return prompts[config.slug] || `Create a presentation from my ${config.slug} content`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Smooth progress timer
// ─────────────────────────────────────────────────────────────────────────────

const TOTAL_DURATION_MS = 90_000;
const TICK_MS = 400;
const MAX_PASSIVE = 98;

function easeOutProgress(elapsed: number): number {
  const t = Math.min(elapsed / TOTAL_DURATION_MS, 1);
  const eased = 1 - Math.pow(1 - t, 2.5);
  return eased * MAX_PASSIVE;
}

// ─────────────────────────────────────────────────────────────────────────────
// SSE stream parser for tool generation
// ─────────────────────────────────────────────────────────────────────────────

function extractSlideData(eventData: any): SlideData | null {
  // The event envelope puts the raw payload under both `data` and `payload`.
  // The slide itself lives in `slide_data` (or `slide`) within that payload.
  const payload = eventData.data || eventData.payload || eventData;
  const raw = payload.slide_data || payload.slide || payload.data || null;
  if (!raw) return null;

  return {
    id: raw.id || `tool-slide-${eventData.slide_index ?? 0}`,
    deckId: raw.deckId || 'tool-preview',
    title: raw.title || '',
    order: eventData.slide_index ?? 0,
    components: Array.isArray(raw.components) ? raw.components : [],
    status: 'completed',
    backgroundColor: raw.backgroundColor,
    backgroundImage: raw.backgroundImage,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_GENERATION_PROGRESS: GenerationProgress = {
  totalSlides: 6,
  completedSlides: 0,
  slideTitles: [],
  title: '',
  phase: '',
  phaseMessage: '',
  backendProgress: 0,
  activeSlideIndex: null,
};

export function useToolConversion(config: ToolPageConfig): UseToolConversionReturn {
  const [state, setState] = useState<ConversionState>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<FileAnalysisResponse | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [deckId, setDeckId] = useState<string | null>(null);
  const [slides, setSlides] = useState<SlideData[]>([]);
  const [lockedAfter, setLockedAfter] = useState(3);
  const [generationProgress, setGenerationProgress] = useState<GenerationProgress>(
    DEFAULT_GENERATION_PROGRESS
  );
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(0);
  /** Tracks when an authenticated user falls back to the tool generation endpoint. */
  const authFallbackRef = useRef(false);

  const startProgressTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    startTimeRef.current = Date.now();
    setProgress(1);
    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      setProgress(Math.round(easeOutProgress(elapsed) * 10) / 10);
      if (elapsed > 180_000 && timerRef.current) clearInterval(timerRef.current);
    }, TICK_MS);
  }, []);

  const finishProgress = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    setProgress(100);
  }, []);

  const stopProgress = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, []);

  const storeForLater = useCallback(
    (prompt: string, fileContext?: FileAnalysisResponse) => {
      try {
        localStorage.setItem('landing_prompt', prompt);
        localStorage.setItem('landing_prompt_ts', String(Date.now()));
        if (fileContext) localStorage.setItem('landing_file_context', JSON.stringify(fileContext));
      } catch { /* private browsing */ }
    },
    []
  );

  // ── Tool generation via SSE ──────────────────────────────────────────────

  const startGeneration = useCallback(
    async (analysis: string, prompt: string) => {
      setState('generating');
      setSlides([]);
      setGenerationProgress({ ...DEFAULT_GENERATION_PROGRESS });
      setProgress(0);

      try {
        // Remove /api prefix since API_BASE already includes it
        const url = `${API_BASE}/tool/generate`;

        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            file_analysis: analysis,
            prompt,
          }),
        });

        if (!response.ok) {
          const errorBody = await response.text();
          throw new Error(
            response.status === 429
              ? 'Rate limit reached. Please wait a few minutes and try again.'
              : `Generation failed: ${errorBody}`
          );
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error('No response stream');

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Process complete SSE messages
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // keep incomplete line in buffer

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const jsonStr = line.slice(6).trim();
            if (!jsonStr) continue;

            try {
              const event = JSON.parse(jsonStr);
              const type = event.type;

              if (type === 'generation_started') {
                const total = event.data?.total_slides || event.total_slides || 6;
                setGenerationProgress((prev) => ({ ...prev, totalSlides: total }));
              } else if (type === 'outline_ready') {
                const data = event.data || event;
                setGenerationProgress((prev) => ({
                  ...prev,
                  title: data.title || '',
                  slideTitles: data.slide_titles || [],
                  // Outline is done — advance phase so the UI shows it as completed
                  phase: prev.phase || 'initialization',
                }));
              } else if (type === 'slide_generated') {
                const slideIdx = event.slide_index ?? event.data?.slide_index;
                const slideData = extractSlideData(event);
                if (slideData) {
                  setSlides((prev) => {
                    // Avoid duplicates by slide index
                    const idx = slideIdx ?? prev.length;
                    const copy = [...prev];
                    copy[idx] = slideData;
                    // Filter out undefined gaps
                    return copy.filter(Boolean);
                  });
                }
                // Always count the slide as completed for progress, even if
                // extractSlideData returned null (e.g. empty components).
                setGenerationProgress((prev) => ({
                  ...prev,
                  completedSlides: Math.min(prev.completedSlides + 1, prev.totalSlides),
                }));
              } else if (type === 'tool_complete') {
                const data = event.data || event;
                const lockedInfo = data.locked_slide_info;
                if (authFallbackRef.current) {
                  // Authenticated users see all slides unlocked
                  setLockedAfter(lockedInfo?.total_count ?? 999);
                } else if (lockedInfo) {
                  setLockedAfter(lockedInfo.unlocked_count ?? 3);
                }
                setState('generated');
              } else if (type === 'theme_generated') {
                // Brand/theme design phase is complete
                setGenerationProgress((prev) => ({
                  ...prev,
                  phase: 'layout_design',
                  phaseMessage: 'Theme ready — planning slide layouts',
                }));
              } else if (type === 'slides_generation_started') {
                const data = event.data || event;
                setGenerationProgress((prev) => ({
                  ...prev,
                  phase: 'slide_generation',
                  totalSlides: data.total_slides || prev.totalSlides,
                }));
              } else if (type === 'progress') {
                const data = event.data || event;
                setGenerationProgress((prev) => ({
                  ...prev,
                  phase: data.phase || prev.phase,
                  phaseMessage: data.message || prev.phaseMessage,
                  backendProgress: data.progress ?? prev.backendProgress,
                }));
              } else if (type === 'slide_started') {
                const data = event.data || event;
                const idx = data.slide_index ?? event.slide_index;
                setGenerationProgress((prev) => ({
                  ...prev,
                  activeSlideIndex: idx ?? prev.activeSlideIndex,
                }));
              } else if (type === 'error') {
                const msg = event.data?.error || event.error || 'Generation failed';
                throw new Error(msg);
              }
            } catch (parseErr) {
              // If it's a thrown Error from above, re-throw
              if (parseErr instanceof Error && parseErr.message !== 'Generation failed') {
                // Only re-throw actual generation errors, not JSON parse errors
                if (!jsonStr) continue;
                // Check if this was our thrown error
                const msg = (parseErr as Error).message;
                if (msg.startsWith('Rate limit') || msg.startsWith('Generation failed')) {
                  throw parseErr;
                }
              }
              // Otherwise ignore malformed SSE lines
            }
          }
        }

        // If we exited the loop without hitting tool_complete, transition anyway
        setState((prev) => (prev === 'generating' ? 'generated' : prev));
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Slide generation failed.';
        setError(message);
        setState('error');
      }
    },
    []
  );

  // ── File upload — main flow ──────────────────────────────────────────────

  const handleFileUpload = useCallback(
    async (file: File) => {
      if (!validateFileType(file, config)) {
        setError(`Invalid file type. Accepted formats: ${config.acceptedFileTypes}`);
        setState('error');
        return;
      }
      if (file.size > 50 * 1024 * 1024) {
        setError('File size exceeds 50 MB limit.');
        setState('error');
        return;
      }

      setState('processing');
      setError(null);
      setFileName(file.name);
      setDeckId(null);
      setSlides([]);

      startProgressTimer();

      try {
        // Step 1: base64
        const base64 = await fileToBase64(file);

        const fileInput: FileInput = {
          id: crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          name: file.name,
          type: file.type,
          content: base64,
          size: file.size,
        };

        // Step 2: Analyze
        const analysisRes = await analyzeFiles([fileInput], buildSeedPrompt(config));
        setAnalysisResult(analysisRes);

        const basePrompt = buildSeedPrompt(config);
        const analysis = analysisRes.combined_analysis || analysisRes.results?.[0]?.analysis || '';
        const fullPrompt = `${basePrompt}\n\nHere is the extracted content from the uploaded file:\n${analysis}`;

        // Authenticated users → try full pipeline (outline → deck → navigate)
        if (isAuthenticated) {
          try {
            const slideCount = Math.min(Math.max(analysisRes.pages_analyzed || 6, 6), 10);
            const outline = await outlineApi.generateOutlineStream(fullPrompt, [], {
              slideCount,
              detailLevel: 'standard',
            });
            const { deck_id } = await outlineApi.createDeckFromOutline(outline, undefined);

            finishProgress();
            setDeckId(deck_id);
            setState('complete');
            setTimeout(() => navigate(`/deck/${deck_id}?new=true`), 600);
            return;
          } catch (outlineErr) {
            // Outline pipeline failed — fall through to tool generation
            console.warn('[ToolConversion] Outline pipeline failed, using tool generation:', outlineErr);
            authFallbackRef.current = true;
          }
        }

        // Unauthenticated (or authenticated fallback) → in-page generation
        storeForLater(fullPrompt, analysisRes);
        finishProgress();

        // Start tool slide generation
        await startGeneration(analysis, basePrompt);
      } catch (err) {
        stopProgress();
        setError(err instanceof Error ? err.message : 'An error occurred during processing.');
        setState('error');
      }
    },
    [config, isAuthenticated, navigate, storeForLater, startProgressTimer, finishProgress, stopProgress, startGeneration]
  );

  // ── URL submit ───────────────────────────────────────────────────────────

  const handleUrlSubmit = useCallback(
    (url: string) => {
      const trimmed = url.trim();
      if (!validateUrl(trimmed)) {
        setError('Please enter a valid URL (e.g. https://example.com).');
        setState('error');
        return;
      }
      const fullUrl =
        trimmed.startsWith('http://') || trimmed.startsWith('https://') ? trimmed : `https://${trimmed}`;

      setState('processing');
      setProgress(50);
      setError(null);

      const prompt = buildSeedPrompt(config, fullUrl);
      setTimeout(() => {
        setProgress(100);
        setState('complete');
        storeForLater(prompt);
        navigate(isAuthenticated ? '/app' : '/signup');
      }, 800);
    },
    [config, isAuthenticated, navigate, storeForLater]
  );

  // ── Text submit ──────────────────────────────────────────────────────────

  const handleTextSubmit = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (trimmed.length < 10) {
        setError('Please enter at least 10 characters.');
        setState('error');
        return;
      }

      setState('processing');
      setProgress(50);
      setError(null);

      setTimeout(() => {
        setProgress(100);
        setState('complete');
        storeForLater(trimmed);
        navigate(isAuthenticated ? '/app' : '/signup');
      }, 600);
    },
    [isAuthenticated, navigate, storeForLater]
  );

  // ── Navigate (manual CTA) ───────────────────────────────────────────────

  const navigateToApp = useCallback(() => {
    if (deckId) {
      navigate(`/deck/${deckId}?new=true`);
      return;
    }
    storeForLater(buildSeedPrompt(config), analysisResult || undefined);
    navigate(isAuthenticated ? '/app' : '/signup');
  }, [config, analysisResult, deckId, isAuthenticated, navigate, storeForLater]);

  // ── Reset ────────────────────────────────────────────────────────────────

  const reset = useCallback(() => {
    stopProgress();
    setState('idle');
    setProgress(0);
    setError(null);
    setAnalysisResult(null);
    setFileName(null);
    setDeckId(null);
    setSlides([]);
    setGenerationProgress({ ...DEFAULT_GENERATION_PROGRESS });
    authFallbackRef.current = false;
  }, [stopProgress]);

  return {
    state,
    progress,
    error,
    analysisResult,
    fileName,
    deckId,
    slides,
    lockedAfter,
    generationProgress,
    handleFileUpload,
    handleUrlSubmit,
    handleTextSubmit,
    navigateToApp,
    reset,
  };
}
