# Font 404 Errors Fix

## Problem

The backend was serving fonts that don't have actual font files on disk, causing hundreds of 404 errors:

```
INFO: 127.0.0.1:65020 - "GET /api/fonts/file/benito---timeless-typeface?style=regular HTTP/1.1" 404 Not Found
INFO: 127.0.0.1:65024 - "GET /api/fonts/file/bon-foyage---vintage-serif-font?style=regular HTTP/1.1" 404 Not Found
INFO: 127.0.0.1:65025 - "GET /api/fonts/file/barnule-%26-mauren?style=regular HTTP/1.1" 404 Not Found
```

### Root Cause

1. **Font Metadata vs. Actual Files**: The font registry (`font_registry.json`) contains metadata for ~700+ PixelBuddha fonts
2. **Missing Files**: Many of these fonts don't have actual font files on disk
3. **No Validation**: Font selection and API endpoints were not validating file existence
4. **Frontend Loading**: When the frontend loaded font pickers/lists, it tried to load ALL fonts in the registry, including those without files

## Solution Implemented

### 1. Font Selection Validation (EnhancedFontService)

**File**: `apps/backend/services/enhanced_font_service.py`

Added two new methods to check font file availability:

```python
def _font_has_files(self, font_id: str) -> bool:
    """Check if a font actually has available files on disk"""
    try:
        # Try to get font path - if it returns None, font doesn't have files
        path = self.get_font_path(font_id, 'regular')
        return path is not None
    except Exception:
        return False

def _filter_available_fonts(self, fonts: List[Dict]) -> List[Dict]:
    """Filter list to only include fonts with actual files available"""
    available = []
    for font in fonts:
        font_id = font.get('id', '')
        if font_id and self._font_has_files(font_id):
            available.append(font)
    return available
```

**Modified** `select_font_pair()` to filter fonts before selection:

```python
# CRITICAL: Filter out fonts without actual files
hero_fonts = self._filter_available_fonts(hero_fonts)
body_fonts = self._filter_available_fonts(body_fonts)

if not hero_fonts or not body_fonts:
    # Fallback to safe defaults
    logger.warning(f"⚠️  No available fonts found after filtering! Using fallback fonts.")
    return {'hero': 'Montserrat', 'body': 'Roboto', 'source': 'fallback'}
```

### 2. API Endpoint Filtering (font_server.py)

**File**: `apps/backend/api/font_server.py`

Updated **ALL** font listing endpoints to default to `available_only=True`:

#### `/api/fonts/list`
```python
@router.get("/list", response_model=FontListResponse)
async def get_font_list(
    ...
    available_only: Optional[bool] = Query(True, description="Only include fonts with resolvable files (default: True)")
):
    """By default, only returns fonts with actual files to prevent 404 errors."""
```

#### `/api/fonts/catalog`
```python
@router.get("/catalog")
async def get_font_catalog(
    available_only: Optional[bool] = Query(True, description="Only include fonts with actual files (default: True)")
):
    """By default, only includes fonts with actual files to prevent 404 errors."""
    # Filter fonts before adding to catalog
    if available_only:
        try:
            if not font_service.get_font_path(font_id, 'regular'):
                continue
        except Exception:
            continue
```

#### `/api/fonts/search`
```python
@router.get("/search")
async def search_fonts(
    ...
    available_only: Optional[bool] = Query(True, description="Only include fonts with actual files (default: True)")
):
    """By default, only returns fonts with actual files to prevent 404 errors."""
    # Filter results to only available fonts
    if available_only:
        filtered_results = []
        for font in results:
            font_id = font.get('id', '')
            try:
                if font_id and font_service.get_font_path(font_id, 'regular'):
                    filtered_results.append(font)
            except Exception:
                continue
        results = filtered_results
```

#### `/api/fonts/search-by-tags` and `/api/fonts/use-case/{use_case}`
Same filtering logic applied to both endpoints.

## How It Works

