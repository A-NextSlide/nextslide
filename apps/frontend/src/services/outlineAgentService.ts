/**
 * Outline Agent Service
 *
 * Handles communication with the outline generation agent.
 * The agent has natural conversations and uses tools to trigger outline generation.
 */

import { API_CONFIG } from '@/config/environment';

const AGENT_URL = `${API_CONFIG.AGENT_BASE_URL}/api/outline-agent/chat`;

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface OutlineAgentRequest {
  message: string;
  chat_history: ChatMessage[];
  context?: {
    [key: string]: any;
  };
}

export interface AgentTextEvent {
  type: 'text';
  content: string;
}

export interface OutlineSlide {
  title: string;
  subtitle?: string;
  key_points?: string[];
}

export interface ThemeChanges {
  colors?: {
    search_query?: string;
  };
  brand?: {
    name?: string;
    url?: string;
  };
  fonts?: {
    family?: string;
  };
  logo?: {
    action: 'add' | 'remove';
    brand_names?: string[];
  };
}

export interface OutlineData {
  action: 'generate_outline' | 'update_outline' | 'update_slides' | 'update_theme';
  slide_count?: number;
  topic?: string;
  detail_level?: 'quick' | 'standard' | 'detailed';
  tone?: string;
  slides?: OutlineSlide[];
  updated_slides?: Array<{
    index: number;
    title: string;
    subtitle?: string;
    key_points?: string[];
  }>;
  theme_changes?: ThemeChanges;
}

export interface AgentOutlineEvent {
  type: 'outline';
  data: OutlineData;
}

export interface AgentErrorEvent {
  type: 'error';
  message: string;
}

export interface AgentDoneEvent {
  type: 'done';
}

export type AgentEvent =
  | AgentTextEvent
  | AgentOutlineEvent
  | AgentErrorEvent
  | AgentDoneEvent;

/**
 * Try to extract partial slide data from streaming JSON text
 */
function extractPartialSlides(text: string): OutlineData | null {
  // 1. Find the start of the slides array
  const slidesMatch = text.match(/"slides"\s*:\s*\[/);
  if (!slidesMatch) return null;

  const slidesStartIndex = slidesMatch.index! + slidesMatch[0].length;
  const slidesText = text.slice(slidesStartIndex);

  // 2. Extract complete objects { ... }
  const slides: any[] = [];
  let braceCount = 0;
  let currentObjectStart = -1;
  let inString = false;
  let escape = false;

  for (let i = 0; i < slidesText.length; i++) {
    const char = slidesText[i];

    if (escape) {
      escape = false;
      continue;
    }

    if (char === '\\') {
      escape = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (!inString) {
      if (char === '{') {
        if (braceCount === 0) currentObjectStart = i;
        braceCount++;
      } else if (char === '}') {
        braceCount--;
        if (braceCount === 0 && currentObjectStart !== -1) {
          // Found a complete object
          const objStr = slidesText.slice(currentObjectStart, i + 1);
          try {
            const obj = JSON.parse(objStr);
            // Validate basic slide structure
            if (obj.title) {
              slides.push(obj);
            }
          } catch (e) {
            // Ignore malformed objects
          }
          currentObjectStart = -1;
        }
      } else if (char === ']') {
        // End of slides array
        break;
      }
    }
  }

  if (slides.length > 0) {
    // Try to extract other metadata if available
    let action: any = 'generate_outline';
    const actionMatch = text.match(/"action"\s*:\s*"([^"]+)"/);
    if (actionMatch) action = actionMatch[1];

    let topic: string | undefined;
    const topicMatch = text.match(/"topic"\s*:\s*"([^"]+)"/);
    if (topicMatch) topic = topicMatch[1];

    return {
      action,
      topic,
      slides
    };
  }

  return null;
}

/**
 * Extract JSON blocks from text (between ```json and ```, or raw JSON objects)
 * Returns both the parsed data and the text with JSON removed
 */
