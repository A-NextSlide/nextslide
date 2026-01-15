# Mobile Testing Setup

## Changes Made for Local Network Testing

To test on iPhone via local network, the following changes were made:

---

## iOS Safari Crash Fixes (CustomComponent)

### Problem
iOS Safari crashes when rendering CustomComponent iframes due to:
1. Multiple re-renders overwhelming memory
2. JavaScript in iframes consuming resources
3. Multiple iframes loading simultaneously

### Solution (apps/frontend/src/renderers/components/CustomComponentRenderer.tsx)

**For full slide view (~line 1596):**
On iOS, the iframe renders **static HTML only** (no scripts):
- Scripts are stripped: `/<script>...</script>/` removed
- Inline handlers removed: `onclick=""` etc. removed
- Sandbox restricted: `allow-same-origin` only (no `allow-scripts`)

```typescript
srcDoc={BROWSER.isIOS
  ? stableIframeSrcDoc
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/on\w+="[^"]*"/gi, '')
  : stableIframeSrcDoc
}
sandbox={BROWSER.isIOS ? "allow-same-origin" : "allow-scripts allow-same-origin allow-popups allow-forms"}
```

**To revert:** Remove the iOS conditional and use `stableIframeSrcDoc` directly with full sandbox permissions.

### Lazy Loading for Thumbnails (MiniSlide.tsx)

**Problem:** Too many iframes rendering at once causes iOS Safari to crash from memory exhaustion.

**Solution:** Use IntersectionObserver to lazy load thumbnails:
- Show only background color until thumbnail enters viewport
- Load full content when visible
- Unload content when scrolled away to free memory

```typescript
// Lines 103-136 in MiniSlide.tsx
const [isVisible, setIsVisible] = useState(false);

useEffect(() => {
  if (BROWSER.isIOS && typeof IntersectionObserver !== 'undefined') {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setIsVisible(true);
        } else {
          setIsVisible(false); // Unload when scrolled away
        }
      },
      { rootMargin: '100px', threshold: 0 }
    );
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }
}, []);
```

**To revert:** Remove the IntersectionObserver logic and always set `isVisible = true`.

---

### 1. Frontend `.env` (apps/frontend/.env)

**Added:**
```env
# Mobile testing - use Mac's local IP
VITE_API_URL=http://192.168.1.33:9090/api
VITE_AGENT_API_URL=http://192.168.1.33:9090
```

**To revert:** Comment out or delete these two lines.

### 2. Backend CORS (apps/backend/api/chat_server.py)

**Added to `allowed_origins` set (~line 224):**
```python
# Local network for mobile testing
"http://192.168.1.33:8080",
```

**Updated `allow_origin_regex` (~line 234) to include local IPs:**
```python
# Old:
allow_origin_regex=r"https://([a-z0-9-]+\.)?nextslide\.ai$|http://(localhost|127\.0\.0\.1)(:\d+)?$"

# New (added 192.168.x.x and 10.x.x.x):
allow_origin_regex=r"https://([a-z0-9-]+\.)?nextslide\.ai$|http://(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)(:\d+)?$"
```

**To revert:** Remove the `192.168.1.33:8080` line and revert the regex.

### 3. deckSyncService.ts (apps/frontend/src/lib/deckSyncService.ts)

**Changed hardcoded localhost to use env var (~line 27):**
```typescript
// Old:
return `http://localhost:9090${endpoint}`;

// New:
const devHost = import.meta.env.VITE_AGENT_API_URL || 'http://localhost:9090';
return `${devHost}${endpoint}`;
```

**To revert:** This change is backwards-compatible, no need to revert.

---

## How to Test on iPhone

1. Get Mac's local IP: `ipconfig getifaddr en0`
2. Update the IP in `.env` and backend CORS if it changed
3. Restart both frontend and backend servers
4. On iPhone (same WiFi), go to `http://<mac-ip>:8080`
5. Use Safari Web Inspector: Mac Safari > Develop > [iPhone] > [Page]
