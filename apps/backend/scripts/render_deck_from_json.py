import json
import argparse
from pathlib import Path
from typing import Any, Dict

from services.slide_renderer import SlideRenderer  # type: ignore


def main():
    parser = argparse.ArgumentParser(description="Render deck JSON to images using SlideRenderer")
    parser.add_argument("deck_json", help="Path to imported_deck.json")
    parser.add_argument("--out", default="./render_out", help="Output directory")
    args = parser.parse_args()

    deck_path = Path(args.deck_json).resolve()
    out_dir = Path(args.out).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    deck: Dict[str, Any] = json.loads(deck_path.read_text())
    slides = deck.get("slides", [])
    sr = SlideRenderer(output_dir=str(out_dir))

    for idx, slide in enumerate(slides):
        out = sr.render_slide(slide, deck_uuid=deck.get("uuid"), slide_index=idx)
        # Rename as deck_slide_###.png
        try:
            import shutil
            target = out_dir / f"deck_slide_{idx+1:03d}.png"
            shutil.copyfile(out, target)
        except Exception:
            pass


if __name__ == "__main__":
    main()


