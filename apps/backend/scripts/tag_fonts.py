#!/usr/bin/env python3
"""
Font Semantic Tagging Pipeline

Replaces garbage tags in font_metadata_complete.json with clean, standardized
semantic tags by visually inspecting each font with AI vision (Gemini Flash).

Steps:
  1. Build font file index (font_id → .ttf/.otf path)
  2. Render preview contact sheets (8 fonts per image)
  3. AI Vision classification via Gemini Flash
  4. Update font_metadata_complete.json with new tags
  5. Verify results

Usage:
  python scripts/tag_fonts.py                    # Full pipeline
  python scripts/tag_fonts.py --step render      # Only render previews
  python scripts/tag_fonts.py --step classify    # Only run AI classification
  python scripts/tag_fonts.py --step apply       # Only apply cached results
  python scripts/tag_fonts.py --dry-run          # Preview without saving
"""

import argparse
import base64
import io
import json
import logging
import os
import sys
import time
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
from PIL import Image, ImageDraw, ImageFont

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
BACKEND_DIR = Path(__file__).resolve().parent.parent
ASSETS_DIR = BACKEND_DIR / "assets" / "fonts"
METADATA_PATH = ASSETS_DIR / "metadata" / "font_metadata_complete.json"
REGISTRY_PATH = ASSETS_DIR / "pixelbuddha" / "font_registry.json"
PB_EXTRACTED_DIR = ASSETS_DIR / "pixelbuddha" / "downloads" / "extracted"
DESIGNER_DIR = ASSETS_DIR / "designer"
SHEETS_DIR = Path("/tmp/font_sheets")
RESULTS_DIR = Path("/tmp/font_tag_results")

# ---------------------------------------------------------------------------
# Taxonomy
# ---------------------------------------------------------------------------
VALID_TAGS = {
    # Classification (pick 1 primary)
    "serif", "sans-serif", "slab-serif", "display", "script", "handwritten",
    "monospace", "blackletter", "decorative", "pixel",
    # Sub-style
    "geometric", "humanist", "grotesque", "neo-grotesque", "didone",
    "transitional", "old-style", "calligraphic", "brush", "stencil",
    "inline", "outline", "3d", "shadow", "textured", "distressed", "grunge",
    # Weight/Width
    "thin", "light", "regular", "bold", "heavy", "black",
    "condensed", "wide", "extended",
    # Mood/Personality
    "professional", "corporate", "formal", "elegant", "luxurious", "refined",
    "sophisticated", "minimal", "clean", "modern", "contemporary", "casual",
    "friendly", "warm", "playful", "fun", "quirky", "whimsical", "cute",
    "serious", "dark", "edgy", "aggressive", "energetic", "dynamic", "calm",
    "romantic", "mysterious",
    # Era/Period
    "vintage", "retro", "art-deco", "art-nouveau", "mid-century", "victorian",
    "medieval", "50s", "60s", "70s", "80s", "90s", "y2k", "futuristic",
    # Genre/Aesthetic
    "horror", "gothic", "western", "sci-fi", "cyberpunk", "steampunk",
    "tropical", "bohemian", "streetwear", "hip-hop", "punk", "psychedelic",
    "graffiti", "comic", "cartoon", "fantasy", "military", "sport",
    "academic", "newspaper", "editorial",
    # Use Case
    "headline", "body-text", "logo", "poster", "web", "print", "packaging",
    "branding", "invitation", "signage",
}

VALID_BEST_FOR = {
    "headlines", "body_text", "logos", "posters", "print", "web",
    "packaging", "advertising", "presentations", "invitations",
    "branding", "signage", "editorial", "social_media",
}

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("tag_fonts")

# ---------------------------------------------------------------------------
# Step 1: Build font file index
# ---------------------------------------------------------------------------

def build_font_index() -> dict[str, Optional[Path]]:
    """Map each font_id from metadata → first usable .ttf/.otf file."""
    metadata = json.loads(METADATA_PATH.read_text())
    registry = json.loads(REGISTRY_PATH.read_text()) if REGISTRY_PATH.exists() else {}

    index: dict[str, Optional[Path]] = {}
    found = 0

    for font_id in metadata:
        font_path = _find_font_file(font_id, registry)
        index[font_id] = font_path
        if font_path:
            found += 1

    log.info(f"Font index: {found}/{len(index)} fonts have files")
    return index


