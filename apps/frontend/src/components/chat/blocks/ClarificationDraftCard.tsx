import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ClarificationField } from '@/services/outlineAgentService';

type DraftPart =
  | { type: 'text'; value: string }
  | { type: 'field'; id: string; value: string };

type QuestionType = 'text' | 'number' | 'choice' | 'boolean';

interface ClarificationQuestion {
  id: string;
  label: string;
  type: QuestionType;
  options?: string[];
  defaultValue?: string;
  title?: string;
  hint?: string;
}

interface DraftTokenMeta {
  id: string;
  defaultValue: string;
  title: string;
  hint?: string;
}

interface ClarificationDraftCardProps {
  draft?: string;
  fields?: ClarificationField[];
  onConfirm: (text: string) => void;
  onEdit: (text: string) => void;
  className?: string;
  autoFocus?: boolean;
}

const TOKEN_REGEX = /\[\[([^\]]+)\]\]/g;

const parseDraft = (draft: string): DraftPart[] => {
  TOKEN_REGEX.lastIndex = 0;
  const parts: DraftPart[] = [];
  let lastIndex = 0;
  let fieldIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = TOKEN_REGEX.exec(draft)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', value: draft.slice(lastIndex, match.index) });
    }
    parts.push({
      type: 'field',
      id: `field-${fieldIndex}`,
      value: match[1]?.trim() || '',
    });
    fieldIndex += 1;
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < draft.length) {
    parts.push({ type: 'text', value: draft.slice(lastIndex) });
  }

  return parts.length > 0 ? parts : [{ type: 'text', value: draft }];
};

const buildResolvedDraft = (parts: DraftPart[], values: Record<string, string>) => (
  parts.map((part) => {
    if (part.type === 'text') return part.value;
    return values[part.id] ?? part.value;
  }).join('')
);

const normalizeQuestionLabel = (line: string) => {
  TOKEN_REGEX.lastIndex = 0;
  const withoutToken = line.replace(TOKEN_REGEX, '').trim();
  const withoutBullet = withoutToken
    .replace(/^\s*[-*]\s*/, '')
    .replace(/^\s*\d+\.\s*/, '');
  return withoutBullet.replace(/\s*[:\-–]\s*$/, '').trim();
};

const normalizeWhitespace = (value: string) => value.replace(/\s+/g, ' ').trim();

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const toTitleCase = (value: string) => (
  value.replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
);

const formatFieldLabel = (value: string) => {
  let cleaned = value.trim();
  if (!cleaned) return '';
  TOKEN_REGEX.lastIndex = 0;
  cleaned = cleaned.replace(TOKEN_REGEX, '').trim();
  cleaned = cleaned.replace(/\b(?:e\.?g\.?|eg\.?|example|for example)\b.*$/i, '').trim();
  cleaned = cleaned.split(',')[0]?.trim() ?? '';
  cleaned = cleaned.replace(/[:\-–]\s*$/, '').trim();
  cleaned = cleaned.replace(/_+/g, ' ');
  cleaned = normalizeWhitespace(cleaned);
  if (!cleaned) return '';
  if (/[A-Z]/.test(cleaned) && /[a-z]/.test(cleaned)) return cleaned;
  if (cleaned.toUpperCase() === cleaned) return cleaned;
  return toTitleCase(cleaned);
};

const stripExampleValue = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return value;
  if (/^(?:\(?\s*)?(?:e\.?g\.?|eg\.?|example|for example)\b[\s:–,)]*/i.test(trimmed)) {
    return '';
  }
  return value;
};

const cleanDefaultValue = (value: string, field: ClarificationField) => {
  let cleaned = value.trim();
  if (!cleaned) return value;

  const prefixes = [
    field.label,
    field.key,
    field.key?.replace(/_/g, ' '),
    field.key?.replace(/_/g, '-'),
  ].filter(Boolean) as string[];

  for (const prefix of prefixes) {
    const pattern = new RegExp(`^${escapeRegExp(prefix)}\\s*[:\\-–]\\s*`, 'i');
    if (pattern.test(cleaned)) {
      cleaned = cleaned.replace(pattern, '').trim();
      break;
    }
  }

  return stripExampleValue(cleaned);
};

const hasTokenLabelCue = (value: string) => (
  value.includes(':') ||
  /\b(e\.?g\.?|eg\.?|example|for example)\b/i.test(value)
);

const parseTokenLabelAndDefault = (rawValue: string) => {
  const trimmed = rawValue.trim();
  if (!trimmed) return { label: '', defaultValue: '' };
  if (!hasTokenLabelCue(trimmed)) {
    return { label: '', defaultValue: stripExampleValue(trimmed) };
  }

  const labelCandidate = formatFieldLabel(trimmed);
  if (!labelCandidate || /^\d+$/.test(labelCandidate)) {
    return { label: '', defaultValue: stripExampleValue(trimmed) };
  }

  const cleanedDefault = cleanDefaultValue(trimmed, {
    key: labelCandidate,
    label: labelCandidate,
    type: 'text',
  } as ClarificationField);

  return { label: labelCandidate, defaultValue: cleanedDefault };
};