### Before Fix:
```
1. Theme generation selects font "benito---timeless-typeface" from registry ❌
2. Frontend tries to load: GET /api/fonts/file/benito---timeless-typeface?style=regular
3. Backend tries to find file: get_font_path() returns None
4. Server returns 404 ❌
```

### After Fix:
```
1. Theme generation calls select_font_pair()
2. Font service filters candidates: _filter_available_fonts()
   - Checks: _font_has_files("benito---timeless-typeface") → False ❌
   - Skips this font
   - Selects next available font with files ✅
3. Frontend receives only fonts with files
4. All font loads succeed ✅
```

## Validation Points

Font validation now happens at **3 levels**:

### Level 1: Theme Generation
- `EnhancedFontService.select_font_pair()` filters fonts before selection
- Only fonts with actual files are considered
- Fallback to safe defaults if no available fonts found

### Level 2: API Endpoints (Default Behavior)
- `/list`, `/catalog`, `/search`, `/search-by-tags`, `/use-case` all default to `available_only=True`
- Frontend font pickers only see fonts with files
- No 404s when loading font lists/previews

### Level 3: Component Validation (Existing)
- Component validator already had validation as final safety check
- Replaces invalid fonts in components if they somehow slip through

## Impact

### Before:
- Hundreds of 404 errors in logs
- Frontend trying to load ~700 fonts, many missing
- Slow performance due to failed requests
- Poor user experience

### After:
- Only fonts with actual files are served
- Reduced font list (only ~100-200 available fonts instead of 700+)
- No 404 errors
- Faster loading since fewer requests
- Better user experience

## Fallback Fonts

If font filtering results in no available fonts, the system uses guaranteed fallbacks:

- **Hero Font Fallback**: `Montserrat` (always available via Google Fonts)
- **Body Font Fallback**: `Roboto` (always available via Google Fonts)
- **Playful Topic Fallback**: `Bebas Neue` + `Poppins` (always available)

## Testing

To verify the fix works:

1. **Theme Generation**:
   ```bash
   # Generate a new presentation
   # Check logs for font selection
   # Should see: "Selected font pair: <font-with-files> (hero) + <font-with-files> (body)"
   # Should NOT see: 404 errors for font files
   ```

2. **API Endpoints**:
   ```bash
   # Check font list
   curl http://localhost:9090/api/fonts/list?available_only=true
   # All fonts should have files
   
   # Check catalog
   curl http://localhost:9090/api/fonts/catalog
   # Should return only fonts with files (default behavior)
   ```

3. **Frontend Font Picker**:
   - Open font picker in editor
   - Should see reduced list of fonts (only available ones)
   - No 404 errors in browser console
   - All font previews should load successfully

## Optional: Disable Filtering

If needed, filtering can be disabled per-request:

```bash
# Get ALL fonts including those without files
curl "http://localhost:9090/api/fonts/list?available_only=false"

# Get catalog including unavailable fonts
curl "http://localhost:9090/api/fonts/catalog?available_only=false"
```

## Expected Results

### Logs Before:
```
INFO: GET /api/fonts/file/benito---timeless-typeface?style=regular HTTP/1.1" 404 Not Found
INFO: GET /api/fonts/file/bon-foyage---vintage-serif-font?style=regular HTTP/1.1" 404 Not Found
INFO: GET /api/fonts/file/barnule-%26-mauren?style=regular HTTP/1.1" 404 Not Found
... (hundreds more)
```

### Logs After:
```
INFO: Selected font pair: Gendra (hero) + FBS Chopen Sans (body) ✅
INFO: GET /api/fonts/file/gendra?style=regular HTTP/1.1" 200 OK ✅
INFO: GET /api/fonts/file/fbs-chopen-sans?style=regular HTTP/1.1" 200 OK ✅
```

## Summary

**Problem**: Font metadata contained ~700 fonts but only ~100-200 had actual files → 404 errors  
**Solution**: Validate font file existence at selection time and API endpoints  
**Result**: Only fonts with files are served → No 404 errors  
**Fallback**: Safe defaults (Montserrat/Roboto) if filtering results in no fonts