def _find_font_file(font_id: str, registry: dict) -> Optional[Path]:
    """Find first .ttf or .otf for a font_id."""
    # Try registry first
    if font_id in registry:
        entry = registry[font_id]
        for f in entry.get("files", []):
            raw_path = f.get("path", "")
            # Registry uses 'all_downloads' but actual dir is 'downloads'
            raw_path = raw_path.replace("all_downloads/", "")
            full = BACKEND_DIR / raw_path
            if full.exists() and full.suffix.lower() in (".ttf", ".otf"):
                return full

    # Try pixelbuddha extracted directory
    pb_dir = PB_EXTRACTED_DIR / font_id
    if pb_dir.is_dir():
        font_file = _scan_dir_for_font(pb_dir)
        if font_file:
            return font_file

    # Try designer directory (underscore variants)
    designer_id = font_id.replace("-", "_")
    designer_dir = DESIGNER_DIR / designer_id
    if designer_dir.is_dir():
        font_file = _scan_dir_for_font(designer_dir)
        if font_file:
            return font_file

    # Try designer directory with exact font_id
    designer_dir2 = DESIGNER_DIR / font_id
    if designer_dir2.is_dir():
        font_file = _scan_dir_for_font(designer_dir2)
        if font_file:
            return font_file

    return None


def _scan_dir_for_font(directory: Path) -> Optional[Path]:
    """Recursively find first .ttf or .otf file, skipping __MACOSX."""
    # Prefer TTF, then OTF
    for ext in (".ttf", ".otf"):
        for p in sorted(directory.rglob(f"*{ext}")):
            if "__MACOSX" not in str(p):
                return p
    return None


# ---------------------------------------------------------------------------
# Step 2: Render preview contact sheets
# ---------------------------------------------------------------------------

SAMPLE_TEXT_1 = "AaBbCcDdEe 0123456789"
SAMPLE_TEXT_2 = "The Quick Brown Fox Jumps Over"
FONT_SIZE = 48
LABEL_SIZE = 18
ROW_HEIGHT = 140
SHEET_WIDTH = 1600
FONTS_PER_SHEET = 8


def render_contact_sheets(font_index: dict[str, Optional[Path]]) -> list[tuple[Path, list[str]]]:
    """Render contact sheets of 8 fonts each. Returns list of (image_path, [font_ids])."""
    SHEETS_DIR.mkdir(parents=True, exist_ok=True)

    # Only fonts with files
    renderable = [(fid, fp) for fid, fp in font_index.items() if fp is not None]
    log.info(f"Rendering {len(renderable)} fonts into contact sheets...")

    sheets: list[tuple[Path, list[str]]] = []
    batch: list[tuple[str, Path]] = []

    for fid, fp in renderable:
        batch.append((fid, fp))
        if len(batch) == FONTS_PER_SHEET:
            sheet_path = _render_sheet(batch, len(sheets))
            sheets.append((sheet_path, [b[0] for b in batch]))
            batch = []

    # Remaining
    if batch:
        sheet_path = _render_sheet(batch, len(sheets))
        sheets.append((sheet_path, [b[0] for b in batch]))

    log.info(f"Rendered {len(sheets)} contact sheets to {SHEETS_DIR}")
    return sheets


def _render_sheet(batch: list[tuple[str, Path]], sheet_idx: int) -> Path:
    """Render a single contact sheet with up to 8 fonts."""
    height = ROW_HEIGHT * len(batch) + 20
    img = Image.new("RGB", (SHEET_WIDTH, height), "white")
    draw = ImageDraw.Draw(img)

    # Fallback label font
    try:
        label_font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", LABEL_SIZE)
    except OSError:
        label_font = ImageFont.load_default()

    y = 10
    for font_id, font_path in batch:
        # Draw label
        draw.text((10, y), font_id, fill="#888888", font=label_font)
        y += LABEL_SIZE + 4

        # Try loading the font
        try:
            font = ImageFont.truetype(str(font_path), FONT_SIZE)
            draw.text((10, y), SAMPLE_TEXT_1, fill="black", font=font)
            y += FONT_SIZE + 4
            draw.text((10, y), SAMPLE_TEXT_2, fill="black", font=font)
        except Exception as e:
            draw.text((10, y), f"[render error: {e}]", fill="red", font=label_font)
            y += FONT_SIZE + 4

        y += FONT_SIZE + 20

    out_path = SHEETS_DIR / f"sheet_{sheet_idx:03d}.png"
    img.save(out_path, "PNG")
    return out_path