const getSentenceTail = (text: string) => {
  const segments = text.split(/[\n.!?]/);
  return segments[segments.length - 1] ?? '';
};

const getSentenceHead = (text: string) => {
  const segments = text.split(/[\n.!?]/);
  return segments[0] ?? '';
};

const stripLeadingMarkers = (value: string) => (
  value
    .replace(/^\s*[-*]\s*/, '')
    .replace(/^\s*\d+\.\s*/, '')
);

const cleanBeforeSegment = (value: string) => {
  let cleaned = normalizeWhitespace(stripLeadingMarkers(value));
  cleaned = cleaned.replace(/^[,.;:–-]+\s*/, '');
  cleaned = cleaned.replace(/[:\-–]\s*$/, '');
  return cleaned.trim();
};

const cleanAfterSegment = (value: string) => {
  let cleaned = normalizeWhitespace(value);
  cleaned = cleaned.replace(/^[\s,.;:–-]+/, '');
  return cleaned.trim();
};

const getPromptParts = (before: string, after: string) => ({
  prefix: cleanBeforeSegment(getSentenceTail(before)),
  suffix: cleanAfterSegment(getSentenceHead(after)),
});

const buildPromptSnippet = (before: string, after: string) => {
  const { prefix, suffix } = getPromptParts(before, after);
  if (!prefix && !suffix) return '';
  const placeholder = '____';
  const combined = prefix && suffix
    ? `${prefix} ${placeholder} ${suffix}`
    : (prefix ? `${prefix} ${placeholder}` : `${placeholder} ${suffix}`);
  return combined.replace(/\s+([.,!?;:])/g, '$1').trim();
};

const buildHintSnippet = (before: string, after: string, title: string) => {
  const { prefix, suffix } = getPromptParts(before, after);
  const primary = prefix || suffix;
  if (!primary) return undefined;
  if (/[,:]/.test(primary)) return undefined;
  const hint = prefix ? `${primary} ____` : `____ ${suffix}`;
  if (hint.length > 60) return undefined;
  const normalizedHint = normalizeWhitespace(hint.replace(/____/g, '')).toLowerCase();
  const normalizedTitle = normalizeWhitespace(title).toLowerCase();
  if (!normalizedHint || normalizedHint === normalizedTitle || normalizedHint.includes(normalizedTitle)) {
    return undefined;
  }
  return hint.replace(/\s+([.,!?;:])/g, '$1').trim();
};

const inferQuestionTitle = ({
  before,
  after,
  tokenValue,
  fallback,
  index,
}: {
  before: string;
  after: string;
  tokenValue: string;
  fallback: string;
  index: number;
}) => {
  const beforeLower = before.toLowerCase();
  const afterLower = after.toLowerCase();
  const tokenLower = tokenValue.toLowerCase();
  const context = `${beforeLower} ${afterLower} ${tokenLower}`;

  if (/(tone|voice|style|vibe)/.test(context)) return 'Tone';
  if (/(motion|animation|mode|transition)/.test(context)) return 'Motion';
  if (/(slide)/.test(context) && /^\d+$/.test(tokenLower)) return 'Slide count';
  if (/(audience|attendee|attendees|viewer|viewers|customer|customers)/.test(context)) return 'Audience';
  if (/\bfor\b/.test(beforeLower) && tokenLower && !/^\d+$/.test(tokenLower)) return 'Audience';
  if (/(brand|company|organization|client|logo|domain)/.test(context)) return 'Brand';
  if (/(title|topic|subject|theme)/.test(context)) return 'Topic';

  const cleanedFallback = normalizeWhitespace(fallback);
  if (cleanedFallback && cleanedFallback.length <= 60) return cleanedFallback;
  return `Detail ${index + 1}`;
};

const formatQuestionTitle = (title: string) => {
  const normalized = normalizeWhitespace(title);
  if (!normalized) return 'Quick question';
  return /[?.!]$/.test(normalized) ? normalized : `${normalized}?`;
};

const buildDraftTokenMeta = (parts: DraftPart[]): DraftTokenMeta[] => {
  const tokens: DraftTokenMeta[] = [];
  parts.forEach((part, index) => {
    if (part.type !== 'field') return;
    const before = index > 0 && parts[index - 1].type === 'text' ? parts[index - 1].value : '';
    const after = index < parts.length - 1 && parts[index + 1].type === 'text' ? parts[index + 1].value : '';
    const { prefix, suffix } = getPromptParts(before, after);
    const prompt = buildPromptSnippet(before, after);
    const fallback = normalizeQuestionLabel(`${prefix} ${suffix}`) || prompt || `Detail ${tokens.length + 1}`;
    const rawTokenValue = part.value?.trim() || '';
    const parsedToken = parseTokenLabelAndDefault(rawTokenValue);
    const defaultValue = parsedToken.label ? parsedToken.defaultValue : stripExampleValue(rawTokenValue);
    const tokenValueForInference = defaultValue || rawTokenValue;
    const title = inferQuestionTitle({
      before: prefix,
      after: suffix,
      tokenValue: tokenValueForInference,
      fallback,
      index: tokens.length,
    });
    const resolvedTitle = parsedToken.label || title;
    const hint = buildHintSnippet(before, after, resolvedTitle);
    tokens.push({
      id: part.id,
      defaultValue,
      title: resolvedTitle,
      hint,
    });
  });
  return tokens;
};

