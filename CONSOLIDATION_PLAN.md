# Consolidation Plan: Theme & Outline in Conversational Chat

## Executive Summary

Consolidate theme creation and outline editing into the ConversationalOnboarding chat, eliminating the separate Outline page. The chat becomes the single interface for presentation setup with inline editable theme/outline components and rich thinking/status UI.

---

## Part 1: Critical Data Flows to Preserve

### 1.1 The Complete Flow Today

```
USER INPUT (ConversationalOnboarding)
  │
  ├─► handleSendMessage() streams to /api/outline-agent/chat
  │   └─► Agent researches, generates outline, extracts brand/style
  │
  ├─► onComplete(CollectedData) called with:
  │   • topic, style, slideMode, slides[], themeChanges
  │   • uploadedMedia[], slideScreenshots[]
  │
  ▼
handleConversationalComplete() [DeckList.tsx:825-1041]
  │
  ├─► Extracts vibeContext = data.style || data.stylePreferences
  ├─► Builds stylePreferences { initialIdea, vibeContext, colors, slideMode, referenceImages }
  ├─► Clears old theme: themeStore.setOutlineDeckTheme(outlineId, null)
  ├─► Creates placeholderOutline with stylePrefsFromTheme
  ├─► IMMEDIATELY triggers generateThemeFromOutline() [line 970]
  │   └─► Dispatches theme_preview_update events
  │
  ▼
OutlineDisplayView renders [OutlineDisplayView.tsx]
  │
  ├─► Listens for theme_preview_update CustomEvents
  ├─► Applies theme to useThemeStore
  ├─► Loads fonts via FontLoadingService
  ├─► Shows theme editing UI (color swatches, font dropdowns)
  │   └─► updateSwatchColor(), applyThemeUpdate()
  │
  ▼
handleGenerateDeck() [DeckList.tsx:1244-1700]
  │
  ├─► Gets theme: outlineDeckTheme = useThemeStore.getState().getOutlineDeckTheme(outlineId)
  ├─► CRITICAL: Reorders colors - accent_1, accent_2 at FRONT of colors[]
  ├─► Builds finalTheme with color_palette, typography, logo
  ├─► Builds outlineWithTheme = { ...outline, notes: { theme: finalTheme } }
  ├─► Calls coordinator.generateFromOutline(outlineWithTheme, stylePreferences)
  │
  ▼
Backend receives outline with notes.theme [api_deck_create_stream.py]
  │
  ├─► Extracts theme from outline.notes.theme
  ├─► Passes to adapters.py → SlideGenerationContext
  │
  ▼
CustomComponentGenerator receives [custom_component_generator.py]
  │
  ├─► context.theme (ThemeSpec with color_palette)
  ├─► context.palette (computed colors)
  ├─► context.style_manifesto (design guidelines)
  ├─► context.presentation_context (initialIdea + vibeContext)
  ├─► context.reference_images (design screenshots)
  └─► Generates HTML/CSS/JS with theme colors
```

### 1.2 Data Structures That MUST Be Preserved

#### CollectedData (from ConversationalOnboarding)
```typescript
interface CollectedData {
  topic?: string;                    // Presentation topic
  style?: string;                    // Brand/style (e.g., "nike.com", "modern tech")
  stylePreferences?: string;         // Alternative style descriptor
  slideMode?: 'interactive' | 'presentation' | 'static';
  slideCount?: number;
  detailLevel?: 'quick' | 'standard' | 'detailed';
  slides?: Array<{                   // Pre-generated slides from agent
    title: string;
    subtitle?: string;
    content?: string;
    key_points?: string[];
  }>;
  themeChanges?: {                   // Theme edits from conversation
    brand?: { name: string; url?: string };
    colors?: ColorConfig | string[];
    palette?: any;
    color_palette?: any;
  };
  uploadedMedia?: Array<{            // Processed media from agent
    id: string;
    name: string;
    type: string;
    content?: string;
    url?: string;
  }>;
  slideScreenshots?: string[];       // Base64 PNG from uploaded PPT/PDF
  chatHistory?: ChatMessage[];
  narrative?: string;
}
```

