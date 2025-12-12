"""
Billing API Endpoints

Handles:
- Credit balance queries
- Subscription management
- Checkout flow
- Webhook processing
"""

import json
import logging
from typing import Optional
from fastapi import APIRouter, HTTPException, Request, Depends, Header
from pydantic import BaseModel

from services.billing_service import get_billing_service, CreditAction
from services.stripe_service import get_stripe_service
from services.supabase_auth_service import get_auth_service
from api.requests.api_auth import get_auth_header

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/billing", tags=["billing"])


async def get_current_user(token: Optional[str] = Depends(get_auth_header)) -> dict:
    """Get current authenticated user from token."""
    if not token:
        raise HTTPException(status_code=401, detail="Authentication required")

    auth_service = get_auth_service()
    user = auth_service.get_user_with_token(token)

    if not user:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    return user


# ============================================================================
# Request/Response Models
# ============================================================================

class CreditBalanceResponse(BaseModel):
    remaining_credits: int
    monthly_credits: int
    purchased_credits: int
    used_credits: int
    plan_id: str
    plan_name: str
    period_end: Optional[str] = None
    # Helpful estimates
    estimated_slides: int
    estimated_presentations: int
    # Overage (Pro only)
    overage_credits: int = 0
    overage_cost_cents: int = 0
    can_use_overage: bool = False
    # Friends & Family (WOOHOOFREESLIDES coupon)
    is_friends_family: bool = False


class UsageStatsResponse(BaseModel):
    total_credits_used: int
    slides_generated: int
    chats_sent: int
    edits_made: int
    period_start: str
    period_end: str


class SubscriptionResponse(BaseModel):
    plan_id: str
    plan_name: str
    status: str
    current_period_end: Optional[str] = None
    cancel_at_period_end: bool = False
    features: list


class CheckoutRequest(BaseModel):
    plan_id: str
    success_url: Optional[str] = None
    cancel_url: Optional[str] = None


class CheckoutResponse(BaseModel):
    session_id: str
    url: str


class PortalResponse(BaseModel):
    url: str


class PricingPlan(BaseModel):
    id: str
    name: str
    description: Optional[str]
    monthly_credits: int
    price_cents: int
    features: list
    estimated_presentations: int


class CreditCheckResponse(BaseModel):
    has_credits: bool
    cost: int
    remaining: int
    action: str


class CancelRequest(BaseModel):
    reason: str
    reason_details: Optional[str] = None


# ============================================================================
# Endpoints
# ============================================================================

@router.get("/balance", response_model=CreditBalanceResponse)
async def get_credit_balance(user: dict = Depends(get_current_user)):
    """Get current user's credit balance."""
    billing = get_billing_service()
    balance = await billing.get_user_balance(user["id"])

    if not balance:
        raise HTTPException(status_code=404, detail="Balance not found")

    # Check for Friends & Family (unlimited credits = -1)
    is_friends_family = balance.monthly_credits == -1

    # Estimate slides (avg 5 credits per slide)
    if is_friends_family:
        estimated_slides = 999999  # Unlimited
        estimated_presentations = 999999
    else:
        estimated_slides = balance.remaining_credits // 5
        estimated_presentations = estimated_slides // 8  # Avg 8 slides per presentation

    # Get overage info for Pro users
    overage_credits, overage_cost_cents = 0, 0
    can_use_overage = balance.plan_id == "pro" and not is_friends_family
    if can_use_overage:
        overage_credits, overage_cost_cents = await billing.get_overage(user["id"])

    return CreditBalanceResponse(
        remaining_credits=balance.remaining_credits,
        monthly_credits=balance.monthly_credits,
        purchased_credits=balance.purchased_credits,
        used_credits=balance.used_credits,
        plan_id=balance.plan_id,
        plan_name=balance.plan_name,
        period_end=balance.period_end.isoformat() if balance.period_end else None,
        estimated_slides=estimated_slides,
        estimated_presentations=estimated_presentations,
        overage_credits=overage_credits,
        overage_cost_cents=overage_cost_cents,
        can_use_overage=can_use_overage,
        is_friends_family=is_friends_family
    )


