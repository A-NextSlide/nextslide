import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ClarificationField } from '@/services/outlineAgentService';

/**
 * Simple markdown renderer for inline formatting (bold, italic)
 */
const renderMarkdown = (text: string): React.ReactNode => {
  if (!text) return null;

  const parts: React.ReactNode[] = [];
  let remaining = text;
  let keyIndex = 0;

  while (remaining.length > 0) {
    const boldMatch = remaining.match(/^\*\*([^*]+)\*\*/);
    if (boldMatch) {
      parts.push(<strong key={keyIndex++} className="font-semibold">{boldMatch[1]}</strong>);
      remaining = remaining.slice(boldMatch[0].length);
      continue;
    }

    const italicMatch = remaining.match(/^\*([^*]+)\*/);
    if (italicMatch) {
      parts.push(<em key={keyIndex++} className="italic">{italicMatch[1]}</em>);
      remaining = remaining.slice(italicMatch[0].length);
      continue;
    }

    const nextBold = remaining.indexOf('**');
    const nextItalic = remaining.search(/(?<!\*)\*(?!\*)/);

    let nextDelim = -1;
    if (nextBold !== -1 && nextItalic !== -1) {
      nextDelim = Math.min(nextBold, nextItalic);
    } else if (nextBold !== -1) {
      nextDelim = nextBold;
    } else if (nextItalic !== -1) {
      nextDelim = nextItalic;
    }

    if (nextDelim === -1 || nextDelim === 0) {
      if (nextDelim === 0) {
        parts.push(remaining[0]);
        remaining = remaining.slice(1);
      } else {
        parts.push(remaining);
        remaining = '';
      }
    } else {
      parts.push(remaining.slice(0, nextDelim));
      remaining = remaining.slice(nextDelim);
    }
  }

  return parts.length === 1 && typeof parts[0] === 'string' ? parts[0] : <>{parts}</>;
};

type QuestionType = 'text' | 'number' | 'choice' | 'boolean';

interface ClarificationQuestion {
  id: string;
  label: string;
  responseLabel: string;
  type: QuestionType;
  options?: string[];
  defaultValue?: string;
  placeholder?: string;
}

interface ClarificationDraftCardProps {
  fields?: ClarificationField[];
  onConfirm: (text: string) => void;
  onEdit: (text: string) => void;
  className?: string;
  autoFocus?: boolean;
}

const formatKeyLabel = (value?: string) => {
  if (!value) return '';
  const cleaned = value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim();
  if (!cleaned) return '';
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
};

const isKeyLikeLabel = (value: string) => (
  /[a-z][A-Z]/.test(value) || /^[a-z0-9_-]+$/i.test(value)
);

const normalizeLabel = (value?: string) => {
  const trimmed = value?.trim() || '';
  if (!trimmed) return '';
  return isKeyLikeLabel(trimmed) ? formatKeyLabel(trimmed) : trimmed;
};

const normalizeResponseLabel = (value: string) => value.replace(/[?]+$/, '').trim();

const normalizeKey = (value?: string) => (value || '').replace(/[_-]+/g, '').toLowerCase();

