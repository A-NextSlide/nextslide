from __future__ import annotations

from typing import List, Optional, Dict, Any, Literal
from pydantic import BaseModel, Field, create_model
import uuid as _uuid
import json
import io
from io import BytesIO
import csv
import urllib.request

from models.tools import ToolModel
from models.deck import DeckBase, DeckDiff, DeckDiffBase
from models.slide import SlideBase
from models.registry import ComponentRegistry
from utils.deck import find_current_slide


class CreateSlideArgs(ToolModel):
    tool_name: Literal["create_slide"] = Field(description="Create a new slide. Optionally copy style from an existing slide or another deck.")
    id: str = Field(description="UUID for the new slide")
    title: str = Field(description="Title of the new slide")
    content: str = Field(description="Main content for the new slide (text)")
    insert_after_slide_id: Optional[str] = Field(default=None, description="Insert after this slide id (if supported). Defaults to append.")
    style_from_slide_id: Optional[str] = Field(default=None, description="Copy style from an existing slide in this deck")
    style_from_deck_id: Optional[str] = Field(default=None, description="Copy style from a slide in another deck (cross-deck)")
    style_from_source_slide_id: Optional[str] = Field(default=None, description="The source slide id in the other deck when copying style across decks")


def _copy_slide_style(source_slide: Dict[str, Any], new_title: str, new_content: str) -> Dict[str, Any]:
    """Create a new slide dict by copying style/layout from source and replacing text content.
    Keeps Background and non-text components; For text components, preserves style/position but replaces text content.
    """
    new_slide: Dict[str, Any] = {
        "id": str(_uuid.uuid4()),
        "title": new_title,
        "components": []
    }
    components = list((source_slide or {}).get("components") or [])
    text_used = False
    for comp in components:
        ctype = (comp or {}).get("type")
        if not isinstance(comp, dict) or not ctype:
            continue
        ccopy = json.loads(json.dumps(comp))
        # Always generate new component id to avoid collisions
        ccopy["id"] = str(_uuid.uuid4())
        if ctype in ("TiptapTextBlock", "TextBlock", "Title"):
            # Replace textual content; keep styling/position
            props = ccopy.setdefault("props", {})
            if ctype == "TiptapTextBlock":
                # Simplistic mapping: put content into 'text' or 'content'
                # Many systems use HTML or rich content; place raw text to 'text'
                props["text"] = new_content if not text_used else props.get("text")
            elif ctype == "Title":
                props["text"] = new_title
            else:
                # TextBlock
                props["text"] = new_content if not text_used else props.get("text")
            text_used = True
        new_slide["components"].append(ccopy)
    # If no text component existed, add a basic TiptapTextBlock with rich texts[] segments
    if not text_used:
        new_slide["components"].append({
            "id": str(_uuid.uuid4()),
            "type": "TiptapTextBlock",
            "props": {
                # Split into intro + emphasis for better hierarchy by default
                "texts": [
                    {"text": (new_title + " - ") if new_title else "", "fontSize": 36, "fontWeight": "normal", "style": {"textColor": "#FFFFFFFF", "backgroundColor": "#00000000", "bold": False, "italic": False, "underline": False, "strike": False}},
                    {"text": new_content or "", "fontSize": 88, "fontWeight": "bold", "style": {"textColor": "#FFFFFFFF", "backgroundColor": "#00000000", "bold": True, "italic": False, "underline": False, "strike": False}}
                ],
                "position": {"x": 200, "y": 200},
                "width": 1520,
                "height": 480,
                "padding": 0,
                "backgroundColor": "#00000000",
                "alignment": "left",
                "verticalAlignment": "top",
                "lineHeight": 1.2
            }
        })
    return new_slide


