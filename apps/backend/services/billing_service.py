"""
Billing & Credits Service

Handles:
- Credit balance management
- Subscription status
- Credit consumption tracking
- Usage analytics
"""

import os
import logging
from typing import Optional, Dict, Any, List
from datetime import datetime, timedelta
from dataclasses import dataclass
from enum import Enum

from services.supabase import get_supabase_client

logger = logging.getLogger(__name__)


class CreditAction(str, Enum):
    """Types of credit-consuming actions."""
    SLIDE_GENERATION = "slide_generation"
    SLIDE_REGENERATION = "slide_regeneration"
    AI_CHAT = "ai_chat"
    AI_EDIT = "ai_edit"
    THEME_GENERATION = "theme_generation"
    OUTLINE_GENERATION = "outline_generation"
    IMAGE_GENERATION = "image_generation"


# Default credit costs (can be overridden by database)
DEFAULT_CREDIT_COSTS = {
    CreditAction.SLIDE_GENERATION: 5,
    CreditAction.SLIDE_REGENERATION: 3,
    CreditAction.AI_CHAT: 1,
    CreditAction.AI_EDIT: 2,
    CreditAction.THEME_GENERATION: 3,
    CreditAction.OUTLINE_GENERATION: 2,
    CreditAction.IMAGE_GENERATION: 3,
}


@dataclass
class CreditBalance:
    """User's credit balance."""
    user_id: str
    monthly_credits: int
    purchased_credits: int
    used_credits: int
    remaining_credits: int
    period_end: Optional[datetime]
    plan_id: str
    plan_name: str


@dataclass
class UsageStats:
    """Usage statistics for a user."""
    total_credits_used: int
    slides_generated: int
    chats_sent: int
    edits_made: int
    period_start: datetime
    period_end: datetime