#### stylePreferences (stored in outline)
```typescript
interface StylePreferences {
  initialIdea?: string;              // Original presentation idea
  vibeContext?: string;              // Brand/style for theme generation
  font?: string | null;              // Heading font family
  bodyFont?: string | null;          // Body font family
  colors?: ColorConfig | null;       // Color configuration
  autoSelectImages?: boolean;        // Auto-apply generated images
  referenceLinks?: string[];         // URLs for visual reference
  referenceImages?: string[];        // Base64 design screenshots
  slideMode?: 'interactive' | 'presentation' | 'static';
  logoUrl?: string;                  // Brand logo URL
}
```

#### Theme in outline.notes (passed to backend)
```typescript
interface OutlineNotes {
  theme?: {
    theme_name?: string;
    color_palette: {
      primary_background: string;
      secondary_background?: string;
      primary_text: string;
      accent_1: string;
      accent_2: string;
      colors: string[];              // CRITICAL: accent_1, accent_2 at FRONT
      backgrounds?: string[];
    };
    typography: {
      hero_title: { family: string; size?: string; weight?: number };
      body_text: { family: string; size?: string };
    };
    visual_style?: any;
    logo?: { url: string; source?: string };
    design_style?: string;
  };
}
```

### 1.3 Theme Store Integration Points

```typescript
// Get theme for outline
const outlineDeckTheme = useThemeStore.getState().getOutlineDeckTheme?.(outlineId);

// Set theme for outline
useThemeStore.getState().setOutlineDeckTheme?.(outlineId, themePayload);

// Clear theme (before new generation)
useThemeStore.getState().setOutlineDeckTheme?.(outlineId, null);
useThemeStore.getState().clearOutlineThemeRequested?.(outlineId);

// Apply to workspace
const themeId = useThemeStore.getState().addCustomTheme(builtTheme);
useThemeStore.getState().setWorkspaceTheme(themeId);

// Theme ready state
useThemeStore.getState().setThemeReady(true|false);
```

### 1.4 Font Loading Flow

```typescript
// Must load fonts BEFORE applying theme
await FontLoadingService.syncDesignerFonts?.();
await FontLoadingService.loadFont(fontName);

// Wait for browser to process
if ('fonts' in document) {
  await document.fonts.load(`bold 24px "${headingFont}"`);
  await document.fonts.load(`14px "${bodyFont}"`);
}
```

### 1.5 Color Reordering (CRITICAL for AI)

```typescript
// In handleGenerateDeck - accent colors MUST be at front
const existingColors = outlineDeckTheme.color_palette.colors || [];
const otherColors = existingColors.filter(c =>
  c.toLowerCase() !== accent1.toLowerCase() &&
  c.toLowerCase() !== accent2.toLowerCase()
);
const reorderedColors = [accent1, accent2, ...otherColors].filter(Boolean);
```

---

## Part 2: New Architecture

### 2.1 Chat Message Extensions

```typescript
interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;

  // NEW: Inline editable blocks
  blocks?: ChatBlock[];

  // NEW: Thinking/status steps
  thinkingSteps?: ThinkingStep[];
  isStreaming?: boolean;
}

interface ChatBlock {
  id: string;
  type: 'theme_editor' | 'outline_preview' | 'research_card';
  collapsed: boolean;
  data: ThemeEditorData | OutlinePreviewData | ResearchCardData;
}

interface ThinkingStep {
  id: string;
  phase: 'analyzing' | 'researching' | 'designing' | 'generating';
  label: string;
  detail?: string;
  status: 'pending' | 'active' | 'completed' | 'error';
  timestamp: Date;
  expandedContent?: string;  // Research results, file summaries
}
```

### 2.2 ThemeEditorData (Inline Theme Card)

```typescript
interface ThemeEditorData {
  themeId: string;

  // Colors - matches backend color_palette structure
  colors: {
    primary_background: string;
    primary_text: string;
    accent_1: string;
    accent_2: string;
    colors: string[];          // Full palette for swatches
    backgrounds?: string[];
  };

  // Typography - matches backend typography structure
  typography: {
    headingFont: string;       // hero_title.family
    bodyFont: string;          // body_text.family
  };

  // Branding
  branding?: {
    logoUrl?: string;
    brandName?: string;
    brandDomain?: string;      // For Brandfetch lookup
  };

  // Design context
  designStyle?: string;
  vibeContext?: string;        // Original style request

  // State
  isEditable: boolean;
  isLoading?: boolean;
  loadingMessage?: string;
}
```

### 2.3 New Agent Action: generate_theme

When agent has enough context, it emits:

