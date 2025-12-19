import asyncio
import json
import time
import uuid
import os
import re
from typing import Dict, Any, Optional, List, AsyncGenerator, Tuple

from dotenv import load_dotenv

from .models import (
    OutlineOptions, OutlineResult, SlideContent,
    ProgressUpdate, ChartData
)
from .planner import OutlinePlanner
from .slide_generator import SlideGenerator
from .chart_generator import ChartGenerator
from .media_manager import MediaManager
from .chart_normalization import normalize_slide_chart_fields
from agents.ai.clients import get_client, invoke
from agents.config import (
    OUTLINE_PLANNING_MODEL, OUTLINE_CONTENT_MODEL,
    OUTLINE_RESEARCH_MODEL,
    USE_PERPLEXITY_FOR_OUTLINE, PERPLEXITY_OUTLINE_MODEL,
    PRESENTATION_OUTLINE_MODEL, USE_HYBRID_RESEARCH_MODE
)
from agents.research import OutlineResearchAgent
from agents import config as agents_config
from agents.ai.clients import get_max_tokens_for_model
from services.openai_service import OpenAIService
from agents.generation.file_processor import create_file_processor
from setup_logging_optimized import get_logger
from services.pptx_text_extractor import extract_pptx_text_from_bytes
from .generator_utils import extract_image_prompt_from_content

logger = get_logger(__name__)


