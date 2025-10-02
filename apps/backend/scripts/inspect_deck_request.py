#!/usr/bin/env python3
"""
Inspect what the frontend is sending for deck creation
"""
from fastapi import FastAPI, Request
import json
import uvicorn

app = FastAPI()

@app.post("/auth/decks")
async def inspect_deck_creation(request: Request):
    """Log the raw request and return helpful error"""
    body = await request.body()
    
    try:
        data = json.loads(body)
        print("\n=== DECK CREATION REQUEST ===")
        print(f"Headers: {dict(request.headers)}")
        print(f"Body: {json.dumps(data, indent=2)}")
        print("============================\n")
        
        # Check what's missing
        missing = []
        if "uuid" not in data:
            missing.append("uuid")
        if "name" not in data:
            missing.append("name")
            
        # Check what's extra
        extra = []
        expected = {"uuid", "name", "slides", "theme", "data", "outline", "version"}
        for key in data.keys():
            if key not in expected:
                extra.append(key)
        
        return {
            "error": "Validation failed",
            "missing_required_fields": missing,
            "unexpected_fields": extra,
            "received_fields": list(data.keys()),
            "expected_fields": list(expected),
            "raw_data": data
        }
    except Exception as e:
        return {"error": str(e), "raw_body": body.decode()}

if __name__ == "__main__":
    print("Starting inspection server on port 9091...")
    uvicorn.run(app, host="0.0.0.0", port=9091)