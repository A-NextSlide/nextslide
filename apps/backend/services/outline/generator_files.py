import os
from typing import Any, Dict, List, Optional

from .file_processing_utils import (
    append_pptx_titles_to_prompt,
    extract_pptx_outlines,
    filter_assistant_files,
    scan_files,
)
from .models import OutlineOptions, SlideContent, ProgressUpdate
from agents.generation.file_processor import create_file_processor
from setup_logging_optimized import get_logger

logger = get_logger(__name__)


class OutlineGeneratorFileMixin:

    async def _process_files(self, options: OutlineOptions, progress_callback=None) -> Optional[dict]:
        """Process files and return extracted information."""
        if not options.files:
            return None

        logger.info("Processing %s uploaded files (non-streaming)", len(options.files))
        scan = scan_files(options.files)

        if progress_callback:
            await self._call_progress(progress_callback, ProgressUpdate(
                stage="processing_files", message="Processing uploaded files...", progress=10
            ))

        use_openai_assistant = self._should_use_openai_assistant(scan.assistant_eligible)
        if use_openai_assistant:
            result = await self._process_files_with_assistant(options, progress_callback)
            if result:
                if scan.has_images:
                    vision_result = await self._process_images_with_vision(options, progress_callback)
                    self._merge_processing_results(result, vision_result)
                self._apply_pptx_outlines(result, scan.pptx_files, options)
                return result

        if scan.has_images:
            result = await self._process_images_with_vision(options, None)
            if result:
                self._apply_pptx_outlines(result, scan.pptx_files, options)
                return result

        processed_files = await self._process_files_with_processor(options)
        self._apply_pptx_outlines(processed_files, scan.pptx_files, options)
        return processed_files

    async def _process_files_streaming(self, options: OutlineOptions):
        """Process files with streaming updates."""
        if not options.files:
            return None

        logger.info("Processing %s uploaded files (streaming)", len(options.files))
        scan = scan_files(options.files)

        use_openai_assistant = self._should_use_openai_assistant(scan.assistant_eligible)
        if use_openai_assistant:
            result = await self._process_files_with_assistant(options, None)
            if result:
                if scan.has_images:
                    vision_result = await self._process_images_with_vision(options, None)
                    self._merge_processing_results(result, vision_result)
                self._apply_pptx_outlines(result, scan.pptx_files, options)
                return result

        if scan.has_images:
            result = await self._process_images_with_vision(options, None)
            if result:
                self._apply_pptx_outlines(result, scan.pptx_files, options)
                return result

        processed_files = await self._process_files_with_processor(options)
        self._apply_pptx_outlines(processed_files, scan.pptx_files, options)
        return processed_files

    def _should_use_openai_assistant(self, assistant_eligible: bool) -> bool:
        assistant_id = os.getenv("OPENAI_ASSISTANT_ID")
        api_key = os.getenv("OPENAI_API_KEY")
        if not assistant_eligible:
            return False
        if not (assistant_id and api_key and assistant_id.startswith("asst_")):
            return False
        return True

    async def _process_files_with_assistant(self, options: OutlineOptions, progress_callback=None) -> Optional[dict]:
        try:
            from services.openai_service import OpenAIService

            files_for_assistant = filter_assistant_files(options.files)
            if not files_for_assistant:
                logger.warning("No assistant-eligible files after filtering")
                return None

            openai_service = OpenAIService()
            on_progress = None
            if progress_callback:
                on_progress = lambda msg: logger.info("OpenAI Processing: %s", msg)

            logger.info("Processing files with OpenAI Assistant API")
            result = await openai_service._process_files_with_assistant(
                files_for_assistant,
                options.prompt,
                on_progress=on_progress,
            )
            self._append_file_context(options, result)
            return result
        except Exception as exc:
            logger.error("OpenAI Assistant processing failed: %s", exc)
            return None

    async def _process_images_with_vision(self, options: OutlineOptions, progress_callback=None) -> Optional[dict]:
        try:
            from services.openai_service import OpenAIService

            image_files = [f for f in options.files if (f.get("type") or "").startswith("image/")]
            if not image_files:
                return None

            openai_service = OpenAIService()
            on_progress = None
            if progress_callback:
                on_progress = lambda msg: logger.info("Vision Processing: %s", msg)

            logger.info("Processing %s images with Vision API", len(image_files))
            result = await openai_service._process_images_with_vision(
                image_files,
                options.prompt,
                on_progress=on_progress,
            )
            self._append_file_context(options, result, prefix="\n\n")
            return result
        except Exception as exc:
            logger.error("Vision API processing failed: %s", exc)
            return None

    def _append_file_context(self, options: OutlineOptions, result: Optional[dict], prefix: str = "") -> None:
        if not result:
            return
        file_context = result.get("file_context")
        if file_context:
            options.prompt += f"{prefix}{file_context}"

    def _merge_processing_results(self, primary: dict, secondary: Optional[dict]) -> dict:
        if not secondary:
            return primary
        for key in ("images", "data_files", "extracted_data"):
            if secondary.get(key):
                primary[key] = (primary.get(key) or []) + secondary[key]
        if secondary.get("file_context"):
            merged = (primary.get("file_context") or "").strip()
            if merged:
                merged += "\n\n"
            merged += secondary["file_context"]
            primary["file_context"] = merged
        return primary

    def _apply_pptx_outlines(self, result: dict, pptx_files: list, options: OutlineOptions) -> None:
        if not pptx_files:
            return
        pptx_outlines = extract_pptx_outlines(pptx_files)
        if pptx_outlines:
            result["pptx_outlines"] = pptx_outlines
            options.prompt = append_pptx_titles_to_prompt(options.prompt, pptx_outlines)

    async def _process_files_with_processor(self, options: OutlineOptions) -> dict:
        model_type = "openai" if "gpt" in self._get_model("planning", options).lower() else "gemini"
        file_processor = create_file_processor(model_type)
        processed_files = await file_processor.process_files(options.files, options.prompt)
        self._append_file_context(options, processed_files)
        return processed_files

    async def _process_media_and_charts(self, slides: list[SlideContent], processed_files: dict, options: OutlineOptions) -> list[SlideContent]:
        """Process media assignments and attach extracted data summaries."""
        logger.info("[PROCESS MEDIA] Starting with %s slides", len(slides))
        
        # Check if any slides already have tagged media (from streaming)
        has_existing_media = any(slide.taggedMedia for slide in slides)
        if has_existing_media:
            logger.info("[PROCESS MEDIA] Some slides already have tagged media, skipping re-assignment")
        
        if processed_files and not has_existing_media:
            # Use AI-based media assignment only if no media assigned yet
            model = self._get_model("content", options)
            await self.media_manager.assign_media_to_slides_with_ai(slides, processed_files, model)
        
        if processed_files and processed_files.get("images"):
            tagged_count = sum(1 for slide in slides if slide.taggedMedia)
            logger.info("[PROCESS MEDIA] Tagged media on %s/%s slides", tagged_count, len(slides))
        
        if processed_files and processed_files.get("extracted_data"):
            self._attach_extracted_data_summaries(slides, processed_files["extracted_data"])
        
        return slides

    def _attach_extracted_data_summaries(self, slides: list[SlideContent], extracted_data: List[Dict[str, Any]]) -> None:
        """Attach a single extracted-data summary to slides that lack chart or manual data."""
        for slide in slides:
            manual_charts = getattr(slide, "manualCharts", None)
            has_manual_charts = isinstance(manual_charts, list) and len(manual_charts) > 0
            if slide.extractedData or has_manual_charts:
                continue
            for data_item in extracted_data:
                if isinstance(data_item, dict) and "summary" in data_item:
                    slide.extractedData = {
                        "source": "Extracted from uploaded file",
                        "summary": data_item["summary"],
                        "keyMetrics": data_item.get("keyMetrics", {}),
                        "metadata": {"source": "Extracted from uploaded file"},
                    }
                    logger.info("Added extracted data summary to slide: %s", slide.title)
                    break