class OutlineGeneratorFileMixin:

    async def _process_files(self, options: OutlineOptions, progress_callback=None) -> Optional[dict]:
        """Process files and return extracted information"""
        logger.info(f"=== _process_files CALLED (non-streaming) ===")
        logger.info(f"Number of files: {len(options.files) if options.files else 0}")
        
        if not options.files:
            return None
        
        # Define these outside the try block for broader scope
        has_complex_files = any(
            file_info.get('type', '').startswith(('application/', 'text/csv')) or
            file_info.get('name', '').lower().endswith(('.xlsx', '.xls', '.csv', '.pdf', '.pptx', '.ppt'))
            for file_info in options.files
        )
        has_images = any(
            file_info.get('type', '').startswith('image/') 
            for file_info in options.files
        )
        # Treat PPTX as handled by our internal parser, not the Assistant
        try:
            pptx_files_list = [f for f in options.files if (f.get('name','').lower().endswith(('.pptx','.ppt')) or 'presentation' in f.get('type',''))]
        except Exception:
            pptx_files_list = []
        has_pptx_files = bool(pptx_files_list)
        # Only spreadsheets and PDFs are Assistant-eligible
        def _is_spreadsheet_or_csv(ftype: str, fname: str) -> bool:
            fname_l = (fname or '').lower()
            return (
                ftype in (
                    'text/csv',
                    'application/vnd.ms-excel',
                    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                )
                or fname_l.endswith(('.csv', '.xlsx', '.xls'))
            )
        def _is_pdf(ftype: str, fname: str) -> bool:
            return ftype == 'application/pdf' or (fname or '').lower().endswith('.pdf')
        assistant_eligible = any(
            _is_spreadsheet_or_csv(f.get('type',''), f.get('name','')) or _is_pdf(f.get('type',''), f.get('name',''))
            for f in options.files
        )
        
        if progress_callback:
            await self._call_progress(progress_callback, ProgressUpdate(
                stage="processing_files", message="Processing uploaded files...", progress=10
            ))
        
        # Check if we should use OpenAI Assistant for file processing
        use_openai_assistant = False
        try:
            import os
            assistant_id = os.getenv('OPENAI_ASSISTANT_ID')
            api_key = os.getenv('OPENAI_API_KEY')
            
            print(f"[ENV CHECK] assistant_id={assistant_id[:10] + '...' if assistant_id else None}, api_key={'set' if api_key else 'not set'}")
            
            logger.info(f"Checking OpenAI Assistant: assistant_id={assistant_id[:10] + '...' if assistant_id else None}, "
                        f"api_key={'set' if api_key else 'not set'}")
            
            # Use OpenAI Assistant if configured and we have complex files
            if assistant_id and api_key and assistant_id.startswith('asst_'):
                print(f"[ASSISTANT CHECK] Passed initial check (has ID and key)")
                
                print(f"[FILE CHECK] has_complex_files={has_complex_files}, has_images={has_images}")
                
                logger.info(f"Files check: {len(options.files)} files, "
                           f"has_complex_files={has_complex_files}, has_images={has_images}")
                logger.info(f"File types: {[f.get('type', 'unknown') for f in options.files]}")
                
                # Only use OpenAI Assistant for complex files (Excel, CSV, PDF)
                # Images need to be handled differently due to Assistant API limitations
                if has_complex_files:
                    use_openai_assistant = True
                    print(f"[DECISION] Using OpenAI Assistant!")
                    logger.info("Using OpenAI Assistant for file processing (complex files detected)")
                else:
                    print(f"[DECISION] NOT using OpenAI Assistant (images will use vision API)")
            else:
                print(f"[ASSISTANT CHECK] Failed initial check - assistant_id={bool(assistant_id)}, api_key={bool(api_key)}, starts_with_asst={assistant_id.startswith('asst_') if assistant_id else False}")
        except Exception as e:
            print(f"[ERROR] Exception in OpenAI Assistant check: {e}")
            logger.warning(f"Error checking OpenAI Assistant availability: {e}")
        
        print(f"[FINAL DECISION] use_openai_assistant = {use_openai_assistant}")
        
        # If we should use OpenAI Assistant, delegate to OpenAI service
        if use_openai_assistant:
            try:
                from services.openai_service import OpenAIService, GenerateOutlineOptions
                
                openai_service = OpenAIService()
                
                # Create options for OpenAI service
                # Map 'standard' to 'detailed' since OpenAI only accepts 'quick' or 'detailed'
                openai_detail_level = 'detailed' if options.detail_level == 'standard' else options.detail_level
                
                # Filter out image files if we have mixed content
                files_for_assistant = options.files
                if has_complex_files and has_images:
                    # Only send non-image files to Assistant
                    files_for_assistant = [
                        f for f in options.files 
                        if not f.get('type', '').startswith('image/')
                    ]
                    print(f"[FILTER] Sending {len(files_for_assistant)} non-image files to Assistant (filtered from {len(options.files)} total)")
                # Always exclude PPTX from Assistant processing; we'll parse those locally
                files_for_assistant = [
                    f for f in files_for_assistant
                    if not (f.get('name','').lower().endswith(('.pptx','.ppt')) or 'presentation' in (f.get('type','') or '').lower())
                ]
                
                # Exclude PPTX from assistant processing; we'll parse those locally
                if assistant_eligible:
                    files_for_assistant = [
                        f for f in files_for_assistant
                        if not (f.get('name','').lower().endswith(('.pptx','.ppt')) or 'presentation' in f.get('type',''))
                    ]
                
                openai_options = GenerateOutlineOptions(
                    prompt=options.prompt,
                    files=files_for_assistant,
                    detailLevel=openai_detail_level,
                    styleContext={'context': options.style_context} if options.style_context else None,
                    fontPreference=options.font_preference,
                    colorPreference=options.color_scheme if options.color_scheme else None
                )
                
                # Use a simpler progress callback if provided
                simple_progress = lambda msg: logger.info(f"OpenAI Processing: {msg}") if progress_callback else None
                
                # Process files using OpenAI Assistant
                logger.info("Processing files with OpenAI Assistant API...")
                result = await openai_service._process_files_with_assistant(
                    files_for_assistant, 
                    options.prompt,
                    on_progress=simple_progress
                )
                
                logger.info(f"OpenAI Assistant processed: {len(result.get('images', []))} images, "
                          f"{len(result.get('data_files', []))} data files, "
                          f"{len(result.get('extracted_data', []))} extracted data items")
                
                # Augment prompt with insights from OpenAI processing
                if result.get('file_context'):
                    options.prompt += result['file_context']
                
                # If we have mixed files, we also need to process images separately
                if has_complex_files and has_images:
                    logger.info("Processing images separately with Vision API...")
                    try:
                        # Filter image files
                        image_files = [f for f in options.files if f.get('type', '').startswith('image/')]
                        
                        # Process images with vision
                        vision_result = await openai_service._process_images_with_vision(
                            image_files,
                            options.prompt,
                            on_progress=lambda msg: logger.info(f"Vision Processing: {msg}") if progress_callback else None
                        )
                        
                        # Merge results
                        if vision_result.get('images'):
                            result['images'] = result.get('images', []) + vision_result['images']
                        if vision_result.get('file_context'):
                            options.prompt += f"\n\n{vision_result['file_context']}"
                            result['file_context'] = result.get('file_context', '') + f"\n\n{vision_result['file_context']}"
                            
                    except Exception as e:
                        logger.error(f"Failed to process images with Vision API: {e}")
                
                # Attach PPTX outlines (from original input files) before returning
                try:
                    pptx_outlines = []
                    pptx_files = [f for f in options.files if (f.get('name','').lower().endswith(('.pptx','.ppt')) or 'presentation' in f.get('type',''))]
                    if pptx_files:
                        logger.info(f"[PPTX] Extracting text (streaming) from {len(pptx_files)} PPTX file(s)")
                        import base64
                        for f in pptx_files:
                            content = f.get('content')
                            if isinstance(content, str):
                                b64 = content.split(';base64,', 1)[1] if content.startswith('data:') and ';base64,' in content else content
                                file_bytes = base64.b64decode(b64)
                            else:
                                file_bytes = content or b""
                            if file_bytes:
                                extracted = extract_pptx_text_from_bytes(file_bytes)
                                pptx_outlines.append({
                                    'filename': f.get('name','presentation.pptx'),
                                    'slides': extracted.get('slides', []),
                                    'slide_count': extracted.get('slide_count', 0)
                                })
                    if pptx_outlines:
                        result['pptx_outlines'] = pptx_outlines
                        # Lightly add titles to prompt
                        titles = [s.get('title','') for s in pptx_outlines[0].get('slides', []) if s.get('title')]
                        if titles:
                            options.prompt += "\n\nPPTX Slides Detected (titles):\n- " + "\n- ".join(titles[:12])
                except Exception:
                    pass

                return result
                
            except Exception as e:
                import traceback
                error_details = traceback.format_exc()
                print(f"[OPENAI ERROR - non-streaming] Failed to use OpenAI Assistant: {type(e).__name__}: {e}")
                print(f"[OPENAI ERROR - non-streaming] Full traceback:\n{error_details}")
                logger.error(f"Failed to use OpenAI Assistant, falling back to simple processor: {e}")
                logger.error(f"Traceback: {error_details}")
                # Fall through to simple processor
        
        # Check if we have images that need Vision API processing
        if has_images and not use_openai_assistant:
            try:
                from services.openai_service import OpenAIService
                
                print(f"[VISION] Processing {len(options.files)} images with Vision API")
                logger.info("Processing images with Vision API...")
                
                openai_service = OpenAIService()
                
                # Filter image files
                image_files = [f for f in options.files if f.get('type', '').startswith('image/')]
                
                # Process images with vision
                result = await openai_service._process_images_with_vision(
                    image_files,
                    options.prompt,
                    on_progress=None
                )
                
                logger.info(f"Vision API analyzed {len(image_files)} images")
                
                # Augment prompt with image analysis
                if result.get('file_context'):
                    print(f"[VISION] Adding image analysis to prompt")
                    options.prompt += f"\n\n{result['file_context']}"
                
                # Attach PPTX outlines before returning
                try:
                    pptx_outlines = []
                    pptx_files = [f for f in options.files if (f.get('name','').lower().endswith(('.pptx','.ppt')) or 'presentation' in f.get('type',''))]
                    if pptx_files:
                        logger.info(f"[PPTX] Extracting text (streaming-vision) from {len(pptx_files)} PPTX file(s)")
                        import base64
                        for f in pptx_files:
                            content = f.get('content')
                            if isinstance(content, str):
                                b64 = content.split(';base64,', 1)[1] if content.startswith('data:') and ';base64,' in content else content
                                file_bytes = base64.b64decode(b64)
                            else:
                                file_bytes = content or b""
                            if file_bytes:
                                extracted = extract_pptx_text_from_bytes(file_bytes)
                                pptx_outlines.append({
                                    'filename': f.get('name','presentation.pptx'),
                                    'slides': extracted.get('slides', []),
                                    'slide_count': extracted.get('slide_count', 0)
                                })
                    if pptx_outlines:
                        result['pptx_outlines'] = pptx_outlines
                        titles = [s.get('title','') for s in pptx_outlines[0].get('slides', []) if s.get('title')]
                        if titles:
                            options.prompt += "\n\nPPTX Slides Detected (titles):\n- " + "\n- ".join(titles[:12])
                except Exception:
                    pass

                return result
                
            except Exception as e:
                logger.error(f"Failed to process images with Vision API: {e}")
                # Fall through to simple processor
        
        # Check for PPTX uploads and extract slide text upfront
        try:
            pptx_files = [f for f in options.files if (f.get('name','').lower().endswith(('.pptx','.ppt')) or 'presentation' in f.get('type',''))]
        except Exception:
            pptx_files = []

        pptx_outlines = []
        if pptx_files:
            logger.info(f"[PPTX] Extracting text from {len(pptx_files)} PPTX file(s) for outline grounding")
            for f in pptx_files:
                try:
                    content = f.get('content')
                    if isinstance(content, str):
                        # Assume base64 data URL or base64
                        import base64
                        if content.startswith('data:') and ';base64,' in content:
                            b64 = content.split(';base64,', 1)[1]
                        else:
                            b64 = content
                        file_bytes = base64.b64decode(b64)
                    else:
                        file_bytes = content or b""
                    if file_bytes:
                        extracted = extract_pptx_text_from_bytes(file_bytes)
                        pptx_outlines.append({
                            'filename': f.get('name','presentation.pptx'),
                            'slides': extracted.get('slides', []),
                            'slide_count': extracted.get('slide_count', 0)
                        })
                except Exception as e:
                    logger.warning(f"[PPTX] Failed extracting text: {e}")

        # Default: Process files with simple processor (only if not handled above)
        print(f"[FALLBACK] Using simple file processor for {options.model or 'unknown'} model")
        model_type = "openai" if "gpt" in self._get_model("planning", options).lower() else "gemini"
        file_processor = create_file_processor(model_type)
        processed_files = await file_processor.process_files(options.files, options.prompt)

        # Attach pptx outlines for downstream consumers (planner/slide generator)
        if pptx_outlines:
            try:
                processed_files['pptx_outlines'] = pptx_outlines
                # Also augment prompt lightly so planning sees context
                for deck in pptx_outlines[:1]:
                    titles = [s.get('title','') for s in deck.get('slides', []) if s.get('title')]
                    if titles:
                        options.prompt += "\n\nPPTX Slides Detected (titles):\n- " + "\n- ".join(titles[:12])
            except Exception:
                pass
        
        # Log processing results
        logger.info(f"Processed {len(options.files)} files: "
                   f"{len(processed_files['images'])} images, "
                   f"{len(processed_files['data_files'])} data files")
        
        # Augment prompt with file context
        if processed_files['file_context']:
            options.prompt += processed_files['file_context']
        
        return processed_files

    async def _process_files_streaming(self, options: OutlineOptions):
        """Process files with streaming updates - generator"""
        logger.debug(f"[GENERATOR] _process_files_streaming called with {len(options.files) if options.files else 0} files")
        logger.info(f"=== _process_files_streaming CALLED ===")
        logger.info(f"Number of files: {len(options.files) if options.files else 0}")
        
        if not options.files:
            return None
        
        # Define these outside the try block for broader scope
        has_complex_files = any(
            file_info.get('type', '').startswith(('application/', 'text/csv')) or
            file_info.get('name', '').lower().endswith(('.xlsx', '.xls', '.csv', '.pdf', '.pptx', '.ppt'))
            for file_info in options.files
        )
        has_images = any(
            file_info.get('type', '').startswith('image/') 
            for file_info in options.files
        )
        
        # Determine PPTX files and Assistant eligibility BEFORE the try block
        try:
            pptx_files_list = [
                f for f in options.files
                if (f.get('name','').lower().endswith(('.pptx','.ppt')) or 'presentation' in (f.get('type','') or '').lower())
            ]
        except Exception:
            pptx_files_list = []
        has_pptx_files = bool(pptx_files_list)
        
        def _is_spreadsheet_or_csv(ftype: str, fname: str) -> bool:
            fname_l = (fname or '').lower()
            return (
                ftype in (
                    'text/csv',
                    'application/vnd.ms-excel',
                    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                )
                or fname_l.endswith(('.csv', '.xlsx', '.xls'))
            )
        def _is_pdf(ftype: str, fname: str) -> bool:
            return ftype == 'application/pdf' or (fname or '').lower().endswith('.pdf')
        assistant_eligible = any(
            _is_spreadsheet_or_csv(f.get('type',''), f.get('name','')) or _is_pdf(f.get('type',''), f.get('name',''))
            for f in options.files
        )
        
        # Check if we should use OpenAI Assistant for file processing
        use_openai_assistant = False
        try:
            import os
            assistant_id = os.getenv('OPENAI_ASSISTANT_ID')
            api_key = os.getenv('OPENAI_API_KEY')
            
            logger.debug(f"[ENV CHECK] assistant_id={assistant_id[:10] + '...' if assistant_id else None}, api_key={'set' if api_key else 'not set'}")
            
            logger.info(f"Checking OpenAI Assistant: assistant_id={assistant_id[:10] + '...' if assistant_id else None}, "
                        f"api_key={'set' if api_key else 'not set'}")
            
            # Use OpenAI Assistant if configured and we have assistant-eligible files (NOT PPTX)
            if assistant_id and api_key and assistant_id.startswith('asst_'):
                logger.debug("[ASSISTANT CHECK] Passed initial check (has ID and key)")
                
                logger.debug(f"[FILE CHECK] has_complex_files={has_complex_files}, has_images={has_images}")
                
                logger.info(f"Files check: {len(options.files)} files, "
                           f"has_complex_files={has_complex_files}, has_images={has_images}")
                logger.info(f"File types: {[f.get('type', 'unknown') for f in options.files]}")
                
                # Only use OpenAI Assistant for spreadsheets/CSVs/PDFs, never for PPTX
                # Images need to be handled differently due to Assistant API limitations
                if assistant_eligible:
                    use_openai_assistant = True
                    logger.info("[DECISION] Using OpenAI Assistant!")
                    logger.info("Using OpenAI Assistant for file processing (complex files detected)")
                else:
                    logger.debug("[DECISION] NOT using OpenAI Assistant (images will use vision API)")
            else:
                logger.debug(f"[ASSISTANT CHECK] Failed initial check - assistant_id={bool(assistant_id)}, api_key={bool(api_key)}, starts_with_asst={assistant_id.startswith('asst_') if assistant_id else False}")
        except Exception as e:
            logger.warning(f"Error checking OpenAI Assistant availability: {e}")
        
        # If we should use OpenAI Assistant, delegate to OpenAI service
        if use_openai_assistant:
            logger.debug("[OPENAI PATH] Entering OpenAI Assistant processing block")
            try:
                from services.openai_service import OpenAIService, GenerateOutlineOptions
                
                openai_service = OpenAIService()
                logger.debug("[OPENAI PATH] OpenAIService instance created")
                
                # Create options for OpenAI service
                # Map 'standard' to 'detailed' since OpenAI only accepts 'quick' or 'detailed'
                openai_detail_level = 'detailed' if options.detail_level == 'standard' else options.detail_level
                
                # Filter out image files if we have mixed content
                files_for_assistant = options.files
                if has_complex_files and has_images:
                    # Only send non-image files to Assistant
                    files_for_assistant = [
                        f for f in options.files 
                        if not f.get('type', '').startswith('image/')
                    ]
                    print(f"[FILTER] Sending {len(files_for_assistant)} non-image files to Assistant (filtered from {len(options.files)} total)")
                
                openai_options = GenerateOutlineOptions(
                    prompt=options.prompt,
                    files=files_for_assistant,
                    detailLevel=openai_detail_level,
                    styleContext={'context': options.style_context} if options.style_context else None,
                    fontPreference=options.font_preference,
                    colorPreference=options.color_scheme if options.color_scheme else None
                )
                logger.debug("[OPENAI PATH] GenerateOutlineOptions created")
                
                # Process files using OpenAI Assistant
                logger.info("Processing files with OpenAI Assistant API (streaming)...")
                logger.debug(f"[OPENAI PATH] About to call _process_files_with_assistant")
                result = await openai_service._process_files_with_assistant(
                    files_for_assistant, 
                    options.prompt,
                    on_progress=None  # Streaming already provides progress
                )
                logger.debug(f"[OPENAI PATH] _process_files_with_assistant returned: {list(result.keys()) if result else None}")
                
                logger.info(f"OpenAI Assistant processed: {len(result.get('images', []))} images, "
                          f"{len(result.get('data_files', []))} data files, "
                          f"{len(result.get('extracted_data', []))} extracted data items")
                
                # Augment prompt with insights from OpenAI processing
                if result.get('file_context'):
                    logger.debug(f"[OPENAI PATH] Adding file context to prompt: {len(result['file_context'])} chars")
                    logger.debug("[OPENAI PATH] File context preview:")
                    logger.debug(result['file_context'][:500] + "..." if len(result['file_context']) > 500 else result['file_context'])
                    options.prompt += result['file_context']
                    logger.debug(f"[OPENAI PATH] Updated prompt length: {len(options.prompt)} chars")

                # Always attach PPTX outlines using our internal parser when PPTX files are present
                try:
                    if has_pptx_files:
                        logger.info(f"[PPTX] Extracting text (streaming-assistant) from {len(pptx_files_list)} PPTX file(s)")
                        import base64
                        pptx_outlines = []
                        for f in pptx_files_list:
                            content = f.get('content')
                            if isinstance(content, str):
                                b64 = content.split(';base64,', 1)[1] if content.startswith('data:') and ';base64,' in content else content
                                file_bytes = base64.b64decode(b64)
                            else:
                                file_bytes = content or b""
                            if file_bytes:
                                extracted = extract_pptx_text_from_bytes(file_bytes)
                                pptx_outlines.append({
                                    'filename': f.get('name','presentation.pptx'),
                                    'slides': extracted.get('slides', []),
                                    'slide_count': extracted.get('slide_count', 0)
                                })
                        if pptx_outlines:
                            result['pptx_outlines'] = pptx_outlines
                            titles = [s.get('title','') for s in pptx_outlines[0].get('slides', []) if s.get('title')]
                            if titles:
                                options.prompt += "\n\nPPTX Slides Detected (titles):\n- " + "\n- ".join(titles[:12])
                except Exception:
                    pass
                
                # If we have mixed files, we also need to process images separately
                if assistant_eligible and has_images:
                    logger.info("[MIXED FILES] Now processing images with Vision API")
                    try:
                        # Filter image files
                        image_files = [f for f in options.files if f.get('type', '').startswith('image/')]
                        logger.info(f"[VISION] Processing {len(image_files)} images with Vision API")
                        
                        # Process images with vision
                        vision_result = await openai_service._process_images_with_vision(
                            image_files,
                            options.prompt,
                            on_progress=None
                        )
                        
                        # Merge results
                        if vision_result.get('images'):
                            result['images'] = result.get('images', []) + vision_result['images']
                        if vision_result.get('file_context'):
                            logger.info("[VISION] Adding image analysis to prompt")
                            options.prompt += f"\n\n{vision_result['file_context']}"
                            result['file_context'] = result.get('file_context', '') + f"\n\n{vision_result['file_context']}"
                            
                    except Exception as e:
                        logger.error(f"Failed to process images with Vision API: {e}")
                        print(f"[VISION ERROR] Failed to process images: {e}")
                
                return result
                
            except Exception as e:
                import traceback
                error_details = traceback.format_exc()
                print(f"[OPENAI ERROR - non-streaming] Failed to use OpenAI Assistant: {type(e).__name__}: {e}")
                print(f"[OPENAI ERROR - non-streaming] Full traceback:\n{error_details}")
                logger.error(f"Failed to use OpenAI Assistant, falling back to simple processor: {e}")
                logger.error(f"Traceback: {error_details}")
                # Fall through to simple processor
        
        # Check if we have images that need Vision API processing
        if has_images and not use_openai_assistant:
            try:
                from services.openai_service import OpenAIService
                
                print(f"[VISION] Processing {len(options.files)} images with Vision API")
                logger.info("Processing images with Vision API...")
                
                openai_service = OpenAIService()
                
                # Filter image files
                image_files = [f for f in options.files if f.get('type', '').startswith('image/')]
                
                # Process images with vision
                result = await openai_service._process_images_with_vision(
                    image_files,
                    options.prompt,
                    on_progress=None
                )
                
                logger.info(f"Vision API analyzed {len(image_files)} images")
                
                # Augment prompt with image analysis
                if result.get('file_context'):
                    print(f"[VISION] Adding image analysis to prompt")
                    options.prompt += f"\n\n{result['file_context']}"
                
                return result
                
            except Exception as e:
                logger.error(f"Failed to process images with Vision API: {e}")
                # Fall through to simple processor
        
        # Default: Process files with simple processor (only if not handled above)
        # Also proactively extract PPTX text with our parser and attach outlines
        model_type = "openai" if "gpt" in self._get_model("planning", options).lower() else "gemini"
        file_processor = create_file_processor(model_type)
        processed_files = await file_processor.process_files(options.files, options.prompt)
        
        # Augment prompt
        if processed_files['file_context']:
            options.prompt += processed_files['file_context']
        
        # Add PPTX outlines in streaming fallback path (always run if PPTX present)
        try:
            pptx_outlines = []
            if has_pptx_files:
                logger.info(f"[PPTX] Extracting text (streaming-fallback) from {len(pptx_files_list)} PPTX file(s)")
                import base64
                for f in pptx_files_list:
                    content = f.get('content')
                    if isinstance(content, str):
                        b64 = content.split(';base64,', 1)[1] if content.startswith('data:') and ';base64,' in content else content
                        file_bytes = base64.b64decode(b64)
                    else:
                        file_bytes = content or b""
                    if file_bytes:
                        extracted = extract_pptx_text_from_bytes(file_bytes)
                        pptx_outlines.append({
                            'filename': f.get('name','presentation.pptx'),
                            'slides': extracted.get('slides', []),
                            'slide_count': extracted.get('slide_count', 0)
                        })
            if pptx_outlines:
                processed_files['pptx_outlines'] = pptx_outlines
                titles = [s.get('title','') for s in pptx_outlines[0].get('slides', []) if s.get('title')]
                if titles:
                    options.prompt += "\n\nPPTX Slides Detected (titles):\n- " + "\n- ".join(titles[:12])
        except Exception:
            pass

        return processed_files

    async def _process_media_and_charts(self, slides: list[SlideContent], processed_files: dict, options: OutlineOptions) -> list[SlideContent]:
        """Process media assignments and chart data conversion"""
        logger.info(f"[PROCESS MEDIA] Starting with {len(slides)} slides")
        
        # Check if any slides already have tagged media (from streaming)
        has_existing_media = any(slide.taggedMedia for slide in slides)
        if has_existing_media:
            logger.info(f"[PROCESS MEDIA] Some slides already have tagged media, skipping re-assignment")
        
        if processed_files and not has_existing_media:
            # Use AI-based media assignment only if no media assigned yet
            model = self._get_model("content", options)
            await self.media_manager.assign_media_to_slides_with_ai(slides, processed_files, model)
        
        # Always debug log media status
        if processed_files and processed_files.get('images'):
            logger.info(f"[PROCESS MEDIA] Media assignment status:")
            for i, slide in enumerate(slides):
                tm_count = len(slide.taggedMedia) if slide.taggedMedia else 0
                logger.info(f"[PROCESS MEDIA] Slide {i+1} '{slide.title}' has {tm_count} taggedMedia items")
                if tm_count > 0:
                    for j, media in enumerate(slide.taggedMedia[:2]):  # First 2
                        preview_url = media.get('previewUrl', '')
                        logger.info(f"[PROCESS MEDIA]   Media {j+1}: {media.get('filename', 'unknown')} - URL: {preview_url}")
            
            # Generate charts from extracted data (NEW: prioritize extracted_data)
            if processed_files.get('extracted_data'):
                logger.info(f"[PROCESS MEDIA] Processing {len(processed_files['extracted_data'])} extracted data items for charts")
                for slide in slides:
                    manual_charts = getattr(slide, 'manualCharts', None)
                    has_manual_charts = isinstance(manual_charts, list) and len(manual_charts) > 0
                    has_chart = bool(slide.extractedData) or has_manual_charts
                    logger.info(f"[PROCESS MEDIA] Checking slide '{slide.title}' - type: {slide.slide_type}, has_chart: {has_chart}")

                    type_allows_chart = slide.slide_type in ['data']

                    # Check if slide already has chart data from AI generation
                    if (not slide.extractedData and not has_manual_charts and type_allows_chart):
                        # Only generate chart if slide content would benefit from it
                        chart_data = await self._generate_chart_from_extracted_data(slide, processed_files['extracted_data'])
                        if chart_data:
                            chart_obj = ChartData(**chart_data)
                            slide.extractedData = self.chart_generator.convert_chart_data_to_extracted_data(
                                chart_obj, slide.title
                            )
                            logger.info(f"[PROCESS MEDIA] Added chart from extracted data to slide: {slide.title}")
            
            # Then handle regular media files
            elif processed_files.get('data_files'):
                for slide in slides:
                    manual_charts = getattr(slide, 'manualCharts', None)
                    has_manual_charts = isinstance(manual_charts, list) and len(manual_charts) > 0
                    if (not slide.extractedData and not has_manual_charts and 
                        slide.slide_type in ['data']):
                        
                        # Try to find matching data file (handle both CSV and Excel)
                        for data_file in processed_files['data_files']:
                            # Check for Excel files too, not just CSV
                            if data_file.get('format') in ['csv', 'excel'] or data_file.get('extracted_data'):
                                # If we have extracted_data in the file, use that
                                if data_file.get('extracted_data'):
                                    chart_data = await self._generate_chart_from_extracted_data(slide, data_file['extracted_data'])
                                else:
                                    chart_data = self.media_manager.generate_chart_from_data_file(data_file, slide.title)
                                
                                if chart_data:
                                    chart_obj = ChartData(**chart_data)
                                    slide.extractedData = self.chart_generator.convert_chart_data_to_extracted_data(
                                        chart_obj, slide.title
                                    )
                                    logger.info(f"Added chart from data file to slide: {slide.title}")
                                    break
        
        # Add extracted data summaries to slides that don't have chart data
        for slide in slides:
            manual_charts = getattr(slide, 'manualCharts', None)
            has_manual_charts = isinstance(manual_charts, list) and len(manual_charts) > 0
            if not slide.extractedData and not has_manual_charts and processed_files and processed_files.get('extracted_data'):
                # Add extracted data even if no chart
                for data_item in processed_files['extracted_data']:
                    if isinstance(data_item, dict) and 'summary' in data_item:
                        slide.extractedData = {
                            'source': 'Extracted from uploaded file',
                            'summary': data_item['summary'],
                            'keyMetrics': data_item.get('keyMetrics', {}),
                            'metadata': {'source': 'Extracted from uploaded file'}
                        }
                        logger.info(f"Added extracted data to slide without chart: {slide.title}")
                        break
        
        return slides

    async def _generate_chart_from_extracted_data(self, slide: SlideContent, extracted_data: List[Dict]) -> Optional[Dict[str, Any]]:
        """Generate chart data from extracted data based on slide content"""
        if not extracted_data:
            logger.info(f"[CHART GEN] No extracted data available for slide: {slide.title}")
            return None
        
        logger.info(f"[CHART GEN] Processing {len(extracted_data)} data items for slide: {slide.title}")
        
        # Find relevant data for this slide
        for data_item in extracted_data:
            if isinstance(data_item, dict):
                # Check if it's stock data
                if 'summary' in data_item and 'priceData' in data_item:
                    symbol = data_item['summary'].get('symbol', 'Unknown')
                    logger.info(f"[CHART GEN] Found stock data for {symbol}")
                    
                    # Determine chart type based on slide title
                    chart_type = "line"
                    data = self.chart_generator._generate_price_chart_from_stock_data(
                        data_item['priceData'], slide.title
                    )
                    title = f"{data_item['summary'].get('symbol', 'Stock')} Price Trend"
                    logger.info(f"[CHART GEN] Creating price chart with {len(data)} data points")

                    if data:
                        chart_result = {
                            'chart_type': chart_type,
                            'data': data,
                            'title': title,
                            'metadata': {'source': 'Extracted from uploaded file'}
                        }
                        logger.info(f"[CHART GEN] Successfully generated {chart_type} chart for slide: {slide.title}")
                        return chart_result
        
        logger.info(f"[CHART GEN] No suitable data found for chart generation in slide: {slide.title}")
        return None

    async def _generate_chart_data_for_slide(self, title: str, content: str, presentation_title: str) -> Optional[Dict[str, Any]]:
        """Generate realistic chart data for a slide."""
        try:
            from agents.ai.clients import get_client
            
            # Use a fast model for data generation
            client, model_name = get_client("perplexity-sonar", wrap_with_instructor=False)
            
            data_prompt = f"""Generate realistic chart data for this slide:

Title: {title}
Content: {content}
Presentation: {presentation_title}

Return ONLY a JSON object with:
{{
    "chartType": "bar|line|pie|area",
    "title": "Chart title",
    "data": [
        {{"label": "Item 1", "value": 123}},
        {{"label": "Item 2", "value": 456}}
    ],
    "source": "Generated based on typical industry data"
}}

Make the data realistic and relevant to the topic. Use as many points as make sense for the domain:
few points for sparse topics, full series for long histories."""

            # Use asyncio to run the synchronous API call in a thread executor
            loop = asyncio.get_event_loop()
            # Use invoke to support both OpenAI and Anthropic clients
            # Only pass extra_body for Perplexity models (not Claude/Anthropic)
            invoke_kwargs = {
                "client": client,
                "model": model_name,
                "messages": [{"role": "user", "content": data_prompt}],
                "response_model": None,  # Free-form text response
                "temperature": 0.1,
                "max_tokens": 400
            }
            # Only add extra_body for Perplexity models
            if model_name.startswith("perplexity-") or "sonar" in model_name:
                invoke_kwargs["extra_body"] = {
                    "return_citations": True,
                    "search_recency_filter": "month",
                    "search_domain_filter": ["-youtube.com", "-youtu.be", "-www.youtube.com", "-m.youtube.com"],
                    "num_search_results": 10
                }
            
            response_result = await loop.run_in_executor(
                None,  # Use default thread pool
                lambda: invoke(**invoke_kwargs)
            )
            
            # Handle dict return from invoke
            response_text = response_result
            if isinstance(response_result, dict):
                response_text = response_result.get("content", "")
            
            response_text = str(response_text).strip()
            
            # Extract JSON from response
            import re
            json_match = re.search(r'{[\s\S]*}', response_text)
            if json_match:
                import json
                chart_data = json.loads(json_match.group(0))
                
                # Validate required fields
                if 'chartType' in chart_data and 'data' in chart_data:
                    return chart_data
                    
        except Exception as e:
            logger.warning(f"[DATA] Error generating chart data: {e}")
            
        # Fallback - create simple sample data
        return {
            "chartType": "bar",
            "title": f"Data for {title}",
            "data": [
                {"label": "Category 1", "value": 45},
                {"label": "Category 2", "value": 30},
                {"label": "Category 3", "value": 25}
            ],
            "source": "Sample data"
        }
