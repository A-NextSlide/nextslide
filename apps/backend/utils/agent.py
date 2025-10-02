from typing import Dict, Any

def log_agent_results(result: Dict[str, Any]) -> None:
    """
    Log the agent's results for debugging
    
    Args:
        result: The result from the agent
    """
    print("\n===== AGENT RESULTS =====")
    print(f"Instructions: {result.get('instructions', '')[:100]}...")
    print(f"Verification: {result.get('verification', '')[:100]}...")
    print(f"Slide Diff: {'slide_diff' in result}")
    print("=========================\n") 

