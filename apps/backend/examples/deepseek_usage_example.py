#!/usr/bin/env python3
"""
Example script demonstrating how to use DeepSeek API integration
Shows both deepseek-chat (non-thinking) and deepseek-reasoner (thinking) modes
"""

import os
import sys

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from agents.ai.clients import get_client, invoke
from pydantic import BaseModel
from typing import List

# Example 1: Using DeepSeek Chat (Non-thinking mode) for quick responses
def example_deepseek_chat():
    """Example using deepseek-chat for fast, efficient responses"""
    print("\n=== DeepSeek Chat (Non-thinking mode) Example ===")
    
    # Define a simple response model
    class QuickSummary(BaseModel):
        main_point: str
        key_facts: List[str]
    
    # Get the client
    client, model_name = get_client("deepseek-chat")
    
    # Create messages
    messages = [
        {"role": "system", "content": "You are a concise assistant. Provide quick, accurate summaries."},
        {"role": "user", "content": "Summarize the benefits of renewable energy in 3 key points."}
    ]
    
    # Get response
    response = invoke(
        client=client,
        model=model_name,
        messages=messages,
        response_model=QuickSummary,
        max_tokens=500,
        temperature=0.7
    )
    
    print(f"Main Point: {response.main_point}")
    print("Key Facts:")
    for fact in response.key_facts:
        print(f"  - {fact}")


# Example 2: Using DeepSeek Reasoner (Thinking mode) for complex analysis
def example_deepseek_reasoner():
    """Example using deepseek-reasoner for complex reasoning tasks"""
    print("\n=== DeepSeek Reasoner (Thinking mode) Example ===")
    
    # Define a complex response model
    class PresentationAnalysis(BaseModel):
        topic_complexity: str
        target_audience: str
        recommended_structure: List[str]
        potential_challenges: List[str]
        success_metrics: List[str]
    
    # Get the client
    client, model_name = get_client("deepseek-reasoner")
    
    # Create messages for a complex task
    messages = [
        {"role": "system", "content": "You are an expert presentation consultant. Analyze topics thoroughly and provide comprehensive recommendations."},
        {"role": "user", "content": "I need to create a presentation about 'Implementing AI Ethics in Healthcare'. Analyze this topic and provide detailed recommendations."}
    ]
    
    # Get response
    response = invoke(
        client=client,
        model=model_name,
        messages=messages,
        response_model=PresentationAnalysis,
        max_tokens=2000,
        temperature=0.7
    )
    
    print(f"Topic Complexity: {response.topic_complexity}")
    print(f"Target Audience: {response.target_audience}")
    print("\nRecommended Structure:")
    for item in response.recommended_structure:
        print(f"  - {item}")
    print("\nPotential Challenges:")
    for challenge in response.potential_challenges:
        print(f"  - {challenge}")
    print("\nSuccess Metrics:")
    for metric in response.success_metrics:
        print(f"  - {metric}")


# Example 3: Comparing both modes for the same task
def example_comparison():
    """Compare responses from both modes for the same task"""
    print("\n=== Comparison: Chat vs Reasoner ===")
    
    class CodeReview(BaseModel):
        issues_found: List[str]
        suggestions: List[str]
        overall_quality: str
    
    # Same code snippet for both models
    code_snippet = """
    def calculate_average(numbers):
        total = 0
        for num in numbers:
            total += num
        return total / len(numbers)
    """
    
    messages = [
        {"role": "system", "content": "You are a code reviewer. Review the provided Python code."},
        {"role": "user", "content": f"Review this code:\n```python\n{code_snippet}\n```"}
    ]
    
    # Test with deepseek-chat
    print("\n--- DeepSeek Chat Response ---")
    client_chat, model_chat = get_client("deepseek-chat")
    response_chat = invoke(
        client=client_chat,
        model=model_chat,
        messages=messages,
        response_model=CodeReview,
        max_tokens=1000,
        temperature=0.7
    )
    print(f"Overall Quality: {response_chat.overall_quality}")
    print("Issues:", response_chat.issues_found)
    
    # Test with deepseek-reasoner
    print("\n--- DeepSeek Reasoner Response ---")
    client_reasoner, model_reasoner = get_client("deepseek-reasoner")
    response_reasoner = invoke(
        client=client_reasoner,
        model=model_reasoner,
        messages=messages,
        response_model=CodeReview,
        max_tokens=1000,
        temperature=0.7
    )
    print(f"Overall Quality: {response_reasoner.overall_quality}")
    print("Issues:", response_reasoner.issues_found)
    print("\nNote: Reasoner mode may provide more detailed analysis")


def main():
    """Run all examples"""
    # Check for API key
    if not os.getenv("DEEPSEEK_API_KEY"):
        print("❌ Error: DEEPSEEK_API_KEY environment variable not set!")
        print("Please set it with: export DEEPSEEK_API_KEY='your-api-key'")
        return
    
    try:
        # Run examples
        example_deepseek_chat()
        example_deepseek_reasoner()
        example_comparison()
        
        print("\n✅ All examples completed successfully!")
        print("\nKey Takeaways:")
        print("- Use 'deepseek-chat' for fast, efficient responses")
        print("- Use 'deepseek-reasoner' for complex reasoning and analysis")
        print("- Both models are available in the agents.ai.clients module")
        
    except Exception as e:
        print(f"\n❌ Error running examples: {str(e)}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    main()

