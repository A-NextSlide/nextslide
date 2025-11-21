
import os
import asyncio
import logging
import json
from dotenv import load_dotenv

# Try loading from backend root or project root
load_dotenv()
load_dotenv(os.path.join(os.path.dirname(__file__), '../../.env'))

from agents.ai.clients import get_client, invoke
from agents.config import GEMINI_3_PRO_MODEL

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def test_gemini_generation():
    print(f"Testing Gemini 3 Pro integration ({GEMINI_3_PRO_MODEL})...")
    
    try:
        client, model_name = get_client(GEMINI_3_PRO_MODEL, wrap_with_instructor=False)
        print(f"Client obtained: {type(client)}")
        print(f"Model name: {model_name}")
        
        prompt = """
        You are a creative layout designer.
        Create a layout for a slide titled "Introduction".
        Return ONLY valid JSON.
        {
            "layout_reasoning": "Simple title layout",
            "components": []
        }
        """
        
        messages = [{"role": "user", "content": prompt}]
        
        print("Invoking model...")
        response = invoke(
            client,
            model_name,
            messages,
            response_model=None, # Raw mode
            max_tokens=1000,
            temperature=0.7
        )
        
        print("\n--- Response ---")
        print(response)
        print("----------------")
        
        if not response:
            print("❌ Response is empty!")
        else:
            try:
                data = json.loads(response)
                print("✅ JSON parsed successfully")
            except json.JSONDecodeError as e:
                print(f"❌ JSON parsing failed: {e}")
                
    except Exception as e:
        print(f"❌ Exception occurred: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    # Ensure API key is present (don't print it)
    if not os.getenv("GOOGLE_API_KEY") and not os.getenv("GEMINI_API_KEY"):
        print("WARNING: GOOGLE_API_KEY or GEMINI_API_KEY not found in env")
    
    asyncio.run(test_gemini_generation())

