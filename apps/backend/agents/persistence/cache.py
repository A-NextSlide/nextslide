import functools
import inspect
import instructor
import diskcache
import json
import hashlib
from pathlib import Path

from openai import OpenAI
from pydantic import BaseModel

from agents.config import CACHE_DIR

cache = diskcache.Cache(CACHE_DIR)

def make_hashable(data):
    if isinstance(data, list):
        return tuple(make_hashable(item) for item in data)
    if isinstance(data, dict):
        return tuple(sorted((key, make_hashable(value)) for key, value in data.items()))
    return data

def deep_hash(data):
    return hash(make_hashable(data))

def instructor_cache(func):
    """Cache a function that returns a Pydantic model"""
    return_type = inspect.signature(func).return_annotation  # 
    if not issubclass(return_type, BaseModel):  # 
        raise ValueError("The return type must be a Pydantic model")

    @functools.wraps(func)
    def wrapper(client, model, messages, response_model, invoke_kwargs):
        key = (
            f"{func.__name__}-{model}-{deep_hash(messages)}-{deep_hash(response_model.model_json_schema())}-{deep_hash(invoke_kwargs)}"  #  
        )
        # Ensure messages directory and write to a safe, short filename
        try:
            messages_dir = Path("messages")
            messages_dir.mkdir(parents=True, exist_ok=True)
            safe_key = hashlib.sha1(key.encode("utf-8")).hexdigest()
            with open(messages_dir / f"{safe_key}.json", "w") as f:
                json.dump(messages, f, indent=2)
        except Exception:
            # Best-effort logging only; ignore any filesystem issues
            pass

        print(f"DEBUG: key: {key}")
        # Check if the result is already cached
        if (cached := cache.get(key)) is not None:
            print(f"DEBUG: Cache hit!")
            # Deserialize from JSON based on the return type 
            return response_model.model_validate_json(cached)
        
        print(f"DEBUG: No cache hit!")
        # Call the function and cache its result
        result = func(client, model, messages, response_model, invoke_kwargs)
        serialized_result = result.model_dump_json()
        cache.set(key, serialized_result)

        return result

    return wrapper

if __name__ == "__main__":
    client = instructor.from_openai(OpenAI())

    class UserDetail(BaseModel):
        name: str
        age: int


    @instructor_cache
    def extract(data) -> UserDetail:
        return client.chat.completions.create(
            model="gpt-3.5-turbo",
            response_model=UserDetail,
            messages=[
                {"role": "user", "content": data},
            ],
        )