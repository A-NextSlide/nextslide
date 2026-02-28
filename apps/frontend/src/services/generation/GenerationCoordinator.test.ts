import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GenerationCoordinator } from './GenerationCoordinator';

type SseEvent = Record<string, unknown>;

function buildSseBody(events: SseEvent[]) {
  const encoder = new TextEncoder();
  const chunks = events.map((event) => encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
  let index = 0;

  return {
    getReader() {
      return {
        async read() {
          if (index >= chunks.length) {
            return { done: true, value: undefined };
          }
          const value = chunks[index];
          index += 1;
          return { done: false, value };
        },
      };
    },
  };
}

describe('GenerationCoordinator.generateFromOutline', () => {
  beforeEach(() => {
    vi.stubGlobal('window', {
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval,
      dispatchEvent: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    vi.stubGlobal(
      'CustomEvent',
      class CustomEvent<T = unknown> extends Event {
        detail: T;
        constructor(type: string, init?: CustomEventInit<T>) {
          super(type, init);
          this.detail = init?.detail as T;
        }
      },
    );
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    const coordinator = GenerationCoordinator.getInstance();
    await coordinator.cleanup();
  });

  it('does not start a second compose stream when create-from-outline is already streaming', async () => {
    const coordinator = GenerationCoordinator.getInstance();
    const startGenerationSpy = vi
      .spyOn(coordinator, 'startGeneration')
      .mockResolvedValue(undefined);

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      body: buildSseBody([
        { type: 'deck_created', deck_id: 'deck-123', deck_url: '/deck/deck-123' },
        { type: 'composition_complete', deck_id: 'deck-123', deck_url: '/deck/deck-123' },
      ]),
    });

    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    const result = await coordinator.generateFromOutline({
      id: 'deck-123',
      slides: [{ title: 'Slide 1', content: 'Intro' }],
    });

    expect(result).toEqual({ deckId: 'deck-123', deckUrl: '/deck/deck-123' });
    expect(startGenerationSpy).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain('/deck/create-from-outline');
  });
});
