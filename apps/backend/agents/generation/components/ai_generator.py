"""
AI generator component for slide generation.
"""

import asyncio
import re
from typing import Dict, Any, List, Optional, Type
from datetime import datetime

from agents.ai.clients import get_client, invoke
from agents.config import COMPOSER_MODEL
from agents.domain.models import SlideGenerationContext
from setup_logging_optimized import get_logger

logger = get_logger(__name__)


class AISlideGenerator:
    """Handles AI generation of slides."""
    
    def __init__(self, model: str = COMPOSER_MODEL):
        self.model = model
        self.max_tokens_attempts = [8000, 6000, 4000, 2000]
        self.generation_timeout = 180.0  # Increased from 90.0 to handle large prompts
    
    async def generate(
        self,
        system_prompt: str,
        user_prompt: str,
        response_model: Type,
        context: SlideGenerationContext,
        predicted_components: List[str]
    ) -> Dict[str, Any]:
        """Generate slide data using AI."""
        
        logger.info(
            f"Using {response_model.__name__} model with schema injection for "
            f"{len(predicted_components)} components"
        )
        
        # Get client
        logger.info(f"[AI_GEN] Slide {context.slide_index + 1} getting AI client...")
        client, model_name = get_client(self.model)
        logger.info(f"[AI_GEN] Slide {context.slide_index + 1} got client, model: {model_name}")
        
        # Try generation with decreasing token limits
        for attempt, max_tokens in enumerate(self.max_tokens_attempts):
            try:
                slide_data = await self._attempt_generation(
                    client, model_name, system_prompt, user_prompt,
                    response_model, max_tokens, context, attempt
                )
                
                logger.info(
                    f"✅ Slide {context.slide_index + 1} generated with "
                    f"{len(slide_data.get('components', []))} components"
                )
                
                return slide_data
                
            except asyncio.TimeoutError:
                logger.error(
                    f"AI invocation timed out after {self.generation_timeout}s "
                    f"for slide {context.slide_index + 1}"
                )
                if attempt == len(self.max_tokens_attempts) - 1:
                    raise Exception(f"AI model timed out after {self.generation_timeout} seconds")
                    
            except Exception as e:
                error_msg = str(e)
                
                # Check if it's an overload error
                if "overloaded" in error_msg.lower() or "529" in error_msg:
                    logger.warning(f"⚠️ AI service overloaded (attempt {attempt + 1}/{len(self.max_tokens_attempts)})")
                    if attempt < len(self.max_tokens_attempts) - 1:
                        # Calculate backoff delay
                        delay = min(30, 2 ** attempt) + (attempt * 2)
                        logger.info(f"Waiting {delay}s before retry...")
                        await asyncio.sleep(delay)
                        continue
                
                logger.warning(f"Attempt {attempt + 1} failed: {error_msg}")
                if attempt == len(self.max_tokens_attempts) - 1:
                    raise
    
    async def _attempt_generation(
        self,
        client: Any,
        model_name: str,
        system_prompt: str,
        user_prompt: str,
        response_model: Type,
        max_tokens: int,
        context: SlideGenerationContext,
        attempt: int
    ) -> Dict[str, Any]:
        """Attempt a single generation."""
        
        logger.info(
            f"Generating slide {context.slide_index + 1} "
            f"(attempt {attempt + 1}, max_tokens: {max_tokens})..."
        )
        
        # Create messages
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ]
        
        # Log prompt sizes
        system_size = len(system_prompt)
        user_size = len(user_prompt)
        logger.info(
            f"  Prompt sizes - System: {system_size} chars, "
            f"User: {user_size} chars (~{(system_size + user_size) // 4} tokens)"
        )
        
        # Check if we need CustomComponent
        needs_custom_component = 'CustomComponent' in str(user_prompt)
        
        # Special settings for CustomComponent generation
        if needs_custom_component:
            temperature = 0.3  # Very low temperature for consistency
            actual_max_tokens = min(max_tokens * 2, 8000)  # Increase limit
            logger.info(f"  CustomComponent detected - using temperature={temperature}, max_tokens={actual_max_tokens}")
            logger.info("  Adding extra guidance to prevent truncation")
            
            # Short reminder only (system prompt holds canonical rules)
            messages[1]["content"] += (
                "\n\nNote: For CustomComponent renders, define padding first (const padding = props.padding || 32), compute sizes from it, and use a single escaped render string with a vertical (column) root container."
            )
        else:
            temperature = 0.7  # Normal temperature
            actual_max_tokens = max_tokens
        
        # Invoke AI with timeout
        logger.info(f"  Invoking AI model {model_name} for slide {context.slide_index + 1}...")
        invoke_start = datetime.now()
        
        try:
            # Run the blocking invoke in a thread pool
            logger.info(f"[AI_GEN] Slide {context.slide_index + 1} entering run_in_executor...")
            loop = asyncio.get_event_loop()
            response = await asyncio.wait_for(
                loop.run_in_executor(
                    None,  # Use default thread pool
                    invoke,
                    client,
                    model_name,
                    messages,
                    response_model,
                    actual_max_tokens,
                    temperature,  # Use variable temperature
                    context.deck_uuid,
                    True,  # slide_generation
                    context.slide_index
                ),
                timeout=self.generation_timeout
            )
            
            invoke_elapsed = (datetime.now() - invoke_start).total_seconds()
            logger.info(f"  AI invocation completed in {invoke_elapsed:.1f}s")
            
            # Convert to dict
            slide_data = response.model_dump()
            logger.info(f"  AI response received for slide {context.slide_index + 1}")
            try:
                self._postprocess_slide(slide_data, context)
            except Exception as post_err:
                logger.warning(
                    f"  Post-processing failed for slide {context.slide_index + 1}: {post_err}"
                )
            
            return slide_data
            
        except asyncio.TimeoutError:
            invoke_elapsed = (datetime.now() - invoke_start).total_seconds()
            logger.error(
                f"  AI invocation timed out after {invoke_elapsed:.1f}s "
                f"for slide {context.slide_index + 1}"
            )
            raise 
        except Exception as e:
            # JSON repair fallback for invalid JSON or validation errors
            err_text = str(e)
            lower_err = err_text.lower()
            is_validation_related = any(
                k in lower_err for k in [
                    "json_invalid",
                    "invalid json",
                    "validation error",
                    "pydantic",
                    "expected `,` or `}`",
                    "minimalslide"
                ]
            )
            # Inspect nested cause if present (AIGenerationError wraps underlying error)
            if not is_validation_related:
                try:
                    cause_text = str(getattr(e, "cause", "") or "")
                    lower_cause = cause_text.lower()
                    is_validation_related = any(
                        k in lower_cause for k in [
                            "json_invalid",
                            "invalid json",
                            "validation error",
                            "pydantic",
                            "expected `,` or `}`",
                            "minimalslide"
                        ]
                    )
                except Exception:
                    pass

            if is_validation_related:
                try:
                    logger.warning(
                        f"  Invalid JSON/validation issue for slide {context.slide_index + 1}; attempting raw repair parse..."
                    )
                    loop = asyncio.get_event_loop()
                    raw_text = await asyncio.wait_for(
                        loop.run_in_executor(
                            None,
                            invoke,
                            client,
                            model_name,
                            messages,
                            None,  # unstructured
                            actual_max_tokens,
                            temperature,
                            context.deck_uuid,
                            True,
                            context.slide_index
                        ),
                        timeout=self.generation_timeout
                    )
                    repaired = self._repair_minimal_slide_json(raw_text, context)
                    logger.info(
                        f"  ✓ Repaired JSON for slide {context.slide_index + 1} ({len(repaired.get('components', []))} components)"
                    )
                    return repaired
                except Exception as reparr:
                    logger.error(f"  JSON repair failed: {reparr}")
                    raise
            raise

    def _repair_minimal_slide_json(self, raw_text: str, context: SlideGenerationContext) -> Dict[str, Any]:
        """Best-effort extraction and repair of MinimalSlide JSON from a raw LLM response."""
        import re, json, uuid

        def _strip_code_fences(text: str) -> str:
            t = text.strip()
            # Remove triple backtick fences optionally with language label
            if t.startswith("```"):
                t = re.sub(r"^```(?:json|javascript|js)?\s*", "", t, flags=re.IGNORECASE)
            if t.endswith("```"):
                t = t[:-3].strip()
            return t

        def _strip_surrounding_quotes(text: str) -> str:
            t = text.strip()
            if (t.startswith('"') and t.endswith('"')) or (t.startswith("'") and t.endswith("'")):
                return t[1:-1]
            return t

        def _extract_balanced_object(text: str) -> str | None:
            start = text.find('{')
            if start < 0:
                return None
            depth = 0
            for i in range(start, len(text)):
                ch = text[i]
                if ch == '{':
                    depth += 1
                elif ch == '}':
                    depth -= 1
                    if depth == 0:
                        return text[start:i+1]
            return None

        cleaned = _strip_code_fences(raw_text)
        cleaned = _strip_surrounding_quotes(cleaned)
        candidate = _extract_balanced_object(cleaned) or cleaned
        candidate = candidate.strip()

        # Remove trailing commas before } or ]
        try:
            candidate = re.sub(r",\s*(?=[}\]])", "", candidate)
        except Exception:
            pass

        # Remove stray trailing characters after the last balanced brace/bracket
        try:
            last_obj = _extract_balanced_object(candidate)
            if last_obj:
                candidate = last_obj
        except Exception:
            pass

        # Try direct JSON load
        try:
            data = json.loads(candidate)
        except Exception:
            # Attempt single-quote to double-quote conversion (best-effort)
            try:
                sq_candidate = re.sub(r"(?<!\\)'", '"', candidate)
                data = json.loads(sq_candidate)
            except Exception:
                # Best-effort salvage: extract title and components even from malformed JSON
                title = None
                try:
                    m = re.search(r'"title"\s*:\s*"([^"]{0,200})"', candidate)
                    if m:
                        title = m.group(1)
                except Exception:
                    title = None

                # Helper to extract a balanced array after a key like "components": [ ... ]
                def _extract_balanced_array(text: str, key: str) -> str | None:
                    try:
                        key_match = re.search(rf'"{key}"\s*:\s*\[', text)
                        if not key_match:
                            return None
                        start = text.find('[', key_match.end() - 1)
                        if start < 0:
                            return None
                        depth = 0
                        for i in range(start, len(text)):
                            ch = text[i]
                            if ch == '[':
                                depth += 1
                            elif ch == ']':
                                depth -= 1
                                if depth == 0:
                                    # return contents inside the brackets
                                    return text[start + 1:i]
                        return None
                    except Exception:
                        return None

                # Iterate over balanced objects inside an array string
                def _iter_balanced_objects_in_array(array_text: str):
                    idx = 0
                    n = len(array_text)
                    while idx < n:
                        # find next object start
                        brace_pos = array_text.find('{', idx)
                        if brace_pos == -1:
                            break
                        depth = 0
                        start_obj = brace_pos
                        for j in range(brace_pos, n):
                            ch = array_text[j]
                            if ch == '{':
                                depth += 1
                            elif ch == '}':
                                depth -= 1
                                if depth == 0:
                                    yield array_text[start_obj:j + 1]
                                    idx = j + 1
                                    break
                        else:
                            # Unbalanced; stop
                            break

                components: list[dict] = []

                # Try to pull components from either original or single-quote converted text
                arrays_to_try = [candidate]
                try:
                    arrays_to_try.append(sq_candidate)  # type: ignore[name-defined]
                except Exception:
                    pass

                for source_text in arrays_to_try:
                    comp_array = _extract_balanced_array(source_text, 'components')
                    if not comp_array:
                        continue
                    # Attempt to parse each object individually, tolerating minor issues
                    for obj_text in _iter_balanced_objects_in_array(comp_array):
                        obj_candidate = obj_text.strip()
                        # Remove trailing comma if present
                        obj_candidate = re.sub(r",\s*$", "", obj_candidate)
                        parsed = None
                        try:
                            parsed = json.loads(obj_candidate)
                        except Exception:
                            # Try removing trailing commas inside objects/arrays
                            try:
                                tmp = re.sub(r",\s*(?=[}\]])", "", obj_candidate)
                                parsed = json.loads(tmp)
                            except Exception:
                                # Try single->double quotes
                                try:
                                    tmp2 = re.sub(r"(?<!\\)'", '"', obj_candidate)
                                    parsed = json.loads(tmp2)
                                except Exception:
                                    parsed = None
                        if isinstance(parsed, dict):
                            components.append(parsed)

                    # If we salvaged any, no need to try other sources
                    if components:
                        break

                data = {
                    "id": str(uuid.uuid4()),
                    "title": title or (getattr(context.slide_outline, 'title', None) or f"Slide {context.slide_index + 1}"),
                    "components": components
                }

        # Ensure required fields exist and are well-typed
        if not isinstance(data, dict):
            data = {}
        if not isinstance(data.get("id"), str):
            data["id"] = str(uuid.uuid4())
        if not isinstance(data.get("title"), str) or not data.get("title").strip():
            data["title"] = getattr(context.slide_outline, 'title', None) or f"Slide {context.slide_index + 1}"
        comps = data.get("components")
        if not isinstance(comps, list):
            data["components"] = []
        return data

    def _postprocess_slide(self, slide_data: Dict[str, Any], context: SlideGenerationContext) -> None:
        components = slide_data.get("components")
        if not isinstance(components, list):
            return

        for component in components:
            if not isinstance(component, dict):
                continue
            if component.get("type") != "CustomComponent":
                continue
            self._sanitize_custom_component(component)

    def _sanitize_custom_component(self, component: Dict[str, Any]) -> None:
        props = component.setdefault("props", {})
        render = props.get("render")
        if not isinstance(render, str) or not render.strip():
            return

        violations: List[str] = []
        if "React.useState" in render or "useState(" in render:
            violations.append("hooks")
        if re.search(r"<\s*[A-Za-z]", render):
            violations.append("jsx")
        if "function render" not in render:
            violations.append("signature")

        quiz_data = self._extract_quiz_data(render)
        if quiz_data:
            inner_props = props.setdefault("props", {})
            if quiz_data.get("questions"):
                inner_props.setdefault("questions", quiz_data["questions"])
            if quiz_data.get("title"):
                inner_props.setdefault("title", quiz_data["title"])
            if quiz_data.get("scoreLabel"):
                inner_props.setdefault("scoreLabel", quiz_data["scoreLabel"])
            for color_key, color_value in quiz_data.get("colors", {}).items():
                inner_props.setdefault(color_key, color_value)
            violations.append("quiz")

        if not violations:
            props["render"] = self._force_double_quotes(render)
            return

        if quiz_data:
            props["render"] = self._build_static_quiz_render()
            return

        props["render"] = self._build_safe_placeholder_render()

    def _force_double_quotes(self, render: str) -> str:
        def _replace(match: re.Match) -> str:
            value = match.group(0)
            if value.startswith("\'") and value.endswith("\'"):
                inner = value[1:-1]
                inner = inner.replace("\\\"", "'")
                inner = inner.replace("\'", "'")
                inner = inner.replace("\"", "'")
                return f'"{inner}"'
            return value

        try:
            return re.sub(r"\'([^\n\r]*?)\'", _replace, render)
        except Exception:
            return render

    def _extract_quiz_data(self, render: str) -> Optional[Dict[str, Any]]:
        questions_pattern = re.compile(
            r"question\s*:\s*(['\"])(.*?)\1\s*,\s*options\s*:\s*\[(.*?)\]\s*,\s*correctAnswer\s*:\s*(['\"])(.*?)\4",
            re.DOTALL
        )
        questions: List[Dict[str, Any]] = []
        for match in questions_pattern.finditer(render):
            question_text = self._normalize_text(match.group(2))
            options_block = match.group(3)
            correct_answer = self._normalize_text(match.group(5))
            option_matches = re.findall(r"(['\"])(.*?)\1", options_block)
            options = [self._normalize_text(opt[1]) for opt in option_matches]
            if question_text:
                questions.append({
                    "question": question_text,
                    "options": options,
                    "correctAnswer": correct_answer
                })

        if not questions:
            return None

        hex_matches = re.findall(r"#(?:[0-9A-Fa-f]{6})", render)
        colors: Dict[str, str] = {}
        if hex_matches:
            colors["backgroundColor"] = hex_matches[0]
        if len(hex_matches) > 1:
            colors.setdefault("primaryColor", hex_matches[1])
        if len(hex_matches) > 2:
            colors.setdefault("accentColor", hex_matches[2])

        title_match = re.search(r"['\"]([^'\"\n]{3,80}Quiz[^'\"\n]*)['\"]", render)
        title = self._normalize_text(title_match.group(1)) if title_match else None

        return {
            "questions": questions,
            "title": title,
            "scoreLabel": "Score" if "Score" in render else None,
            "colors": colors
        }

    def _normalize_text(self, value: str) -> str:
        text = (value or "").strip()
        text = text.replace("\r", " ")
        text = text.replace("\n", " ")
        text = re.sub(r"\s+", " ", text)
        text = text.replace('"', "'")
        return text

    def _build_static_quiz_render(self) -> str:
        return (
            "function render({ props }) {\n"
            "  const padding = props.padding || 32;\n"
            "  const availableWidth = Math.max(0, (props.width || 0) - padding * 2);\n"
            "  const availableHeight = Math.max(0, (props.height || 0) - padding * 2);\n"
            "  const primaryColor = props.primaryColor || props.color || \"#3B4CCA\";\n"
            "  const accentColor = props.accentColor || props.backgroundColor || \"#FFDE00\";\n"
            "  const textColor = props.textColor || \"#1F2937\";\n"
            "  const fontFamily = props.fontFamily || \"Poppins\";\n"
            "  const questions = Array.isArray(props.questions) ? props.questions : [];\n"
            "  const title = props.title || \"Quiz Spotlight\";\n"
            "  const scoreLabel = props.scoreLabel || \"Knowledge Check\";\n"
            "  const header = React.createElement(\n"
            "    \"div\",\n"
            "    {\n"
            "      key: \"header\",\n"
            "      style: {\n"
            "        display: \"flex\",\n"
            "        justifyContent: \"space-between\",\n"
            "        alignItems: \"center\",\n"
            "        marginBottom: availableHeight * 0.04\n"
            "      }\n"
            "    },\n"
            "    [\n"
            "      React.createElement(\n"
            "        \"div\",\n"
            "        {\n"
            "          key: \"title\",\n"
            "          style: {\n"
            "            fontSize: Math.max(14, availableHeight * 0.08),\n"
            "            fontWeight: 800,\n"
            "            color: primaryColor,\n"
            "            fontFamily,\n"
            "            letterSpacing: 1.2\n"
            "          }\n"
            "        },\n"
            "        title\n"
            "      ),\n"
            "      React.createElement(\n"
            "        \"div\",\n"
            "        {\n"
            "          key: \"score\",\n"
            "          style: {\n"
            "            fontSize: Math.max(16, availableHeight * 0.045),\n"
            "            fontWeight: 600,\n"
            "            color: primaryColor,\n"
            "            fontFamily,\n"
            "            backgroundColor: \"#FFFFFF\",\n"
            "            borderRadius: 999,\n"
            "            padding: \"6px 18px\",\n"
            "            border: `2px solid ${primaryColor}`\n"
            "          }\n"
            "        },\n"
            "        scoreLabel\n"
            "      )\n"
            "    ]\n"
            "  );\n"
            "  const questionCards = questions.slice(0, 8).map(function(item, index) {\n"
            "    const options = Array.isArray(item.options) ? item.options : [];\n"
            "    const optionElements = options.map(function(optionText, optionIndex) {\n"
            "      const isCorrect = typeof item.correctAnswer === \"string\" && item.correctAnswer === optionText;\n"
            "      return React.createElement(\n"
            "        \"li\",\n"
            "        {\n"
            "          key: `opt-${optionIndex}`,\n"
            "          style: {\n"
            "            listStyle: \"none\",\n"
            "            marginBottom: 8,\n"
            "            padding: \"10px 14px\",\n"
            "            borderRadius: 12,\n"
            "            border: `1px solid ${primaryColor}`,\n"
            "            backgroundColor: isCorrect ? primaryColor : (index % 2 === 0 ? \"#FFFFFF\" : \"#F5F6FF\"),\n"
            "            color: isCorrect ? \"#FFFFFF\" : textColor,\n"
            "            fontFamily,\n"
            "            fontWeight: isCorrect ? 700 : 500,\n"
            "            fontSize: Math.max(13, availableHeight * 0.032)\n"
            "          }\n"
            "        },\n"
            "        `${String.fromCharCode(65 + optionIndex)}. ${optionText}`\n"
            "      );\n"
            "    });\n"
            "    return React.createElement(\n"
            "      \"div\",\n"
            "      {\n"
            "        key: `question-${index}`,\n"
            "        style: {\n"
            "          backgroundColor: \"#FFFFFF\",\n"
            "          borderRadius: 18,\n"
            "          padding: \"18px 20px\",\n"
            "          marginBottom: 18,\n"
            "          boxShadow: \"0 8px 18px rgba(0,0,0,0.08)\"\n"
            "        }\n"
            "      },\n"
            "      [\n"
            "        React.createElement(\n"
            "          \"div\",\n"
            "          {\n"
            "            key: \"question\",\n"
            "            style: {\n"
            "              fontFamily,\n"
            "              fontWeight: 700,\n"
            "              color: primaryColor,\n"
            "              marginBottom: 12,\n"
            "              fontSize: Math.max(15, availableHeight * 0.04)\n"
            "            }\n"
            "          },\n"
            "          `Q${index + 1}. ${item.question}`\n"
            "        ),\n"
            "        React.createElement(\"ul\", { key: \"options\", style: { padding: 0, margin: 0 } }, optionElements)\n"
            "      ]\n"
            "    );\n"
            "  });\n"
            "  return React.createElement(\n"
            "    \"div\",\n"
            "    {\n"
            "      style: {\n"
            "        width: \"100%\",\n"
            "        height: \"100%\",\n"
            "        padding: `${padding}px`,\n"
            "        backgroundColor: accentColor,\n"
            "        borderRadius: props.borderRadius || 24,\n"
            "        boxSizing: \"border-box\",\n"
            "        display: \"flex\",\n"
            "        flexDirection: \"column\",\n"
            "        gap: 16\n"
            "      }\n"
            "    },\n"
            "    [header].concat(questionCards)\n"
            "  );\n"
            "}\n"
        )

    def _build_safe_placeholder_render(self) -> str:
        return (
            "function render({ props }) {\n"
            "  const padding = props.padding || 32;\n"
            "  const backgroundColor = props.backgroundColor || \"#F8FAFC\";\n"
            "  const borderColor = props.borderColor || \"#D0D7E2\";\n"
            "  const fontFamily = props.fontFamily || \"Poppins\";\n"
            "  return React.createElement(\n"
            "    \"div\",\n"
            "    {\n"
            "      style: {\n"
            "        width: \"100%\",\n"
            "        height: \"100%\",\n"
            "        padding: `${padding}px`,\n"
            "        boxSizing: \"border-box\",\n"
            "        borderRadius: 24,\n"
            "        border: `2px dashed ${borderColor}`,\n"
            "        backgroundColor,\n"
            "        display: \"flex\",\n"
            "        alignItems: \"center\",\n"
            "        justifyContent: \"center\",\n"
            "        color: \"#475569\",\n"
            "        fontFamily,\n"
            "        textAlign: \"center\",\n"
            "        fontSize: 22,\n"
            "        fontWeight: 600\n"
            "      }\n"
            "    },\n"
            "    props.fallbackText || \"Custom visualization placeholder\"\n"
            "  );\n"
            "}\n"
        )
