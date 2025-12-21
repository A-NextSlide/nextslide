import React from 'react';
import type { ActionButton } from '../types';

const BUTTON_REGEX = /\[Button:\s*([^\|]+)\s*\|\s*([^\]]+)\]/g;
const JSON_BLOCK_REGEX = /```json[\s\S]*?```/g;
const TOOL_PAYLOAD_KEYS = new Set(['action', 'command']);

const containsToolPayload = (value: any): boolean => {
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) {
    return value.some(containsToolPayload);
  }
  if (Object.keys(value).some((key) => TOOL_PAYLOAD_KEYS.has(key))) {
    return true;
  }
  return Object.values(value).some(containsToolPayload);
};

const extractBalancedJson = (text: string, start: number) => {
  let depth = 0;
  let inString = false;
  let escapeNext = false;

  for (let i = start; i < text.length; i++) {
    const char = text[i];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    if (char === '\\' && inString) {
      escapeNext = true;
      continue;
    }

    if (char === '"' && !escapeNext) {
      inString = !inString;
      continue;
    }

    if (!inString) {
      if (char === '{' || char === '[') {
        depth++;
      } else if (char === '}' || char === ']') {
        depth--;
        if (depth === 0) {
          return { jsonText: text.slice(start, i + 1), endIndex: i + 1 };
        }
      }
    }
  }

  return null;
};

const stripToolJsonPayloads = (text: string) => {
  let result = '';
  let i = 0;

  while (i < text.length) {
    const char = text[i];
    if (char === '{' || char === '[') {
      const extracted = extractBalancedJson(text, i);
      if (extracted) {
        try {
          const parsed = JSON.parse(extracted.jsonText);
          if (containsToolPayload(parsed)) {
            i = extracted.endIndex;
            continue;
          }
        } catch (error) {
          // Ignore invalid JSON blocks
        }
      }
    }
    result += char;
    i++;
  }

  return result;
};

export const renderText = (text: string) => {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  const tokenRegex = /\*\*([^*]+)\*\*|\[\[([^\]]+)\]\]/g;
  let match;

  while ((match = tokenRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    if (match[1]) {
      parts.push(
        <strong key={match.index} className="font-semibold">
          {match[1]}
        </strong>
      );
    } else if (match[2]) {
      parts.push(
        <span key={match.index} className="underline underline-offset-4 decoration-2 decoration-orange-400">
          {match[2]}
        </span>
      );
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : text;
};

export const extractButtons = (content: string): ActionButton[] => {
  const buttons: ActionButton[] = [];
  for (const match of content.matchAll(BUTTON_REGEX)) {
    buttons.push({
      label: match[1].trim(),
      action: match[2].trim(),
    });
  }
  return buttons;
};

export const stripAssistantMarkup = (content: string) => {
  let cleaned = content.replace(BUTTON_REGEX, '').replace(JSON_BLOCK_REGEX, '');
  cleaned = stripToolJsonPayloads(cleaned);
  cleaned = cleaned.replace(/,\s*(?=\n)/g, '');
  return cleaned.trim();
};
