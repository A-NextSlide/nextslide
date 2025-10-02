from pydantic import BaseModel, Field
from bs4 import BeautifulSoup
import json

from agents.ai.clients import get_client, invoke
from agents.config import QUALITY_EVALUATOR_MODEL
from api.image_utils import get_combined_slide_images

class QualityEvaluationResult(BaseModel):
    """Structured quality evaluation result from the LLM"""
    score: float = Field(..., description="Quality score from 1-5, where 5 is excellent")
    explanation: str = Field(..., description="Detailed explanation justifying the score")
    positives: list[str] = Field(..., description="List of strengths or positive aspects of the modifications")
    negatives: list[str] = Field(..., description="List of areas for improvement or negative aspects of the modifications")

def evaluate_quality(user_query, before_html, after_html, deck_diff, before_images=None, after_images=None, debug_mode=False):
    """
    Evaluate the quality of a modification based on a user query and modifications.
    
    Args:
        user_query: The original user query requesting the modification
        before_html: HTML representation of the deck before modification
        after_html: HTML representation of the deck after modification
        deck_diff: The diff that was applied to create the after state
        before_images: List of base64 encoded images of the before state
        after_images: List of base64 encoded images of the after state
        debug_mode: Whether to display debugging visualizations
        
    Returns:
        QualityEvaluationResult object with a score, explanation, and details
    """
    # Log if we received images and their sizes
    
    before_image_obj, after_image_obj = get_combined_slide_images(before_images, after_images, debug=True)

    # Clean up the HTML for better readability
    try:
        before_html_pretty = BeautifulSoup(before_html, 'html.parser').prettify()
    except Exception as e:
        print(f"Warning: Could not prettify before_html: {e}")
        before_html_pretty = before_html
    
    try:
        after_html_pretty = BeautifulSoup(after_html, 'html.parser').prettify()
    except Exception as e:
        print(f"Warning: Could not prettify after_html: {e}")
        after_html_pretty = after_html

    # Generate a system prompt for quality evaluation
    system_prompt = """You are an expert evaluator of presentation slide modifications.
Your task is to assess how well the changes to a slide deck fulfill the user's request.

Rate the quality on a scale of 1-5 stars, where:
1 = Poor: Fails to address the request or makes it worse
2 = Below Average: Partially addresses the request but with significant issues
3 = Average: Adequately addresses the request but could be improved
4 = Good: Successfully addresses the request with minor room for improvement
5 = Excellent: Perfectly addresses the request with high quality output

Consider these factors in your evaluation:
1. Relevance: How well do the changes address the user's specific request?
2. Visual Quality: How professional and visually appealing is the result?
3. Completeness: Did the changes fulfill all aspects of the request?
4. Correctness: Were the changes implemented without introducing errors?
5. Design: Is the styling consistent and appropriate?

Be sure to analyze ALL slides in the deck. The html may contain multiple slides in the before and after states.
Focus primarily on the differences between before and after states, and how well they address the user query.
I want you to be very critical in your evaluation about style and layout of the slides.
"""

    # Create user prompt with the content to evaluate
    user_prompt = f"""Please evaluate the quality of the following slide deck modification:

<user_query>
{user_query}
</user_query>

<before_html>
{before_html_pretty}
</before_html>

<after_html>
{after_html_pretty}
</after_html>

<deck_diff>
{json.dumps(deck_diff, indent=2)}
</deck_diff>

Please provide your detailed evaluation with a score, explanation, positives, and negatives.

The diff is the changes made to the deck, but the html is the final output of the system.
It is important that you mainly look at the html in your evaluation as that is the final output of the system.
Pay special attention to all slides in the deck, not just the first one.
I want you to be very critical in your evaluation about sytle and layout of the slides
You will be provided with the after image of the deck, use it to evaluate the quality of the changes.
"""
    #print(f"DEBUG: User prompt: {user_prompt}")
    # Use instructor with Anthropic to call the LLM with structured output
    client, model = get_client(QUALITY_EVALUATOR_MODEL)

    content = [user_prompt]
    # if before_image_obj:
    #     content.append(before_image_obj)
    if after_image_obj:
        content.append(after_image_obj)
    
    # Execute the evaluation request
    response = invoke(
        client=client,
        model=model,
        max_tokens=4096,  # Increase token limit for more thorough evaluations
        response_model=QualityEvaluationResult,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": content}
        ]
    )
    
    return response 