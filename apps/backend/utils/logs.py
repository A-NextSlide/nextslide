from langsmith import Client
from models.deck import DeckDiffBase
import json
import os

def print_run_url(run_id):
    client = Client()
    project_name = os.getenv("LANGSMITH_PROJECT")
    
    # Get all runs with the specified edit_uuid
    runs = client.list_runs(
        project_name=project_name,
        run_ids=[run_id]
    )
    r = next(runs)

    run_url = r.get_run_url()
    print(f"DEBUG: Run URL: {run_url}")


def log_deck_diff(deck_diff: DeckDiffBase) -> None:
    """
    Log the deck diff details for debugging
    
    Args:
        deck_diff: The DeckDiff to log
    """
    print("\n===== DECK DIFF TO SEND =====")
    print(f"Slides to update: {len(deck_diff.slides_to_update or [])}")
    print(f"Slides to add: {len(deck_diff.slides_to_add or [])}")
    print(f"Slides to remove: {len(deck_diff.slides_to_remove or [])}")
    
    # Add detailed deck diff printing
    print("\nDetailed Deck Diff:")
    try:
        # Convert to dict and print as formatted JSON
        deck_diff_dict = deck_diff.dict()
        print(json.dumps(deck_diff_dict, indent=2))
    except Exception as e:
        print(f"Error printing detailed deck diff: {str(e)}")
        
    print("==============================\n")

