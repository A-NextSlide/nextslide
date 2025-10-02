from models.requests import QualityEvaluationRequest, QualityEvaluationResponse
from utils.threading import run_in_threadpool
from agents.ai.quality_agent import evaluate_quality
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor

# Create a thread pool executor for running CPU-bound tasks
thread_pool = ThreadPoolExecutor(max_workers=32)

async def api_evaluate_quality(
    request: QualityEvaluationRequest,
    debug: bool=False
):
    """
    Evaluate the quality of a deck modification based on the user query and before/after states
    """
    print(f"Received quality evaluation request for user query: {request.user_query}")
    
    # Log debug visualization status if enabled
    if debug:
        print("⚠️ DEBUG IMAGE VISUALIZATION ENABLED - Images will be displayed during processing")
    
    # Log the image sizes if present
    if request.before_images:
        print(f"Received before_images: {len(request.before_images)} images")
    if request.after_images:
        print(f"Received after_images: {len(request.after_images)} images")
    
    # Use the images directly since they're already base64-encoded
    before_images = request.before_images
    after_images = request.after_images
    
    try:
        # Execute the evaluation request in a separate thread to avoid blocking
        response = await run_in_threadpool(
            thread_pool,
            evaluate_quality,
            user_query=request.user_query,
            before_html=request.before_html,
            after_html=request.after_html,
            deck_diff=request.deck_diff,
            before_images=before_images,
            after_images=after_images,
            debug_mode=debug
        )
        
        print(f"Quality evaluation completed with score: {response.score}/5")
        
        # Return the structured response
        return QualityEvaluationResponse(
            quality_score=response.score,
            explanation=response.explanation,
            strengths=response.positives,
            areas_for_improvement=response.negatives,
            timestamp=datetime.now()
        )
    except Exception as e:
        import traceback
        print(f"Error evaluating quality: {str(e)}")
        print(traceback.format_exc())
        
        # Return a default response in case of error
        return QualityEvaluationResponse(
            quality_score=3.0,
            explanation="Error occurred during evaluation: " + str(e),
            strengths=["Evaluation could not be completed properly"],
            areas_for_improvement=["Fix evaluation system error"],
            timestamp=datetime.now()
        )