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

    async def generate_image(
        self,
        prompt: str,
        size: str = "1024x1024",
        transparent_background: bool = False,
        n: int = 1,
        retry_count: int = 0
    ) -> Dict[str, Any]:
        """Generate an image via Gemini 2.5 Flash Image.

        Args:
            prompt: Natural language prompt
            size: WxH string. Gemini outputs up to 1024x1024. We'll pass via prompt guidance only.
            transparent_background: If true, request PNG with transparent BG via prompt hint
            n: number of images (Gemini typically returns one; we loop if supported later)
        Returns:
            Dict containing 'b64_json' and metadata similar to OpenAIImageService.
        """
        if not self.is_available:
            return {"error": "Gemini API not configured"}

        # Do not modify the user's prompt
        effective_prompt = prompt

        # Note: google-genai is sync; wrap in thread to keep interface async
        try:
            def _invoke():
                # The SDK returns candidates with parts; images are in inline_data
                response = self._client.models.generate_content(
                    model=self.model,
                    contents=effective_prompt,
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
                return await self.generate_image(prompt, size, transparent_background, n, retry_count + 1)
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
            f"Create a clean, professional illustration of {subject}. "
            f"Context: {context}. "
            "Style: Modern, minimalist, suitable for a professional presentation. "
            "Do not include any text or labels in the image. "
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
                response = self._client.models.generate_content(
                    model=self.model,
                    contents=[prompt, pil_img],
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
                contents = [effective_prompt] + pil_images
                response = self._client.models.generate_content(
                    model=self.model,
                    contents=contents,
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