```json
{
  "action": "generate_theme",
  "context": {
    "topic": "KitKat World History",
    "vibeContext": "playful colorful",
    "brand": "KitKat",
    "brandDomain": "kitkat.com",
    "mood": "energetic and fun"
  }
}
```

Backend intercepts this and:
1. Calls ThemeDirector.generate_theme_document()
2. Fetches brand colors via Brandfetch if brand detected
3. Streams back theme as `chat_block` event

---

## Part 3: New Components

### 3.1 ThinkingStatusDisplay

**Purpose**: Shows agent thinking steps with expandable details

```
┌─────────────────────────────────────────────────┐
│ ✓ Understanding your request                    │
│ ✓ Research complete (3 queries, 9 sources)     │
│   └─ [Click to see research results]           │
│ ✓ Created 10-slide outline                      │
│ ✓ Detected brand: KitKat                        │
│ ⋯ Generating theme...                           │
│   └─ Fetching brand colors from kitkat.com     │
│ ○ Selecting typography                          │
└─────────────────────────────────────────────────┘
```

**Props**:
```typescript
interface ThinkingStatusDisplayProps {
  steps: ThinkingStep[];
  isActive: boolean;
  defaultCollapsed?: boolean;
  onStepClick?: (step: ThinkingStep) => void;
}
```

**Implementation Notes**:
- Animate step transitions (fade-in, slide-up)
- Color code: green=done, orange=active, gray=pending
- Click step to expand research/file details
- Auto-collapse when generation complete

### 3.2 InlineChatThemeEditor

**Purpose**: Collapsible, editable theme card in chat

**Collapsed State**:
```
┌─────────────────────────────────────────────────┐
│ 🎨 Theme: KitKat Brand        [▶ Expand]       │
│ [■ ■ ■ ■] Montserrat + Inter                   │
└─────────────────────────────────────────────────┘
```

**Expanded State**:
```
┌─────────────────────────────────────────────────┐
│ 🎨 Your Theme                      [▼ Collapse] │
├─────────────────────────────────────────────────┤
│ ┌─────────┬─────────┬─────────┬─────────┐      │
│ │ Primary │Secondary│ Accent1 │ Accent2 │      │
│ │ #FFFFFF │ #BA0018 │ #BA0018 │ #74350C │      │
│ └────┬────┴────┬────┴────┬────┴────┬────┘      │
│      └─────────┴─────────┴─────────┘           │
│              Click swatch to edit               │
│                                                 │
│ Typography                                      │
│ ┌─────────────────────────────────────────┐    │
│ │ Heading: Montserrat Bold    [Change ▼]  │    │
│ │ Body:    Inter Regular      [Change ▼]  │    │
│ └─────────────────────────────────────────┘    │
│                                                 │
│ Brand  [KitKat Logo]                           │
│ Detected from topic • kitkat.com               │
│                                                 │
│       [✓ Apply]  [↻ Regenerate]  [✎ Edit]     │
└─────────────────────────────────────────────────┘
```

**Props**:
```typescript
interface InlineChatThemeEditorProps {
  data: ThemeEditorData;
  isCollapsed: boolean;
  onToggleCollapse: () => void;

  // Theme editing callbacks
  onColorChange: (colorKey: string, hex: string) => void;
  onFontChange: (fontType: 'heading' | 'body', fontFamily: string) => void;
  onBrandChange: (brand: { name?: string; logoUrl?: string }) => void;

  // Actions
  onApply: () => void;          // Commit changes to outline
  onRegenerate: () => void;     // Ask agent for new theme

  // State
  isEditable: boolean;
  fonts: FontOption[];          // From font registry
}
```

**CRITICAL Implementation Requirements**:

1. **Use EnhancedColorPicker** - Same component as OutlineDisplayView
2. **Use GroupedDropdown for fonts** - With ALL_FONT_NAMES, FONT_CATEGORIES
3. **Load fonts before preview** - FontLoadingService.loadFont()
4. **Update themeStore on change** - setOutlineDeckTheme()
5. **Preserve color array order** - accent_1, accent_2 at front

### 3.3 InlineChatOutlinePreview

**Purpose**: Collapsible outline summary with quick actions

```
┌─────────────────────────────────────────────────┐
│ 📋 KitKat World History (10 slides) [▼ Collapse]│
├─────────────────────────────────────────────────┤
│ 1. KitKat: A Bite of History                   │
│    └─ Introduction to the iconic chocolate bar  │
│ 2. The Beginning: 1935                          │
│    └─ Rowntree's in York, England               │
│ 3. The Original Icon                            │
│    └─ Four-finger wafer design                  │
│ ⋮ (+ 7 more slides)                             │
│                                                 │
│ [+ Add Slide]  [Edit All]  [↻ Regenerate]      │
└─────────────────────────────────────────────────┘
```

