import React from 'react';
import type { ActionButton } from '../types';

const BUTTON_REGEX = /\[Button:\s*([^\|]+)\s*\|\s*([^\]]+)\]/g;
const JSON_BLOCK_REGEX = /```json[\s\S]*?```/g;

export const renderText = (text: string) => {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  const boldRegex = /\*\*([^*]+)\*\*/g;
  let match;

  while ((match = boldRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    parts.push(
      <strong key={match.index} className="font-semibold">
        {match[1]}
      </strong>
    );
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
  return content.replace(BUTTON_REGEX, '').replace(JSON_BLOCK_REGEX, '').trim();
};
