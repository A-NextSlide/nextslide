# Validation Errors Fixed ✅

## Summary
Fixed all component validation errors that were causing slide generation to fail. The errors were primarily related to:
1. Invalid font names ("Fonts")
2. Missing required fields in Chart data points
3. Incorrect Lines component structure
4. Missing Chart axis configuration

## Issues Fixed

### 1. ComponentRegistry.get_instance() Error ✅
**Error:**
```
[FONT FALLBACK] Error finding fallback for 'Fonts': type object 'ComponentRegistry' has no attribute 'get_instance'
```

**Root Cause:**
- `ComponentRegistry` doesn't have a `get_instance()` class method (it's not a singleton)
- Code in `slide_generator.py` was trying to call `ComponentRegistry.get_instance()` which doesn't exist

**Fix:**
- **File:** `apps/backend/agents/generation/slide_generator.py`
- **Location:** Line 2483-2485
- **Change:** Pass `None` to `RegistryFonts.get_available_fonts()` and `RegistryFonts.get_all_fonts_list()` instead of trying to get a registry instance
- The `RegistryFonts` methods accept an optional registry parameter and will fall back to loading from the schema file when `None` is passed

```python
# Before
registry = ComponentRegistry.get_instance()
available_fonts_dict = RegistryFonts.get_available_fonts(registry)
all_available = RegistryFonts.get_all_fonts_list(registry)

# After  
available_fonts_dict = RegistryFonts.get_available_fonts(None)
all_available = RegistryFonts.get_all_fonts_list(None)
```

### 2. Invalid Font Name "Fonts" ✅
**Error:**
```
408 validation errors for TiptapTextBlockComponent
props.fontFamily.literal['HK Grotesk Wide']
  Input should be 'HK Grotesk Wide' [type=literal_error, input_value='Fonts', input_type=str]
```

**Root Cause:**
- LLM was generating `fontFamily: "Fonts"` which is not a valid font name
- The validator wasn't catching obviously invalid font names early enough

**Fix:**
- **File:** `apps/backend/agents/generation/components/component_validator.py`
- **Location:** Lines 151-164 (in `_clean_text_component`)
- **Change:** Added validation to catch and replace invalid font names before validation

```python
# CRITICAL FIX: Validate and fix obviously invalid font names
invalid_fonts = ['fonts', 'font', 'font family', 'fontfamily', 'default']
current_font = str(props.get('fontFamily', '')).lower().strip()
if current_font in invalid_fonts or not current_font:
    # Use theme font if available, otherwise use safe default
    if theme and isinstance(theme, dict):
        typography = theme.get('typography', {})
        props['fontFamily'] = typography.get('body_text', {}).get('family', 'Inter')
    else:
        props['fontFamily'] = 'Inter'
```

### 3. Chart Data Points Missing Color Field ✅
**Error:**
```
10 validation errors for ChartComponent
props.data.0.color
  Field required [type=missing, input_value={'name': '2020', 'value': 5, 'y': 5}, input_type=dict]
```

**Root Cause:**
- Chart schema requires all data points to have a `color` field
- LLM was generating chart data without colors: `{name: '2020', value: 5, y: 5}`
- Should be: `{name: '2020', value: 5, y: 5, color: '#FF4301'}`

**Fix:**
- **File:** `apps/backend/agents/generation/components/component_validator.py`
- **Location:** Lines 1159-1204 (new method `_ensure_chart_data_colors`)
- **Change:** Added automatic color assignment to data points that don't have colors

```python
def _ensure_chart_data_colors(self, component: Dict[str, Any], theme: Optional[Dict[str, Any]] = None):
    """Ensure all chart data points have a color field (required by schema).
    Adds colors from theme palette or defaults if missing.
    """
    # Get theme colors or use defaults
    # Add color field to data points that don't have it
    for i, point in enumerate(data):
        if not point.get('color'):
            point['color'] = available_colors[i % len(available_colors)]
```

- **Also updated:** Lines 52-55 to call this method for all Chart components

### 4. Chart axisBottom Missing Required Fields ✅
**Error:**
```
props.axisBottom.legend
  Field required [type=missing, input_value={'tickRotation': 30}, input_type=dict]
props.axisBottom.legendOffset
  Field required [type=missing, input_value={'tickRotation': 30}, input_type=dict]
```

**Root Cause:**
- When `axisBottom` is provided, the schema requires `legend` and `legendOffset` fields
- LLM was generating `axisBottom: {tickRotation: 30}` without these required fields