# ---------------------------------------------------------------------------
# Step 3: AI Vision Classification
# ---------------------------------------------------------------------------

TAXONOMY_PROMPT = """You are a typography expert. Classify each font shown in this contact sheet.

For each font (identified by its ID label above the sample text), provide:

1. **tags**: Array of tags from ONLY this taxonomy (8-20 tags per font):

   Classification (exactly 1): serif, sans-serif, slab-serif, display, script, handwritten, monospace, blackletter, decorative, pixel

   Sub-style (0-3): geometric, humanist, grotesque, neo-grotesque, didone, transitional, old-style, calligraphic, brush, stencil, inline, outline, 3d, shadow, textured, distressed, grunge

   Weight/Width (1-3): thin, light, regular, bold, heavy, black, condensed, wide, extended

   Mood/Personality (2-5): professional, corporate, formal, elegant, luxurious, refined, sophisticated, minimal, clean, modern, contemporary, casual, friendly, warm, playful, fun, quirky, whimsical, cute, serious, dark, edgy, aggressive, energetic, dynamic, calm, romantic, mysterious

   Era/Period (0-2): vintage, retro, art-deco, art-nouveau, mid-century, victorian, medieval, 50s, 60s, 70s, 80s, 90s, y2k, futuristic

   Genre/Aesthetic (0-3): horror, gothic, western, sci-fi, cyberpunk, steampunk, tropical, bohemian, streetwear, hip-hop, punk, psychedelic, graffiti, comic, cartoon, fantasy, military, sport, academic, newspaper, editorial

   Use Case (1-4): headline, body-text, logo, poster, web, print, packaging, branding, invitation, signage, editorial

2. **best_for**: Array from: headlines, body_text, logos, posters, print, web, packaging, advertising, presentations, invitations, branding, signage, editorial, social_media

3. **personality**: Array of 2-4 mood words (subset of mood tags above)

Respond with ONLY valid JSON (no markdown):
{
  "fonts": {
    "<font_id>": {
      "tags": ["tag1", "tag2", ...],
      "best_for": ["use1", "use2", ...],
      "personality": ["mood1", "mood2", ...]
    },
    ...
  }
}"""

TEXT_ONLY_PROMPT = """You are a typography expert. Based on the font name and description, classify each font.

For each font, provide:

1. **tags**: Array of tags from ONLY this taxonomy (8-15 tags per font):

   Classification (exactly 1): serif, sans-serif, slab-serif, display, script, handwritten, monospace, blackletter, decorative, pixel

   Sub-style (0-3): geometric, humanist, grotesque, neo-grotesque, didone, transitional, old-style, calligraphic, brush, stencil, inline, outline, 3d, shadow, textured, distressed, grunge

   Weight/Width (1-3): thin, light, regular, bold, heavy, black, condensed, wide, extended

   Mood/Personality (2-5): professional, corporate, formal, elegant, luxurious, refined, sophisticated, minimal, clean, modern, contemporary, casual, friendly, warm, playful, fun, quirky, whimsical, cute, serious, dark, edgy, aggressive, energetic, dynamic, calm, romantic, mysterious

   Era/Period (0-2): vintage, retro, art-deco, art-nouveau, mid-century, victorian, medieval, 50s, 60s, 70s, 80s, 90s, y2k, futuristic

   Genre/Aesthetic (0-3): horror, gothic, western, sci-fi, cyberpunk, steampunk, tropical, bohemian, streetwear, hip-hop, punk, psychedelic, graffiti, comic, cartoon, fantasy, military, sport, academic, newspaper, editorial

   Use Case (1-4): headline, body-text, logo, poster, web, print, packaging, branding, invitation, signage, editorial

2. **best_for**: Array from: headlines, body_text, logos, posters, print, web, packaging, advertising, presentations, invitations, branding, signage, editorial, social_media

3. **personality**: Array of 2-4 mood words (subset of mood tags above)

Respond with ONLY valid JSON (no markdown):
{
  "fonts": {
    "<font_id>": {
      "tags": ["tag1", "tag2", ...],
      "best_for": ["use1", "use2", ...],
      "personality": ["mood1", "mood2", ...]
    },
    ...
  }
}

Here are the fonts to classify:
"""


