export interface StructuredEventEnvelope {
  schema?: string;
  type: string;
  timestamp: string;
  payload?: Record<string, any>;
  data?: Record<string, any>;
  progress?: number;
  phase?: string;
  deck_uuid?: string;
  slide_index?: number;
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
  const deck_uuid = raw.deck_uuid ?? envelope?.deck_uuid;
  const slide_index = raw.slide_index ?? envelope?.slide_index;

  return {
    ...raw,
    type,
    timestamp,
    data,
    progress,
    phase,
    deck_uuid,
    slide_index,
  };
}
