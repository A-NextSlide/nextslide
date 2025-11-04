# NextSlide API Flow Documentation

## Overview
This document maps all API endpoints the frontend hits and describes the application flow.

## Core API Endpoints

### Health & Registry
- **GET** `/api/health` - Health check endpoint (polled frequently)
- **POST** `/api/registry` - Initialize/update component registry from frontend

### Authentication & User
- **GET** `/auth/decks?filter={shared|owned}` - Get user's decks (with pagination)
  - Query params: `filter`, `limit`, `offset`, `include_first_slide`
- **GET** `/api/admin/check` - Check if user has admin permissions

### Deck Management
- **GET** `/auth/decks/{uuid}` - Get deck metadata
- **GET** `/auth/decks/{uuid}/full` - Get complete deck with all slides
- **PUT** `/auth/decks/{uuid}` - Update deck data
- **GET** `/api/decks/{uuid}/collaborators` - Get deck collaborators
- **GET** `/api/decks/{uuid}/comments` - Get comments for specific slide
  - Query params: `slideId`, `status`

### Presentation Generation Flow
1. **POST** `/api/openai/generate-outline-stream` - Generate presentation outline (streaming)
   - Returns: Streaming SSE with slides as they're generated

2. **POST** `/api/theme/from-outline` - Generate theme from outline
   - Returns: Theme with colors, fonts, palette

3. **POST** `/api/deck/create-from-outline` - Create deck and generate slides
   - Triggers parallel slide generation
   - Streams updates back to frontend

### Media & Assets
- **GET** `/api/fonts/list` - Get available fonts list
  - Query params: `limit`
- **GET** `/api/fonts/font/{fontName}` - Get specific font details
- **POST** `/api/images/generate` - Generate AI images for slides
- **POST** `/api/media/search` - Search for stock images
  - Query params: `query`, `type` (images/videos)

### Agent System
- **POST** `/v1/agent/sessions` - Create agent session
- **WebSocket** `/v1/agent/stream` - Real-time agent communication
  - Query params: `sessionId`, `token`

## Application Flow

### 1. Initial Load
```
Frontend Start
  ├─> GET /api/health (health check)
  ├─> POST /api/registry (component registry init)
  └─> GET /auth/decks?filter=shared (load shared decks)
      └─> GET /auth/decks?filter=owned (load user's decks)
```

### 2. User Authentication
```
User Login/Session Restore
  ├─> Supabase Auth: GET /auth/v1/user
  ├─> GET /api/admin/check (check permissions)
  └─> GET /api/fonts/list (preload fonts)
```

### 3. Presentation Creation Flow
```
User Creates Presentation
  ├─> POST /api/openai/generate-outline-stream
  │   ├─> Perplexity API: Generate outline structure
  │   ├─> Stream: outline_ready event
  │   ├─> Stream: slide_ready events (per slide)
  │   └─> Stream: complete event
  │
  ├─> POST /api/theme/from-outline
  │   ├─> Claude API: Analyze presentation topic
  │   ├─> Palette DB: Vector search for color schemes
  │   ├─> Brandfetch API: Fetch brand colors (if applicable)
  │   └─> Return: Theme with fonts, colors, palette
  │
  └─> POST /api/deck/create-from-outline
      ├─> Create deck in Supabase
      ├─> Start parallel slide generation (max 8 concurrent)
      │   ├─> For each slide:
      │   │   ├─> Claude API: Generate slide components
      │   │   ├─> Validate & post-process components
      │   │   └─> Save slide to Supabase
      │   │
      │   └─> Background image search
      │       └─> SerpAPI: Search images for each slide
      │
      ├─> Background narrative flow generation
      │   └─> Perplexity API: Generate presentation flow
      │
      └─> Stream: slide_complete events (as slides finish)
```

### 4. Image Generation & Media
```
Slide Needs Images
  ├─> POST /api/images/generate (AI generation)
  │   ├─> Flux AI: Generate image
  │   └─> Supabase Storage: Upload generated image
  │
  └─> POST /api/media/search (stock images)
      └─> SerpAPI: Search Google Images
```

### 5. Real-time Collaboration
```
User Edits Deck
  ├─> PUT /auth/decks/{uuid} (save changes)
  ├─> WebSocket: Broadcast changes to collaborators
  └─> GET /api/decks/{uuid}/comments (load comments)
```

## External API Dependencies

### AI/ML Services
- **Anthropic Claude** - Slide generation, theme analysis
- **Perplexity API** - Outline generation, research
- **Flux AI** - Image generation

### Data Services
- **Supabase**
  - Auth: `/auth/v1/*`
  - Database: `/rest/v1/*`
  - Storage: `/storage/v1/*`
- **SerpAPI** - Image search
- **Brandfetch** - Brand color/logo fetching
- **OpenAI** - Embeddings for palette search

## Database Tables (Supabase)

### Core Tables
- `decks` - Presentation decks
  - `decks_optimized` - Optimized view with slide count
- `users` - User accounts
- `deck_collaborators` - Deck sharing/permissions
- `comments` - Slide comments
- `agent_sessions` - Agent conversation sessions

### Asset Tables
- `color_palettes` - Color schemes with vector embeddings
- `slide-media` (storage bucket) - Images, logos, generated assets

## Key Flow Patterns

### Streaming Pattern
Most generation endpoints use Server-Sent Events (SSE) for real-time updates:
1. Client initiates request
2. Server streams events: `{type: 'event_name', data: {...}}`
3. Events: `outline_ready`, `slide_ready`, `theme_generated`, `deck_complete`

### Caching Strategy
- Claude prompt caching: Reuse KB context across slides
- Font registry: Cached in frontend
- Brand colors: Cached in database
- Theme: Persisted in deck `data` field

### Concurrency Controls
- Max 8 parallel slides generating
- Max 10 API calls per user concurrently
- Rate limiting: 60 requests/minute per user
- Deck generation locks prevent duplicate creation

## Common Request Flows

### Quick Health Check Loop
```
Every 2-3 seconds:
  GET /api/health
```

### Deck List Refresh
```
GET /auth/decks?filter=shared
GET /auth/decks?filter=owned&limit=20&offset=0&include_first_slide=true
```

### Font Loading (on demand)
```
For each unique font in deck:
  GET /api/fonts/font/{fontName}
```

This is typically triggered when slides are rendered and need font data.