def classify_fonts_vision(
    sheets: list[tuple[Path, list[str]]],
    metadata: dict,
    font_index: dict[str, Optional[Path]],
) -> dict:
    """Classify all fonts using Gemini Flash vision + text-only fallback."""
    from google import genai
    from google.genai import types as genai_types

    load_dotenv(BACKEND_DIR / ".env")
    api_key = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("GOOGLE_API_KEY not set in .env")

    client = genai.Client(api_key=api_key)
    model = "gemini-2.5-flash"
    all_results: dict = {}
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)

    # --- Vision classification for fonts with rendered sheets ---
    log.info(f"Classifying {len(sheets)} contact sheets with Gemini Flash vision...")
    for i, (sheet_path, font_ids) in enumerate(sheets):
        cache_path = RESULTS_DIR / f"vision_{i:03d}.json"
        if cache_path.exists():
            cached = json.loads(cache_path.read_text())
            all_results.update(cached.get("fonts", {}))
            log.info(f"  Sheet {i+1}/{len(sheets)}: loaded from cache ({len(font_ids)} fonts)")
            continue

        img_bytes = sheet_path.read_bytes()
        b64 = base64.b64encode(img_bytes).decode()

        contents = [
            genai_types.Part.from_bytes(data=img_bytes, mime_type="image/png"),
            genai_types.Part.from_text(text=TAXONOMY_PROMPT),
        ]

        try:
            response = client.models.generate_content(
                model=model,
                contents=contents,
                config=genai_types.GenerateContentConfig(
                    temperature=0.3,
                    max_output_tokens=8192,
                    response_mime_type="application/json",
                ),
            )
            result_text = response.text
            parsed = json.loads(result_text)
            fonts_data = parsed.get("fonts", parsed)

            # Cache result
            cache_path.write_text(json.dumps({"fonts": fonts_data}, indent=2))
            all_results.update(fonts_data)
            log.info(f"  Sheet {i+1}/{len(sheets)}: classified {len(fonts_data)} fonts")

        except Exception as e:
            log.error(f"  Sheet {i+1}/{len(sheets)} FAILED: {e}")

        # Rate limiting
        if i < len(sheets) - 1:
            time.sleep(1)

    # --- Text-only classification for fonts without files ---
    no_file_fonts = {fid: metadata[fid] for fid in font_index if font_index[fid] is None and fid in metadata}
    if no_file_fonts:
        log.info(f"Classifying {len(no_file_fonts)} fonts text-only...")
        text_batch: list[tuple[str, dict]] = []

        for font_id, font_data in no_file_fonts.items():
            text_batch.append((font_id, font_data))
            if len(text_batch) == 8:
                _classify_text_batch(client, model, text_batch, all_results, len(all_results))
                text_batch = []
                time.sleep(1)

        if text_batch:
            _classify_text_batch(client, model, text_batch, all_results, len(all_results))

    log.info(f"Total classified: {len(all_results)} fonts")
    return all_results


def _classify_text_batch(client, model, batch: list[tuple[str, dict]], results: dict, batch_idx: int):
    """Classify a batch of fonts using text-only (name + description)."""
    from google.genai import types as genai_types

    cache_path = RESULTS_DIR / f"text_{batch_idx:04d}.json"
    if cache_path.exists():
        cached = json.loads(cache_path.read_text())
        results.update(cached.get("fonts", {}))
        log.info(f"  Text batch: loaded from cache ({len(batch)} fonts)")
        return

    font_descriptions = []
    for font_id, font_data in batch:
        name = font_data.get("name", font_id)
        desc = font_data.get("description", "")[:300]
        font_descriptions.append(f"- **{font_id}** ({name}): {desc}")

    prompt = TEXT_ONLY_PROMPT + "\n".join(font_descriptions)

    try:
        response = client.models.generate_content(
            model=model,
            contents=prompt,
            config=genai_types.GenerateContentConfig(
                temperature=0.3,
                max_output_tokens=8192,
                response_mime_type="application/json",
            ),
        )
        parsed = json.loads(response.text)
        fonts_data = parsed.get("fonts", parsed)
        cache_path.write_text(json.dumps({"fonts": fonts_data}, indent=2))
        results.update(fonts_data)
        log.info(f"  Text batch: classified {len(fonts_data)} fonts")
    except Exception as e:
        log.error(f"  Text batch FAILED: {e}")


# ---------------------------------------------------------------------------
# Step 4: Update metadata
# ---------------------------------------------------------------------------

