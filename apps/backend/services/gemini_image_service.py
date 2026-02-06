import os
import base64
import asyncio
from typing import Dict, Any, Optional, List

from dotenv import load_dotenv
from PIL import Image
from io import BytesIO

# Load environment variables
load_dotenv()

try:
    # Prefer the official google genai SDK naming as used elsewhere in repo
    from google import genai
except Exception:
    genai = None  # Graceful degradation if SDK not installed

from agents.config import GEMINI_IMAGE_MODEL


class GeminiImageService:
    """Service for generating images using Google's Gemini 2.5 Flash Image model.

    Returns a structure compatible with existing image handling logic
    (i.e., b64_json for later upload to storage).
    """

    def __init__(self):
        self.api_key = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
        self.is_available = bool(self.api_key and genai is not None)
        self.model = GEMINI_IMAGE_MODEL

        if self.is_available:
            # Instantiate client lazily to avoid import errors when key is missing
            self._client = genai.Client(api_key=self.api_key)
        else:
            print("Warning: GOOGLE_API_KEY/GEMINI_API_KEY not set or google-genai SDK missing. Gemini image generation disabled.")

    # Supported aspect ratios for Gemini image generation
    VALID_ASPECT_RATIOS = frozenset({
        "1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"
    })

    async def generate_image(
        self,
        prompt: str,
        size: str = "1024x1024",
        transparent_background: bool = False,
        n: int = 1,
        retry_count: int = 0,
        aspect_ratio: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Generate an image via Gemini 2.5 Flash Image.

        Args:
            prompt: Natural language prompt
            size: WxH string (legacy, unused — use aspect_ratio instead)
            transparent_background: If true, request PNG with transparent BG via prompt hint
            n: number of images (Gemini typically returns one; we loop if supported later)
            aspect_ratio: Gemini aspect ratio string e.g. "16:9", "4:3", "1:1"
        Returns:
            Dict containing 'b64_json' and metadata similar to OpenAIImageService.
        """
        if not self.is_available:
            return {"error": "Gemini API not configured"}

        effective_prompt = prompt

        # Validate aspect ratio
        if aspect_ratio and aspect_ratio not in self.VALID_ASPECT_RATIOS:
            print(f"Warning: Invalid aspect ratio '{aspect_ratio}', defaulting to None")
            aspect_ratio = None

        # Encode aspect ratio in the prompt since ImageConfig is not available
        # in google-genai SDK <=1.31. The model respects sizing instructions in prompt.
        if aspect_ratio:
            ratio_map = {
                "16:9": "wide landscape (16:9 aspect ratio)",
                "4:3": "standard landscape (4:3 aspect ratio)",
                "3:2": "landscape (3:2 aspect ratio)",
                "21:9": "ultrawide panoramic (21:9 aspect ratio)",
                "1:1": "square (1:1 aspect ratio)",
                "9:16": "tall portrait (9:16 aspect ratio)",
                "3:4": "portrait (3:4 aspect ratio)",
                "2:3": "tall portrait (2:3 aspect ratio)",
                "5:4": "slightly wide (5:4 aspect ratio)",
                "4:5": "slightly tall (4:5 aspect ratio)",
            }
            ratio_desc = ratio_map.get(aspect_ratio, f"{aspect_ratio} aspect ratio")
            effective_prompt = f"Generate a {ratio_desc} image: {prompt}"

        # Note: google-genai is sync; wrap in thread to keep interface async
        try:
            def _invoke():
                from google.genai import types

                response = self._client.models.generate_content(
                    model=self.model,
                    contents=effective_prompt,
                    config=types.GenerateContentConfig(
                        response_modalities=["IMAGE"],
                    ),
                )
                return response

            response = await asyncio.to_thread(_invoke)

            if not response or not getattr(response, "candidates", None):
                return {"error": "Empty response from Gemini"}

            # Extract first inline image
            b64_data: Optional[str] = None
            revised_prompt: Optional[str] = None

            try:
                parts = response.candidates[0].content.parts
            except Exception:
                parts = []

            for part in parts:
                # Text parts ignored; look for inline image bytes
                if getattr(part, "inline_data", None) is not None:
                    # inline_data.data is bytes; base64 encode to align with existing flow
                    data_bytes = part.inline_data.data
                    if isinstance(data_bytes, (bytes, bytearray)):
                        b64_data = base64.b64encode(data_bytes).decode("utf-8")
                    else:
                        # Some SDKs may already provide b64
                        try:
                            b64_data = data_bytes.decode("utf-8")
                        except Exception:
                            pass
                elif getattr(part, "text", None):
                    # Capture any revised prompt or notes in text, if provided
                    revised_prompt = part.text

            if not b64_data:
                return {"error": "No image data returned by Gemini"}

            return {
                "b64_json": b64_data,
                "url": None,  # Keep None; callers upload to storage
                "is_ai_generated": True,
                "revised_prompt": revised_prompt,
                "model_used": self.model,
            }

        except Exception as e:
            if retry_count == 0 and "timeout" in str(e).lower():
                return await self.generate_image(prompt, size, transparent_background, n, retry_count + 1, aspect_ratio)
            print(f"[GeminiImageService] generate_image error (model={self.model}, ratio={aspect_ratio}): {e}")
            return {"error": str(e)}

    async def generate_supporting_image(
        self,
        subject: str,
        context: str,
        style_preferences: Optional[Dict[str, Any]] = None,
        transparent_background: bool = True
    ) -> Dict[str, Any]:
        """Generate a supporting image tuned for slide content using Gemini.
        Mirrors OpenAI helper to preserve existing call sites.
        """
        prompt = (
            f"DSLR photograph of {subject}. "
            f"Context: {context}. "
            "Style: Clean, artistic, professional DSLR photography with cinematic lighting and shallow depth of field. "
            "Do not include any text, words, labels, overlays, titles, captions, or watermarks on the image. "
        )

        if style_preferences:
            if style_preferences.get("vibeContext"):
                prompt += f"Visual style: {style_preferences['vibeContext']}. "
            if style_preferences.get("colorPreference"):
                prompt += f"Use colors that match: {style_preferences['colorPreference']}. "

        return await self.generate_image(
            prompt=prompt,
            size="1024x1024",
            transparent_background=transparent_background,
            n=1,
        )

    def should_use_ai_generation(self, slide_title: str, slide_content: str) -> bool:
        """Reuse the same heuristic as OpenAI service callers expect."""
        text = (slide_title + " " + slide_content).lower()
        ai_necessary_keywords = [
            "pokemon", "pikachu", "mario", "luigi", "zelda", "sonic",
            "dragon", "unicorn", "griffin", "phoenix",
            "nintendo", "playstation", "xbox",
            "neural network visualization", "blockchain diagram",
            "quantum computing illustration", "metaverse concept",
            "custom illustration", "specific scenario", "unique visualization",
        ]
        return any(k in text for k in ai_necessary_keywords)

    async def edit_image(
        self,
        instructions: str,
        image_bytes: bytes,
        transparent_background: bool = False,
        size: str = "1024x1024",
    ) -> Dict[str, Any]:
        """Edit a single image using prompt-based instructions.
        Returns a structure with b64_json similar to generate_image.
        """
        if not self.is_available:
            return {"error": "Gemini API not configured"}

        prompt = instructions

        # Build PIL image
        try:
            pil_img = Image.open(BytesIO(image_bytes))
        except Exception as e:
            return {"error": f"Invalid image data: {e}"}

        try:
            def _invoke():
                from google.genai import types
                response = self._client.models.generate_content(
                    model=self.model,
                    contents=[prompt, pil_img],
                    config=types.GenerateContentConfig(
                        response_modalities=["IMAGE", "TEXT"]
                    )
                )
                return response

            response = await asyncio.to_thread(_invoke)

            if not response or not getattr(response, "candidates", None):
                return {"error": "Empty response from Gemini"}

            b64_data: Optional[str] = None
            revised_prompt: Optional[str] = None
            try:
                parts = response.candidates[0].content.parts
            except Exception:
                parts = []
            for part in parts:
                if getattr(part, "inline_data", None) is not None:
                    data_bytes = part.inline_data.data
                    if isinstance(data_bytes, (bytes, bytearray)):
                        b64_data = base64.b64encode(data_bytes).decode("utf-8")
                    else:
                        try:
                            b64_data = data_bytes.decode("utf-8")
                        except Exception:
                            pass
                elif getattr(part, "text", None):
                    revised_prompt = part.text

            if not b64_data:
                return {"error": "No image data returned by Gemini"}

            return {
                "b64_json": b64_data,
                "url": None,
                "is_ai_generated": True,
                "revised_prompt": revised_prompt,
                "model_used": self.model,
            }
        except Exception as e:
            return {"error": str(e)}

    async def fuse_images(
        self,
        prompt: str,
        image_bytes_list: List[bytes],
        size: str = "1024x1024",
    ) -> Dict[str, Any]:
        """Fuse multiple images guided by a prompt into a single output image."""
        if not self.is_available:
            return {"error": "Gemini API not configured"}

        effective_prompt = prompt

        try:
            pil_images = []
            for data in image_bytes_list:
                pil_images.append(Image.open(BytesIO(data)))

            def _invoke():
                from google.genai import types
                contents = [effective_prompt] + pil_images
                response = self._client.models.generate_content(
                    model=self.model,
                    contents=contents,
                    config=types.GenerateContentConfig(
                        response_modalities=["IMAGE", "TEXT"]
                    )
                )
                return response

            response = await asyncio.to_thread(_invoke)

            if not response or not getattr(response, "candidates", None):
                return {"error": "Empty response from Gemini"}

            b64_data: Optional[str] = None
            revised_prompt: Optional[str] = None
            try:
                parts = response.candidates[0].content.parts
            except Exception:
                parts = []
            for part in parts:
                if getattr(part, "inline_data", None) is not None:
                    data_bytes = part.inline_data.data
                    if isinstance(data_bytes, (bytes, bytearray)):
                        b64_data = base64.b64encode(data_bytes).decode("utf-8")
                    else:
                        try:
                            b64_data = data_bytes.decode("utf-8")
                        except Exception:
                            pass
                elif getattr(part, "text", None):
                    revised_prompt = part.text

            if not b64_data:
                return {"error": "No image data returned by Gemini"}

            return {
                "b64_json": b64_data,
                "url": None,
                "is_ai_generated": True,
                "revised_prompt": revised_prompt,
                "model_used": self.model,
            }
        except Exception as e:
            return {"error": str(e)}