def create_slide(args: CreateSlideArgs, registry: ComponentRegistry, deck_data: DeckBase, deck_diff: DeckDiff) -> DeckDiff:
    # Default: lightweight slide with Background + Text, then rely on style_slide later
    new_slide: Dict[str, Any] | None = None

    # Try style copy within current deck
    if args.style_from_slide_id:
        src = find_current_slide(deck_data, args.style_from_slide_id)
        if isinstance(src, dict):
            new_slide = _copy_slide_style(src, args.title, args.content)

    # Try cross-deck style copy
    if new_slide is None and args.style_from_deck_id and args.style_from_source_slide_id:
        try:
            from utils.supabase import get_deck as _get_deck
            src_deck = _get_deck(args.style_from_deck_id)
            if isinstance(src_deck, dict):
                for s in (src_deck.get("slides") or []):
                    if s.get("id") == args.style_from_source_slide_id:
                        new_slide = _copy_slide_style(s, args.title, args.content)
                        break
        except Exception:
            new_slide = None

    # Fallback minimal slide
    if new_slide is None:
        new_slide = {
            "id": args.id or str(_uuid.uuid4()),
            "title": args.title,
            "components": [
                {
                    "id": str(_uuid.uuid4()),
                    "type": "Background",
                    "props": {
                        "backgroundType": "gradient",
                        "gradient": {
                            "type": "linear",
                            "angle": 135,
                            "stops": [
                                {"color": "#0A0E27", "position": 0},
                                {"color": "#1A1F3A", "position": 100}
                            ]
                        }
                    }
                },
                {
                    "id": str(_uuid.uuid4()),
                    "type": "TiptapTextBlock",
                    "props": {
                        "text": args.content,
                        "position": {"x": 200, "y": 200},
                        "width": 1520,
                        "height": 480,
                        "lineHeight": 1.2
                    }
                }
            ]
        }
    # Enforce provided id
    new_slide["id"] = args.id or new_slide.get("id") or str(_uuid.uuid4())

    # Append (insertion index is applied by persistence layer if supported; otherwise append)
    deck_diff.deck_diff.slides_to_add.append(new_slide)
    return deck_diff


class DuplicateSlideArgs(ToolModel):
    tool_name: Literal["duplicate_slide"] = Field(description="Duplicate an existing slide. Optionally replace text content and title.")
    source_slide_id: str = Field(description="Slide id to duplicate")
    id: str = Field(description="UUID for the duplicated slide")
    new_title: Optional[str] = Field(default=None, description="Override title for the new slide")
    replace_text: Optional[str] = Field(default=None, description="Replace textual components' content with this text")
    copy_style_only: bool = Field(default=False, description="If true, keep layout/style but blank/replace text")


def duplicate_slide(args: DuplicateSlideArgs, registry: ComponentRegistry, deck_data: DeckBase, deck_diff: DeckDiff) -> DeckDiff:
    src = find_current_slide(deck_data, args.source_slide_id)
    if not isinstance(src, dict):
        return deck_diff
    title = args.new_title or src.get("title") or "Untitled"
    content = args.replace_text or ""
    if args.copy_style_only and not content:
        # Keep layout but blank out text
        content = ""
    new_slide = _copy_slide_style(src, title, content)
    new_slide["id"] = args.id or str(_uuid.uuid4())
    deck_diff.deck_diff.slides_to_add.append(new_slide)
    return deck_diff


class RemoveSlideArgs(ToolModel):
    tool_name: Literal["remove_slide"] = Field(description="Remove a slide by id")
    slide_id: str = Field(description="Slide id to remove")


def remove_slide(args: RemoveSlideArgs, registry: ComponentRegistry, deck_data: DeckBase, deck_diff: DeckDiff) -> DeckDiff:
    deck_diff.remove_slide(args.slide_id)
    return deck_diff


class InsertImageArgs(ToolModel):
    tool_name: Literal["insert_image"] = Field(description="Insert an image component into a slide. URL can be an uploaded Supabase URL.")
    slide_id: str = Field(description="Target slide id")
    id: str = Field(description="Component id for the new Image")
    image_url: str = Field(description="Public URL of the image (prefer Supabase storage URL)")
    x: Optional[float] = Field(default=200, description="x position in pixels")
    y: Optional[float] = Field(default=200, description="y position in pixels")
    width: Optional[float] = Field(default=960, description="Width in pixels")
    height: Optional[float] = Field(default=540, description="Height in pixels")
    object_fit: Optional[str] = Field(default="cover", description="CSS objectFit equivalent")