function extractJSONFromText(text: string): { data: OutlineData | null; textWithoutJSON: string } {
  let data: OutlineData | null = null;
  let textWithoutJSON = text;

  // Try markdown code block first
  const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);

  if (jsonMatch && jsonMatch[1]) {
    try {
      console.log('[OutlineAgent] Found JSON code block, attempting parse...');
      const parsed = JSON.parse(jsonMatch[1]);
      if (isValidOutlineData(parsed)) {
        console.log('[OutlineAgent] Valid JSON action found:', parsed.action);
        data = parsed as OutlineData;
        textWithoutJSON = text.replace(/```json\s*[\s\S]*?\s*```/g, '').trim();
        return { data, textWithoutJSON };
      }
    } catch (e) {
      console.error('[OutlineAgent] Failed to parse JSON code block:', e);
    }
  }

  // Fallback: Try to find raw JSON object with "action" field
  const rawJsonMatch = text.match(/\{[\s\S]*?"action"\s*:\s*"[^"]+"/);
  if (rawJsonMatch) {
    // Find the matching closing brace
    const startIdx = text.indexOf(rawJsonMatch[0]);
    let braceCount = 0;
    let endIdx = startIdx;

    for (let i = startIdx; i < text.length; i++) {
      if (text[i] === '{') braceCount++;
      else if (text[i] === '}') {
        braceCount--;
        if (braceCount === 0) {
          endIdx = i + 1;
          break;
        }
      }
    }

    if (endIdx > startIdx) {
      const jsonStr = text.slice(startIdx, endIdx);
      try {
        console.log('[OutlineAgent] Found raw JSON object, attempting parse...');
        const parsed = JSON.parse(jsonStr);
        if (isValidOutlineData(parsed)) {
          console.log('[OutlineAgent] Valid raw JSON action found:', parsed.action);
          data = parsed as OutlineData;
          textWithoutJSON = (text.slice(0, startIdx) + text.slice(endIdx)).trim();
          return { data, textWithoutJSON };
        }
      } catch (e) {
        console.debug('[OutlineAgent] Failed to parse raw JSON:', e);
      }
    }
  }

  return { data, textWithoutJSON };
}

/**
 * Validate if parsed JSON is valid OutlineData
 */
function isValidOutlineData(parsed: any): boolean {
  if (!parsed.action) return false;

  const hasSlides = parsed.slides && Array.isArray(parsed.slides);
  const hasUpdatedSlides = parsed.updated_slides && Array.isArray(parsed.updated_slides);
  const hasThemeChanges = parsed.theme_changes && typeof parsed.theme_changes === 'object';

  return hasSlides || hasUpdatedSlides || hasThemeChanges;
}

/**
 * Stream chat with the outline agent
 * The agent outputs JSON directly in its text response (no tool calling)
 */
export async function* streamOutlineAgentChat(
  request: OutlineAgentRequest
): AsyncGenerator<AgentEvent, void, unknown> {
  try {
    const response = await fetch(AGENT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let accumulatedText = '';
    let outlineEmitted = false;
    let lastEmittedSlideCount = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          try {
            const event = JSON.parse(data) as AgentEvent;

            // If it's a text event, accumulate and check for JSON
            if (event.type === 'text') {
              accumulatedText += event.content;

              // Check if we have a complete JSON block and haven't emitted outline yet
              if (!outlineEmitted && accumulatedText.includes('```json') && accumulatedText.includes('```', accumulatedText.indexOf('```json') + 7)) {
                const { data } = extractJSONFromText(accumulatedText);
                if (data) {
                  console.log('[OutlineAgent] Extracted outline from text:', data);
                  yield {
                    type: 'outline',
                    data
                  };
                  outlineEmitted = true;
                }
              } else if (!outlineEmitted) {
                // Try to extract partial slides
                const partialData = extractPartialSlides(accumulatedText);
                if (partialData && partialData.slides && partialData.slides.length > lastEmittedSlideCount) {
                  console.log('[OutlineAgent] Emitting partial outline:', partialData.slides.length, 'slides');
                  yield {
                    type: 'outline',
                    data: partialData
                  };
                  lastEmittedSlideCount = partialData.slides.length;
                }
              }

              // Still yield text events for display (hook will strip JSON)
              yield event;
            } else {
              yield event;
            }
          } catch (e) {
            console.error('Failed to parse SSE data:', data, e);
          }
        }
      }
    }
  } catch (error) {
    console.error('[OutlineAgent] Error:', error);
    yield {
      type: 'error',
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}