**Props**:
```typescript
interface InlineChatOutlinePreviewProps {
  data: {
    outlineId: string;
    title: string;
    slides: Array<{
      id: string;
      title: string;
      subtitle?: string;
      keyPoints?: string[];
    }>;
  };
  isCollapsed: boolean;
  onToggleCollapse: () => void;

  // Slide editing
  onSlideEdit: (slideId: string, updates: Partial<SlideOutline>) => void;
  onSlideDelete: (slideId: string) => void;
  onSlideAdd: () => void;
  onSlideReorder: (fromIndex: number, toIndex: number) => void;

  // Actions
  onRegenerate: () => void;

  isEditable: boolean;
}
```

---

## Part 4: Backend Changes

### 4.1 New SSE Event Types

```python
# api_outline_agent.py

SSE_EVENTS = {
    'text': str,                # Regular text content
    'status': dict,             # Thinking status update
    'outline': dict,            # Outline data
    'research': dict,           # Research results with citations
    'chat_block': dict,         # NEW: Inline editable block
    'thinking_step': dict,      # NEW: Granular thinking progress
    'done': None,
    'error': dict,
}
```

### 4.2 Handle generate_theme Action

```python
async def handle_generate_theme_action(context: dict, outline_id: str):
    """Generate theme and stream back as chat_block."""

    # Emit thinking step
    yield {
        "type": "thinking_step",
        "step": {
            "id": str(uuid4()),
            "phase": "designing",
            "label": "Generating visual theme",
            "status": "active"
        }
    }

    # Check for brand
    brand_name = context.get('brand')
    brand_domain = context.get('brandDomain')

    if brand_name or brand_domain:
        yield {
            "type": "thinking_step",
            "step": {
                "id": str(uuid4()),
                "phase": "designing",
                "label": f"Fetching brand colors for {brand_name or brand_domain}",
                "status": "active"
            }
        }

    # Generate theme via ThemeDirector
    theme_director = ThemeDirector(...)
    theme_doc = await theme_director.generate_theme_document(
        title=context.get('topic'),
        context=context.get('vibeContext'),
        options={
            'brand': brand_name,
            'brand_domain': brand_domain,
        }
    )

    # Build theme editor data
    theme_data = {
        "themeId": str(uuid4()),
        "colors": {
            "primary_background": theme_doc.color_palette.primary_background,
            "primary_text": theme_doc.color_palette.primary_text,
            "accent_1": theme_doc.color_palette.accent_1,
            "accent_2": theme_doc.color_palette.accent_2,
            "colors": theme_doc.color_palette.colors,
            "backgrounds": theme_doc.color_palette.backgrounds,
        },
        "typography": {
            "headingFont": theme_doc.typography.hero_title.font_family,
            "bodyFont": theme_doc.typography.body_text.font_family,
        },
        "branding": {
            "logoUrl": theme_doc.logo_url,
            "brandName": brand_name,
            "brandDomain": brand_domain,
        },
        "designStyle": theme_doc.design_style,
        "vibeContext": context.get('vibeContext'),
        "isEditable": True,
    }

    # Emit as chat block
    yield {
        "type": "chat_block",
        "block_type": "theme_editor",
        "data": theme_data
    }

    # Mark thinking step complete
    yield {
        "type": "thinking_step",
        "step": {
            "id": str(uuid4()),
            "phase": "designing",
            "label": "Theme ready",
            "status": "completed"
        }
    }
```

### 4.3 Agent System Prompt Addition

```python
THEME_DIRECTIVE = """
## THEME GENERATION

After generating an outline, you MUST proactively offer to create a visual theme.

1. When you have enough context (topic, style, any brand mentions), say:
   "Now let me create a visual theme for your presentation..."

2. Then emit a generate_theme action:
   ```json
   {
     "action": "generate_theme",
     "context": {
       "topic": "The presentation topic",
       "vibeContext": "style description",
       "brand": "BrandName",           // If detected in topic or user message
       "brandDomain": "brand.com",     // If detected
       "mood": "energetic and fun"     // Inferred mood
     }
   }
   ```

3. The system will generate the theme and display it as an editable card.

4. If user asks to change colors/fonts AFTER theme is shown, emit update_theme action.

## THINKING STEPS

Emit thinking updates so user sees progress:

```json
{
  "action": "show_thinking",
  "step": {
    "phase": "researching",
    "label": "Searching for KitKat history",
    "detail": "Query: KitKat brand history 1935"
  }
}
```

Phases: analyzing, researching, designing, generating
"""
```

