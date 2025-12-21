export interface StructuredEventEnvelope {
  schema?: string;
  type: string;
  timestamp: string;
  payload?: Record<string, any>;
  data?: Record<string, any>;
  progress?: number;
  phase?: string;
  deck_uuid?: string;
  deck_id?: string;
  slide_index?: number;
  sequence?: number;
}

export type AnySseEvent = Record<string, any> & {
  event?: StructuredEventEnvelope;
};

export function normalizeSseEvent(raw: any): AnySseEvent {
  if (!raw || typeof raw !== 'object') {
    return raw as AnySseEvent;
  }

  const envelope: StructuredEventEnvelope | undefined = raw.event;
  const envelopePayload = envelope?.data || envelope?.payload;
  const type = raw.type || envelope?.type;
  const timestamp = raw.timestamp || envelope?.timestamp;
  const data = raw.data || envelopePayload;
  const progress = raw.progress ?? envelope?.progress;
  const phase = raw.phase ?? envelope?.phase;
  const deck_uuid = raw.deck_uuid ?? raw.deck_id ?? raw.deckId ?? envelope?.deck_uuid;
  const slide_index = raw.slide_index ?? raw.slideIndex ?? envelope?.slide_index;
  const deck_id = raw.deck_id ?? raw.deckId ?? deck_uuid;
  const sequence = raw.sequence ?? envelope?.sequence;

  const normalizedData =
    data && typeof data === 'object'
      ? {
          ...data,
          ...(progress !== undefined && (data as any).progress === undefined ? { progress } : {}),
          ...(phase && (data as any).phase === undefined ? { phase } : {}),
          ...(deck_uuid && (data as any).deck_uuid === undefined ? { deck_uuid } : {}),
          ...(slide_index !== undefined && (data as any).slide_index === undefined ? { slide_index } : {}),
        }
      : data;

  return {
    ...raw,
    type,
    timestamp,
    data: normalizedData,
    progress,
    phase,
    deck_uuid,
    deck_id,
    slide_index,
    sequence,
  };
}
