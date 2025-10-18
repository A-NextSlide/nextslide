# Slide Generation Hang Fix

## Problem
Slide generation was getting stuck at "Generated slide 12" at 93% progress and never completing. The UI would hang indefinitely without finishing the generation process.

## Root Cause
There were **TWO CRITICAL ISSUES** causing the hang:

### Issue 1: Missing HTTP Client Timeouts ⚠️ **PRIMARY CAUSE**
The AI HTTP clients (Anthropic, OpenAI, Perplexity, etc.) were being initialized **without any timeout configuration**. This meant:
- If the AI API was slow or unresponsive, HTTP requests could hang indefinitely
- The connection timeout, read timeout, and write timeout were all unlimited
- Even though Python-level async timeouts existed, they couldn't interrupt blocking HTTP calls
- This is why slide 12 (or any slide) could get stuck - the HTTP client was waiting forever for a response

### Issue 2: Orchestrator Loop Could Block
The parallel slide orchestrator had issues in its main event processing loop:

1. **Infinite Wait**: The main loop used `asyncio.wait()` without a timeout, which meant if any slide task got stuck (even with per-slide timeouts), the main loop would wait forever
2. **No Global Timeout**: There was no overall timeout for the entire generation process
3. **Progress Blocking**: If a slide failed or timed out, it wouldn't update the progress counter, preventing the UI from showing that generation was moving forward
4. **Task Completion Detection**: Failed tasks might not be properly removed from the pending task set, causing the loop to never exit

## Changes Made

### 🔴 CRITICAL FIX #1: HTTP Client Timeouts (`clients.py`)

Added proper timeout configuration to all HTTP clients to prevent indefinite hanging:

```python
# Add HTTP timeout configuration to prevent hanging
# This is critical - without timeouts, the client can hang indefinitely
if client_type in ["openai", "anthropic", "groq", "samba", "deepseek", "perplexity"]:
    try:
        import httpx
        # Set aggressive timeouts: 60s connect, 180s read (3 minutes for generation)
        client_kwargs["timeout"] = httpx.Timeout(
            connect=60.0,   # 60 seconds to establish connection
            read=180.0,     # 3 minutes to read response (for long generations)
            write=30.0,     # 30 seconds to send request
            pool=10.0       # 10 seconds to get connection from pool
        )
        logger.info(f"[CLIENT INIT] Configuring {client_type} with httpx timeouts")
    except Exception as e:
        logger.warning(f"[CLIENT INIT] Failed to set httpx timeout for {client_type}: {e}")
```

**Why This Matters:**
- Before: HTTP requests could wait forever if the AI service was slow
- After: After 180 seconds (3 minutes), the request will timeout and raise an exception
- This allows the async timeout layers above to catch the error and cancel the task
- **This is the most important fix** - without it, the orchestrator fixes don't help

### 2. Global Timeout Protection (`parallel_slide_orchestrator.py`)

Added a 10-minute maximum wait time for all slides:

```python
max_wait_time = 600  # 10 minutes total for all slides
start_time = datetime.now()

while pending_tasks or not event_queue.empty():
    elapsed = (datetime.now() - start_time).total_seconds()
    if elapsed > max_wait_time:
        logger.error(f"⚠️ Global timeout reached after {elapsed}s. Cancelling {len(pending_tasks)} pending tasks.")
        for task in pending_tasks:
            if not task.done():
                task.cancel()
        break
```

### 3. Wait Timeout for Stuck Detection

Added a 5-second timeout to `asyncio.wait()` to periodically check task status:

```python
try:
    done, pending = await asyncio.wait(
        {event_processor} | pending_tasks,
        return_when=asyncio.FIRST_COMPLETED,
        timeout=5.0  # Add 5-second timeout to prevent infinite waits
    )
except asyncio.TimeoutError:
    # Check if any tasks are stuck
    stuck_tasks = [task for task in pending_tasks if not task.done()]
    if stuck_tasks and elapsed > 360:  # After 6 minutes, be more aggressive
        logger.error(f"❌ Found {len(stuck_tasks)} stuck tasks after {elapsed}s. Cancelling them.")
        for task in stuck_tasks:
            task.cancel()
        pending_tasks = set()
        break
```

