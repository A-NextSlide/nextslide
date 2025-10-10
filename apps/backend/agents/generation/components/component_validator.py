"""
Component validator for slide generation.
"""

from typing import Dict, Any, List, Optional
import re
import uuid
from setup_logging_optimized import get_logger
from services.adaptive_font_sizer import adaptive_font_sizer

logger = get_logger(__name__)


class ComponentValidator:
    """Validates and processes slide components."""
    
    def __init__(self, registry=None):
        """Initialize with optional registry."""
        self.registry = registry
        self.font_sizer = adaptive_font_sizer
    
    def validate_components(
        self,
        components: List[Dict[str, Any]],
        registry: Any = None,
        theme: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        """Validate components against registry."""
        # Use provided registry or fall back to instance registry
        registry = registry or self.registry

        # Apply font sizing to all text components if theme provided
        if theme:
            logger.info(f"[FONT SIZING] Applying adaptive font sizing to {len(components)} components")
            components = self.apply_slide_font_sizing(components, theme)
        else:
            logger.warning("[FONT SIZING] No theme provided, skipping font sizing")

        validated = []
        
        for component in components:
            try:
                # Ensure component has an ID
                if not component.get('id'):
                    component['id'] = str(uuid.uuid4())
                
                # Get the component model from registry
                comp_type = component.get('type')

                # Proactive normalization for specific component types
                if comp_type == 'Chart':
                    component = self._normalize_chart_props(component)
                    component = self._ensure_axis_label_rotation(component)
                
                # Special handling for CustomComponent
                if comp_type == 'CustomComponent':
                    component = self._fix_custom_component_render(component)
                
                # Special handling for Background component
                if comp_type == 'Background':
                    component = self._fix_background_component(component)
                
                # Special handling for Shape component
                if comp_type == 'Shape':
                    component = self._normalize_shape_props(component)
                
                # Special handling for text components - standardize and enrich formatting
                if comp_type in ['TiptapTextBlock', 'TextBlock', 'Title']:
                    component = self._clean_text_component(component)
                    # Normalize fontFamily casing to match schema enums (e.g., 'OPEN SANS' -> 'Open Sans')
                    try:
                        p = component.get('props') or {}
                        fam = p.get('fontFamily')
                        if isinstance(fam, str) and fam.strip():
                            normalized = ' '.join(w.capitalize() for w in fam.split())
                            p['fontFamily'] = normalized
                            component['props'] = p
                    except Exception:
                        pass
                    component = self._promote_plain_text_to_rich_tiptap(component)
                    # Apply intelligent font sizing
                    component = self._apply_intelligent_font_sizing(component)
                
                # Validate boundaries for all components to prevent overflow
                component = self._validate_component_boundaries(component)
                
                if registry and comp_type in registry._component_models:
                    ComponentModel = registry._component_models[comp_type]
                    # Validate the component
                    validated_comp = ComponentModel(**component)
                    validated.append(validated_comp.model_dump())
                else:
                    # No registry or unknown component type - still apply boundary validation
                    validated.append(component)
                    
            except Exception as e:
                logger.warning(f"Component validation failed for {comp_type}: {e}")
                # Last-chance sanitation for Chart components before keeping
                try:
                    if comp_type == 'Chart':
                        component = self._normalize_chart_props(component)
                        component = self._ensure_axis_label_rotation(component)
                        if registry and comp_type in registry._component_models:
                            ComponentModel = registry._component_models[comp_type]
                            validated_comp = ComponentModel(**component)
                            validated.append(validated_comp.model_dump())
                            continue
                except Exception:
                    # Fall through to keep-as-is
                    pass
                # Keep the component anyway - but ensure it has an ID
                if not component.get('id'):
                    component['id'] = str(uuid.uuid4())
                validated.append(component)
        
        # Final pass: guarantee no bottom/right overflow (boundary-only)
        try:
            validated = [self._validate_component_boundaries(c) for c in validated]
        except Exception as e:
            logger.debug(f"boundary pass skipped: {e}")
        return validated

    def _normalize_non_overlapping_layout(self, components: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Overlap enforcement removed - AI model handles positioning directly."""
        return components
    
    def _clean_text_component(self, component: Dict[str, Any]) -> Dict[str, Any]:
        """Normalize text components to satisfy typed schema while keeping visual intent.
        - Ensure required fields exist with safe defaults
        - Coerce types (e.g., letterSpacing numeric)
        - Restructure texts[].style when missing
        - Keep background visually transparent by default using '#00000000'
        """
        props = component.get('props', {}) or {}

        # Base visual defaults often required by schema
        props.setdefault('opacity', 1)
        props.setdefault('rotation', 0)
        # Keep zIndex only if user specified; many schemas mark it required but we can default to 10
        props.setdefault('zIndex', 10)
        props.setdefault('padding', 0)
        props.setdefault('fontStyle', 'normal')

        # Alignment defaults (schema often requires both)
        props.setdefault('alignment', 'left')
        props.setdefault('verticalAlignment', 'top')

        # Background should exist but be transparent by default
        bg = props.get('backgroundColor')
        if not isinstance(bg, str) or not bg:
            props['backgroundColor'] = '#00000000'

        # letterSpacing must be numeric per schema
        if 'letterSpacing' in props:
            ls = props.get('letterSpacing')
            if isinstance(ls, str):
                try:
                    if ls.endswith('em'):
                        props['letterSpacing'] = float(ls.replace('em', '').strip())
                    elif ls.endswith('px'):
                        # Convert px to approx em (base 16px)
                        props['letterSpacing'] = float(ls.replace('px', '').strip()) / 16.0
                    else:
                        props['letterSpacing'] = float(ls)
                except Exception:
                    props['letterSpacing'] = -0.01
        else:
            # Default tightening; bump for very large text later
            props['letterSpacing'] = -0.01

        # Clamp or default lineHeight to a maximum of 1.2
        try:
            lh = props.get('lineHeight', None)
            if lh is None:
                props['lineHeight'] = 1.2
            else:
                if isinstance(lh, str):
                    # Accept numeric strings or units like 'px'/'em'
                    norm = lh.replace('px', '').replace('em', '').strip()
                    lh_val = float(norm)
                else:
                    lh_val = float(lh)
                props['lineHeight'] = 1.2 if lh_val > 1.2 else lh_val
        except Exception:
            # Safe fallback
            props['lineHeight'] = 1.2

        # Root textColor for schema compliance: take from largest text segment if available
        texts = props.get('texts', []) or []
        dominant_color = None
        dominant_size = -1
        for seg in texts:
            seg_size = 0
            if isinstance(seg, dict):
                seg_size = seg.get('fontSize', 0) or 0
                # Newer format may place color under seg['color']
                seg_color = seg.get('color')
                if isinstance(seg.get('style'), dict):
                    seg_color = seg.get('style', {}).get('textColor') or seg_color
                if seg_size >= dominant_size and seg_color:
                    dominant_color = seg_color
                    dominant_size = seg_size
        if dominant_color and isinstance(dominant_color, str):
            props['textColor'] = dominant_color
        else:
            props.setdefault('textColor', '#000000ff')

        # Compute root fontSize/fontWeight heuristics if missing
        # Use larger default sizes for better visibility
        if 'fontSize' not in props:
            max_size = max((seg.get('fontSize', 0) for seg in texts if isinstance(seg, dict)), default=0)
            # Determine default based on component type
            comp_type = component.get('type')
            if comp_type == 'Title' or 'title' in str(props.get('metadata', {}).get('role', '')).lower():
                default_size = 120  # Large size for titles
            elif comp_type == 'Heading':
                default_size = 72   # Medium-large for headings
            else:
                default_size = 48   # Standard for body text
            props['fontSize'] = max_size or default_size
        if 'fontWeight' not in props:
            props['fontWeight'] = 'bold' if props.get('fontSize', 0) >= 72 else 'normal'

        # Restructure texts[].style if missing to satisfy schema requirements
        normalized_texts: List[Dict[str, Any]] = []
        for seg in texts:
            if not isinstance(seg, dict):
                continue
            text_str = seg.get('text', '')
            style = seg.get('style') if isinstance(seg.get('style'), dict) else {}
            # Map legacy fields into style
            color = seg.get('color') or style.get('textColor') or props.get('textColor')
            bold_flag = style.get('bold')
            if bold_flag is None:
                fw = seg.get('fontWeight') or props.get('fontWeight')
                bold_flag = True if str(fw).lower() == 'bold' or str(fw).isdigit() and int(str(fw)) >= 600 else False
            style.setdefault('textColor', color or '#000000ff')
            style.setdefault('backgroundColor', '#00000000')
            style.setdefault('bold', bool(bold_flag))
            style.setdefault('italic', False)
            style.setdefault('underline', False)
            style.setdefault('strike', False)

            # Preserve intentional newlines (e.g., for bullet points) while removing carriage returns
            # Don't collapse newlines to spaces as this breaks intended formatting
            cleaned_text = text_str.replace('\r\n', '\n').replace('\r', '\n')
            # Only collapse multiple consecutive spaces (not newlines)
            import re
            cleaned_text = re.sub(r' {2,}', ' ', cleaned_text)

            normalized_texts.append({
                'text': cleaned_text,
                'style': style
            })
        if texts and normalized_texts:
            props['texts'] = normalized_texts

        component['props'] = props
        return component

    def _apply_intelligent_font_sizing(self, component: Dict[str, Any]) -> Dict[str, Any]:
        """Apply adaptive font sizing - NO HARDCODED LIMITS."""
        try:
            props = component.get('props', {}) or {}
            comp_type = component.get('type')

            # Get text content
            text_content = ""
            if 'texts' in props and isinstance(props['texts'], list):
                # For rich text components
                text_content = ' '.join([t.get('text', '') for t in props['texts']])
            elif 'text' in props:
                # For plain text components
                text_content = props.get('text', '')

            if not text_content.strip():
                logger.debug(f"  ⚠️ No text content found in {comp_type}, skipping")
                return component

            # ALWAYS recalculate font size, even if one exists (no hardcoded limits)

            # Get actual container dimensions with proper None handling
            width = props.get('width') or 600
            height = props.get('height') or 200

            # Get padding if specified, otherwise small default
            padding_x = props.get('paddingX') or 10
            padding_y = props.get('paddingY') or 5

            # Determine role for optimization hints (not limits!)
            role = self._get_element_type(comp_type, props)

            # Calculate optimal size using adaptive sizer
            sizing_result = self.font_sizer.size_with_role_hint(
                text=text_content,
                container_width=width,
                container_height=height,
                font_family=props.get('fontFamily', 'Inter'),
                role=role,
                padding_x=padding_x,
                padding_y=padding_y
            )

            # Apply calculated size
            props['fontSize'] = sizing_result['fontSize']

            # NO hardcoded min/max - the size IS the size
            props['fontSizeMin'] = sizing_result['fontSize']
            props['fontSizeMax'] = sizing_result['fontSize']

            # Standard line height based on font size
            props['lineHeight'] = 1.2 if role == 'title' else 1.5
            props['letterSpacing'] = 0

            # Add detailed metadata for debugging
            props.setdefault('metadata', {}).update({
                'fontSizingApplied': True,
                'adaptiveSizing': True,
                'estimatedLines': sizing_result['estimatedLines'],
                'iterations': sizing_result['iterations'],
                'confidence': sizing_result['confidence'],
                'fits': sizing_result['fits'],
                'containerSize': sizing_result['containerSize'],
                'spaceUsed': sizing_result['spaceUsed']
            })

            # If we have rich text, update all segments
            if 'texts' in props and isinstance(props['texts'], list):
                base_size = sizing_result['fontSize']
                for text_segment in props['texts']:
                    # Check if this segment was meant to be emphasized
                    current_size = text_segment.get('fontSize', base_size)
                    is_emphasized = current_size > base_size * 1.3

                    if is_emphasized and role == 'title':
                        # Keep emphasis for titles, but scale proportionally
                        text_segment['fontSize'] = base_size * 1.2
                    else:
                        # Use calculated base size
                        text_segment['fontSize'] = base_size

            # Log detailed font sizing info at DEBUG level
            logger.debug(
                f"[FONT SIZING] {comp_type}: {sizing_result['fontSize']}px "
                f"(container={width}x{height}, iterations={sizing_result['iterations']}, confidence={sizing_result['confidence']:.2f})"
            )

            component['props'] = props
            return component

        except Exception as e:
            logger.warning(f"[FONT SIZING] Failed for {comp_type}: {e}")
            # Return component unchanged if sizing fails
            return component

    def _get_element_type(self, comp_type: str, props: Dict[str, Any]) -> str:
        """Determine element type from component type and props."""
        if comp_type == 'Title':
            return 'title'
        elif comp_type == 'Heading':
            return 'heading'

        # Check metadata for role
        metadata = props.get('metadata', {})
        role = metadata.get('role', '').lower()

        if 'title' in role:
            return 'title'
        elif 'heading' in role or 'header' in role:
            return 'heading'
        elif 'subtitle' in role:
            return 'subtitle'
        elif 'caption' in role:
            return 'caption'
        elif 'bullet' in role:
            return 'bullet'
        else:
            return 'body'

    # NOTE: These methods are kept for backwards compatibility but NOT USED
    # in adaptive sizing. They're only role hints, not hard limits.

    def _get_hierarchy_level(self, element_type: str) -> int:
        """DEPRECATED: Used only for backwards compatibility."""
        return 1  # Not used in adaptive sizing

    def _get_min_size_for_type(self, element_type: str) -> float:
        """DEPRECATED: No hardcoded minimums in adaptive sizing."""
        return 1.0  # Start from smallest possible

    def _get_max_size_for_type(self, element_type: str) -> float:
        """DEPRECATED: No hardcoded maximums in adaptive sizing."""
        return 999.0  # No artificial limit

    def _get_max_lines_for_type(self, element_type: str) -> Optional[int]:
        """DEPRECATED: Let text flow naturally based on container."""
        return None  # No line limits

    def _is_emphasized(self, props: Dict[str, Any]) -> bool:
        """Check if text is emphasized."""
        # Check for bold weight
        if str(props.get('fontWeight', '')).lower() in ['bold', '700', '800', '900']:
            return True
        # Check for emphasis in metadata
        metadata = props.get('metadata', {})
        return metadata.get('emphasized', False)

    def apply_slide_font_sizing(self,
                               components: List[Dict[str, Any]],
                               theme: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Apply adaptive font sizing to all text components."""
        try:
            sized_count = 0
            # Process ALL text components with adaptive sizing
            for comp in components:
                comp_type = comp.get('type')
                props = comp.get('props', {})

                # More robust text component detection
                has_text = ('text' in props or 'texts' in props)

                # Check for ANY component with text properties
                has_font_props = any(key in props for key in ['fontSize', 'fontFamily', 'textColor'])

                # Check common text component types (case insensitive)
                comp_type_lower = (comp_type or '').lower()
                is_text_type = any(text_type in comp_type_lower for text_type in
                                  ['text', 'title', 'heading', 'tiptap', 'label', 'caption'])

                # If it has text content OR text-related properties, it's a text component
                if has_text or has_font_props or is_text_type:
                    logger.debug(f"[FONT SIZING] Processing {comp_type} component")
                    # Apply adaptive sizing to each component
                    self._apply_intelligent_font_sizing(comp)
                    sized_count += 1

            logger.info(f"[FONT SIZING] ✅ Applied adaptive font sizing to {sized_count} text components")
            return components

        except Exception as e:
            logger.error(f"[FONT SIZING] Batch font sizing failed: {e}", exc_info=True)
            return components

    def _promote_plain_text_to_rich_tiptap(self, component: Dict[str, Any]) -> Dict[str, Any]:
        """Ensure text components use rich Tiptap texts[] structure with style and emphasis.
        - If props.text exists and props.texts is missing, convert to texts[]
        - Create emphasis by splitting into segments and applying bold+accent to the largest token
        - Keep backgroundColor transparent
        """
        try:
            comp_type = component.get('type')
            props = component.get('props', {}) or {}
            if comp_type not in ['TiptapTextBlock', 'TextBlock', 'Title']:
                return component
            # If texts already present and properly structured, keep as-is but ensure style subkeys
            if isinstance(props.get('texts'), list) and props.get('texts'):
                normalized: List[Dict[str, Any]] = []
                for seg in props.get('texts'):
                    if not isinstance(seg, dict):
                        continue
                    style = seg.get('style') if isinstance(seg.get('style'), dict) else {}
                    # Map color to style.textColor if present
                    if 'color' in seg and 'textColor' not in style:
                        style['textColor'] = seg.get('color')
                    style.setdefault('backgroundColor', '#00000000')
                    style.setdefault('bold', bool(str(seg.get('fontWeight', props.get('fontWeight', 'normal'))).lower() == 'bold'))
                    style.setdefault('italic', False)
                    style.setdefault('underline', False)
                    style.setdefault('strike', False)
                    # Preserve intentional newlines while normalizing carriage returns
                    text_content = seg.get('text', '').replace('\r\n', '\n').replace('\r', '\n')
                    # Only collapse multiple consecutive spaces (not newlines)
                    text_content = re.sub(r' {2,}', ' ', text_content)
                    normalized.append({'text': text_content, 'style': style, 'fontSize': seg.get('fontSize')})
                if normalized:
                    props['texts'] = normalized
                    component['props'] = props
                return component

            raw_text = props.get('text') or ''
            if not isinstance(raw_text, str) or raw_text.strip() == '':
                return component

            # Simple emphasis: split by spaces, mark longest token as bold/accent
            words = [w for w in raw_text.split(' ') if w]
            longest = max(words, key=len) if words else ''
            # Base sizes - determine by component type
            comp_type = component.get('type')
            if comp_type == 'Title' or 'title' in str(props.get('metadata', {}).get('role', '')).lower():
                default_size = 120  # Large for titles
            elif comp_type == 'Heading':
                default_size = 72   # Medium for headings
            else:
                default_size = 48   # Standard for body
            base_size = props.get('fontSize') or default_size
            large_size = max(int(base_size * 1.8), base_size + 48)  # Increased emphasis

            texts: List[Dict[str, Any]] = []
            for w in words:
                seg: Dict[str, Any] = {
                    'text': (w + ' '),
                    'fontSize': large_size if w == longest and comp_type != 'TextBlock' else base_size,
                    'style': {
                        'textColor': props.get('textColor') or props.get('color') or '#000000ff',
                        'backgroundColor': '#00000000',
                        'bold': (w == longest) or (str(props.get('fontWeight', 'normal')).lower() == 'bold'),
                        'italic': False,
                        'underline': False,
                        'strike': False
                    }
                }
                texts.append(seg)

            # Update props
            props['texts'] = texts
            # Ensure root props consistency
            props.setdefault('letterSpacing', -0.01)
            props.setdefault('lineHeight', 1.2)
            props.setdefault('textShadow', '0 4px 24px rgba(0,0,0,0.25)')
            props['backgroundColor'] = '#00000000'
            component['props'] = props
            return component
        except Exception as e:
            logger.debug(f"_promote_plain_text_to_rich_tiptap skipped: {e}")
            return component
    
    def _fix_background_component(self, component: Dict[str, Any]) -> Dict[str, Any]:
        """Fix Background component with invalid patternType and legacy gradient format."""
        props = component.get('props', {})
        
        # Fix legacy gradient properties - including gradientStops!
        legacy_gradient_props = [
            'gradientType', 'gradientDirection', 'gradientAngle',
            'gradientStartColor', 'gradientEndColor', 'gradientStopColor',
            'gradientEnabled', 'gradientColors', 'gradientStops'
        ]
        
        has_legacy = any(prop in props for prop in legacy_gradient_props)
        
        if has_legacy:
            logger.warning("Background component uses LEGACY gradient format. Converting to new format...")
            
            # Extract legacy values
            gradient_type = props.pop('gradientType', 'linear')
            angle = props.pop('gradientDirection', props.pop('gradientAngle', 135))
            start_color = props.pop('gradientStartColor', '#011830')
            end_color = props.pop('gradientEndColor', '#003151')
            gradient_colors = props.pop('gradientColors', None)
            gradient_stops = props.pop('gradientStops', None)
            
            # Remove other legacy props
            props.pop('gradientEnabled', None)
            props.pop('gradientStopColor', None)
            
            # Set correct format
            props['backgroundType'] = 'gradient'
            
            # Build gradient object
            if gradient_stops and isinstance(gradient_stops, list) and len(gradient_stops) >= 2:
                # Use gradientStops if available (already in correct format)
                stops = gradient_stops
            elif gradient_colors and isinstance(gradient_colors, list) and len(gradient_colors) >= 2:
                # Use gradientColors if available
                stops = [
                    {"color": gradient_colors[0], "position": 0},
                    {"color": gradient_colors[-1], "position": 100}
                ]
                if len(gradient_colors) > 2:
                    # Add middle stops
                    for i, color in enumerate(gradient_colors[1:-1], 1):
                        position = int(100 * i / (len(gradient_colors) - 1))
                        stops.insert(i, {"color": color, "position": position})
            else:
                # Use start/end colors
                stops = [
                    {"color": start_color, "position": 0},
                    {"color": end_color, "position": 100}
                ]
            
            props['gradient'] = {
                "type": gradient_type,
                "angle": angle,
                "stops": stops
            }
            
            logger.info(f"Converted legacy gradient to new format: {props['gradient']}")
        
        # Check if patternType is set to 'none' or other invalid values
        pattern_type = props.get('patternType')
        if pattern_type is not None:
            valid_patterns = {'dots', 'lines', 'checkered', 'grid'}
            if pattern_type not in valid_patterns:
                logger.warning(
                    f"Background component has invalid patternType: '{pattern_type}'. "
                    f"Removing pattern fields as pattern should be omitted if not needed."
                )
                # Remove all pattern-related fields if pattern is invalid
                props.pop('patternType', None)
                props.pop('patternColor', None)
                props.pop('patternScale', None)
                props.pop('patternOpacity', None)
                
                # Ensure we have a valid backgroundType
                if 'backgroundType' not in props:
                    props['backgroundType'] = 'gradient'
                    logger.info("Added missing backgroundType: 'gradient' to Background component")
        
        # Ensure required base and schema props exist for Background
        try:
            base = props if isinstance(props, dict) else {}
            base.setdefault('position', {'x': 0, 'y': 0})
            base.setdefault('width', 1920)
            base.setdefault('height', 1080)
            base.setdefault('opacity', 1)
            base.setdefault('rotation', 0)
            base.setdefault('zIndex', 0)
            # Preserve gradient backgrounds if present
            if base.get('backgroundType') == 'gradient' and base.get('gradient'):
                # Keep gradient as is
                pass
            elif base.get('backgroundType') != 'image':
                # Only default to solid color if no gradient is specified
                base.setdefault('backgroundType', 'color')
                # Keep existing backgroundColor if set elsewhere; default to white
                base.setdefault('backgroundColor', '#FFFFFF')
            # Schema-required defaults
            base.setdefault('backgroundColor', base.get('backgroundColor', '#E8F4FDff'))
            base.setdefault('isAnimated', False)
            base.setdefault('animationSpeed', 1)
            base.setdefault('backgroundImageSize', 'cover')
            base.setdefault('backgroundImageRepeat', 'no-repeat')
            base.setdefault('backgroundImageOpacity', 1)
            base.setdefault('patternColor', '#ccccccff')
            base.setdefault('patternScale', 5)
            base.setdefault('patternOpacity', 0.5)
            component['props'] = base
        except Exception:
            pass
        
        return component

    def _normalize_shape_props(self, component: Dict[str, Any]) -> Dict[str, Any]:
        """Normalize Shape component to satisfy schema and prevent validation errors."""
        try:
            props = component.get('props', {}) or {}
            # Position/dimensions defaults
            props.setdefault('position', {'x': 0, 'y': 0})
            props.setdefault('width', 200)
            props.setdefault('height', 200)
            props.setdefault('opacity', 1)
            props.setdefault('rotation', 0)
            props.setdefault('zIndex', 1)
            # Enforce valid shapeType; map unknowns like 'line' to 'rectangle'
            valid_types = {'rectangle','circle','ellipse','triangle','star','hexagon','pentagon','diamond','arrow','heart'}
            st = props.get('shapeType')
            if st not in valid_types:
                if isinstance(st, str) and st.strip():
                    logger.warning(f"Shape has invalid shapeType '{st}', coercing to 'rectangle'")
                props['shapeType'] = 'rectangle'
            # Visual defaults - DON'T default to transparent, let theme enforcement handle it
            # props.setdefault('fill', '#00000000')  # REMOVED - prevents theme colors!
            # Gradient optional; leave if present
            props.setdefault('isAnimated', False)
            props.setdefault('animationSpeed', 1)
            props.setdefault('stroke', '#00000000')
            props.setdefault('strokeWidth', 0)
            props.setdefault('borderRadius', 0)
            props.setdefault('shadow', False)
            props.setdefault('shadowBlur', 0)
            props.setdefault('shadowColor', '#00000000')
            props.setdefault('shadowOffsetX', 0)
            props.setdefault('shadowOffsetY', 0)
            props.setdefault('shadowSpread', 0)
            
            # CRITICAL: Enforce textPadding limit for shapes with text
            if props.get('hasText') and 'textPadding' in props:
                text_padding = props.get('textPadding', 16)
                if isinstance(text_padding, (int, float)) and text_padding > 20:
                    logger.warning(f"Shape has excessive textPadding={text_padding}, capping at 20")
                    props['textPadding'] = 20
                elif isinstance(text_padding, (int, float)) and text_padding < 6:
                    logger.warning(f"Shape has too low textPadding={text_padding}, setting to 16")
                    props['textPadding'] = 16

            component['props'] = props
        except Exception as e:
            logger.debug(f"_normalize_shape_props skipped due to error: {e}")
        return component
    
    def _validate_component_boundaries(self, component: Dict[str, Any]) -> Dict[str, Any]:
        """Validate and fix component boundaries to prevent overflow for all component types."""
        props = component.get('props', {})
        position = props.get('position', {})
        comp_type = component.get('type', '')
        
        # Skip Background components as they should fill the canvas
        if comp_type == 'Background':
            return component
        
        # Get current position and dimensions
        x = position.get('x', 0)
        y = position.get('y', 0)
        width = props.get('width', 0)
        height = props.get('height', 0)
        
        # Canvas dimensions
        CANVAS_WIDTH = 1920
        CANVAS_HEIGHT = 1080
        MARGIN = 80  # Standard margin from edges
        
        # Log overflow detection for all components (top-left semantics)
        if x + width > CANVAS_WIDTH or y + height > CANVAS_HEIGHT or x < 0 or y < 0:
            logger.warning(
                f"{comp_type} overflow detected: x={x}, y={y}, width={width}, height={height}. "
                f"Right edge: {x + width}, Bottom edge: {y + height}"
            )
        
        # Fix horizontal overflow (top-left clamping with margin-based resize fallback)
        if x + width > CANVAS_WIDTH:
            # Try to reposition within canvas bounds
            new_x = CANVAS_WIDTH - width - MARGIN
            if new_x >= MARGIN:
                position['x'] = new_x
                logger.info(f"Repositioned {comp_type} to x={new_x} to prevent right overflow")
            else:
                # Component is too wide, resize it
                new_width = CANVAS_WIDTH - max(x, MARGIN) - MARGIN
                if new_width > 200:  # Minimum reasonable width
                    props['width'] = new_width
                    # For images, maintain aspect ratio
                    if comp_type == 'Image' and height > 0:
                        scale = new_width / width
                        props['height'] = int(height * scale)
                    logger.info(f"Resized {comp_type} to width={new_width} to fit canvas")
                else:
                    # Force safe position and size
                    position['x'] = MARGIN
                    props['width'] = CANVAS_WIDTH - (2 * MARGIN)
                    logger.info(f"Force repositioned {comp_type} to safe position")
        
        # Fix vertical overflow (top-left clamping with margin-based resize fallback)
        if y + height > CANVAS_HEIGHT:
            # Try to reposition within canvas bounds
            new_y = CANVAS_HEIGHT - height - MARGIN
            if new_y >= MARGIN:
                position['y'] = new_y
                logger.info(f"Repositioned {comp_type} to y={new_y} to prevent bottom overflow")
            else:
                # Component is too tall, resize it
                new_height = CANVAS_HEIGHT - max(y, MARGIN) - MARGIN
                if new_height > 150:  # Minimum reasonable height
                    props['height'] = new_height
                    # For images, maintain aspect ratio
                    if comp_type == 'Image' and width > 0:
                        scale = new_height / height
                        props['width'] = int(width * scale)
                    logger.info(f"Resized {comp_type} to height={new_height} to fit canvas")
                else:
                    # Force safe position and size
                    position['y'] = MARGIN
                    props['height'] = CANVAS_HEIGHT - (2 * MARGIN)
                    logger.info(f"Force repositioned {comp_type} to safe position")
        
        # Ensure minimum position constraints
        if position.get('x', 0) < 0:
            position['x'] = 0
            logger.info(f"Fixed negative x position for {comp_type}")
        if position.get('y', 0) < 0:
            position['y'] = 0
            logger.info(f"Fixed negative y position for {comp_type}")
        
        # Update component with validated values
        component['props']['position'] = position
        
        return component
    
    def _validate_image_boundaries(self, component: Dict[str, Any]) -> Dict[str, Any]:
        """Validate and fix image boundaries to prevent overflow."""
        # Use the general boundary validator
        return self._validate_component_boundaries(component)

    def _normalize_chart_props(self, component: Dict[str, Any]) -> Dict[str, Any]:
        """Normalize and clamp chart props to valid ranges.
        - innerRadius: expected 0.0-0.9 (fraction). Accept percentages 0-100 and clamp. Convert 'donut' to 'pie'.
        - Apply a few safe defaults per guidelines.
        """
        try:
            props = component.get('props', {}) or {}

            # Normalize chartType naming (donut -> pie with innerRadius)
            chart_type = props.get('chartType')
            if isinstance(chart_type, str) and chart_type.lower() == 'donut':
                props['chartType'] = 'pie'
                # If no innerRadius provided, set a sensible donut look
                props.setdefault('innerRadius', 0.4)

            # Inner radius normalization
            if 'innerRadius' in props:
                raw_val = props.get('innerRadius')
                try:
                    val = float(raw_val)
                except Exception:
                    # Drop invalid value entirely
                    props.pop('innerRadius', None)
                else:
                    # Interpret >1 as percentage or bad units
                    if val > 1:
                        if val <= 100:
                            val = val / 100.0
                        else:
                            # Extremely large (e.g., 8000) likely px or garbage → default donut thickness
                            val = 0.4
                    # Clamp to schema range
                    if val < 0:
                        val = 0.0
                    if val > 0.9:
                        val = 0.9
                    props['innerRadius'] = round(val, 3)

            # Enforce legend rules for common chart types
            if props.get('chartType') in ('bar', 'column', 'pie'):
                props['showLegend'] = False

            # Provide safe defaults for commonly required props across chart types
            props.setdefault('padAngle', 0)
            props.setdefault('cornerRadius', 0)
            props.setdefault('enableArcLinkLabels', False)
            props.setdefault('enableLabel', True)
            props.setdefault('smoothCurve', True)
            props.setdefault('pointSize', 4)
            props.setdefault('pointBorderWidth', 0)
            props.setdefault('lineWidth', 2)

            # Required media metadata (empty by default if not used)
            props.setdefault('mediaSourceId', '')
            props.setdefault('originalFilename', '')
            props.setdefault('aiInterpretation', '')
            props.setdefault('mediaSlideId', '')

            # Default a left (Y) axis label for most chart types when missing
            try:
                ctype = str(props.get('chartType') or '').strip().lower()
                # Apply only to cartesian charts where a Y axis exists
                y_axis_supported = {
                    'bar', 'column', 'line', 'area', 'spline', 'areaspline', 'scatter', 'bubble', 'boxplot'
                }
                if ctype in y_axis_supported:
                    y_label_existing = str(props.get('yAxisLabel') or '').strip()
                    if not y_label_existing:
                        # Try to infer from headers/metadata if present; otherwise use a generic label
                        inferred = None
                        try:
                            headers = props.get('headers') or {}
                            if isinstance(headers, dict):
                                # Common conventions: x/y keys or first/second column names
                                inferred = headers.get('y') or headers.get('value') or headers.get('second')
                            elif isinstance(headers, list) and len(headers) >= 2:
                                inferred = headers[1]
                        except Exception:
                            inferred = None
                        if not inferred:
                            # Check any attached metadata for units
                            meta = props.get('metadata') or {}
                            if isinstance(meta, dict):
                                inferred = meta.get('unit') or meta.get('units')
                        label = str(inferred).strip() if inferred else ''
                        props['yAxisLabel'] = label or 'Value'
            except Exception:
                # Never fail validation due to label heuristics
                pass

            component['props'] = props
        except Exception as e:
            logger.debug(f"_normalize_chart_props skipped due to error: {e}")
        return component

    def _ensure_axis_label_rotation(self, component: Dict[str, Any]) -> Dict[str, Any]:
        """Conservatively set bottom axis label rotation and margin when labels are long/dense.
        - If props.data has many items (>=8) or label strings are long (>=12 chars median), set:
          - axisBottom.tickRotation = 30 (or keep existing if already set)
          - margins.bottom >= 60
        Schema keys align with our registry (Nivo-style); frontend can map to Highcharts (xAxis.labels.rotation, chart.marginBottom).
        """
        try:
            props = component.get('props', {}) or {}
            data = props.get('data') or []
            if not isinstance(data, list) or not data:
                return component
            # Heuristics: count and median label length
            labels = [str((d or {}).get('name') or '') for d in data if isinstance(d, dict)]
            if not labels:
                return component
            long_count = sum(1 for s in labels if len(s) >= 12)
            need_rotation = len(labels) >= 8 or long_count >= max(1, len(labels) // 3)
            if not need_rotation:
                return component
            axis_bottom = props.setdefault('axisBottom', {}) if isinstance(props.get('axisBottom'), dict) else props.setdefault('axisBottom', {})
            if 'tickRotation' not in axis_bottom or axis_bottom.get('tickRotation') in (None, 0):
                axis_bottom['tickRotation'] = 30
            props['axisBottom'] = axis_bottom
            margins = props.setdefault('margins', {}) if isinstance(props.get('margins'), dict) else props.setdefault('margins', {})
            bottom = int(margins.get('bottom', 0) or 0)
            if bottom < 60:
                margins['bottom'] = 60
            props['margins'] = margins
            component['props'] = props
        except Exception as e:
            logger.debug(f"_ensure_axis_label_rotation skipped: {e}")
        return component

    def _fix_custom_component_render(self, component: Dict[str, Any]) -> Dict[str, Any]:
        """Fix CustomComponent render function to be properly escaped string."""
        props = component.get('props', {})
        # Prefer explicit render; fall back to data (older format)
        render = props.get('render') or props.get('data') or ''
        
        # CRITICAL: Ensure padding/available sizes declared inside function body
        if render and 'const padding' not in render:
            if 'function render' in render:
                try:
                    close_paren_idx = render.find(')')
                    open_brace_idx = render.find('{', close_paren_idx if close_paren_idx != -1 else 0)
                    if open_brace_idx != -1:
                        insert_at = open_brace_idx + 1
                        render = (
                            render[:insert_at] +
                            "\\n  const padding = props.padding || 32;" +
                            "\\n  const availableWidth = (props.width || 1920) - padding * 2;" +
                            "\\n  const availableHeight = (props.height || 1080) - padding * 2;" +
                            render[insert_at:]
                        )
                        logger.info("[CustomComponent Fix] Injected padding and available sizes in function body")
                except Exception:
                    parts = render.split('{', 1)
                    if len(parts) == 2:
                        render = parts[0] + '{\\n  const padding = props.padding || 32;\\n' + parts[1]
                        logger.info("[CustomComponent Fix] Fallback padding injection applied")
        
        # Fix hardcoded padding values (e.g., "props.width - 80" should be "props.width - padding * 2")
        if render and 'props.width - ' in render:
            # Look for patterns like "props.width - 80" or "props.width - 40" 
            import re
            pattern = r'props\.width\s*-\s*(\d+)'
            matches = re.findall(pattern, render)
            if matches and 'const padding' in render:
                # Replace hardcoded values with padding * 2
                render = re.sub(pattern, 'props.width - padding * 2', render)
                logger.info("[CustomComponent Fix] Fixed hardcoded padding values to use padding variable")
        
        # Sanitize any text content within nested props to remove emojis and normalize whitespace
        try:
            if isinstance(props.get('props'), dict):
                props['props'] = self._sanitize_text_fields(props['props'])
        except Exception:
            # Best-effort; don't fail validation for sanitize issues
            pass
        
        # Log the original render for debugging
        if render:
            logger.info(f"[CustomComponent Fix] Processing render function (length: {len(render)})")
        
        # First, proactively sanitize template literals/backticks which break our runtime wrapper
        # Convert `${expr}` to string concatenation and replace backticks with single quotes
        try:
            if isinstance(render, str) and ('${' in render or '`' in render):
                import re
                original_len = len(render)
                # Replace ${...} with ' + ... + '
                render = re.sub(r"\$\{([^}]+)\}", r"' + \1 + '", render)
                # Replace backticks with single quotes
                render = render.replace('`', "'")
                logger.info(
                    f"[CustomComponent Fix] Sanitized template literals/backticks in render (len {original_len} -> {len(render)})"
                )
                props['render'] = render
        except Exception as e:
            logger.warning(f"[CustomComponent Fix] Failed to sanitize template literals: {e}")
        
        # Enforce no emojis and normalize newlines/quotes inside the render string
        try:
            if isinstance(render, str) and render:
                sanitized_render = self._sanitize_render_string(render)
                if sanitized_render != render:
                    props['render'] = sanitized_render
                    render = sanitized_render
        except Exception:
            # Keep original render if sanitize fails
            pass

        # Normalize fallback string literals to double quotes with no internal double quotes
        try:
            if isinstance(render, str) and render:
                normalized_fallbacks = self._normalize_text_literal_fallbacks(render)
                if normalized_fallbacks != render:
                    props['render'] = normalized_fallbacks
                    render = normalized_fallbacks
        except Exception:
            pass

        # Inject missing common variable definitions to prevent runtime ReferenceErrors
        try:
            if isinstance(render, str) and render:
                injected_render = self._inject_missing_variable_definitions(render)
                if injected_render != render:
                    props['render'] = injected_render
                    render = injected_render
        except Exception as e:
            logger.debug(f"[CustomComponent Fix] _inject_missing_variable_definitions skipped: {e}")

        # Dedupe duplicate variable declarations that commonly cause syntax errors
        try:
            if isinstance(render, str) and render:
                deduped_render = self._dedupe_common_declarations(render)
                if deduped_render != render:
                    props['render'] = deduped_render
                    render = deduped_render
        except Exception as e:
            logger.debug(f"[CustomComponent Fix] _dedupe_common_declarations skipped: {e}")

        # Check if render is already a properly escaped string, but only keep as-is
        # when no additional safety fixes are required (cx: x, defaultVariant, blur/r/c, width/height fallbacks)
        if isinstance(render, str) and '\\n' in render and not render.strip().endswith('.') and not render.strip().endswith('/'):
            # Check if it looks complete (has balanced braces)
            open_braces = render.count('{')
            close_braces = render.count('}')
            if open_braces == close_braces and open_braces > 0 and not self._needs_overlay_safety_fixes(render):
                logger.info("[CustomComponent Fix] Render function appears valid, keeping as-is")
                return component
        
        # If render looks like raw JavaScript or is incomplete
        if isinstance(render, str) and render:
            logger.info(f"[CustomComponent Fix] Fixing render function")
            
            # First, check if it's truncated with // or incomplete
            if render.strip().endswith('//') or render.strip().endswith('/'):
                logger.warning("[CustomComponent Fix] Detected truncated function ending with //")
                # Replace with simple working function
                simple_render = self._get_simple_render_function()
                props['render'] = simple_render
                return component
            
            # Check for too many helper functions
            import re
            helper_patterns = [
                r'const\s+safe\w+\s*=',
                r'function\s+safe\w+',
                r'const\s+format\w+\s*=',
                r'function\s+format\w+',
                r'const\s+get\w+\s*=',
                r'function\s+get\w+',
                r'const\s+\w+Helper\s*='
            ]
            
            helper_count = sum(len(re.findall(pattern, render)) for pattern in helper_patterns)
            
            if helper_count >= 2:
                logger.warning(f"[CustomComponent Fix] Detected {helper_count} helper functions - replacing with simple version")
                # Replace with simple working function
                simple_render = self._get_simple_render_function()
                props['render'] = simple_render
                return component
            
            # Check if it's missing proper escaping
            if '\n' in render and '\\n' not in render:
                logger.info("[CustomComponent Fix] Adding proper escaping to render function")
                # Escape the render function
                escaped_render = render.replace('\\', '\\\\').replace('\n', '\\n').replace('"', '\\"')
                
                # Ensure it ends properly
                if not escaped_render.rstrip().endswith('}'):
                    logger.warning("[CustomComponent Fix] Adding missing closing brace")
                    # Count braces to add the right amount
                    open_count = escaped_render.count('{')
                    close_count = escaped_render.count('}')
                    missing = open_count - close_count
                    if missing > 0:
                        escaped_render += '\\n}' * missing
                
                props['render'] = escaped_render
                return component
            
            # If it's already escaped but incomplete
            if '\\n' in render:
                # Check for balanced braces
                open_count = render.count('{')
                close_count = render.count('}')
                
                if open_count != close_count:
                    logger.warning(f"[CustomComponent Fix] Brace mismatch: {open_count} open, {close_count} close")
                    # If it's too complex, replace with simple version
                    if open_count - close_count > 2 or helper_count > 0:
                        simple_render = self._get_simple_render_function()
                        props['render'] = simple_render
                    else:
                        # Try to fix by adding closing braces
                        render += '\\n}' * (open_count - close_count)
                        # Ensure root container styles after fixing braces
                        props['render'] = self._ensure_root_container_styles(render)
                    return component
        
        # Normalize dimensions to avoid fixed max widths that cause cropping
        try:
            if isinstance(render, str) and render:
                normalized_render = self._normalize_render_dimensions(render)
                if normalized_render != render:
                    props['render'] = normalized_render
                    render = normalized_render
        except Exception:
            pass

        # Normalize layout for responsiveness (grids, alignment)
        try:
            if isinstance(render, str) and render:
                layout_normalized = self._normalize_layout_responsiveness(render)
                if layout_normalized != render:
                    props['render'] = layout_normalized
                    render = layout_normalized
        except Exception:
            pass

        # Enforce correct function signature if present (do not return early; allow further safety fixes)
        if isinstance(render, str) and 'function render(' in render and '{ props }' in render:
            logger.info("[CustomComponent Fix] Updating render signature to include state/updateState/id/isThumbnail")
            render = render.replace('function render({ props }', 'function render({ props, state, updateState, id, isThumbnail }')
            # Force single-argument signature by stripping any trailing params (e.g., ", instanceId")
            try:
                import re as _re
                render = _re.sub(r"function\s+render\s*\(\s*\{[^}]*\}\s*(?:,[^)]*)?\)",
                                 "function render({ props, state, updateState, id, isThumbnail })",
                                 render)
            except Exception:
                pass
            # Ensure root container styles as well
            render = self._ensure_root_container_styles(render)
            props['render'] = render

        # Final guard: remove/replace undefined identifiers and inject required locals
        try:
            if isinstance(render, str) and 'function render' in render:
                # Normalize: use escaped newlines if string is escaped already
                uses_escaped_n = '\\n' in render
                nl = '\\n' if uses_escaped_n else '\n'
                # Always strip defaultVariant token
                import re
                # 1) Replace usage: "|| defaultVariant" -> '|| "content"'
                render = re.sub(r"\|\|\s*defaultVariant", '|| "content"', render)
                # 2) Remove any declaration: 'const defaultVariant = ...;'
                render = re.sub(r"const\s+defaultVariant\s*=.*?;", '', render, flags=re.S)
                # Inline cx value so we never depend on x
                render = render.replace('cx: x', 'cx: (80 + i * ((1920 - 160) / Math.max(1, (totalSlides - 1))))')
                # Harden availableWidth/availableHeight fallbacks if present in unsafe form
                render = re.sub(r"props\\.width\s*-\s*padding\s*\*\s*2", "(props.width || 1920) - padding * 2", render)
                render = re.sub(r"props\\.height\s*-\s*padding\s*\*\s*2", "(props.height || 1080) - padding * 2", render)
                # Ensure padding/available sizes exist and inject common fallbacks (blur, r, c)
                # Insert right after the function body opening brace
                open_idx = render.find('{', render.find('function render'))
                if open_idx != -1:
                    injections: list[str] = []
                    # Ensure padding and dimension fallbacks when missing entirely
                    if 'const padding' not in render:
                        injections.append(f"{nl}  const padding = props.padding || 32;")
                    if 'const availableWidth' not in render:
                        injections.append(f"{nl}  const availableWidth = (props.width || 1920) - padding * 2;")
                    if 'const availableHeight' not in render:
                        injections.append(f"{nl}  const availableHeight = (props.height || 1080) - padding * 2;")
                    # Inject blur/r/c only if referenced and undeclared
                    if 'stdDeviation: blur' in render and 'const blur' not in render:
                        injections.append(f"{nl}  const blur = 110;")
                    # r/c are often used together for stat arcs
                    if ('r: r' in render or 'Math.PI * r' in render) and 'const r' not in render:
                        injections.append(f"{nl}  const r = 280;")
                    if 'strokeDasharray: c' in render and 'const c' not in render:
                        injections.append(f"{nl}  const c = 2 * Math.PI * r;")
                    if injections:
                        render = render[:open_idx+1] + ''.join(injections) + nl + render[open_idx+1:]
                props['render'] = render
                # Ensure legacy data field does not shadow render downstream
                try:
                    if isinstance(props.get('data'), str):
                        props.pop('data', None)
                except Exception:
                    pass
        except Exception:
            pass

        # If no render function provided, add a simple one
        if not render:
            logger.info("[CustomComponent Fix] No render function provided, adding default")
            props['render'] = self._get_simple_render_function()
        
        # Final safety: ensure container styles on any existing render
        if isinstance(props.get('render'), str):
            sanitized = self._sanitize_prohibited_apis(props['render'])
            props['render'] = self._ensure_root_container_styles(sanitized)
        
        # Prevent JS syntax errors from leading-dot chains ("Unexpected token '.'")
        # If any line starts with a dot (either real or escaped newlines), fallback to a safe render.
        try:
            rstr = props.get('render')
            if isinstance(rstr, str):
                # Match start-of-string or newline (real or escaped) followed by optional spaces and a dot
                if re.search(r"(?:^|\n)\s*\.", rstr) or re.search(r"(?:^|\\n)\s*\.", rstr):
                    logger.warning("[CustomComponent Fix] Leading dot at line start detected; replacing with safe render to avoid syntax error")
                    props['render'] = self._get_simple_render_function()
        except Exception:
            pass
        
        return component

    def _needs_overlay_safety_fixes(self, render: str) -> bool:
        """Detect patterns that lead to runtime errors despite balanced syntax.
        - Unresolved cx: x usage
        - defaultVariant referenced without declaration
        - blur/r/c used without declarations
        - availableWidth/availableHeight without width/height fallbacks
        """
        try:
            if not isinstance(render, str):
                return False
            # cx: x should be inlined to avoid missing x
            if 'cx: x' in render:
                return True
            # defaultVariant referenced but not declared
            if '|| defaultVariant' in render and 'const defaultVariant' not in render:
                return True
            # blur used without declaration
            if 'stdDeviation: blur' in render and 'const blur' not in render:
                return True
            # r/c used without declaration
            if 'r: r' in render and 'const r' not in render:
                return True
            if 'strokeDasharray: c' in render and 'const c' not in render:
                return True
            # width/height fallbacks missing (avoid NaN when props.width/height undefined)
            if 'props.width - padding * 2' in render or 'props.height - padding * 2' in render:
                return True
            return False
        except Exception:
            return False

    def _inject_missing_variable_definitions(self, render_str: str) -> str:
        """Best-effort injection of missing variable declarations commonly used in CustomComponents.
        - Ensures availableWidth/availableHeight are defined after padding
        - Provides safe defaults when tokens like rayCount/iconSize are referenced but not declared
        - Adds theme-related defaults (primaryColor, secondaryColor, textColor, fontFamily) if referenced and undeclared
        Operates on escaped JS strings (with \n). Keeps existing declarations intact.
        """
        try:
            if not isinstance(render_str, str) or 'function render' not in render_str:
                return render_str

            updated = render_str

            # Helper to look for token usage and declaration presence
            def token_used(name: str) -> bool:
                return re.search(rf"\\b{name}\\b", updated) is not None

            def declared(name: str) -> bool:
                return re.search(rf"\\b(const|let|var)\\s+{name}\\b", updated) is not None

            injections: List[str] = []

            # Ensure availableWidth/availableHeight exist
            needs_avail_w = not declared('availableWidth')
            needs_avail_h = not declared('availableHeight')
            if needs_avail_w:
                injections.append("  const availableWidth = props.width - padding * 2;")
            if needs_avail_h:
                injections.append("  const availableHeight = props.height - padding * 2;")

            # rayCount (only if used)
            if token_used('rayCount') and not declared('rayCount'):
                injections.append("  const rayCount = props.rayCount || 12;")

            # iconSize (only if used)
            if token_used('iconSize') and not declared('iconSize'):
                injections.append("  const iconSize = Math.min(availableWidth, availableHeight) * 0.4;")

            # Common theme variables – only if referenced and not declared
            if token_used('primaryColor') and not declared('primaryColor'):
                injections.append("  const primaryColor = props.primaryColor || props.color || '#FFD100';")
            if token_used('secondaryColor') and not declared('secondaryColor'):
                injections.append("  const secondaryColor = props.secondaryColor || '#4CAF50';")
            if token_used('textColor') and not declared('textColor'):
                injections.append("  const textColor = props.textColor || '#FFFFFF';")
            if token_used('fontFamily') and not declared('fontFamily'):
                injections.append("  const fontFamily = props.fontFamily || 'Poppins';")

            # Content variables – only if referenced
            if token_used('title') and not declared('title'):
                injections.append("  const title = props.title || '';")
            if token_used('description') and not declared('description'):
                injections.append("  const description = props.description || '';")

            if not injections:
                return updated

            # Insert injections right after padding line if present; otherwise after function opening brace
            padding_line = "const padding = props.padding || 32;"
            padding_idx = updated.find(padding_line)
            # Use escaped newlines (\\n) to keep render as a single-line-escaped JS string
            injection_block = "\\n" + "\\n".join(injections)

            if padding_idx != -1:
                insert_pos = padding_idx + len(padding_line)
                updated = updated[:insert_pos] + injection_block + updated[insert_pos:]
                return updated

            # Fallback: inject right after first '{' (function opening)
            parts = updated.split('{', 1)
            if len(parts) == 2:
                updated = parts[0] + '{' + injection_block + parts[1]
            return updated
        except Exception as e:
            logger.debug(f"_inject_missing_variable_definitions failed: {e}")
            return render_str

    def _sanitize_text_fields(self, obj: Any) -> Any:
        """Recursively sanitize text fields in nested props: remove emojis and normalize whitespace/newlines.
        Keeps data structures intact.
        """
        try:
            if isinstance(obj, str):
                return self._sanitize_text_value(obj)
            if isinstance(obj, list):
                return [self._sanitize_text_fields(item) for item in obj]
            if isinstance(obj, dict):
                sanitized = {}
                for key, value in obj.items():
                    sanitized[key] = self._sanitize_text_fields(value)
                return sanitized
            return obj
        except Exception:
            return obj

    def _sanitize_text_value(self, text: str) -> str:
        """Remove emojis and normalize whitespace in a text value."""
        if not isinstance(text, str):
            return text
        # Remove emoji characters
        text = self._remove_emojis(text)
        # Normalize CRLF/CR to LF, then collapse excessive whitespace while preserving single spaces
        text = text.replace('\r\n', '\n').replace('\r', '\n')
        # Trim and collapse multiple spaces but keep newlines
        text = re.sub(r"[\t\f\v]+", " ", text)
        text = re.sub(r"\s*\n\s*", "\n", text)  # trim around newlines
        text = re.sub(r" {2,}", " ", text)
        return text.strip()

    def _remove_emojis(self, text: str) -> str:
        """Strip common emoji code point ranges, ZWJ and variation selectors."""
        if not isinstance(text, str) or not text:
            return text
        emoji_pattern = re.compile(
            "[" 
            "\U0001F600-\U0001F64F"  # Emoticons
            "\U0001F300-\U0001F5FF"  # Misc Symbols & Pictographs
            "\U0001F680-\U0001F6FF"  # Transport & Map
            "\U0001F1E6-\U0001F1FF"  # Regional Indicator Symbols (flags)
            "\U0001F900-\U0001F9FF"  # Supplemental Symbols & Pictographs
            "\U0001FA70-\U0001FAFF"  # Symbols & Pictographs Extended-A
            "\u2600-\u26FF"          # Miscellaneous Symbols (includes ☀ etc.)
            "\u2700-\u27BF"          # Dingbats (includes ✨ etc.)
            "]",
            flags=re.UNICODE,
        )
        # Remove base emoji codepoints
        text = emoji_pattern.sub("", text)
        # Remove popular standalone star emoji specifically (⭐ U+2B50)
        text = text.replace("\u2B50", "")
        # Remove variation selectors and zero-width joiners used in emoji sequences
        text = re.sub(r"[\u200D\uFE0E\uFE0F]", "", text)
        return text

    def _normalize_render_dimensions(self, render_str: str) -> str:
        """Relax hardcoded max widths in the render string to prevent overflow cropping.
        Replaces maxWidth: 'NNNpx' with maxWidth: '100%'. Keeps other widths as-is.
        """
        try:
            if not isinstance(render_str, str) or not render_str:
                return render_str
            # Replace single-quoted px maxWidth
            render_str = re.sub(r"maxWidth:\s*'\\d+px'", "maxWidth: '100%'", render_str)
            # Replace double-quoted px maxWidth just in case
            render_str = re.sub(r'maxWidth:\s*"\\d+px"', 'maxWidth: "100%"', render_str)
            # Normalize nowrap to wrapping behavior
            render_str = re.sub(r"whiteSpace:\s*'nowrap'", "whiteSpace: 'normal'", render_str)
            render_str = re.sub(r'whiteSpace:\s*"nowrap"', 'whiteSpace: "normal"', render_str)
            render_str = re.sub(r"flexWrap:\s*'nowrap'", "flexWrap: 'wrap'", render_str)
            render_str = re.sub(r'flexWrap:\s*"nowrap"', 'flexWrap: "wrap"', render_str)
            return render_str
        except Exception as e:
            logger.debug(f"_normalize_render_dimensions failed: {e}")
            return render_str

    def _normalize_layout_responsiveness(self, render_str: str) -> str:
        """Make common layout patterns responsive and stack-friendly.
        - Convert rigid gridTemplateColumns (e.g., '1fr 1fr', repeat(2,1fr)) to auto-fit pattern
        - Prefer flex-start alignment over center to avoid side-by-side centering in roots
        """
        try:
            if not isinstance(render_str, str) or not render_str:
                return render_str

            updated = render_str

            # Convert gridTemplateColumns strings like '1fr 1fr' or '1fr 1fr 1fr'
            updated = re.sub(
                r"gridTemplateColumns:\s*'(?:(?:\s*1fr\s*){2,})'",
                "gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))'",
                updated
            )
            updated = re.sub(
                r'gridTemplateColumns:\s*"(?:(?:\s*1fr\s*){2,})"',
                "gridTemplateColumns: \"repeat(auto-fit, minmax(220px, 1fr))\"",
                updated
            )

            # Convert repeat(2, 1fr) or repeat(3, 1fr) (with or without quotes)
            updated = re.sub(
                r"gridTemplateColumns:\s*'\s*repeat\(\s*\d+\s*,\s*1fr\s*\)\s*'",
                "gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))'",
                updated
            )
            updated = re.sub(
                r'gridTemplateColumns:\s*"\s*repeat\(\s*\d+\s*,\s*1fr\s*\)\s*"',
                "gridTemplateColumns: \"repeat(auto-fit, minmax(220px, 1fr))\"",
                updated
            )
            updated = re.sub(
                r"gridTemplateColumns:\s*repeat\(\s*\d+\s*,\s*1fr\s*\)",
                "gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))'",
                updated
            )

            # In the first root style block, prefer alignItems/justifyContent flex-start over center
            # Replace only first occurrence to bias the root container
            updated = re.sub(r"alignItems:\s*'center'", "alignItems: 'flex-start'", updated, count=1)
            updated = re.sub(r'alignItems:\s*"center"', 'alignItems: "flex-start"', updated, count=1)
            updated = re.sub(r"justifyContent:\s*'center'", "justifyContent: 'flex-start'", updated, count=1)
            updated = re.sub(r'justifyContent:\s*"center"', 'justifyContent: "flex-start"', updated, count=1)

            return updated
        except Exception as e:
            logger.debug(f"_normalize_layout_responsiveness failed: {e}")
            return render_str

    def _sanitize_render_string(self, render_str: str) -> str:
        """Remove emojis and escape any literal newlines in the render string.
        Keep existing escaped sequences intact; do not double-escape.
        """
        if not isinstance(render_str, str) or not render_str:
            return render_str
        # Remove emojis first
        cleaned = self._remove_emojis(render_str)
        # Normalize CRLF/CR to LF
        cleaned = cleaned.replace('\r\n', '\n').replace('\r', '\n')
        # Escape literal newline characters to "\\n" sequences (but not inside existing escapes)
        if '\n' in cleaned:
            cleaned = cleaned.replace('\n', '\\n')
        # Fix broken string literals that were split across lines without escaping, e.g., "Calvin\nCycle"
        # Also normalize any multi-line quotes into a single-line quoted string with explicit \n
        try:
            import re
            # Escape unescaped apostrophes inside words to prevent JS identifier breaks: opponent's -> opponent\'s
            cleaned = re.sub(r"(?<!\\)([A-Za-z0-9])'([A-Za-z0-9])", r"\1\\'\2", cleaned)
        except Exception:
            # Best-effort; keep cleaned as-is if regex fails
            pass

        # Force literal text children in React.createElement to use double quotes so apostrophes don't break strings
        try:
            cleaned = self._force_double_quotes_for_text_nodes(cleaned)
        except Exception:
            # Best-effort; keep cleaned as-is if regex fails
            pass
        return cleaned

    def _force_double_quotes_for_text_nodes(self, render_str: str) -> str:
        """Convert single-quoted literal text children in React.createElement calls to double-quoted strings.
        This avoids bugs when the text contains apostrophes (e.g., Dyna.co's ...).

        Example transform:
        React.createElement('div', { ... }, 'Dyna.co\'s text') -> React.createElement('div', { ... }, "Dyna.co's text")
        """
        try:
            if not isinstance(render_str, str) or 'React.createElement' not in render_str:
                return render_str
            import re

            # Pattern A: Single-quoted third argument (literal string child)
            pattern_single = re.compile(r"(React\.createElement\s*\([^,]+,\s*(?:\{[^}]*\}|null)\s*,\s*)'((?:\\.|[^'\\])*)'")

            # Pattern B: Double-quoted third argument (literal string child)
            pattern_double = re.compile(r'(React\.createElement\s*\([^,]+,\s*(?:\{[^}]*\}|null)\s*,\s*)"((?:\\.|[^"\\])*)"')

            def _replacer_single(match: re.Match) -> str:
                prefix = match.group(1)
                content = match.group(2)
                # Normalize: we want outer double quotes and NO internal double quotes.
                # 1) Unescape apostrophes that were escaped for single-quoted strings
                normalized = content.replace("\\'", "'")
                # 2) Replace any escaped or raw double quotes with single quotes
                normalized = re.sub(r'\\"', "'", normalized)
                normalized = normalized.replace('"', "'")
                return f'{prefix}"{normalized}"'

            def _replacer_double(match: re.Match) -> str:
                prefix = match.group(1)
                content = match.group(2)
                # Already double-quoted outside. Ensure no internal double quotes remain.
                # 1) Replace escaped/unescaped double quotes with single quotes
                normalized = re.sub(r'\\"', "'", content)
                normalized = normalized.replace('"', "'")
                # 2) Ensure apostrophes are not escaped (prefer plain ' inside outer ")
                normalized = normalized.replace("\\'", "'")
                return f'{prefix}"{normalized}"'

            updated = pattern_single.sub(_replacer_single, render_str)
            updated = pattern_double.sub(_replacer_double, updated)

            # Also handle string literals used as direct array children inside the third argument array
            # Example: React.createElement('div', {...}, [ React.createElement(...), "Text here" ])
            # We only target strings that are immediate array items: preceded by '[' or ',' and followed by ',' or ']'
            pattern_array_single = re.compile(r"(\[|,)\s*'((?:\\.|[^'\\])*)'\s*(?=(?:,|\]))")
            pattern_array_double = re.compile(r'(\[|,)\s*"((?:\\.|[^"\\])*)"\s*(?=(?:,|\])))')

            def _arr_replacer_single(match: re.Match) -> str:
                prefix = match.group(1)
                content = match.group(2)
                normalized = content.replace("\\'", "'")
                normalized = re.sub(r'\\"', "'", normalized)
                normalized = normalized.replace('"', "'")
                return f"{prefix} \"{normalized}\""

            def _arr_replacer_double(match: re.Match) -> str:
                prefix = match.group(1)
                content = match.group(2)
                normalized = re.sub(r'\\"', "'", content)
                normalized = normalized.replace('"', "'")
                normalized = normalized.replace("\\'", "'")
                return f"{prefix} \"{normalized}\""

            updated = pattern_array_single.sub(_arr_replacer_single, updated)
            updated = pattern_array_double.sub(_arr_replacer_double, updated)
            return updated
        except Exception:
            return render_str

    def _normalize_text_literal_fallbacks(self, render_str: str) -> str:
        """Ensure default text string literals (fallbacks) use outer double quotes and contain no inner double quotes.
        Examples to normalize inside the JS function string:
          const label = props.label || 'Goku\'s saga'; -> const label = props.label || "Goku's saga";
          const title = props.title || "Calvin \"Cycle\""; -> const title = props.title || "Calvin 'Cycle'";
        Only targets obvious text fallback patterns after ||.
        """
        try:
            if not isinstance(render_str, str) or not render_str:
                return render_str
            import re

            updated = render_str

            def normalize_inner_quotes(text: str) -> str:
                # Replace escaped or raw double quotes with single quotes; unescape any escaped apostrophes
                text = re.sub(r'\\"', "'", text)
                text = text.replace('"', "'")
                text = text.replace("\\'", "'")
                return text

            # 1) Single-quoted fallbacks after || '...'
            pattern_single = re.compile(r"(\|\|\s*)'((?:\\.|[^'\\])*)'")
            def repl_single(m: re.Match) -> str:
                prefix = m.group(1)
                content = m.group(2)
                normalized = normalize_inner_quotes(content)
                return f"{prefix}\"{normalized}\""
            updated = pattern_single.sub(repl_single, updated)

            # 2) Double-quoted fallbacks after || "..." (ensure no inner double quotes)
            pattern_double = re.compile(r'(\|\|\s*)"((?:\\.|[^"\\])*)"')
            def repl_double(m: re.Match) -> str:
                prefix = m.group(1)
                content = m.group(2)
                normalized = normalize_inner_quotes(content)
                return f"{prefix}\"{normalized}\""
            updated = pattern_double.sub(repl_double, updated)

            return updated
        except Exception:
            return render_str

    def _ensure_root_container_styles(self, render_str: str) -> str:
        """Ensure the root element includes width/height 100%, boxSizing, and overflow safety.
        This is a best-effort string transformer that looks for the first style object and
        prepends missing properties. Keeps existing styles intact.
        """
        try:
            if not isinstance(render_str, str):
                return render_str
            # Only act on strings that look like React.createElement with a style object
            if "React.createElement('div', {" not in render_str or 'style: {' not in render_str:
                return render_str

            needs_width = "width: '100%'" not in render_str
            needs_height = "height: '100%'" not in render_str
            needs_box = "boxSizing: 'border-box'" not in render_str
            needs_overflow = "overflow: 'hidden'" not in render_str
            needs_display = "display: 'flex'" not in render_str
            needs_flex_direction = "flexDirection: 'column'" not in render_str
            needs_position = "position: 'relative'" not in render_str
            needs_max_w = "maxWidth: '100%'" not in render_str
            needs_max_h = "maxHeight: '100%'" not in render_str
            # NOTE: Do NOT inject CSS 'contain' here; it breaks frontend fit-to-box measurement
            needs_overflow_wrap = "overflowWrap: 'anywhere'" not in render_str and "overflowWrap: 'break-word'" not in render_str
            needs_word_break = "wordBreak: 'break-word'" not in render_str and "wordBreak: 'anywhere'" not in render_str
            needs_text_overflow = "textOverflow: 'ellipsis'" not in render_str
            needs_white_space = "whiteSpace: 'normal'" not in render_str
            needs_align_items = "alignItems: 'stretch'" not in render_str
            needs_justify_content = "justifyContent: 'flex-start'" not in render_str

            if not any([
                needs_width, needs_height, needs_box, needs_overflow,
                needs_display, needs_flex_direction, needs_position, needs_max_w, needs_max_h,
                needs_overflow_wrap, needs_word_break, needs_text_overflow, needs_white_space,
                needs_align_items, needs_justify_content
            ]):
                return render_str

            inject_parts = []
            if needs_width:
                inject_parts.append("width: '100%'")
            if needs_height:
                inject_parts.append("height: '100%'")
            if needs_box:
                inject_parts.append("boxSizing: 'border-box'")
            if needs_overflow:
                inject_parts.append("overflow: 'hidden'")
            if needs_display:
                inject_parts.append("display: 'flex'")
            if needs_flex_direction:
                inject_parts.append("flexDirection: 'column'")
            if needs_position:
                inject_parts.append("position: 'relative'")
            if needs_max_w:
                inject_parts.append("maxWidth: '100%'")
            if needs_max_h:
                inject_parts.append("maxHeight: '100%'")
            if needs_overflow_wrap:
                inject_parts.append("overflowWrap: 'anywhere'")
            if needs_word_break:
                inject_parts.append("wordBreak: 'break-word'")
            if needs_text_overflow:
                inject_parts.append("textOverflow: 'ellipsis'")
            if needs_white_space:
                inject_parts.append("whiteSpace: 'normal'")
            if needs_align_items:
                inject_parts.append("alignItems: 'stretch'")
            if needs_justify_content:
                inject_parts.append("justifyContent: 'flex-start'")

            injection = ', '.join(inject_parts)
            # Insert immediately after the first occurrence of 'style: {'
            return render_str.replace('style: {', f"style: {{ {injection}, ", 1)
        except Exception as e:
            logger.warning(f"[CustomComponent Fix] Failed to enforce container styles: {e}")
            return render_str

    def _validate_custom_component_boundaries(self, component: Dict[str, Any]) -> Dict[str, Any]:
        """Validate and fix CustomComponent boundaries to prevent overflow off canvas.
        Ensures the component fits within 1920x1080 with 80px margins when possible.
        """
        try:
            props = component.get('props', {}) or {}
            position = props.get('position', {}) or {}
            x = position.get('x', 0)
            y = position.get('y', 0)
            width = props.get('width', 0)
            height = props.get('height', 0)

            CANVAS_WIDTH = 1920
            CANVAS_HEIGHT = 1080
            MARGIN = 80

            adjusted = False

            # Clamp negative positions
            if x < 0:
                position['x'] = 0
                adjusted = True
            if y < 0:
                position['y'] = 0
                adjusted = True

            # Fix horizontal overflow
            if x + width > CANVAS_WIDTH:
                # Try repositioning within right margin
                new_x = max(MARGIN, CANVAS_WIDTH - width - MARGIN)
                if new_x >= 0 and new_x != x:
                    position['x'] = new_x
                    adjusted = True
                # If still overflow or width too large, shrink width
                if position['x'] + width > CANVAS_WIDTH - MARGIN:
                    new_width = max(200, CANVAS_WIDTH - position['x'] - MARGIN)
                    if new_width != width:
                        props['width'] = new_width
                        adjusted = True

            # Fix vertical overflow
            if y + height > CANVAS_HEIGHT:
                new_y = max(MARGIN, CANVAS_HEIGHT - height - MARGIN)
                if new_y >= 0 and new_y != y:
                    position['y'] = new_y
                    adjusted = True
                if position['y'] + height > CANVAS_HEIGHT - MARGIN:
                    new_height = max(150, CANVAS_HEIGHT - position['y'] - MARGIN)
                    if new_height != height:
                        props['height'] = new_height
                        adjusted = True

            if adjusted:
                component['props']['position'] = position
                component['props']['width'] = props.get('width', width)
                component['props']['height'] = props.get('height', height)
        except Exception as e:
            logger.debug(f"_validate_custom_component_boundaries skipped due to error: {e}")
        return component

    def _sanitize_prohibited_apis(self, render_str: str) -> str:
        """Remove or neutralize prohibited APIs/imports from render strings.
        If detected, fall back to simple safe render to prevent runtime errors.
        """
        try:
            if not isinstance(render_str, str):
                return render_str
            lowered = render_str.lower()
            forbidden_snippets = [
                'import ',
                'require(',
                'fetch(',
                'document.',
                'window.',
                'dangerouslysetinnerhtml',
                'eval(',
                'new websocket(',
                # Explicit bans to prevent 'Unexpected token catch' and runtime issues
                'try{', 'try {', ' catch(', 'catch (',
                'setinterval(', 'settimeout(', 'requestanimationframe(',
                'updatestate('
            ]
            if any(snippet in lowered for snippet in forbidden_snippets):
                logger.warning("[CustomComponent Fix] Prohibited construct (try/catch, timers, updateState, or disallowed API) detected; replacing with safe render")
                return self._get_simple_render_function()

            # Disallow redeclaring the 'state' parameter inside render (e.g., 'const state = ...')
            if re.search(r"\b(const|let|var)\s+state\s*=", render_str):
                logger.warning("[CustomComponent Fix] Redeclaration of 'state' detected; replacing with safe render")
                return self._get_simple_render_function()
            return render_str
        except Exception as e:
            logger.warning(f"[CustomComponent Fix] Failed to sanitize prohibited APIs: {e}")
            return render_str

    def _dedupe_common_declarations(self, render_str: str) -> str:
        """Remove duplicate const/let/var declarations for common variables (keep first occurrence).
        Operates on escaped JS strings (with \n). Uses regex to identify duplicates.
        """
        try:
            if not isinstance(render_str, str) or 'function render' not in render_str:
                return render_str
            updated = render_str
            import re
            # Variables we often see duplicated by LLMs
            vars_to_dedupe = [
                'availableWidth', 'availableHeight', 'primaryColor', 'secondaryColor', 'textColor', 'textColor1', 'textColor2', 'fontFamily',
                'blur', 'r', 'c'
            ]
            for var_name in vars_to_dedupe:
                pattern = re.compile(rf"(?:const|let|var)\s+{var_name}\s*=\s*[^;]+;")
                matches = list(pattern.finditer(updated))
                if len(matches) > 1:
                    # Keep the first declaration, remove subsequent ones
                    keep_start, keep_end = matches[0].span()
                    # Build a new string skipping later matches
                    result = []
                    last_idx = 0
                    for i, m in enumerate(matches):
                        if i == 0:
                            continue
                        start, end = m.span()
                        result.append(updated[last_idx:start])
                        last_idx = end
                    result.append(updated[last_idx:])
                    # Ensure the kept declaration remains
                    prefix = updated[:keep_end]
                    suffix = ''.join(result)[keep_end:]
                    updated = prefix + suffix
            return updated
        except Exception:
            return render_str

    def _get_simple_render_function(self) -> str:
        """Get a simple, working render function that's properly escaped and follows signature/rules."""
        return (
            "function render({ props, state, updateState, id, isThumbnail }) {\\n"
            "  const padding = props.padding || 32;\\n"
            "  const width = props.width || 600;\\n"
            "  const height = props.height || 300;\\n"
            "  const availableWidth = width - padding * 2;\\n"
            "  const availableHeight = height - padding * 2;\\n"
            "  const title = props.title || '';\\n"
            "  const rawValue = (typeof props.value !== 'undefined' && props.value !== null) ? props.value : '';\\n"
            "  const hasValue = String(rawValue).trim() !== '';\\n"
            "  const valueText = hasValue ? String(rawValue) : '';\\n"
            "  const label = props.label || '';\\n"
            "  const primaryColor = props.primaryColor || '#00D4FF';\\n"
            "  const secondaryColor = props.secondaryColor || '#06FFA5';\\n"
            "  const textColor = props.textColor || '#FFFFFF';\\n"
            "  const fontFamily = props.fontFamily || 'Poppins';\\n"
            "  const alignment = (props.alignment || 'center');\\n"
            "  const alignItems = alignment === 'left' ? 'flex-start' : (alignment === 'right' ? 'flex-end' : 'center');\\n"
            "  const textAlign = alignment;\\n"
            "  const emphasis = props.emphasis || (hasValue ? 'hero' : 'normal');\\n"
            "  const maxValueHeight = Math.floor(availableHeight * (emphasis === 'hero' ? 0.7 : 0.5));\\n"
            "  const valueSize = hasValue ? Math.min( Math.floor(availableWidth / Math.max(3, valueText.length * 0.6)), maxValueHeight ) : 0;\\n"
            "  const labelSize = Math.min(36, Math.floor(availableWidth / 12));\\n"
            "  const titleSize = title ? Math.min(48, Math.floor(availableWidth / Math.max(8, title.length * 0.5))) : 0;\\n"
            "  const backdrop = (props.backdrop === true) ? (props.backdropColor || (secondaryColor + '10')) : 'transparent';\\n"
            "  return React.createElement('div', {\\n"
            "    style: {\\n"
            "      width: '100%', height: '100%', maxWidth: '100%', maxHeight: '100%',\\n"
            "      boxSizing: 'border-box', overflow: 'hidden',\\n"
            "      display: 'flex', flexDirection: 'column', flexWrap: 'nowrap', position: 'relative',\\n"
            "      alignItems: alignItems, justifyContent: 'center',\\n"
            "      padding: padding + 'px', fontFamily: fontFamily, background: backdrop\\n"
            "    }\\n"
            "  }, [\\n"
            "    title && React.createElement('div', {\\n"
            "      key: 'title',\\n"
            "      style: { fontSize: titleSize + 'px', color: textColor, opacity: 0.85, marginBottom: '12px', letterSpacing: '0.5px', fontWeight: '700', textAlign: textAlign, width: '100%' }\\n"
            "    }, title),\\n"
            "    hasValue && React.createElement('div', {\\n"
            "      key: 'value',\\n"
            "      style: { fontSize: Math.max(14, valueSize) + 'px', fontWeight: '900',\\n"
            "        background: 'linear-gradient(135deg, ' + primaryColor + ' 0%, ' + secondaryColor + ' 100%)',\\n"
            "        WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',\\n"
            "        lineHeight: 1, letterSpacing: '-0.02em', textAlign: textAlign, width: '100%' }\\n"
            "    }, valueText),\\n"
            "    label && React.createElement('div', {\\n"
            "      key: 'label',\\n"
            "      style: { fontSize: labelSize + 'px', color: textColor, opacity: 0.8, marginTop: '12px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.1em', textAlign: textAlign, width: '100%' }\\n"
            "    }, label)\\n"
            "  ]);\\n"
            "}"
        )