**Fix:**
- **File:** `apps/backend/agents/generation/components/component_validator.py`
- **Location:** Lines 1206-1228 (new method `_ensure_axis_bottom_fields`)
- **Change:** Added defaults for missing required axisBottom fields

```python
def _ensure_axis_bottom_fields(self, component: Dict[str, Any]):
    """Ensure axisBottom has required legend and legendOffset fields."""
    if axis_bottom is not None:
        if 'legend' not in axis_bottom:
            axis_bottom['legend'] = ''
        if 'legendOffset' not in axis_bottom:
            axis_bottom['legendOffset'] = 36
```

- **Also updated:** Line 54 to call this method for all Chart components

### 5. Lines Component Validation Errors ✅
**Error:**
```
5 validation errors for LinesComponent
props.position.x
  Field required [type=missing, input_value={}, input_type=dict]
props.width
  Field required [type=missing, input_value={...}, input_type=dict]
props.stroke
  Input should be a valid string [type=string_type, input_value={'color': '#e7273b', 'width': 2}, input_type=dict]
```

**Root Cause:**
- Lines components use `startPoint`/`endPoint` coordinates, NOT `position`/`width`/`height`
- LLM was generating box-based positioning instead of coordinate-based
- `stroke` was being generated as an object `{color: '#e7273b', width: 2}` instead of a color string

**Fix:**
- **File:** `apps/backend/agents/generation/components/component_validator.py`
- **Location:** Lines 1230-1283 (new method `_fix_lines_component`)
- **Change:** Convert Lines from box-based to coordinate-based positioning, fix stroke structure

```python
def _fix_lines_component(self, component: Dict[str, Any]):
    """Fix Lines components that were incorrectly generated with position/width/height 
    instead of startPoint/endPoint. Also fixes stroke structure.
    """
    # Convert position/width/height to startPoint/endPoint
    if (has_position or has_dimensions) and missing_points:
        position = props.get('position', {})
        x = position.get('x', 100)
        y = position.get('y', 100)
        width = props.get('width', 200)
        height = props.get('height', 2)
        
        props['startPoint'] = {'x': x, 'y': y}
        props['endPoint'] = {'x': x + width, 'y': y + height}
        
        # Remove box-based props
        props.pop('position', None)
        props.pop('width', None)
        props.pop('height', None)
    
    # Fix stroke object to color string
    if isinstance(stroke, dict):
        color = stroke.get('color', '#000000')
        props['stroke'] = color
        if 'width' in stroke:
            props['strokeWidth'] = stroke['width']
```

- **Also updated:** Lines 57-59 to call this method for all Lines components

## Integration

All fixes are automatically applied during component validation:

```python
# In validate_components():
if comp_type == 'Chart':
    component = self._normalize_chart_props(component)
    component = self._ensure_chart_data_colors(component, theme)  # ✅ NEW
    component = self._ensure_axis_bottom_fields(component)         # ✅ NEW
    component = self._ensure_axis_label_rotation(component)

if comp_type == 'Lines':
    component = self._fix_lines_component(component)               # ✅ NEW

if comp_type in ['TiptapTextBlock', 'TextBlock', 'Title']:
    component = self._clean_text_component(component, theme)      # ✅ NOW FIXES FONTS
```

## Testing

The fixes handle:
- ✅ Invalid font names ("Fonts", "Font", "Font Family", etc.)
- ✅ Missing `color` field in Chart data points
- ✅ Missing `legend` and `legendOffset` in Chart axisBottom
- ✅ Lines components with box-based positioning (position/width/height)
- ✅ Lines components with stroke as object instead of color string
- ✅ Font fallback when ComponentRegistry is not available

## Impact

These fixes will:
1. **Reduce validation errors** - Components will pass schema validation
2. **Improve reliability** - Slides will generate without errors
3. **Better UX** - Users won't see validation error messages in logs
4. **Maintain visual fidelity** - Fixes preserve the visual intent while ensuring schema compliance

## Files Modified

1. `apps/backend/agents/generation/slide_generator.py` (line 2483-2485)
2. `apps/backend/agents/generation/components/component_validator.py` (multiple locations)
   - Lines 52-59: Added fix method calls
   - Lines 106-122: Updated error handling to include fixes
   - Lines 151-164: Added invalid font detection
   - Lines 1159-1204: New `_ensure_chart_data_colors` method
   - Lines 1206-1228: New `_ensure_axis_bottom_fields` method
   - Lines 1230-1283: New `_fix_lines_component` method