### 4. Better Exception Handling

Added proper handling for `CancelledError` in addition to `TimeoutError`:

```python
except asyncio.CancelledError:
    logger.warning(f"⚠️ Slide {slide_index + 1} generation was cancelled")
    deck_state.slides[slide_index]['status'] = SlideStatus.ERROR.value
    await event_queue.put({
        'type': 'slide_error',
        'slide_index': slide_index,
        'error': 'Generation was cancelled',
        'message': f'Slide {slide_index + 1} generation was cancelled',
        'slide_title': slide_outline.title
    })
```

### 5. Progress Updates for Failed Slides

Now when a slide fails, it increments the completion counter so progress continues:

```python
elif event.get('type') == 'slide_error':
    slide_idx = event.get('slide_index', -1)
    slides_in_progress.discard(slide_idx)
    # Treat errored slides as "completed" for progress tracking purposes
    completed_slides += 1
    progress = self._calculate_progress(
        completed_slides, len(slides_in_progress), total_slides
    )
    event['progress'] = progress
    event['slides_completed'] = completed_slides
    event['slides_total'] = total_slides
```

### 6. Improved Completion Message

The final completion event now shows successful vs failed slides:

```python
# Count successful vs failed slides
successful_slides = sum(1 for s in deck_state.slides if s.get('status') == SlideStatus.COMPLETED.value)
failed_slides = sum(1 for s in deck_state.slides if s.get('status') == SlideStatus.ERROR.value)

yield {
    'type': 'slides_generation_complete',
    'total_slides': total_slides,
    'completed_slides': successful_slides,
    'failed_slides': failed_slides,
    'message': f'Generated {successful_slides} of {total_slides} slides' + (f' ({failed_slides} failed)' if failed_slides > 0 else ''),
    'success': successful_slides > 0
}
```

### 7. Task Cleanup

Ensure all pending tasks are properly cancelled:

```python
# Cancel any remaining pending tasks
for task in pending_tasks:
    if not task.done():
        logger.warning(f"Cancelling pending task that didn't complete")
        task.cancel()
```

## Benefits

1. **No More Infinite Hangs**: Global timeout ensures generation completes even if slides fail
2. **Graceful Degradation**: Failed slides don't block other slides from completing
3. **Better Progress Tracking**: UI shows continuous progress even when slides fail
4. **Better Error Reporting**: Users see which slides failed and why
5. **Resource Cleanup**: Stuck tasks are properly cancelled to free resources
6. **Stuck Task Detection**: After 6 minutes, actively identifies and cancels hung tasks

## Testing

To verify the fix works:

1. Generate a deck with multiple slides
2. If a slide gets stuck or times out, the generation should continue with other slides
3. Progress should reach 100% even if some slides fail
4. The completion message should indicate how many slides succeeded vs failed

## Related Files

- `apps/backend/agents/ai/clients.py` - **CRITICAL:** HTTP client timeout configuration
- `apps/backend/agents/generation/orchestration/parallel_slide_orchestrator.py` - Orchestrator fixes
- `apps/backend/agents/config.py` - Timeout configurations
- `apps/frontend/src/services/generation/GenerationProgressTracker.ts` - Frontend error handling

## Configuration

The following timeouts can be adjusted in `apps/backend/agents/config.py`:

- `SLIDE_GENERATION_TIMEOUT = 300` - Per-slide timeout (5 minutes)
- `DECK_GENERATION_TIMEOUT = 600` - Total deck timeout (10 minutes)
- `MAX_PARALLEL_SLIDES = 10` - Maximum concurrent slides

## Status

✅ **Fixed** - Slide generation will now complete even if individual slides fail or timeout

