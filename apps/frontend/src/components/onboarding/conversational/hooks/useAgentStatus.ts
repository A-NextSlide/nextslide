import { useCallback, useState } from 'react';
import { STATUS_PHASES, type StatusPhase, type ThinkingStep } from '@/types/agentEvents';

const PLACEHOLDER_HOSTS = [
  'placehold.co',
  'placeholder.com',
  'via.placeholder.com',
  'placekitten.com',
  'placebear.com',
  'dummyimage.com',
  'fakeimg.pl',
  'picsum.photos',
  'loremflickr.com',
];

const URL_IN_TEXT_REGEX = /https?:\/\/[^\s)]+/i;

const isPlaceholderHost = (host?: string): boolean => {
  if (!host) return false;
  const normalizedHost = host.replace(/^www\./i, '').toLowerCase();
  return PLACEHOLDER_HOSTS.some((candidate) => (
    normalizedHost === candidate || normalizedHost.endsWith(`.${candidate}`)
  ));
};

const extractHostFromText = (value?: string): string | undefined => {
  if (!value) return undefined;
  const urlMatch = value.match(URL_IN_TEXT_REGEX)?.[0];
  if (!urlMatch) return undefined;
  const cleaned = urlMatch.replace(/[),.;]+$/g, '');
  try {
    return new URL(cleaned).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return undefined;
  }
};

const sanitizeStatusDetail = (status: string, detail?: string): string | undefined => {
  if (!detail) return undefined;
  const trimmed = detail.trim();
  if (!trimmed) return undefined;

  // For scrape progress lines, keep the message short and avoid placeholder URLs.
  if (status === 'scraping' || trimmed.toLowerCase().startsWith('reading content from')) {
    const host = extractHostFromText(trimmed);
    if (!host || isPlaceholderHost(host)) return 'Reading content from source...';
    return `Reading content from ${host}...`;
  }

  return trimmed;
};

export const useAgentStatus = () => {
  const [isAgentTyping, setIsAgentTyping] = useState(false);
  const [thinkingSteps, setThinkingSteps] = useState<ThinkingStep[]>([]);
  const [streamingText, setStreamingText] = useState('');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusPhase, setStatusPhase] = useState<string | null>(null);

  const addThinkingStep = useCallback((status: string, message?: string, query?: string) => {
    const phaseConfig = STATUS_PHASES[status as StatusPhase] || {
      icon: '...',
      label: status,
      color: '#6B7280',
      activeLabel: status,
    };

    const detail = sanitizeStatusDetail(status, message || query);

    const step: ThinkingStep = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      phase: status,
      label: phaseConfig.activeLabel || phaseConfig.label,
      detail,
      status: 'active',
      timestamp: new Date(),
    };

    setThinkingSteps((prev) => {
      const updated = prev.map((existing) => ({ ...existing, status: 'completed' as const }));
      return [...updated, step];
    });
  }, []);

  const clearThinkingSteps = useCallback(() => {
    setThinkingSteps([]);
  }, []);

  const completeThinkingStep = useCallback((phase: string) => {
    setThinkingSteps((prev) =>
      prev.map((step) => (step.phase === phase ? { ...step, status: 'completed' as const } : step))
    );
  }, []);

  const appendStreamingText = useCallback((chunk: string) => {
    setStreamingText((prev) => prev + chunk);
  }, []);

  const resetStatus = useCallback(() => {
    setStatusMessage(null);
    setStatusPhase(null);
    setStreamingText('');
  }, []);

  return {
    state: {
      isAgentTyping,
      thinkingSteps,
      streamingText,
      statusMessage,
      statusPhase,
    },
    actions: {
      setIsAgentTyping,
      addThinkingStep,
      clearThinkingSteps,
      completeThinkingStep,
      appendStreamingText,
      setStreamingText,
      setStatusMessage,
      setStatusPhase,
      resetStatus,
    },
  };
};
