# Brand Font System - Current State & Implementation Plan

## Current Font Storage Architecture

### 1. **Local Font Storage**
- **Location**: `apps/backend/assets/fonts/`
- **Directories**:
  - `pixelbuddha/` - PixelBuddha fonts (701 fonts, but only 80 curated are loaded)
  - `designer/` - Designer/Unblast fonts
  - `metadata/` - Font metadata JSON files
- **Serving**: Via `/api/fonts/file/{font_id}?style=regular` endpoint
- **Storage**: Filesystem (not Supabase)

### 2. **Brand Data Storage**
- **Database**: `brandfetch_cache` table in Supabase
- **Schema**:
  ```sql
  - id: UUID
  - identifier: TEXT (original search term)
  - normalized_identifier: TEXT (cleaned domain)
  - api_response: JSONB {
      brand_name: string,
      domain: string,
      logos: {...},
      colors: {...},
      fonts: { names: ["Font Name 1", "Font Name 2"] }  // Just names, no files
    }
  - success: BOOLEAN
  - created_at: TIMESTAMP
  - hit_count: INTEGER
  ```

### 3. **Current Font Flow**
```
User requests brand → Brandfetch API → Extract font NAMES → Store in DB
User generates slide → System checks brand fonts → Uses font NAME only
                                                   ↓
                                        Looks up in local registry → May NOT exist
```

### 4. **Supabase Storage System**
- **Bucket**: `slide-media` (existing)
- **Used for**: Images, logos
- **Upload Pattern**:
  ```python
  supabase.storage.from_('slide-media').upload(
      path='logos/domain_com/logo.svg',
      file=file_bytes,
      file_options={'content-type': 'image/svg+xml'}
  )
  ```

## Proposed Brand Font Upload System

### Implementation Plan

#### **Phase 1: Backend Infrastructure**
1. ✅ Create font upload endpoint in admin API
2. ✅ Store font files in Supabase Storage at `fonts/brands/{brand_id}/{font_name}.{ext}`
3. ✅ Update brand API response to include font file URLs
4. ✅ Create font serving endpoint that checks both local AND Supabase storage

#### **Phase 2: Brand Font Storage Structure**
```json
{
  "api_response": {
    "fonts": {
      "names": ["Proxima Nova", "Gotham"],
      "files": [
        {
          "name": "Proxima Nova",
          "variants": {
            "regular": "https://supabase.../fonts/brands/nike/proxima-nova-regular.woff2",
            "bold": "https://supabase.../fonts/brands/nike/proxima-nova-bold.woff2",
            "italic": "https://supabase.../fonts/brands/nike/proxima-nova-italic.woff2"
          },
          "uploaded_at": "2025-01-04T...",
          "uploaded_by": "admin_user_id"
        }
      ]
    }
  }
}
```

#### **Phase 3: Frontend Upload UI**
1. ✅ Add font upload section in Visual Editor tab
2. ✅ Support multiple font file uploads (regular, bold, italic, etc.)
3. ✅ Display uploaded fonts with download/delete options
4. ✅ Show font preview using uploaded files

#### **Phase 4: Font Service Integration**
1. ✅ Modify `EnhancedFontService` to check brand fonts
2. ✅ Update font registry to include brand fonts dynamically
3. ✅ Modify `/api/fonts/list` to include brand fonts
4. ✅ Modify `/api/fonts/file/{font_id}` to serve from Supabase if brand font

### Benefits
- ✅ Custom brand fonts available immediately after upload
- ✅ No need to manually add fonts to local registry
- ✅ Centralized storage (Supabase)
- ✅ Proper brand typography alignment
- ✅ Font files travel with brand data

### Storage Paths
```
Supabase Storage: slide-media/
├── images/               (existing)
├── logos/                (existing)
└── fonts/
    └── brands/
        └── {brand_id}/
            ├── proxima-nova-regular.woff2
            ├── proxima-nova-bold.woff2
            └── gotham-book.woff2
```

## Next Steps
1. Implement backend font upload endpoint
2. Create frontend upload UI
3. Integrate with font service
4. Test end-to-end flow