def insert_image(args: InsertImageArgs, registry: ComponentRegistry, deck_data: DeckBase, deck_diff: DeckDiff) -> DeckDiff:
    # Prefer typed component to avoid pydantic serialization warnings
    comp: Dict[str, Any] | Any = {
        "id": args.id,
        "type": "Image",
        "props": {
            "src": args.image_url,
            "position": {"x": args.x or 0, "y": args.y or 0},
            "width": args.width or 960,
            "height": args.height or 540,
            "objectFit": args.object_fit or "cover",
        }
    }
    try:
        if registry:
            Model = registry.get_component_model("Image")
            if Model:
                comp = Model(**comp)
    except Exception:
        # Fallback to plain dict
        pass
    deck_diff.add_component(args.slide_id, comp)  # type: ignore[arg-type]
    return deck_diff


class InsertAttachmentArgs(ToolModel):
    tool_name: Literal["insert_attachment"] = Field(description="Insert a previously uploaded attachment into a slide (image -> Image, CSV/XLSX -> Chart).")
    slide_id: str = Field(description="Target slide id")
    id: str = Field(description="New component id")
    url: str = Field(description="Public URL of the attachment in Supabase storage")
    mime_type: Optional[str] = Field(default=None, description="Attachment MIME type")
    title: Optional[str] = Field(default=None, description="Optional title for chart/image")


def _fetch_text(url: str, max_bytes: int = 1_000_000) -> Optional[str]:
    try:
        with urllib.request.urlopen(url) as resp:
            data = resp.read(max_bytes)
            return data.decode("utf-8", errors="ignore")
    except Exception:
        return None


def _fetch_bytes(url: str, max_bytes: int = 5_000_000) -> Optional[bytes]:
    try:
        with urllib.request.urlopen(url) as resp:
            return resp.read(max_bytes)
    except Exception:
        return None


def _default_colors(n: int) -> List[str]:
    base = [
        "#1565C0", "#2E7D32", "#C2185B", "#FF8F00", "#5E35B1",
        "#00838F", "#8E24AA", "#43A047", "#6D4C41", "#D81B60",
        "#1976D2", "#388E3C", "#F4511E", "#7B1FA2", "#0097A7"
    ]
    if n <= 0:
        return []
    colors = []
    for i in range(n):
        colors.append(base[i % len(base)])
    return colors


def _build_chart_from_csv(csv_text: str, title: Optional[str] = None) -> Dict[str, Any]:
    reader = csv.reader(io.StringIO(csv_text))
    rows = [r for r in reader if r]
    headers = rows[0] if rows else []
    data_rows = rows[1:11]  # limit
    # Simple categorical mapping: first column labels, second numeric value
    items: List[Dict[str, Any]] = []
    for r in data_rows:
        if len(r) < 2:
            continue
        name = str(r[0])
        try:
            value = float(r[1])
        except Exception:
            try:
                value = float(str(r[1]))
            except Exception:
                continue
        items.append({"name": name, "value": value})

    colors = _default_colors(len(items))
    for idx, item in enumerate(items):
        item["color"] = colors[idx]

    comp = {
        "id": str(_uuid.uuid4()),
        "type": "Chart",
        "props": {
            # Registry expects flat props, no nested chartjs config
            "position": {"x": 200, "y": 200},
            "width": 1200,
            "height": 600,
            "chartType": "bar",
            "data": items,
            "colors": colors,
            # Provide axis labels from headers when available; left axis is critical by default
            "xAxisLabel": (str(headers[0]).strip() if headers and len(headers) >= 1 else ""),
            "yAxisLabel": (str(headers[1]).strip() if headers and len(headers) >= 2 else "Value"),
        },
    }
    return comp


