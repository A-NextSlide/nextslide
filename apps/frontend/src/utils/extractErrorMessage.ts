/**
 * Safely extract a human-readable error message from a FastAPI / Pydantic
 * error response `detail` field.
 *
 * Pydantic V2 validation errors come back as an array of objects with the
 * shape `{ type, loc, msg, input, ctx }`. If these are rendered directly as
 * React children, React throws "Objects are not valid as a React child".
 *
 * This helper normalises any `detail` value into a plain string.
 */
export function extractApiError(detail: unknown, fallback: string): string {
  if (!detail) return fallback;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    const parts = detail.map((e: unknown) =>
      typeof e === 'object' && e !== null
        ? (e as Record<string, unknown>).msg
          ? String((e as Record<string, unknown>).msg)
          : JSON.stringify(e)
        : String(e),
    );
    return parts.join('; ') || fallback;
  }
  if (typeof detail === 'object') return JSON.stringify(detail);
  return String(detail);
}