class BillingService:
    """Service for managing billing and credits."""

    def __init__(self):
        self._credit_costs: Optional[Dict[str, int]] = None

    def _get_client(self):
        return get_supabase_client()

    async def get_credit_costs(self) -> Dict[str, int]:
        """Get credit costs from database or defaults."""
        if self._credit_costs:
            return self._credit_costs

        try:
            client = self._get_client()
            result = client.table("credit_costs").select("*").execute()
            if result.data:
                self._credit_costs = {row["action_type"]: row["credit_cost"] for row in result.data}
            else:
                self._credit_costs = {k.value: v for k, v in DEFAULT_CREDIT_COSTS.items()}
        except Exception as e:
            logger.warning(f"Could not load credit costs from DB, using defaults: {e}")
            self._credit_costs = {k.value: v for k, v in DEFAULT_CREDIT_COSTS.items()}

        return self._credit_costs

    def get_credit_cost(self, action: CreditAction) -> int:
        """Get credit cost for a specific action."""
        costs = DEFAULT_CREDIT_COSTS
        return costs.get(action, 1)

    async def get_user_balance(self, user_id: str) -> Optional[CreditBalance]:
        """Get user's current credit balance."""
        try:
            client = self._get_client()

            # Get balance - use .execute() instead of .single() to avoid exception on 0 rows
            balance_result = client.table("credit_balances").select("*").eq("user_id", user_id).execute()

            if not balance_result.data or len(balance_result.data) == 0:
                # Initialize balance for new user
                logger.info(f"Initializing credits for new user: {user_id}")
                await self.initialize_user_credits(user_id)
                balance_result = client.table("credit_balances").select("*").eq("user_id", user_id).execute()

            if not balance_result.data or len(balance_result.data) == 0:
                logger.warning(f"Failed to get/create balance for user: {user_id}")
                return None

            balance = balance_result.data[0]

            # Get subscription/plan - also avoid .single()
            sub_result = client.table("subscriptions").select("*, pricing_plans(*)").eq("user_id", user_id).execute()

            plan_id = "free"
            plan_name = "Free"
            if sub_result.data and len(sub_result.data) > 0:
                sub_data = sub_result.data[0]
                plan_id = sub_data.get("plan_id", "free")
                if sub_data.get("pricing_plans"):
                    plan_name = sub_data["pricing_plans"].get("name", "Free")

            remaining = max(0, (balance["monthly_credits"] + balance["purchased_credits"]) - balance["used_credits"])

            return CreditBalance(
                user_id=user_id,
                monthly_credits=balance["monthly_credits"],
                purchased_credits=balance["purchased_credits"],
                used_credits=balance["used_credits"],
                remaining_credits=remaining,
                period_end=datetime.fromisoformat(balance["period_end"].replace("Z", "+00:00")) if balance.get("period_end") else None,
                plan_id=plan_id,
                plan_name=plan_name
            )
        except Exception as e:
            logger.error(f"Error getting user balance: {e}")
            return None

    async def initialize_user_credits(self, user_id: str) -> bool:
        """Initialize credits for a new user."""
        try:
            client = self._get_client()
            now = datetime.utcnow()
            period_end = now + timedelta(days=30)

            # Create balance
            client.table("credit_balances").upsert({
                "user_id": user_id,
                "monthly_credits": 50,  # Free tier credits
                "purchased_credits": 450,  # Early user bonus
                "used_credits": 0,
                "period_start": now.isoformat(),
                "period_end": period_end.isoformat()
            }).execute()

            # Create subscription
            client.table("subscriptions").upsert({
                "user_id": user_id,
                "plan_id": "free",
                "status": "active",
                "current_period_start": now.isoformat(),
                "current_period_end": period_end.isoformat()
            }).execute()

            return True
        except Exception as e:
            logger.error(f"Error initializing user credits: {e}")
            return False

    async def check_credits(self, user_id: str, action: CreditAction) -> tuple[bool, int, int]:
        """
        Check if user has enough credits for an action.

        Returns: (has_credits, cost, remaining)
        """
        balance = await self.get_user_balance(user_id)
        if not balance:
            return False, 0, 0

        cost = self.get_credit_cost(action)
        has_credits = balance.remaining_credits >= cost

        return has_credits, cost, balance.remaining_credits

    async def consume_credits(
        self,
        user_id: str,
        action: CreditAction,
        metadata: Optional[Dict[str, Any]] = None,
        description: Optional[str] = None,
        allow_overage: bool = True,
        quantity: int = 1
    ) -> tuple[bool, int, int]:
        """
        Consume credits for an action.

        Pro users can go into overage (negative credits) at $0.03/credit.
        Free/Starter users cannot go over.

        Args:
            user_id: User's ID
            action: The type of action being performed
            metadata: Optional metadata to store with the transaction
            description: Optional description for the transaction
            allow_overage: Whether to allow Pro users to go into overage
            quantity: Number of times the action is performed (multiplies the cost)

        Returns: (success, remaining_credits, overage_credits)
        """
        try:
            client = self._get_client()
            base_cost = self.get_credit_cost(action)
            cost = base_cost * quantity

            # Get current balance
            balance = await self.get_user_balance(user_id)
            if not balance:
                return False, 0, 0

            new_remaining = balance.remaining_credits - cost
            overage = 0

            # Check if user has enough credits or is allowed overage
            if new_remaining < 0:
                # Only Pro users can go into overage
                if balance.plan_id == 'pro' and allow_overage:
                    overage = abs(new_remaining)
                    logger.info(f"User {user_id} going into overage: {overage} credits at $0.03/credit")
                elif balance.plan_id == 'enterprise':
                    # Enterprise has unlimited
                    pass
                else:
                    # Free/Starter cannot go over
                    return False, balance.remaining_credits, 0

            # Update balance
            client.table("credit_balances").update({
                "used_credits": balance.used_credits + cost,
                "updated_at": datetime.utcnow().isoformat()
            }).eq("user_id", user_id).execute()

            # Log transaction
            tx_metadata = metadata or {}
            if overage > 0:
                tx_metadata["overage"] = True
                tx_metadata["overage_credits"] = overage
                tx_metadata["overage_cost_cents"] = overage * 3  # $0.03 per credit

            client.table("credit_transactions").insert({
                "user_id": user_id,
                "amount": -cost,
                "balance_after": max(0, new_remaining),
                "transaction_type": action.value,
                "description": description or f"Used {cost} credits for {action.value}",
                "metadata": tx_metadata
            }).execute()

            # If overage, record it for billing
            if overage > 0:
                await self._record_overage(user_id, overage)

            logger.info(f"User {user_id} consumed {cost} credits for {action.value}. Remaining: {max(0, new_remaining)}, Overage: {overage}")
            return True, max(0, new_remaining), overage

        except Exception as e:
            logger.error(f"Error consuming credits: {e}")
            return False, 0, 0

    async def _record_overage(self, user_id: str, credits: int):
        """Record overage credits for end-of-period billing."""
        try:
            client = self._get_client()

            # Get or create overage record for this period
            balance = client.table("credit_balances").select("period_start, period_end").eq("user_id", user_id).single().execute()
            if not balance.data:
                return

            # Check if there's an existing overage record
            existing = client.table("credit_transactions") \
                .select("id, metadata") \
                .eq("user_id", user_id) \
                .eq("transaction_type", "overage_accumulated") \
                .gte("created_at", balance.data["period_start"]) \
                .execute()

            if existing.data:
                # Update existing overage record
                current_overage = existing.data[0].get("metadata", {}).get("total_overage", 0)
                new_total = current_overage + credits
                client.table("credit_transactions").update({
                    "metadata": {
                        "total_overage": new_total,
                        "cost_cents": new_total * 3  # $0.03 per credit
                    }
                }).eq("id", existing.data[0]["id"]).execute()
            else:
                # Create new overage tracking record
                client.table("credit_transactions").insert({
                    "user_id": user_id,
                    "amount": 0,  # Not consuming, just tracking
                    "balance_after": 0,
                    "transaction_type": "overage_accumulated",
                    "description": f"Accumulated overage credits for billing",
                    "metadata": {
                        "total_overage": credits,
                        "cost_cents": credits * 3  # $0.03 per credit
                    }
                }).execute()

        except Exception as e:
            logger.error(f"Error recording overage: {e}")

    async def get_overage(self, user_id: str) -> tuple[int, int]:
        """
        Get current overage for user.

        Returns: (overage_credits, cost_cents)
        """
        try:
            client = self._get_client()

            # Get current period
            balance = client.table("credit_balances").select("period_start").eq("user_id", user_id).single().execute()
            if not balance.data:
                return 0, 0

            # Get overage record
            overage = client.table("credit_transactions") \
                .select("metadata") \
                .eq("user_id", user_id) \
                .eq("transaction_type", "overage_accumulated") \
                .gte("created_at", balance.data["period_start"]) \
                .execute()

            if overage.data and overage.data[0].get("metadata"):
                meta = overage.data[0]["metadata"]
                return meta.get("total_overage", 0), meta.get("cost_cents", 0)

            return 0, 0
        except Exception as e:
            logger.error(f"Error getting overage: {e}")
            return 0, 0

    async def clear_overage(self, user_id: str):
        """Clear overage after it's been billed."""
        try:
            client = self._get_client()
            balance = client.table("credit_balances").select("period_start").eq("user_id", user_id).single().execute()
            if not balance.data:
                return

            # Delete overage records for this period
            client.table("credit_transactions") \
                .delete() \
                .eq("user_id", user_id) \
                .eq("transaction_type", "overage_accumulated") \
                .gte("created_at", balance.data["period_start"]) \
                .execute()

        except Exception as e:
            logger.error(f"Error clearing overage: {e}")

    async def get_usage_stats(self, user_id: str) -> Optional[UsageStats]:
        """Get usage statistics for current period."""
        try:
            client = self._get_client()

            # Get balance for period info (this will auto-initialize if needed)
            balance = await self.get_user_balance(user_id)
            if not balance:
                return None

            # Get transactions for current period
            balance_result = client.table("credit_balances").select("period_start, period_end").eq("user_id", user_id).execute()
            if not balance_result.data or len(balance_result.data) == 0:
                return None

            period_start = balance_result.data[0]["period_start"]
            period_end = balance_result.data[0]["period_end"]

            # Count by type - include metadata for actual slide counts
            transactions = client.table("credit_transactions") \
                .select("transaction_type, amount, metadata") \
                .eq("user_id", user_id) \
                .gte("created_at", period_start) \
                .execute()

            slides_generated = 0
            chats_sent = 0
            edits_made = 0
            total_used = 0

            # Get credit costs for calculating actual counts
            slide_cost = DEFAULT_CREDIT_COSTS.get(CreditAction.SLIDE_GENERATION, 5)
            regen_cost = DEFAULT_CREDIT_COSTS.get(CreditAction.SLIDE_REGENERATION, 3)

            for tx in transactions.data or []:
                amount = abs(tx["amount"])
                total_used += amount
                metadata = tx.get("metadata") or {}

                if tx["transaction_type"] == "slide_generation":
                    # Try to get actual slide count from metadata, fallback to calculating from amount
                    num_slides = metadata.get("num_slides")
                    if num_slides:
                        slides_generated += num_slides
                    else:
                        # Calculate from amount (amount / cost_per_slide)
                        slides_generated += max(1, amount // slide_cost)
                elif tx["transaction_type"] == "slide_regeneration":
                    # Regenerations are typically single slides
                    num_slides = metadata.get("num_slides", 1)
                    slides_generated += num_slides
                elif tx["transaction_type"] == "ai_chat":
                    chats_sent += 1
                elif tx["transaction_type"] == "ai_edit":
                    edits_made += 1

            return UsageStats(
                total_credits_used=total_used,
                slides_generated=slides_generated,
                chats_sent=chats_sent,
                edits_made=edits_made,
                period_start=datetime.fromisoformat(period_start.replace("Z", "+00:00")),
                period_end=datetime.fromisoformat(period_end.replace("Z", "+00:00")) if period_end else datetime.utcnow() + timedelta(days=30)
            )

        except Exception as e:
            logger.error(f"Error getting usage stats: {e}")
            return None

    async def get_transaction_history(self, user_id: str, limit: int = 50) -> List[Dict[str, Any]]:
        """Get recent transaction history."""
        try:
            client = self._get_client()
            result = client.table("credit_transactions") \
                .select("*") \
                .eq("user_id", user_id) \
                .order("created_at", desc=True) \
                .limit(limit) \
                .execute()

            return result.data or []
        except Exception as e:
            logger.error(f"Error getting transaction history: {e}")
            return []

    async def get_subscription(self, user_id: str) -> Optional[Dict[str, Any]]:
        """Get user's subscription details."""
        try:
            client = self._get_client()
            result = client.table("subscriptions") \
                .select("*, pricing_plans(*)") \
                .eq("user_id", user_id) \
                .execute()

            if result.data and len(result.data) > 0:
                return result.data[0]
            return None
        except Exception as e:
            logger.error(f"Error getting subscription: {e}")
            return None

    async def get_pricing_plans(self) -> List[Dict[str, Any]]:
        """Get all active pricing plans."""
        try:
            client = self._get_client()
            result = client.table("pricing_plans") \
                .select("*") \
                .eq("is_active", True) \
                .order("price_cents", desc=False) \
                .execute()

            return result.data or []
        except Exception as e:
            logger.error(f"Error getting pricing plans: {e}")
            return []

    async def save_cancellation_feedback(
        self,
        user_id: str,
        reason: str,
        reason_details: Optional[str],
        plan_at_cancel: str,
        credits_at_cancel: int
    ) -> bool:
        """Save cancellation feedback for analytics."""
        try:
            client = self._get_client()

            # Create table if it doesn't exist (handled via migration, but safe check)
            client.table("cancellation_feedback").insert({
                "user_id": user_id,
                "reason": reason,
                "reason_details": reason_details,
                "plan_at_cancel": plan_at_cancel,
                "credits_at_cancel": credits_at_cancel
            }).execute()

            logger.info(f"Saved cancellation feedback for user {user_id}: {reason}")
            return True
        except Exception as e:
            logger.error(f"Error saving cancellation feedback: {e}")
            raise


# Singleton instance
_billing_service: Optional[BillingService] = None


def get_billing_service() -> BillingService:
    """Get billing service singleton."""
    global _billing_service
    if _billing_service is None:
        _billing_service = BillingService()
    return _billing_service