const extractSingleExample = (placeholder?: string): string | undefined => {
  const raw = (placeholder || '').trim();
  if (!raw) return undefined;
  if (!/^(e\.?\s*g\.?|for example)\b/i.test(raw)) return undefined;

  const withoutPrefix = raw
    .replace(/^(e\.?\s*g\.?|for example)\s*[:,]?\s*/i, '')
    .trim();
  if (!withoutPrefix) return undefined;

  const cleaned = withoutPrefix
    .replace(/\s+or\s+/gi, ', ')
    .replace(/\s+and\/or\s+/gi, ', ')
    .replace(/\.\s*$/, '');

  const first = cleaned
    .split(',')
    .map((part) => part.trim().replace(/^["']+|["']+$/g, ''))
    .find(Boolean);

  return first || undefined;
};

const KEY_LABEL_OVERRIDES: Record<string, string> = {
  slidemode: 'How will this be presented (live talk with minimal text vs detailed document or interactive web)',
};

const buildQuestionsFromFields = (fields: ClarificationField[]): ClarificationQuestion[] => (
  fields.map((field, index) => {
    const rawLabel = field.label?.trim() || '';
    const overrideLabel = KEY_LABEL_OVERRIDES[normalizeKey(field.key)];
    const fallbackLabel = formatKeyLabel(field.key);
    const isFallbackLabel = !rawLabel ||
      isKeyLikeLabel(rawLabel) ||
      (fallbackLabel && rawLabel.toLowerCase() === fallbackLabel.toLowerCase());
    const normalizedLabel = (overrideLabel && isFallbackLabel) ? overrideLabel : normalizeLabel(rawLabel);
    const label = normalizedLabel || fallbackLabel || `Detail ${index + 1}`;
    const responseLabel = normalizeResponseLabel(normalizedLabel || fallbackLabel || label);
    const examplePrefill = extractSingleExample(field.placeholder);
    let defaultValue = field.value !== undefined ? String(field.value) : (examplePrefill || '');
    if (field.type === 'boolean' && typeof field.value === 'boolean') {
      defaultValue = field.value ? 'Yes' : 'No';
    }
    return {
      id: field.key || `field-${index}`,
      label,
      responseLabel,
      type: field.type || 'text',
      options: field.options,
      defaultValue,
      placeholder: field.placeholder,
    };
  })
);

const ClarificationDraftCard: React.FC<ClarificationDraftCardProps> = ({
  fields,
  onConfirm,
  onEdit,
  className,
  autoFocus = true,
}) => {
  const questions = useMemo(
    () => (fields && fields.length > 0 ? buildQuestionsFromFields(fields) : []),
    [fields]
  );

  const initialAnswers = useMemo(() => (
    questions.reduce((acc, question) => {
      if (question.defaultValue !== undefined) {
        acc[question.id] = question.defaultValue;
      }
      return acc;
    }, {} as Record<string, string>)
  ), [questions]);

  const [answers, setAnswers] = useState<Record<string, string>>(initialAnswers);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  useEffect(() => {
    setAnswers(initialAnswers);
    setCurrentIndex(0);
    setIsComplete(false);
  }, [initialAnswers, questions.length]);

  useEffect(() => {
    if (!autoFocus) return;
    if (!inputRef.current) return;
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [autoFocus, currentIndex]);

  const currentQuestion = questions[currentIndex];
  const currentValue = currentQuestion ? answers[currentQuestion.id] ?? '' : '';

  const buildResponse = useCallback((override?: { id: string; value: string }) => {
    const resolvedAnswers = override
      ? { ...answers, [override.id]: override.value }
      : answers;

    return questions
      .map((question) => {
        const value = (resolvedAnswers[question.id] ?? '').trim();
        if (!value) return '';
        const label = question.responseLabel || question.label;
        return `${label}: ${value}`;
      })
      .filter(Boolean)
      .join('\n')
      .trim();
  }, [answers, questions]);

  const handleAdvance = useCallback((valueOverride?: string) => {
    if (!currentQuestion) return;
    const trimmedValue = (valueOverride ?? currentValue).trim();
    if (!trimmedValue) return;

    setAnswers((prev) => ({ ...prev, [currentQuestion.id]: trimmedValue }));

    if (currentIndex >= questions.length - 1) {
      onConfirm(buildResponse({ id: currentQuestion.id, value: trimmedValue }));
      setIsComplete(true);
      return;
    }

    setCurrentIndex((prev) => Math.min(prev + 1, questions.length - 1));
  }, [buildResponse, currentIndex, currentQuestion, currentValue, onConfirm, questions.length]);

  const handlePrevQuestion = useCallback(() => {
    setCurrentIndex((prev) => Math.max(prev - 1, 0));
  }, []);

  const handleNextQuestion = useCallback(() => {
    setCurrentIndex((prev) => Math.min(prev + 1, questions.length - 1));
  }, [questions.length]);

  const handleSkip = useCallback(() => {
    if (!currentQuestion) return;

    if (currentIndex >= questions.length - 1) {
      const resolved = buildResponse({ id: currentQuestion.id, value: '' });
      onConfirm(resolved || 'No additional details.');
      setIsComplete(true);
      return;
    }

    setAnswers((prev) => ({ ...prev, [currentQuestion.id]: '' }));
    setCurrentIndex((prev) => Math.min(prev + 1, questions.length - 1));
  }, [buildResponse, currentIndex, currentQuestion, onConfirm, questions.length]);

  const handleEdit = useCallback(() => {
    const resolved = buildResponse();
    if (resolved) {
      onEdit(resolved);
      setIsComplete(true);
    }
  }, [buildResponse, onEdit]);

  const handleInputChange = useCallback((event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (!currentQuestion) return;
    const next = event.target.value;
    setAnswers((prev) => ({ ...prev, [currentQuestion.id]: next }));
  }, [currentQuestion]);

  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    handleAdvance();
  }, [handleAdvance]);

  if (!currentQuestion) return null;

  const isLast = currentIndex === questions.length - 1;
  const isChoice = currentQuestion.type === 'choice' && (currentQuestion.options?.length || 0) > 0;
  const isBoolean = currentQuestion.type === 'boolean';
  const inputType = currentQuestion.type === 'number' ? 'number' : 'text';
  const actionLabel = isLast ? 'Submit' : 'Next';
  const canGoBack = currentIndex > 0;
  const canGoForward = currentIndex < questions.length - 1;

  return (
    <div
      className={cn(
        'w-full max-w-[560px] overflow-hidden transition-all duration-300 ease-in-out',
        isComplete ? 'max-h-0 opacity-0 mt-0' : 'max-h-[480px] opacity-100 mt-2'
      )}
      aria-hidden={isComplete}
    >
      <div
        className={cn(
          'rounded-2xl border border-zinc-200/70 bg-white/95 px-4 py-3 shadow-sm',
          className
        )}
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
              Quick questions
            </div>
            <div className="mt-1 flex items-center gap-1 text-[10px] text-zinc-400">
              <button
                type="button"
                onClick={handlePrevQuestion}
                disabled={!canGoBack}
                className={cn(
                  'inline-flex h-5 w-5 items-center justify-center rounded-full border border-zinc-200 text-zinc-400 transition',
                  canGoBack ? 'hover:bg-zinc-100' : 'opacity-40'
                )}
                aria-label="Previous question"
              >
                <ChevronLeft className="h-3 w-3" />
              </button>
              <span>
                {currentIndex + 1} of {questions.length}
              </span>
              <button
                type="button"
                onClick={handleNextQuestion}
                disabled={!canGoForward}
                className={cn(
                  'inline-flex h-5 w-5 items-center justify-center rounded-full border border-zinc-200 text-zinc-400 transition',
                  canGoForward ? 'hover:bg-zinc-100' : 'opacity-40'
                )}
                aria-label="Next question"
              >
                <ChevronRight className="h-3 w-3" />
              </button>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleSkip}
              className="inline-flex h-7 px-2.5 items-center justify-center rounded-full border border-zinc-200 text-[11px] font-semibold text-zinc-500 transition hover:bg-zinc-100"
              aria-label="Skip question"
            >
              Skip
            </button>
            <button
              type="button"
              onClick={() => handleAdvance()}
              className="inline-flex h-7 px-2.5 items-center justify-center rounded-full bg-orange-500 text-white text-[11px] font-semibold shadow-sm transition hover:bg-orange-600"
              aria-label={actionLabel}
            >
              <Check className="h-3.5 w-3.5 mr-1" />
              {actionLabel}
            </button>
            <button
              type="button"
              onClick={handleEdit}
              className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-zinc-200 text-zinc-500 transition hover:bg-zinc-100"
              aria-label="Edit in chat"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="mt-3">
          <div className="text-sm font-medium text-orange-600 mb-2">
            <span className="mr-2">{currentIndex + 1}.</span>
            <span>{renderMarkdown(currentQuestion.label)}</span>
          </div>

          <input
            ref={inputRef as React.RefObject<HTMLInputElement>}
            type={inputType}
            value={currentValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-inner focus:border-orange-400 focus:outline-none"
            placeholder={currentQuestion.placeholder || "Type your answer, press Enter, or skip"}
          />

          {isChoice && currentQuestion.options && (
            <div className="mt-2 flex flex-wrap gap-2">
              {currentQuestion.options.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => handleAdvance(option)}
                  className="rounded-full border border-zinc-200 px-3 py-1 text-xs text-zinc-600 transition hover:border-orange-300 hover:text-orange-600"
                >
                  {option}
                </button>
              ))}
            </div>
          )}

          {isBoolean && (
            <div className="mt-2 flex flex-wrap gap-2">
              {['Yes', 'No'].map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => handleAdvance(option)}
                  className="rounded-full border border-zinc-200 px-3 py-1 text-xs text-zinc-600 transition hover:border-orange-300 hover:text-orange-600"
                >
                  {option}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="mt-2 text-[10px] text-zinc-400">
          Press Enter to continue. Skip moves on. Submit sends everything at once.
        </div>
      </div>
    </div>
  );
};

export default ClarificationDraftCard;