def _build_prefix_index(metadata: dict) -> dict[str, str]:
    """Build numeric-prefix → font_id lookup for fuzzy matching."""
    index: dict[str, str] = {}
    for fid in metadata:
        prefix = fid.split("-")[0] if "-" in fid else fid
        index[prefix] = fid
    return index


def _resolve_font_id(font_id: str, metadata: dict, prefix_index: dict) -> Optional[str]:
    """Resolve a possibly-misread font ID to the correct metadata key."""
    if font_id in metadata:
        return font_id
    # Try matching by numeric prefix (e.g. "3223" → "3223-leon-slab-fat-font")
    prefix = font_id.split("-")[0] if "-" in font_id else font_id
    if prefix in prefix_index:
        return prefix_index[prefix]
    return None


def apply_tags(classification_results: dict, dry_run: bool = False) -> dict:
    """Update font_metadata_complete.json with new semantic tags."""
    metadata = json.loads(METADATA_PATH.read_text())
    prefix_index = _build_prefix_index(metadata)
    updated = 0
    skipped = 0
    fuzzy_matched = 0

    for font_id, new_data in classification_results.items():
        resolved_id = _resolve_font_id(font_id, metadata, prefix_index)
        if resolved_id is None:
            skipped += 1
            continue
        if resolved_id != font_id:
            fuzzy_matched += 1
        font_id = resolved_id

        raw_tags = new_data.get("tags", [])
        # Normalize and validate tags
        clean_tags = []
        for tag in raw_tags:
            t = tag.lower().strip()
            if t in VALID_TAGS:
                clean_tags.append(t)

        if not clean_tags:
            skipped += 1
            continue

        # Update tags
        metadata[font_id]["tags"] = clean_tags

        # Update best_for
        raw_best_for = new_data.get("best_for", [])
        clean_best_for = [b.lower().strip() for b in raw_best_for if b.lower().strip() in VALID_BEST_FOR]
        if clean_best_for:
            metadata[font_id]["best_for"] = clean_best_for

        # Update personality
        raw_personality = new_data.get("personality", [])
        if raw_personality:
            if "style_characteristics" not in metadata[font_id]:
                metadata[font_id]["style_characteristics"] = {}
            metadata[font_id]["style_characteristics"]["personality"] = [
                p.lower().strip() for p in raw_personality
            ]

        updated += 1

    # Strip garbage from any remaining un-updated fonts and salvage valid tags
    garbage_tags = {"Mockups", "Text Effects", "Effects", "Templates", "Fonts",
                    "Icons", "Graphics", "Patterns", "Textures", "UI/UX Resources",
                    "Brushes", "Social Media", "Font", "Typeface", "Type",
                    "Typography", "Typography Font"}
    # Also strip any tag ending with " Font" (e.g. "Bold Font", "Serif Font")
    salvaged = 0
    for font_id, font_data in metadata.items():
        tags = font_data.get("tags", [])
        # Check if still has garbage (wasn't updated by AI)
        if any(t in garbage_tags for t in tags):
            clean = []
            for t in tags:
                tl = t.lower().strip()
                if tl in VALID_TAGS:
                    clean.append(tl)
            # Infer classification from font name if missing
            name_lower = font_data.get("name", "").lower()
            if not any(t in {"serif", "sans-serif", "slab-serif", "display", "script",
                            "handwritten", "monospace", "blackletter", "decorative", "pixel"}
                       for t in clean):
                if "blackletter" in name_lower or "gothic" in name_lower:
                    clean.insert(0, "blackletter")
                elif "pixel" in name_lower or "8-bit" in name_lower:
                    clean.insert(0, "pixel")
                elif "script" in name_lower or "calligraph" in name_lower:
                    clean.insert(0, "script")
                elif "handwrit" in name_lower or "hand-letter" in name_lower:
                    clean.insert(0, "handwritten")
                elif "slab" in name_lower:
                    clean.insert(0, "slab-serif")
                elif "sans" in name_lower or "grotesk" in name_lower:
                    clean.insert(0, "sans-serif")
                elif "serif" in name_lower:
                    clean.insert(0, "serif")
                else:
                    clean.insert(0, "display")

            if clean:
                metadata[font_id]["tags"] = clean
                salvaged += 1

    log.info(f"Updated {updated} fonts ({fuzzy_matched} fuzzy-matched), salvaged {salvaged} remaining, skipped {skipped}")

    if not dry_run:
        METADATA_PATH.write_text(json.dumps(metadata, indent=2, ensure_ascii=False))
        log.info(f"Saved to {METADATA_PATH}")
    else:
        log.info("DRY RUN — no file written")

    return metadata