const buildQuestionsFromDraft = (draft: string, tokens: DraftTokenMeta[]): ClarificationQuestion[] => {
  if (tokens.length === 0) {
    const label = normalizeQuestionLabel(draft);
    return label
      ? [{ id: 'field-0', label, title: label, type: 'text' }]
      : [];
  }

  return tokens.map((token, index) => ({
    id: token.id,
    label: token.title || `Detail ${index + 1}`,
    title: token.title,
    hint: token.hint,
    type: 'text',
    defaultValue: token.defaultValue,
  }));
};

const buildQuestionsFromFields = (fields: ClarificationField[]): ClarificationQuestion[] => (
  fields.map((field, index) => {
    const labelSource = field.label || field.key || '';
    const label = formatFieldLabel(labelSource) || `Detail ${index + 1}`;
    const rawDefaultValue = field.value !== undefined
      ? String(field.value)
      : '';
    const defaultValue = typeof field.value === 'string'
      ? cleanDefaultValue(rawDefaultValue, field)
      : rawDefaultValue;
    return {
      id: field.key || `field-${index}`,
      label,
      title: label,
      hint: undefined,
      type: field.type || 'text',
      options: field.options,
      defaultValue,
    };
  })
);

const ClarificationDraftCard: React.FC<ClarificationDraftCardProps> = ({
  draft: rawDraft,
  fields,
  onConfirm,
  onEdit,
  className,
  autoFocus = true,
}) => {
  const draft = typeof rawDraft === 'string' ? rawDraft.trim() : '';
  const hasFields = Boolean(fields && fields.length > 0);
  const parsedDraft = useMemo(() => (draft ? parseDraft(draft) : []), [draft]);
  const draftTokens = useMemo(
    () => (draft && !hasFields ? buildDraftTokenMeta(parsedDraft) : []),
    [draft, hasFields, parsedDraft]
  );
  const templateParts = useMemo(() => (draft && !hasFields ? parsedDraft : []), [draft, hasFields, parsedDraft]);
  const questions = useMemo(() => {
    if (hasFields && fields) return buildQuestionsFromFields(fields);
    if (draft) return buildQuestionsFromDraft(draft, draftTokens);
    return [];
  }, [draft, draftTokens, fields, hasFields]);

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
  const questionTitle = currentQuestion ? formatQuestionTitle(currentQuestion.title ?? currentQuestion.label) : '';
  const questionHint = currentQuestion?.hint;
  const questionAnimationKey = currentQuestion ? `${currentQuestion.id}-${currentIndex}` : 'question';
  const typingDurationMs = Math.min(1400, Math.max(400, questionTitle.length * 28));
  const shouldTypeQuestion = questionTitle.length <= 72;
  const cursorHideDelayMs = Math.min(2200, typingDurationMs + 500);

  const buildResponse = useCallback((override?: { id: string; value: string }) => {
    const resolvedAnswers = override
      ? { ...answers, [override.id]: override.value }
      : answers;

    if (templateParts.length > 0) {
      const answeredQuestions = questions.filter((question) => (resolvedAnswers[question.id] ?? '').trim());
      if (answeredQuestions.length === 0) return '';
      if (answeredQuestions.length === questions.length) {
        return buildResolvedDraft(templateParts, resolvedAnswers).trim();
      }
    }

    return questions
      .map((question) => {
        const value = (resolvedAnswers[question.id] ?? '').trim();
        if (!value) return '';
        return `${question.label}: ${value}`;
      })
      .filter(Boolean)
      .join('\n')
      .trim();
  }, [answers, questions, templateParts]);

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
          <div className="text-sm font-semibold text-zinc-800 animate-fade-in">
            <span
              key={questionAnimationKey}
              className={cn(shouldTypeQuestion ? 'typing-animation' : '')}
              style={shouldTypeQuestion ? {
                '--message-length': questionTitle.length,
                '--animation-duration': `${typingDurationMs}ms`,
              } as React.CSSProperties : undefined}
            >
              {questionTitle}
            </span>
            {shouldTypeQuestion && (
              <span
                className="typing-cursor typing-cursor-fade relative -top-[1px] ml-0.5"
                style={{ '--cursor-hide-delay': `${cursorHideDelayMs}ms` } as React.CSSProperties}
              >
                |
              </span>
            )}
          </div>
          {questionHint && (
            <div className="mt-1 text-xs text-zinc-400">{questionHint}</div>
          )}
          <input
            ref={inputRef as React.RefObject<HTMLInputElement>}
            type={inputType}
            value={currentValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-inner focus:border-orange-400 focus:outline-none"
            placeholder="Type your answer, press Enter, or skip"
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