def _build_chart_from_excel(xlsx_bytes: bytes, title: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """Parse a simple Excel worksheet into a Chart component.
    - Uses the first sheet
    - Assumes first row is headers
    - Uses first column as labels and second as numeric values
    - Chooses 'line' chart if header suggests dates, else 'bar'
    """
    try:
        import openpyxl  # type: ignore
    except Exception:
        return None

    try:
        wb = openpyxl.load_workbook(BytesIO(xlsx_bytes), read_only=True, data_only=True)
        ws = wb.active
        rows: List[List[Any]] = []
        for row in ws.iter_rows(values_only=True):
            # Keep rows that have at least one non-empty value
            if any(cell is not None and cell != "" for cell in row):
                rows.append([cell for cell in row])
        if len(rows) < 2:
            return None
        headers = [str(h) if h is not None else "" for h in (rows[0] or [])]
        data_rows = rows[1:51]  # cap for safety

        # Use first two columns
        items: List[Dict[str, Any]] = []
        for r in data_rows:
            if len(r) < 2:
                continue
            label_val = r[0]
            num_val = r[1]
            try:
                label_str = str(label_val) if label_val is not None else ""
                num_float = float(num_val) if num_val is not None and str(num_val).strip() != "" else None
            except Exception:
                label_str = str(label_val) if label_val is not None else ""
                num_float = None
            if num_float is None:
                # Try to coerce integers stored as strings
                try:
                    num_float = float(str(num_val)) if num_val is not None else None
                except Exception:
                    num_float = None
            if num_float is None:
                continue
            items.append({"name": label_str, "value": num_float})

        if not items:
            return None

        first_header = (headers[0] or "").lower() if headers else ""
        chart_type = "line" if "date" in first_header else "bar"

        colors = _default_colors(len(items))
        for idx, item in enumerate(items):
            item["color"] = colors[idx]

        comp = {
            "id": str(_uuid.uuid4()),
            "type": "Chart",
            "props": {
                "position": {"x": 200, "y": 200},
                "width": 1200,
                "height": 600,
                "chartType": chart_type,
                "data": items,
                "colors": colors,
                "xAxisLabel": (headers[0] if headers else ""),
                "yAxisLabel": (headers[1] if len(headers) > 1 else "Value"),
            },
        }
        return comp
    except Exception:
        return None


def _as_typed_component(component: Dict[str, Any], registry: ComponentRegistry):
    """Attempt to instantiate a typed component from the registry to avoid serialization warnings."""
    try:
        if not registry:
            return component
        type_name = (component or {}).get("type")
        if not type_name:
            return component
        Model = registry.get_component_model(type_name)
        if not Model:
            return component
        return Model(**component)
    except Exception:
        return component


def insert_attachment(args: InsertAttachmentArgs, registry: ComponentRegistry, deck_data: DeckBase, deck_diff: DeckDiff) -> DeckDiff:
    mt = (args.mime_type or "").lower()
    if mt.startswith("image/"):
        # Delegate to insert_image using provided URL
        img_args = InsertImageArgs(
            tool_name="insert_image",
            slide_id=args.slide_id,
            id=args.id,
            image_url=args.url
        )
        return insert_image(img_args, registry, deck_data, deck_diff)
    # Attempt simple CSV ingestion from URL
    if mt in ("text/csv", "application/csv") or args.url.lower().endswith(".csv"):
        csv_text = _fetch_text(args.url)
        if csv_text:
            chart_comp = _build_chart_from_csv(csv_text, args.title)
            chart_comp["id"] = args.id
            deck_diff.add_component(args.slide_id, _as_typed_component(chart_comp, registry))  # type: ignore[arg-type]
            return deck_diff
    # Excel (.xlsx) ingestion from URL
    if (
        mt in (
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "application/vnd.ms-excel",
        )
        or args.url.lower().endswith(".xlsx")
    ):
        xbytes = _fetch_bytes(args.url)
        if xbytes:
            chart_comp = _build_chart_from_excel(xbytes, args.title)
            if chart_comp:
                chart_comp["id"] = args.id
                deck_diff.add_component(args.slide_id, _as_typed_component(chart_comp, registry))  # type: ignore[arg-type]
                return deck_diff
    # Default: create a link-like TextBlock pointing to the attachment
    fallback = {
        "id": args.id,
        "type": "TextBlock",
        "props": {
            "text": args.title or "Attachment",
            "link": args.url,
            "position": {"x": 200, "y": 200},
            "width": 800,
            "height": 200,
        },
    }
    deck_diff.add_component(args.slide_id, _as_typed_component(fallback, registry))  # type: ignore[arg-type]
    return deck_diff


# Helper model builders for orchestrator selectable args
def get_create_slide_model(slide_ids: List[str]) -> BaseModel:
    # Literal constraints on dynamic lists can be problematic; keep it open and rely on prompt context
    return create_model(
        "CreateSlide",
        __base__=CreateSlideArgs,
        insert_after_slide_id=(Optional[str], Field(default=None, description="Insert after this slide id"))
    )


def get_duplicate_slide_model(slide_ids: List[str]) -> BaseModel:
    return create_model(
        "DuplicateSlide",
        __base__=DuplicateSlideArgs,
        source_slide_id=(str, Field(description="Slide id to duplicate"))
    )