---

## Part 5: Frontend Service Updates

### 5.1 outlineAgentService.ts Additions

```typescript
// New event types
interface AgentEvent {
  type: 'text' | 'outline' | 'status' | 'error' | 'done' | 'research'
      | 'chat_block' | 'thinking_step';

  // For chat_block
  block_type?: 'theme_editor' | 'outline_preview' | 'research_card';
  data?: ThemeEditorData | OutlinePreviewData | ResearchCardData;

  // For thinking_step
  step?: ThinkingStep;
}

// Update streamOutlineAgentChat to handle new events
```

### 5.2 New Hook: useChatBlocks

```typescript
function useChatBlocks(outlineId: string) {
  const [themeBlock, setThemeBlock] = useState<ThemeEditorData | null>(null);
  const [outlineBlock, setOutlineBlock] = useState<OutlinePreviewData | null>(null);
  const [collapseState, setCollapseState] = useState<Record<string, boolean>>({});

  // Handle theme changes - update both local state and themeStore
  const handleThemeChange = useCallback((updates: Partial<ThemeEditorData>) => {
    setThemeBlock(prev => {
      if (!prev) return prev;
      const updated = { ...prev, ...updates };

      // Sync to themeStore
      const themePayload = {
        color_palette: updated.colors,
        typography: {
          hero_title: { family: updated.typography.headingFont },
          body_text: { family: updated.typography.bodyFont },
        },
        logo: updated.branding?.logoUrl ? { url: updated.branding.logoUrl } : undefined,
      };
      useThemeStore.getState().setOutlineDeckTheme?.(outlineId, themePayload);

      return updated;
    });
  }, [outlineId]);

  // Handle color swatch change
  const handleColorChange = useCallback((colorKey: string, hex: string) => {
    setThemeBlock(prev => {
      if (!prev) return prev;

      const newColors = { ...prev.colors, [colorKey]: hex };

      // Ensure accent_1 and accent_2 are at front of colors array
      const accent1 = newColors.accent_1;
      const accent2 = newColors.accent_2;
      const otherColors = (newColors.colors || []).filter(c =>
        c.toLowerCase() !== accent1?.toLowerCase() &&
        c.toLowerCase() !== accent2?.toLowerCase()
      );
      newColors.colors = [accent1, accent2, ...otherColors].filter(Boolean);

      return { ...prev, colors: newColors };
    });
  }, []);

  // Handle font change with loading
  const handleFontChange = useCallback(async (
    fontType: 'heading' | 'body',
    fontFamily: string
  ) => {
    // Load font first
    await FontLoadingService.syncDesignerFonts?.();
    await FontLoadingService.loadFont(fontFamily);

    setThemeBlock(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        typography: {
          ...prev.typography,
          [fontType === 'heading' ? 'headingFont' : 'bodyFont']: fontFamily,
        }
      };
    });
  }, []);

  return {
    themeBlock,
    setThemeBlock,
    outlineBlock,
    setOutlineBlock,
    collapseState,
    toggleCollapse: (blockId: string) => setCollapseState(prev => ({
      ...prev,
      [blockId]: !prev[blockId]
    })),
    handleThemeChange,
    handleColorChange,
    handleFontChange,
  };
}
```

---

## Part 6: ConversationalOnboarding Updates

### 6.1 State Additions

```typescript
// In ConversationalOnboarding.tsx

// Thinking steps for current message
const [thinkingSteps, setThinkingSteps] = useState<ThinkingStep[]>([]);

// Chat blocks (theme, outline)
const {
  themeBlock,
  setThemeBlock,
  outlineBlock,
  setOutlineBlock,
  collapseState,
  toggleCollapse,
  handleThemeChange,
  handleColorChange,
  handleFontChange,
} = useChatBlocks(currentOutlineId);

// Track which message has blocks
const [messageBlocks, setMessageBlocks] = useState<Record<string, ChatBlock[]>>({});
```

### 6.2 Event Handler Updates