# ---------------------------------------------------------------------------
# Step 5: Verify
# ---------------------------------------------------------------------------

def verify_results(metadata: dict):
    """Print summary stats and spot-check results."""
    from collections import Counter

    tag_counter = Counter()
    tag_counts_per_font = []
    fonts_missing_tags = []

    for font_id, font_data in metadata.items():
        tags = font_data.get("tags", [])
        tag_counts_per_font.append(len(tags))
        if not tags:
            fonts_missing_tags.append(font_id)
        for t in tags:
            tag_counter[t] += 1

    avg_tags = sum(tag_counts_per_font) / len(tag_counts_per_font) if tag_counts_per_font else 0

    print("\n" + "=" * 60)
    print("VERIFICATION REPORT")
    print("=" * 60)
    print(f"Total fonts: {len(metadata)}")
    print(f"Fonts with tags: {len(metadata) - len(fonts_missing_tags)}")
    print(f"Fonts missing tags: {len(fonts_missing_tags)}")
    print(f"Avg tags per font: {avg_tags:.1f}")
    print(f"Unique tags in use: {len(tag_counter)}")

    # Check for garbage tags
    garbage = {"Mockups", "Text Effects", "Effects", "Templates", "Fonts",
               "Icons", "Graphics", "Patterns", "Textures", "UI/UX Resources",
               "Brushes", "Social Media"}
    remaining_garbage = {t for t in tag_counter if t in garbage}
    if remaining_garbage:
        print(f"\n⚠ GARBAGE TAGS STILL PRESENT: {remaining_garbage}")
    else:
        print(f"\nAll garbage tags removed!")

    # Top tags
    print(f"\nTop 20 tags:")
    for tag, count in tag_counter.most_common(20):
        print(f"  {tag}: {count}")

    # Check taxonomy coverage
    unused_tags = VALID_TAGS - set(tag_counter.keys())
    if unused_tags:
        print(f"\nUnused taxonomy tags ({len(unused_tags)}): {sorted(unused_tags)[:20]}...")

    # Spot check: show 5 fonts
    print(f"\nSpot check (5 random fonts):")
    import random
    sample = random.sample(list(metadata.keys()), min(5, len(metadata)))
    for fid in sample:
        fd = metadata[fid]
        print(f"\n  {fid}")
        print(f"    name: {fd.get('name', '?')}")
        print(f"    tags: {fd.get('tags', [])}")
        print(f"    best_for: {fd.get('best_for', [])}")
        print(f"    personality: {fd.get('style_characteristics', {}).get('personality', [])}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Font Semantic Tagging Pipeline")
    parser.add_argument("--step", choices=["index", "render", "classify", "apply", "verify"],
                        help="Run only a specific step")
    parser.add_argument("--dry-run", action="store_true", help="Preview without saving")
    args = parser.parse_args()

    metadata = json.loads(METADATA_PATH.read_text())

    if args.step == "verify":
        verify_results(metadata)
        return

    # Step 1: Build index
    log.info("Step 1: Building font file index...")
    font_index = build_font_index()

    if args.step == "index":
        # Print stats and exit
        with_files = sum(1 for v in font_index.values() if v)
        print(f"Fonts with files: {with_files}/{len(font_index)}")
        return

    # Step 2: Render sheets
    log.info("Step 2: Rendering contact sheets...")
    sheets = render_contact_sheets(font_index)

    if args.step == "render":
        print(f"Rendered {len(sheets)} sheets to {SHEETS_DIR}")
        return

    # Step 3: Classify
    log.info("Step 3: AI Vision classification...")
    results = classify_fonts_vision(sheets, metadata, font_index)

    # Save raw results
    raw_path = RESULTS_DIR / "all_classifications.json"
    raw_path.write_text(json.dumps(results, indent=2, ensure_ascii=False))
    log.info(f"Raw results saved to {raw_path}")

    if args.step == "classify":
        print(f"Classified {len(results)} fonts. Results at {raw_path}")
        return

    # Step 4: Apply
    log.info("Step 4: Applying tags to metadata...")
    updated_metadata = apply_tags(results, dry_run=args.dry_run)

    # Step 5: Verify
    log.info("Step 5: Verifying results...")
    verify_results(updated_metadata)


if __name__ == "__main__":
    main()
