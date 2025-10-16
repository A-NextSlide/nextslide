# ⚠️ CRITICAL FIX: HTTP Client Timeouts

## The Real Problem

**The HTTP clients had NO timeouts configured!** This meant when calling AI APIs (Anthropic Claude, OpenAI, Perplexity), if the API was slow or unresponsive, the HTTP request would **hang indefinitely**.

## What Was Happening

```
User generates deck → Slide 12 starts → Claude API call made → API is slow/hangs
                                                               ↓
                                          HTTP client waits FOREVER (no timeout)
                                                               ↓
                                          Python async timeout can't interrupt it
                                                               ↓
                                          Slide 12 never completes → UI stuck at 93%
```

## The Fix

Added proper HTTP timeouts to all AI clients in `apps/backend/agents/ai/clients.py`:

```python
client_kwargs["timeout"] = httpx.Timeout(
    connect=60.0,   # 60 seconds to establish connection
    read=180.0,     # 3 minutes to read response (for long generations)
    write=30.0,     # 30 seconds to send request
    pool=10.0       # 10 seconds to get connection from pool
)
```

## Why This Fixes It

### Before:
- HTTP request to Claude/OpenAI → If API hangs → Waits forever → Slide never completes

### After:
- HTTP request to Claude/OpenAI → If API hangs → After 180s throws `httpx.ReadTimeout` 
- Exception bubbles up → Caught by async timeout wrapper → Slide marked as failed
- Other slides continue → Progress updates → Generation completes

## Impact

This affects **ALL** AI API calls in the system:
- ✅ Slide generation (claude-sonnet-4-5)
- ✅ Theme generation
- ✅ Outline generation (perplexity-sonar)
- ✅ Visual analysis
- ✅ Any future AI operations

## Testing

1. Start a new generation
2. Monitor logs for: `[CLIENT INIT] Configuring anthropic with httpx timeouts`
3. If a slide times out, you'll see: `AI invocation timed out after XX.Xs` (instead of hanging forever)
4. Generation should complete with message like: `Generated 12 of 13 slides (1 failed)`

## Why It Wasn't Caught Before

The Python-level `asyncio.wait_for()` and `asyncio.timeout()` **cannot interrupt blocking I/O operations** like HTTP requests. They only work for async/await code. Since the HTTP clients were making synchronous blocking calls (even when wrapped in `run_in_executor`), the async timeouts were ineffective.

The solution is to set timeouts **at the HTTP client level** so the underlying socket operations timeout.

## Configuration

Current timeout values (can be adjusted if needed):
- **Connect timeout**: 60s - Time to establish TCP connection
- **Read timeout**: 180s (3 min) - Time to receive full response
- **Write timeout**: 30s - Time to send full request  
- **Pool timeout**: 10s - Time to get connection from pool

These are aggressive enough to prevent hangs while allowing for slow AI responses.

## Status

✅ **FIXED** - All HTTP clients now have proper timeouts configured
✅ **DEPLOYED** - Changes in `apps/backend/agents/ai/clients.py`