```typescript
// In handleSendMessage event loop:

for await (const event of streamOutlineAgentChat(request)) {
  switch (event.type) {
    case 'thinking_step':
      setThinkingSteps(prev => {
        const existing = prev.findIndex(s => s.id === event.step?.id);
        if (existing >= 0) {
          const updated = [...prev];
          updated[existing] = event.step!;
          return updated;
        }
        return [...prev, event.step!];
      });
      break;

    case 'chat_block':
      if (event.block_type === 'theme_editor') {
        setThemeBlock(event.data as ThemeEditorData);

        // Add to current message's blocks
        setMessageBlocks(prev => ({
          ...prev,
          [currentMessageId]: [
            ...(prev[currentMessageId] || []),
            {
              id: (event.data as ThemeEditorData).themeId,
              type: 'theme_editor',
              collapsed: false,
              data: event.data,
            }
          ]
        }));

        // Also sync to themeStore immediately
        const themeData = event.data as ThemeEditorData;
        useThemeStore.getState().setOutlineDeckTheme?.(currentOutlineId, {
          color_palette: themeData.colors,
          typography: {
            hero_title: { family: themeData.typography.headingFont },
            body_text: { family: themeData.typography.bodyFont },
          },
        });
      }
      break;

    // ... existing handlers
  }
}
```

### 6.3 onComplete Update

```typescript
// When completing conversation, pass theme data correctly

const handleComplete = useCallback(() => {
  // Build final collected data
  const data: CollectedData = {
    topic,
    style: vibeContext,
    slideMode,
    slides: outlineBlock?.slides || [],
    themeChanges: themeBlock ? {
      colors: themeBlock.colors,
      brand: themeBlock.branding,
    } : undefined,
    uploadedMedia,
    slideScreenshots,
    chatHistory: messages,
  };

  onComplete(data);
}, [themeBlock, outlineBlock, /* ... */]);
```

---

## Part 7: Refactoring Opportunities

### 7.1 Extract Theme Utilities

Create `apps/frontend/src/utils/themeUtils.ts`:

```typescript
// Centralize color reordering logic
export function reorderColorsWithAccentsFirst(
  colors: string[],
  accent1: string,
  accent2: string
): string[] {
  const otherColors = colors.filter(c =>
    c.toLowerCase() !== accent1?.toLowerCase() &&
    c.toLowerCase() !== accent2?.toLowerCase()
  );
  return [accent1, accent2, ...otherColors].filter(Boolean);
}

// Centralize theme payload building
export function buildThemePayload(themeData: ThemeEditorData): any {
  return {
    color_palette: {
      ...themeData.colors,
      colors: reorderColorsWithAccentsFirst(
        themeData.colors.colors,
        themeData.colors.accent_1,
        themeData.colors.accent_2
      ),
    },
    typography: {
      hero_title: { family: themeData.typography.headingFont },
      body_text: { family: themeData.typography.bodyFont },
    },
    logo: themeData.branding?.logoUrl
      ? { url: themeData.branding.logoUrl }
      : undefined,
  };
}

// Validate theme has real colors (not defaults)
export function hasRealThemeColors(colors: any): boolean {
  const defaults = ['#FFFFFF', '#FFF', '#FAFAFA', '#F5F5F5'];
  const accent = colors?.accent_1 || colors?.accent;
  const bg = colors?.primary_background || colors?.background;
  return (
    (accent && !defaults.includes(accent.toUpperCase())) ||
    (bg && !defaults.includes(bg.toUpperCase()))
  );
}
```

### 7.2 Extract Font Loading Hook

Create `apps/frontend/src/hooks/useFontLoader.ts`:

```typescript
export function useFontLoader() {
  const loadFont = useCallback(async (fontFamily: string) => {
    await FontLoadingService.syncDesignerFonts?.();
    await FontLoadingService.loadFont(fontFamily);

    if ('fonts' in document) {
      await Promise.all([
        document.fonts.load(`bold 24px "${fontFamily}"`).catch(() => {}),
        document.fonts.load(`14px "${fontFamily}"`).catch(() => {}),
      ]);
    }
  }, []);

  const loadThemeFonts = useCallback(async (
    headingFont: string,
    bodyFont: string
  ) => {
    await loadFont(headingFont);
    if (bodyFont !== headingFont) {
      await loadFont(bodyFont);
    }
  }, [loadFont]);

  return { loadFont, loadThemeFonts };
}
```

### 7.3 Consolidate Status Event Types

