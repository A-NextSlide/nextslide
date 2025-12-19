import { useCallback, useState } from 'react';
import { STATUS_PHASES, type StatusPhase, type ThinkingStep } from '@/types/agentEvents';

export const useAgentStatus = () => {
  const [isAgentTyping, setIsAgentTyping] = useState(false);
  const [thinkingSteps, setThinkingSteps] = useState<ThinkingStep[]>([]);
  const [streamingText, setStreamingText] = useState('');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusPhase, setStatusPhase] = useState<string | null>(null);

  const addThinkingStep = useCallback((status: string, message?: string, query?: string) => {
    const phaseConfig = STATUS_PHASES[status as StatusPhase] || {
      icon: '⋯',
      label: status,
      color: '#6B7280',
      activeLabel: status,
    };

    const step: ThinkingStep = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      phase: status,
      label: phaseConfig.activeLabel || phaseConfig.label,
      detail: message || query,
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