@router.get("/usage", response_model=UsageStatsResponse)
async def get_usage_stats(user: dict = Depends(get_current_user)):
    """Get usage statistics for current billing period."""
    billing = get_billing_service()
    stats = await billing.get_usage_stats(user["id"])

    if not stats:
        raise HTTPException(status_code=404, detail="Usage stats not found")

    return UsageStatsResponse(
        total_credits_used=stats.total_credits_used,
        slides_generated=stats.slides_generated,
        chats_sent=stats.chats_sent,
        edits_made=stats.edits_made,
        period_start=stats.period_start.isoformat(),
        period_end=stats.period_end.isoformat()
    )


@router.get("/subscription", response_model=SubscriptionResponse)
async def get_subscription(user: dict = Depends(get_current_user)):
    """Get current subscription details."""
    billing = get_billing_service()
    sub = await billing.get_subscription(user["id"])

    # Default features by plan
    default_features = {
        "free": ["50 credits/month", "All AI features", "Export to PDF"],
        "starter": [
            "1,000 credits/month",
            "All AI features",
            "Export to PDF & PPTX",
            "Email support",
            "Unlimited presentations"
        ],
        "pro": [
            "2,000 credits/month",
            "All AI features",
            "Export to PDF & PPTX",
            "Priority support",
            "Unlimited presentations",
            "Overage credits at $0.03 each",
            "Custom branding"
        ],
        "enterprise": [
            "10,000+ credits/month",
            "All AI features",
            "Export to all formats",
            "Dedicated support",
            "Unlimited everything",
            "Custom integrations",
            "SSO & Team management"
        ]
    }

    if not sub:
        # Return free plan info
        return SubscriptionResponse(
            plan_id="free",
            plan_name="Free",
            status="active",
            cancel_at_period_end=False,
            features=default_features["free"]
        )

    plan = sub.get("pricing_plans", {}) or {}
    plan_id = sub["plan_id"]

    # Use database features if available, otherwise use defaults
    # Features may come as JSON string from database, need to parse
    db_features = plan.get("features")
    if db_features:
        if isinstance(db_features, str):
            try:
                features = json.loads(db_features)
            except json.JSONDecodeError:
                features = default_features.get(plan_id, [])
        else:
            features = db_features
    else:
        features = default_features.get(plan_id, [])

    return SubscriptionResponse(
        plan_id=plan_id,
        plan_name=plan.get("name", plan_id.title()),
        status=sub["status"],
        current_period_end=sub.get("current_period_end"),
        cancel_at_period_end=sub.get("cancel_at_period_end", False),
        features=features
    )