Create `apps/frontend/src/types/agentEvents.ts`:

```typescript
export const STATUS_PHASES = {
  thinking: { icon: '💭', label: 'Understanding', color: '#3B82F6' },
  analyzing_file: { icon: '📄', label: 'Analyzing file', color: '#8B5CF6' },
  files_analyzed: { icon: '✓', label: 'Analysis complete', color: '#10B981' },
  researching: { icon: '🔍', label: 'Researching', color: '#6366F1' },
  research_complete: { icon: '✓', label: 'Research complete', color: '#10B981' },
  detecting_brand: { icon: '🏷️', label: 'Detecting brand', color: '#F59E0B' },
  fetching_brand_colors: { icon: '🎨', label: 'Fetching colors', color: '#EC4899' },
  generating_theme: { icon: '✨', label: 'Creating theme', color: '#F59E0B' },
  theme_complete: { icon: '✓', label: 'Theme ready', color: '#10B981' },
  generating_outline: { icon: '📋', label: 'Creating outline', color: '#06B6D4' },
  outline_complete: { icon: '✓', label: 'Outline ready', color: '#10B981' },
} as const;

export type StatusPhase = keyof typeof STATUS_PHASES;
```

---

## Part 8: Implementation Order

### Phase 1: Backend (2-3 files)
1. Add `thinking_step` and `chat_block` SSE events to `api_outline_agent.py`
2. Add `generate_theme` action handler
3. Update agent system prompt with theme directive

### Phase 2: Types & Utilities (3 files)
1. Create `types/agentEvents.ts` with status phases
2. Create `types/chatBlocks.ts` with block interfaces
3. Create `utils/themeUtils.ts` with reusable functions

### Phase 3: Hooks (2 files)
1. Create `useChatBlocks.ts` hook
2. Create `useFontLoader.ts` hook

### Phase 4: Components (4 files)
1. Create `ThinkingStatusDisplay.tsx`
2. Create `InlineChatThemeEditor.tsx`
3. Create `InlineChatOutlinePreview.tsx`
4. Create `ResearchCard.tsx`

### Phase 5: Integration (2 files)
1. Update `outlineAgentService.ts` with new event handling
2. Update `ConversationalOnboarding.tsx` with:
   - New state for blocks and thinking
   - Event handlers for new event types
   - Message rendering with blocks
   - Theme/outline change handlers

### Phase 6: Testing & Cleanup
1. Test complete flow end-to-end
2. Verify theme passes correctly to CustomComponentGenerator
3. Remove/deprecate OutlineDisplayView theme UI (keep for fallback?)
4. Clean up any dead code

---

## Part 9: Verification Checklist

Before considering this complete, verify:

- [ ] Theme colors reach CustomComponentGenerator correctly
- [ ] Color reordering (accent_1, accent_2 first) is preserved
- [ ] Font loading happens before theme preview
- [ ] themeStore is updated on every theme change
- [ ] Brand logos are fetched and displayed
- [ ] Reference images (slideScreenshots) flow to generation
- [ ] stylePreferences.vibeContext is set correctly
- [ ] outline.notes.theme is built correctly for backend
- [ ] Thinking steps show research queries and results
- [ ] Inline theme editor uses EnhancedColorPicker
- [ ] Inline theme editor uses GroupedDropdown for fonts
- [ ] Collapse state persists correctly
- [ ] Regenerate theme works from inline editor
- [ ] User color/font edits sync to themeStore immediately

---

## Part 10: Files Summary

### New Files
```
apps/frontend/src/types/agentEvents.ts
apps/frontend/src/types/chatBlocks.ts
apps/frontend/src/utils/themeUtils.ts
apps/frontend/src/hooks/useChatBlocks.ts
apps/frontend/src/hooks/useFontLoader.ts
apps/frontend/src/components/chat/ThinkingStatusDisplay.tsx
apps/frontend/src/components/chat/InlineChatThemeEditor.tsx
apps/frontend/src/components/chat/InlineChatOutlinePreview.tsx
apps/frontend/src/components/chat/ResearchCard.tsx
```

### Modified Files
```
apps/backend/api/requests/api_outline_agent.py
apps/frontend/src/services/outlineAgentService.ts
apps/frontend/src/components/onboarding/ConversationalOnboarding.tsx
```

### Potentially Deprecated
```
apps/frontend/src/components/outline/OutlineDisplayView.tsx (theme section)
```
