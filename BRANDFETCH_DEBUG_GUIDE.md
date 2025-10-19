# Brandfetch & Logo Debug Guide 🔍

## ✅ What I Just Fixed

Added comprehensive logging to `_hydrate_style_preferences` function to track exactly what's happening with brandfetch and logo loading.

**File:** `apps/backend/api/requests/api_openai_outline.py`

## 🔍 How to Debug Logo Issues

### Step 1: Check Logs When Creating Outline

When you create an outline, search for these log entries:

```bash
# Search for hydration activity:
grep "STYLE PREF HYDRATE" your_log_file.log
```

### Expected Log Flow (Successful)

```
[STYLE PREF HYDRATE] Status check: has_colors=True, has_logo=False, has_font=False
[STYLE PREF HYDRATE] Domain extraction - domain_hint: spotify, vibeContext: None
[STYLE PREF HYDRATE] Candidate chain: ['spotify']
[STYLE PREF HYDRATE] ✅ Found domain (reasonable_brand_term): spotify
[STYLE PREF HYDRATE] 🔍 Attempting to fetch brand data for: spotify
[STYLE PREF HYDRATE] 📦 Checking SimpleBrandfetchCache for: spotify
[STYLE PREF HYDRATE] ✅ Found in cache: spotify
[STYLE PREF HYDRATE] ✅ Successfully retrieved brand data for: spotify
[STYLE PREF HYDRATE] 🖼️ Extracting logo - logos data: ['dark', 'light']
[STYLE PREF HYDRATE] ✅ Logo URL set from light: https://cdn.brandfetch.io/...
```

### Log Patterns When It Fails

#### Pattern 1: No Domain Extracted
```
[STYLE PREF HYDRATE] Status check: has_colors=False, has_logo=False, has_font=False
[STYLE PREF HYDRATE] Domain extraction - domain_hint: None, vibeContext: None
[STYLE PREF HYDRATE] Candidate chain: []
[STYLE PREF HYDRATE] ⚠️ No valid brand identifier found; skipping Brandfetch hydration
[STYLE PREF HYDRATE] Tried candidates: []
```
**Cause:** Generic outline with no brand mentioned
**Fix:** Mention brand in prompt or set vibeContext manually

#### Pattern 2: Not In Cache, API Fails
```
[STYLE PREF HYDRATE] ✅ Found domain (reasonable_brand_term): unknownbrand
[STYLE PREF HYDRATE] 📦 Checking SimpleBrandfetchCache for: unknownbrand
[STYLE PREF HYDRATE] ❌ Not in cache: unknownbrand
[STYLE PREF HYDRATE] 🌐 Calling BrandfetchService API for: unknownbrand
[STYLE PREF HYDRATE] ❌ BrandfetchService returned no data for: unknownbrand
[STYLE PREF HYDRATE] 🔎 Trying BrandColorSearcher fallback for: unknownbrand
[STYLE PREF HYDRATE] ❌ BrandColorSearcher returned no data for: unknownbrand
[STYLE PREF HYDRATE] ⚠️ No brand data found for: unknownbrand (tried cache, API, and fallback)
```
**Cause:** Brand not in database and Brandfetch API doesn't have it
**Fix:** Use well-known brands or upload logo manually

#### Pattern 3: Data Found But No Logo
```
[STYLE PREF HYDRATE] ✅ Successfully retrieved brand data for: somebrand
[STYLE PREF HYDRATE] 🖼️ Extracting logo - logos data: []
[STYLE PREF HYDRATE] ⚠️ No logo URL found in brand_data despite having logos: {}
```
**Cause:** Brand data exists but no logo in the data
**Fix:** Upload logo manually

#### Pattern 4: Already Has Logo
```
[STYLE PREF HYDRATE] Status check: has_colors=True, has_logo=True, has_font=True
[STYLE PREF HYDRATE] All data present, skipping brandfetch
```
**Cause:** User already uploaded a logo
**Status:** ✅ This is normal and good!

## 🎯 Quick Diagnostic Commands

### Check if hydration was called at all:
```bash
grep -c "STYLE PREF HYDRATE" your_log.log
```
If count = 0, hydration wasn't called during outline generation

### See what domain was extracted:
```bash
grep "Domain extraction" your_log.log
```

### Check if brandfetch cache was hit:
```bash
grep "Found in cache\|Not in cache" your_log.log
```

### See if logo was set:
```bash
grep "Logo URL set" your_log.log
```

## 📋 Testing Checklist

### Test 1: Known Brand
**Prompt:** "Create a presentation for Spotify"
**Expected:**
- ✅ Domain extracted: "spotify"
- ✅ Found in cache (if Spotify is in DB)
- ✅ Logo URL set
- ✅ Logo appears in outline theme tab

### Test 2: Domain in Prompt
**Prompt:** "Create slides for airbnb.com"
**Expected:**
- ✅ Domain extracted: "airbnb.com"
- ✅ Brandfetch called
- ✅ Logo loaded

### Test 3: Generic Outline
**Prompt:** "Create a sales presentation"
**Expected:**
- ⚠️ No domain extracted
- ⚠️ Brandfetch skipped
- ✅ This is correct behavior!

### Test 4: Manual Logo Upload
**Steps:**
1. Create outline
2. Go to Theme tab
3. Upload logo
4. Generate slides

**Expected:**
- ✅ Logo saved to stylePreferences.logoUrl
- ✅ "All data present, skipping brandfetch" in logs
- ✅ Logo appears in theme tab
- ✅ Logo appears in generated slides

## 🔧 Manual Fixes

### If brandfe tch isn't triggering:

1. **Set vibeContext manually:**
```python
outline.stylePreferences.vibeContext = "spotify.com"
```

2. **Upload logo directly:**
   - Use theme tab "Add logo" button
   - Logo saved to `stylePreferences.logoUrl`

3. **Check DATABASE_URL:**
```bash
echo $DATABASE_URL
```
If not set, cache won't work

### If logo loads but doesn't display:

1. **Check frontend console:**
```javascript
// Look for: "[ThemeTab] resolved logo candidate"
// Should show which logo source was used
```

2. **Check theme API response:**
Search logs for:
```
[THEME API] Logo URL: https://...
```

3. **Verify outline has logo:**
```python
print(outline.stylePreferences.logoUrl)
```

## 🎉 Summary

With the new logging, you can now:

✅ See exactly when brandfetch is called
✅ See what domain was extracted
✅ See if cache hit or API was called
✅ See if logo was found and set
✅ Track down why logo isn't appearing

**Next time you report "no logo":**
1. Share the logs with `[STYLE PREF HYDRATE]` entries
2. I can tell you exactly what went wrong
3. We can fix it quickly!

All logs use emojis for easy scanning:
- 🔍 = Starting search
- 📦 = Checking cache
- 🌐 = Calling API
- 🔎 = Trying fallback
- 🖼️ = Extracting logo
- ✅ = Success
- ❌ = Not found
- ⚠️ = Warning/Issue