@router.get("/plans")
async def get_pricing_plans():
    """Get all available pricing plans."""
    billing = get_billing_service()
    plans = await billing.get_pricing_plans()

    result = []
    for plan in plans:
        monthly_credits = plan.get("monthly_credits", 0)
        # Estimate: 5 credits per slide, 8 slides per presentation
        estimated_presentations = (monthly_credits // 5) // 8 if monthly_credits > 0 else 0

        # Parse features - may come as JSON string from database
        features = plan.get("features", [])
        if isinstance(features, str):
            try:
                features = json.loads(features)
            except json.JSONDecodeError:
                features = []

        result.append(PricingPlan(
            id=plan["id"],
            name=plan["name"],
            description=plan.get("description"),
            monthly_credits=monthly_credits,
            price_cents=plan.get("price_cents", 0),
            features=features,
            estimated_presentations=estimated_presentations
        ))

    return result


@router.get("/check/{action}")
async def check_credits(action: str, user: dict = Depends(get_current_user)):
    """Check if user has enough credits for an action."""
    try:
        credit_action = CreditAction(action)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid action: {action}")

    billing = get_billing_service()
    has_credits, cost, remaining = await billing.check_credits(user["id"], credit_action)

    return CreditCheckResponse(
        has_credits=has_credits,
        cost=cost,
        remaining=remaining,
        action=action
    )


@router.get("/transactions")
async def get_transactions(limit: int = 50, user: dict = Depends(get_current_user)):
    """Get recent credit transactions."""
    billing = get_billing_service()
    transactions = await billing.get_transaction_history(user["id"], limit)
    return transactions


@router.post("/checkout", response_model=CheckoutResponse)
async def create_checkout(request: CheckoutRequest, user: dict = Depends(get_current_user)):
    """Create a Stripe checkout session for subscription."""
    if request.plan_id not in ["starter", "pro"]:
        raise HTTPException(status_code=400, detail="Invalid plan")

    stripe_service = get_stripe_service()

    try:
        result = await stripe_service.create_checkout_session(
            user_id=user["id"],
            email=user.get("email", ""),
            plan_id=request.plan_id,
            success_url=request.success_url,
            cancel_url=request.cancel_url
        )
        return CheckoutResponse(**result)
    except Exception as e:
        logger.error(f"Checkout error: {e}")
        raise HTTPException(status_code=500, detail="Failed to create checkout session")


@router.post("/portal", response_model=PortalResponse)
async def create_portal_session(user: dict = Depends(get_current_user)):
    """Create a Stripe Customer Portal session."""
    stripe_service = get_stripe_service()

    try:
        result = await stripe_service.create_portal_session(user["id"])
        return PortalResponse(**result)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Portal error: {e}")
        raise HTTPException(status_code=500, detail="Failed to create portal session")


@router.post("/cancel")
async def cancel_subscription(
    request: CancelRequest,
    user: dict = Depends(get_current_user)
):
    """Cancel subscription with feedback."""
    billing = get_billing_service()
    stripe_service = get_stripe_service()

    # Get current balance for feedback record
    balance = await billing.get_user_balance(user["id"])
    plan_id = balance.plan_id if balance else "unknown"
    credits = balance.monthly_credits if balance else 0

    # Save cancellation feedback
    try:
        await billing.save_cancellation_feedback(
            user_id=user["id"],
            reason=request.reason,
            reason_details=request.reason_details,
            plan_at_cancel=plan_id,
            credits_at_cancel=credits
        )
    except Exception as e:
        logger.warning(f"Failed to save cancellation feedback: {e}")
        # Continue with cancellation even if feedback fails

    # Cancel at period end (best practice)
    success = await stripe_service.cancel_subscription(user["id"], at_period_end=True)

    if not success:
        raise HTTPException(status_code=400, detail="Failed to cancel subscription")

    return {"status": "canceled", "at_period_end": True}


@router.post("/webhook")
async def stripe_webhook(
    request: Request,
    stripe_signature: str = Header(None, alias="Stripe-Signature")
):
    """Handle Stripe webhook events."""
    if not stripe_signature:
        raise HTTPException(status_code=400, detail="Missing signature")

    payload = await request.body()
    stripe_service = get_stripe_service()

    try:
        result = await stripe_service.handle_webhook(payload, stripe_signature)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Webhook error: {e}")
        raise HTTPException(status_code=500, detail="Webhook processing failed")


@router.post("/sync")
async def sync_subscription(user: dict = Depends(get_current_user)):
    """
    Sync subscription from Stripe.

    Call this after checkout to ensure subscription is updated in the database.
    This is a fallback when webhooks aren't configured.
    """
    stripe_service = get_stripe_service()

    try:
        result = await stripe_service.sync_subscription(user["id"])
        return result
    except Exception as e:
        logger.error(f"Sync error: {e}")
        raise HTTPException(status_code=500, detail="Failed to sync subscription")


# ============================================================================
# Credit Cost Info (for frontend display)
# ============================================================================

@router.get("/costs")
async def get_credit_costs():
    """Get credit costs for all actions."""
    billing = get_billing_service()
    costs = await billing.get_credit_costs()

    return {
        "costs": costs,
        "descriptions": {
            "slide_generation": "Generate a new slide",
            "slide_regeneration": "Regenerate an existing slide",
            "ai_chat": "AI chat message",
            "ai_edit": "AI-assisted component edit",
            "theme_generation": "Generate a theme",
            "outline_generation": "Generate presentation outline",
            "image_generation": "Generate an AI image"
        }
    }
