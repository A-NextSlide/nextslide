import re
from typing import Any, Dict

from agents import config as agents_config
from setup_logging_optimized import get_logger

logger = get_logger(__name__)

# Formatting thresholds (override via agents.config if needed).
SENTENCE_SPLIT_THRESHOLD = int(getattr(agents_config, "SENTENCE_SPLIT_THRESHOLD", 180))
MAX_LINE_LENGTH = int(getattr(agents_config, "MAX_LINE_LENGTH", 180))
DETAILED_MODE_MAX_BULLET_WORDS = int(getattr(agents_config, "DETAILED_MODE_MAX_BULLET_WORDS", 45))

# Title slide constraints
TITLE_SLIDE_MAX_WORDS = 30
TITLE_SLIDE_MAX_LINES = 4
TITLE_FIRST_LINE_MAX_WORDS = 12


class SlideGeneratorValidationMixin:

    def _validate_title_slide_content(self, content: str, max_words: int = TITLE_SLIDE_MAX_WORDS) -> str:
        """Validate and enforce title slide content constraints.

        ⚠️ CRITICAL: Title slides must ALWAYS be CLEAN HERO SLIDES in ALL MODES!
        This applies to detailed, standard, AND quick modes - NO EXCEPTIONS!

        Title slide requirements:
        - Maximum 20-30 words total
        - Only: title + optional subtitle + metadata
        - NO bullets, NO paragraphs, NO extra content
        - NO comprehensive analysis on title slides (save that for content slides)

        Args:
            content: Raw content generated for the title slide
            max_words: Maximum word count (default: 30, NEVER increase this)

        Returns:
            Validated and potentially truncated title slide content
        """
        try:
            if not content:
                return ""

            # Strip and normalize
            text = re.sub(r'\r\n?', '\n', str(content)).strip()

            # Count total words
            word_count = len(text.split())

            # If under limit, return as-is
            if word_count <= max_words:
                logger.info(f"[TITLE VALIDATION] Title slide word count: {word_count} (OK)")
                return text

            # VIOLATION: Title slide has too much content
            logger.warning(f"[TITLE VALIDATION] Title slide exceeded {max_words} words ({word_count} words). Stripping excess content.")

            # Extract key elements (preserve structure but enforce limits)
            lines = [line.strip() for line in text.split('\n') if line.strip()]

            # Keep first 3-4 lines maximum (title, subtitle, metadata)
            # Remove any bullets, paragraphs, or extra content
            cleaned_lines = []
            for i, line in enumerate(lines[:TITLE_SLIDE_MAX_LINES]):
                # Skip bullet points
                if line.startswith('•') or line.startswith('-') or line.startswith('*'):
                    logger.info(f"[TITLE VALIDATION] Removing bullet point from title slide: {line[:50]}")
                    continue

                # Skip very long lines (likely paragraphs)
                if len(line.split()) > TITLE_FIRST_LINE_MAX_WORDS and i > 0:  # Allow longer first line (title)
                    logger.info(f"[TITLE VALIDATION] Removing long line from title slide: {line[:50]}")
                    continue

                cleaned_lines.append(line)

            # Rebuild content
            cleaned = '\n'.join(cleaned_lines)
            final_word_count = len(cleaned.split())

            # If still too long, truncate to max_words
            if final_word_count > max_words:
                words = cleaned.split()
                cleaned = ' '.join(words[:max_words])
                logger.warning(f"[TITLE VALIDATION] Truncated title slide from {final_word_count} to {max_words} words")

            logger.info(f"[TITLE VALIDATION] Final title slide word count: {len(cleaned.split())}")
            return cleaned

        except Exception as e:
            logger.error(f"[TITLE VALIDATION] Error validating title slide: {e}")
            # Fallback: just take first 30 words
            words = str(content).split()[:max_words]
            return ' '.join(words)

    def _ensure_proper_formatting(self, content: str) -> str:
        """Ensure content is formatted as concise bullet points.
        - Converts paragraphs and long lines to short bullets
        - Splits "Header: paragraph" into a short header bullet + callout bullets
        - Normalizes bullet markers and trims each bullet to a readable length
        """
        try:
            if not content:
                return ""

            # Normalize line breaks and whitespace
            text = re.sub(r'\r\n?', '\n', str(content)).strip()

            # Helper: split a clause into shorter callouts if it's long
            def _split_clauses(s: str) -> list[str]:
                s = s.strip()
                if not s:
                    return []
                # First, split by end-of-sentence punctuation
                parts = [p.strip() for p in re.split(r'(?<=[\.!?;])\s+', s) if p and p.strip()]
                result: list[str] = []
                for part in parts:
                    # If still lengthy and packed with multiple metrics, split by commas
                    if len(part.split()) > 20 and (part.count('%') + len(re.findall(r'\d+', part)) >= 2):
                        result.extend([p.strip() for p in part.split(',') if p.strip()])
                    else:
                        result.append(part)
                return result

            # Helper: normalize incoming lines (numbers/bullets/headings)
            def _normalize_line(line: str) -> list[str]:
                if not line:
                    return []
                # Remove leading list markers or numbering
                line = re.sub(r'^\s*(?:[-*\u2022•\u2013\u2014]|#+|\d+\.)\s*', '', line).strip()
                if not line:
                    return []
                # If "Header: rest" pattern, split into header + clauses
                if ':' in line:
                    try:
                        colon_idx = line.index(':')
                    except ValueError:
                        colon_idx = -1
                    if 0 <= colon_idx < 50:
                        header = line[:colon_idx].strip()
                        rest = line[colon_idx + 1:].strip()
                        segs: list[str] = []
                        if header:
                            segs.append(header)
                        if rest:
                            segs.extend(_split_clauses(rest))
                        return segs
                # Otherwise split long sentences into clauses
                return _split_clauses(line) or [line]

            # Build candidate lines: if there are no line breaks but text is long, split by sentences
            raw_lines = [l for l in (ln.strip() for ln in text.split('\n')) if l]
            if len(raw_lines) <= 1 and len(text) > SENTENCE_SPLIT_THRESHOLD:
                raw_lines = [seg.strip() for seg in re.split(r'(?<=[\.!?])\s+', text) if seg and seg.strip()]

            # Flatten into segments
            segments: list[str] = []
            for raw in raw_lines:
                # If a raw line is very long, pre-split it before normalization
                if len(raw) > MAX_LINE_LENGTH and any(ch in raw for ch in '.;!?'):
                    for chunk in re.split(r'(?<=[\.!?;])\s+', raw):
                        segments.extend(_normalize_line(chunk))
                else:
                    segments.extend(_normalize_line(raw))

            # Final cleanup, trimming, and bulletization
            formatted: list[str] = []
            for seg in segments:
                seg = seg.strip().strip('"')
                if not seg:
                    continue
                # Preserve trailing citation like [1]
                citation = ''
                m = re.search(r'(\s*\[\d+\])\s*$', seg)
                if m:
                    citation = m.group(1).strip()
                    seg = seg[:m.start()].rstrip()
                # Trim to reasonable length (45 words for detailed mode, 20 for presentation)
                # Using 45 as default to not limit detailed mode comprehensive bullets
                words = seg.split()
                max_words_for_bullet = DETAILED_MODE_MAX_BULLET_WORDS  # Allow comprehensive bullets
                if len(words) > max_words_for_bullet:
                    seg = ' '.join(words[:max_words_for_bullet]) + '…'
                # Re-attach citation
                if citation:
                    seg = f"{seg} {citation}"
                formatted.append(f"• {seg}")

            # Ensure at least one bullet if content existed
            if not formatted and text:
                max_words_for_bullet = DETAILED_MODE_MAX_BULLET_WORDS  # Allow comprehensive bullets
                trimmed = ' '.join(text.split()[:max_words_for_bullet]) + ('…' if len(text.split()) > max_words_for_bullet else '')
                formatted = [f"• {trimmed}"]

            return '\n\n'.join(formatted)
        except Exception:
            # Fallback: safest path, prefix each non-empty line with a bullet
            safe_lines = []
            for ln in str(content).split('\n'):
                ln = ln.strip()
                if not ln:
                    continue
                if not ln.startswith('•'):
                    ln = f"• {ln}"
                safe_lines.append(ln)
            return '\n\n'.join(safe_lines)

    def _contains_placeholders(self, content: str) -> bool:
        """Check if content contains placeholder text that should be replaced with real data"""
        placeholder_patterns = [
            r'\[insert\s+.*?\]',
            r'\[mention\s+.*?\]',
            r'\[specific\s+.*?\]',
            r'\[.*?value.*?\]',
            r'\[.*?percentage.*?\]',
            r'\[.*?number.*?\]',
            r'\[.*?amount.*?\]',
            r'\[your\s+name\]',  # Except for title slides
            r'insert\s+specific',
            r'mention\s+a\s+specific',
            r'specific\s+price\s+point(?!\s*:)',  # Not followed by colon
            r'specific\s+percentage\s+or\s+value',
        ]
        
        content_lower = content.lower()
        for pattern in placeholder_patterns:
            if re.search(pattern, content_lower, re.IGNORECASE):
                return True
        
        return False

    def _build_placeholder_repair_instruction(self, context: Dict[str, Any]) -> str:
        """Build a minimal instruction for fixing placeholder text via the model."""
        has_data = bool(context and context.get('processed_files') and context['processed_files'].get('extracted_data'))
        if has_data:
            guidance = (
                "Replace any placeholders with specific values. Use the extracted data above when relevant; "
                "otherwise choose plausible values. Do not use bracketed placeholders."
            )
        else:
            guidance = (
                "Replace any placeholders with specific values. Choose plausible values. "
                "Do not use bracketed placeholders."
            )
        return "\n\nIMPORTANT: " + guidance
