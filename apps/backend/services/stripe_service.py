"""
Stripe Integration Service

Handles:
- Checkout sessions
- Subscription management
- Webhook processing
- Customer management
"""

import os
import logging
from typing import Optional, Dict, Any
from datetime import datetime, timedelta
from pathlib import Path
from dotenv import load_dotenv

# Load env vars from backend directory - only if file exists, don't override system env
backend_dir = Path(__file__).parent.parent
env_path = backend_dir / ".env"
if env_path.exists():
    load_dotenv(env_path, override=False)  # Don't override system env vars (Render)

try:
    import stripe
    STRIPE_AVAILABLE = True
except ImportError:
    STRIPE_AVAILABLE = False
    stripe = None

from services.supabase import get_supabase_client

logger = logging.getLogger(__name__)


def _get_stripe_key():
    """Get Stripe key dynamically to handle reloader."""
    return os.getenv("STRIPE_SECRET_KEY")


def _get_frontend_url():
    """Get frontend URL dynamically."""
    return os.getenv("FRONTEND_URL", "http://localhost:8080")


def _get_price_ids():
    """Get Stripe price IDs dynamically."""
    return {
        "starter": os.getenv("STRIPE_PRICE_STARTER"),
        "pro": os.getenv("STRIPE_PRICE_PRO"),
    }


def _get_webhook_secret():
    """Get Stripe webhook secret dynamically."""
    return os.getenv("STRIPE_WEBHOOK_SECRET")


def _ensure_stripe_configured():
    """Ensure Stripe is configured with the API key."""
    if not STRIPE_AVAILABLE:
        return False
    key = _get_stripe_key()
    if key:
        stripe.api_key = key
        return True
    return False


# Check initial configuration status (exposed for startup display)
STRIPE_CONFIGURED = _ensure_stripe_configured()
if STRIPE_CONFIGURED:
    logger.info("Stripe configured successfully")
else:
    logger.warning(f"Stripe not configured - env_path={env_path}, exists={env_path.exists()}")


class StripeService:
    """Service for Stripe payment integration."""

    def _get_db(self):
        return get_supabase_client()

    def _check_stripe_available(self):
        """Check if Stripe is properly configured."""
        if not _ensure_stripe_configured():
            raise ValueError("Stripe is not configured. Please set STRIPE_SECRET_KEY environment variable.")

    async def get_or_create_customer(self, user_id: str, email: str, name: Optional[str] = None) -> str:
        """Get or create a Stripe customer for a user."""
        self._check_stripe_available()
        db = self._get_db()

        # Check if customer already exists
        sub = db.table("subscriptions").select("stripe_customer_id").eq("user_id", user_id).single().execute()

        if sub.data and sub.data.get("stripe_customer_id"):
            return sub.data["stripe_customer_id"]

        # Create new customer
        customer = stripe.Customer.create(
            email=email,
            name=name,
            metadata={"user_id": user_id}
        )

        # Save customer ID
        db.table("subscriptions").update({
            "stripe_customer_id": customer.id
        }).eq("user_id", user_id).execute()

        return customer.id

    async def get_active_subscription(self, user_id: str) -> Optional[Dict[str, Any]]:
        """Get user's active Stripe subscription if one exists."""
        db = self._get_db()

        # Get subscription info from database
        result = db.table("subscriptions") \
            .select("stripe_subscription_id, stripe_customer_id, plan_id, status") \
            .eq("user_id", user_id) \
            .single() \
            .execute()

        if not result.data:
            return None

        sub_id = result.data.get("stripe_subscription_id")
        if not sub_id:
            return None

        # Verify subscription is active in Stripe
        try:
            stripe_sub = stripe.Subscription.retrieve(sub_id)
            if stripe_sub.status in ["active", "trialing"]:
                return {
                    "subscription_id": sub_id,
                    "customer_id": result.data.get("stripe_customer_id"),
                    "current_plan": result.data.get("plan_id"),
                    "status": stripe_sub.status,
                    "current_price_id": stripe_sub["items"]["data"][0]["price"]["id"] if stripe_sub["items"]["data"] else None
                }
        except Exception as e:
            logger.warning(f"Could not retrieve Stripe subscription {sub_id}: {e}")

        return None

    async def upgrade_subscription(
        self,
        user_id: str,
        new_plan_id: str,
        success_url: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Upgrade an existing subscription to a new plan with proration.

        Stripe automatically calculates the prorated amount - user only pays
        the difference for the remaining billing period.
        """
        self._check_stripe_available()
        prices = _get_price_ids()
        new_price_id = prices.get(new_plan_id)
        if not new_price_id:
            raise ValueError(f"No Stripe price configured for plan: {new_plan_id}")

        # Get current subscription
        active_sub = await self.get_active_subscription(user_id)
        if not active_sub:
            raise ValueError("No active subscription to upgrade")

        subscription_id = active_sub["subscription_id"]

        # Get the subscription item ID (needed for modification)
        stripe_sub = stripe.Subscription.retrieve(subscription_id)
        if not stripe_sub["items"]["data"]:
            raise ValueError("Subscription has no items")

        subscription_item_id = stripe_sub["items"]["data"][0]["id"]

        # Modify the subscription with proration
        # proration_behavior="create_prorations" is the default and charges the difference
        updated_sub = stripe.Subscription.modify(
            subscription_id,
            items=[{
                "id": subscription_item_id,
                "price": new_price_id
            }],
            proration_behavior="create_prorations",
            metadata={
                "user_id": user_id,
                "plan_id": new_plan_id
            }
        )

        # Update local database
        await self._update_subscription_from_stripe(updated_sub)

        frontend_url = _get_frontend_url()

        logger.info(f"Upgraded subscription for user {user_id} to {new_plan_id} with proration")

        return {
            "upgraded": True,
            "plan_id": new_plan_id,
            "subscription_id": subscription_id,
            "redirect_url": success_url or f"{frontend_url}/profile?tab=billing&billing=upgraded"
        }

    async def create_checkout_session(
        self,
        user_id: str,
        email: str,
        plan_id: str,
        success_url: Optional[str] = None,
        cancel_url: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Create a Stripe Checkout session for subscription.

        If user has an active subscription, this will upgrade it with proration
        instead of creating a new subscription (avoiding double charges).
        """
        self._check_stripe_available()

        # Check for existing active subscription
        active_sub = await self.get_active_subscription(user_id)

        if active_sub:
            current_plan = active_sub.get("current_plan")

            # If already on this plan, just redirect to billing
            if current_plan == plan_id:
                frontend_url = _get_frontend_url()
                return {
                    "session_id": None,
                    "url": f"{frontend_url}/profile?tab=billing&already_subscribed=true",
                    "already_subscribed": True
                }

            # Upgrade existing subscription with proration
            result = await self.upgrade_subscription(user_id, plan_id, success_url)
            return {
                "session_id": None,
                "url": result["redirect_url"],
                "upgraded": True
            }

        # No existing subscription - create new checkout session
        prices = _get_price_ids()
        price_id = prices.get(plan_id)
        if not price_id:
            raise ValueError(f"No Stripe price configured for plan: {plan_id}")

        customer_id = await self.get_or_create_customer(user_id, email)
        frontend_url = _get_frontend_url()

        session = stripe.checkout.Session.create(
            customer=customer_id,
            payment_method_types=["card"],
            line_items=[{
                "price": price_id,
                "quantity": 1
            }],
            mode="subscription",
            success_url=success_url or f"{frontend_url}/profile?tab=billing&billing=success",
            cancel_url=cancel_url or f"{frontend_url}/pricing?canceled=true",
            metadata={
                "user_id": user_id,
                "plan_id": plan_id
            },
            subscription_data={
                "metadata": {
                    "user_id": user_id,
                    "plan_id": plan_id
                }
            },
            allow_promotion_codes=True
        )

        return {
            "session_id": session.id,
            "url": session.url
        }

    async def create_portal_session(self, user_id: str) -> Dict[str, Any]:
        """Create a Stripe Customer Portal session."""
        self._check_stripe_available()
        db = self._get_db()

        # Get customer ID
        sub = db.table("subscriptions").select("stripe_customer_id").eq("user_id", user_id).single().execute()

        if not sub.data or not sub.data.get("stripe_customer_id"):
            raise ValueError("No Stripe customer found for user. Please subscribe to a plan first.")

        frontend_url = _get_frontend_url()

        try:
            session = stripe.billing_portal.Session.create(
                customer=sub.data["stripe_customer_id"],
                return_url=f"{frontend_url}/profile?tab=billing"
            )
            return {"url": session.url}
        except stripe.error.InvalidRequestError as e:
            # Customer doesn't exist in Stripe (maybe from different test/live mode)
            if "No such customer" in str(e):
                # Clear the invalid customer ID
                db.table("subscriptions").update({
                    "stripe_customer_id": None,
                    "stripe_subscription_id": None
                }).eq("user_id", user_id).execute()
                logger.warning(f"Cleared invalid Stripe customer for user {user_id}")
                raise ValueError("Your billing account needs to be re-linked. Please subscribe to a plan.")
            raise

    async def handle_webhook(self, payload: bytes, signature: str) -> Dict[str, Any]:
        """Handle Stripe webhook events."""
        webhook_secret = _get_webhook_secret()
        if not webhook_secret:
            logger.error("Stripe webhook secret not configured")
            raise ValueError("Webhook secret not configured")

        try:
            event = stripe.Webhook.construct_event(
                payload, signature, webhook_secret
            )
        except stripe.error.SignatureVerificationError as e:
            logger.error(f"Webhook signature verification failed: {e}")
            raise ValueError("Invalid signature")

        event_type = event["type"]
        data = event["data"]["object"]

        logger.info(f"Processing Stripe webhook: {event_type}")

        handlers = {
            "checkout.session.completed": self._handle_checkout_completed,
            "customer.subscription.created": self._handle_subscription_created,
            "customer.subscription.updated": self._handle_subscription_updated,
            "customer.subscription.deleted": self._handle_subscription_deleted,
            "invoice.created": self._handle_invoice_created,
            "invoice.paid": self._handle_invoice_paid,
            "invoice.payment_failed": self._handle_payment_failed,
        }

        handler = handlers.get(event_type)
        if handler:
            await handler(data)
            return {"status": "processed", "event": event_type}

        return {"status": "ignored", "event": event_type}

    async def _handle_checkout_completed(self, session: Dict[str, Any]):
        """Handle successful checkout."""
        user_id = session.get("metadata", {}).get("user_id")
        if not user_id:
            logger.warning("No user_id in checkout session metadata")
            return

        plan_id = session.get("metadata", {}).get("plan_id", "starter")
        db = self._get_db()
        now = datetime.utcnow()

        # Plan credits mapping
        plan_credits = {
            "free": 50,
            "starter": 1000,
            "pro": 2000,
            "enterprise": 100000
        }

        # Check for Friends & Family coupon by fetching the subscription from Stripe
        is_friends_family = False
        subscription_id = session.get("subscription")
        if subscription_id:
            try:
                sub = stripe.Subscription.retrieve(subscription_id)
                if sub.discount and sub.discount.coupon:
                    coupon_id = sub.discount.coupon.id
                    if coupon_id == "WOOHOOFREESLIDES":
                        is_friends_family = True
                        logger.info(f"Checkout: User {user_id} has Friends & Family coupon!")
            except Exception as e:
                logger.warning(f"Could not fetch subscription to check coupon: {e}")

        # Update subscription with Stripe IDs AND plan details
        sub_result = db.table("subscriptions").update({
            "stripe_subscription_id": subscription_id,
            "stripe_customer_id": session.get("customer"),
            "plan_id": plan_id,
            "status": "active",
            "updated_at": now.isoformat()
        }).eq("user_id", user_id).execute()

        if not sub_result.data:
            logger.warning(f"Checkout: subscriptions update returned no data for user {user_id}")

        # Friends & Family get unlimited credits (-1)
        monthly_credits = -1 if is_friends_family else plan_credits.get(plan_id, 100)
        credits_result = db.table("credit_balances").update({
            "monthly_credits": monthly_credits,
            "used_credits": 0,
            "updated_at": now.isoformat()
        }).eq("user_id", user_id).execute()

        if not credits_result.data:
            logger.warning(f"Checkout: credit_balances update returned no data for user {user_id}")

        logger.info(f"Checkout completed for user {user_id}: plan={plan_id}, credits={monthly_credits}, friends_family={is_friends_family}")

    async def _handle_subscription_created(self, subscription: Dict[str, Any]):
        """Handle new subscription created."""
        await self._update_subscription_from_stripe(subscription)

    async def _handle_subscription_updated(self, subscription: Dict[str, Any]):
        """Handle subscription update."""
        await self._update_subscription_from_stripe(subscription)

    async def _handle_subscription_deleted(self, subscription: Dict[str, Any]):
        """Handle subscription cancellation."""
        db = self._get_db()

        # Find user by Stripe subscription ID
        result = db.table("subscriptions") \
            .select("user_id") \
            .eq("stripe_subscription_id", subscription["id"]) \
            .single() \
            .execute()

        if not result.data:
            return

        user_id = result.data["user_id"]
        now = datetime.utcnow()

        # Downgrade to free
        db.table("subscriptions").update({
            "plan_id": "free",
            "status": "canceled",
            "updated_at": now.isoformat()
        }).eq("user_id", user_id).execute()

        # Reset credits to free tier
        db.table("credit_balances").update({
            "monthly_credits": 50,
            "updated_at": now.isoformat()
        }).eq("user_id", user_id).execute()

        logger.info(f"Subscription canceled for user {user_id}")

    async def _update_subscription_from_stripe(self, subscription: Dict[str, Any]):
        """Update local subscription from Stripe data."""
        db = self._get_db()

        user_id = subscription.get("metadata", {}).get("user_id")
        if not user_id:
            # Try to find by customer ID
            customer_result = db.table("subscriptions") \
                .select("user_id") \
                .eq("stripe_customer_id", subscription.get("customer")) \
                .single() \
                .execute()
            if customer_result.data:
                user_id = customer_result.data["user_id"]

        if not user_id:
            logger.warning("Could not find user for subscription")
            return

        # Get plan_id from subscription metadata, with fallbacks
        plan_id = subscription.get("metadata", {}).get("plan_id")

        # Fallback: check price/plan metadata
        if not plan_id:
            items = subscription.get("items", {})
            if items and items.get("data"):
                price = items["data"][0].get("price", {})
                price_metadata = price.get("metadata", {})
                plan_id = price_metadata.get("plan_id")

        # Ultimate fallback based on price amount
        if not plan_id:
            items = subscription.get("items", {})
            if items and items.get("data"):
                price = items["data"][0].get("price", {})
                amount = price.get("unit_amount", 0)
                # $9.99 = 999 cents = starter, $19.99 = 1999 cents = pro
                if amount >= 1999:
                    plan_id = "pro"
                elif amount >= 999:
                    plan_id = "starter"
                else:
                    plan_id = "pro"  # Default to pro if unclear
            else:
                plan_id = "pro"

        logger.info(f"Webhook: Resolved plan_id={plan_id} for user {user_id}")

        # Check for Friends & Family coupon (100% off forever)
        is_friends_family = False
        discount = subscription.get("discount")
        if discount and discount.get("coupon"):
            coupon_id = discount["coupon"].get("id", "")
            if coupon_id == "WOOHOOFREESLIDES":
                is_friends_family = True
                logger.info(f"User {user_id} has Friends & Family coupon - granting unlimited credits")

        # Map Stripe status to our status
        status_map = {
            "active": "active",
            "past_due": "past_due",
            "canceled": "canceled",
            "unpaid": "past_due",
            "trialing": "trialing",
            "paused": "paused"
        }
        status = status_map.get(subscription.get("status"), "active")

        now = datetime.utcnow()

        # Update subscription - safely access period fields
        update_data = {
            "plan_id": plan_id,
            "status": status,
            "stripe_subscription_id": subscription["id"],
            "cancel_at_period_end": subscription.get("cancel_at_period_end", False),
            "updated_at": now.isoformat()
        }

        # Safely add period fields if they exist
        if subscription.get("current_period_start"):
            update_data["current_period_start"] = datetime.fromtimestamp(subscription["current_period_start"]).isoformat()
        if subscription.get("current_period_end"):
            update_data["current_period_end"] = datetime.fromtimestamp(subscription["current_period_end"]).isoformat()

        db.table("subscriptions").update(update_data).eq("user_id", user_id).execute()

        # Update credit allocation based on plan
        plan_credits = {
            "free": 50,
            "starter": 1000,
            "pro": 2000,
            "enterprise": 100000  # Effectively unlimited
        }

        # Friends & Family get unlimited credits (-1 = infinite)
        monthly_credits = -1 if is_friends_family else plan_credits.get(plan_id, 100)

        credit_update_data = {
            "monthly_credits": monthly_credits,
            "updated_at": now.isoformat()
        }
        if subscription.get("current_period_end"):
            credit_update_data["period_end"] = datetime.fromtimestamp(subscription["current_period_end"]).isoformat()

        db.table("credit_balances").update(credit_update_data).eq("user_id", user_id).execute()

        logger.info(f"Updated subscription for user {user_id}: plan={plan_id}, status={status}")

    async def _handle_invoice_created(self, invoice: Dict[str, Any]):
        """Add overage charges to invoice before it's finalized."""
        from services.billing_service import get_billing_service

        db = self._get_db()
        customer_id = invoice.get("customer")
        if not customer_id:
            return

        # Find user
        result = db.table("subscriptions") \
            .select("user_id, plan_id") \
            .eq("stripe_customer_id", customer_id) \
            .single() \
            .execute()

        if not result.data:
            return

        user_id = result.data["user_id"]
        plan_id = result.data.get("plan_id")

        # Only Pro users have overage
        if plan_id != "pro":
            return

        # Get overage
        billing = get_billing_service()
        overage_credits, overage_cents = await billing.get_overage(user_id)

        if overage_credits > 0 and overage_cents > 0:
            try:
                # Add invoice item for overage
                stripe.InvoiceItem.create(
                    customer=customer_id,
                    invoice=invoice["id"],
                    amount=overage_cents,
                    currency="usd",
                    description=f"Credit overage: {overage_credits} credits @ $0.03/credit"
                )
                logger.info(f"Added overage charge for user {user_id}: {overage_credits} credits = ${overage_cents/100:.2f}")

                # Clear overage after adding to invoice
                await billing.clear_overage(user_id)
            except Exception as e:
                logger.error(f"Failed to add overage to invoice: {e}")

    async def _handle_invoice_paid(self, invoice: Dict[str, Any]):
        """Handle successful payment."""
        db = self._get_db()

        customer_id = invoice.get("customer")
        if not customer_id:
            return

        # Find user
        result = db.table("subscriptions") \
            .select("user_id") \
            .eq("stripe_customer_id", customer_id) \
            .single() \
            .execute()

        if not result.data:
            return

        user_id = result.data["user_id"]

        # Store invoice
        db.table("invoices").upsert({
            "user_id": user_id,
            "stripe_invoice_id": invoice["id"],
            "amount_cents": invoice.get("amount_paid", 0),
            "currency": invoice.get("currency", "usd"),
            "status": "paid",
            "invoice_url": invoice.get("hosted_invoice_url"),
            "pdf_url": invoice.get("invoice_pdf"),
            "period_start": datetime.fromtimestamp(invoice["period_start"]).isoformat() if invoice.get("period_start") else None,
            "period_end": datetime.fromtimestamp(invoice["period_end"]).isoformat() if invoice.get("period_end") else None
        }).execute()

        # Reset used credits for new period
        if invoice.get("billing_reason") == "subscription_cycle":
            db.table("credit_balances").update({
                "used_credits": 0,
                "period_start": datetime.utcnow().isoformat()
            }).eq("user_id", user_id).execute()

            logger.info(f"Reset credits for user {user_id} (new billing cycle)")

    async def _handle_payment_failed(self, invoice: Dict[str, Any]):
        """Handle failed payment."""
        db = self._get_db()

        customer_id = invoice.get("customer")
        if not customer_id:
            return

        # Find user
        result = db.table("subscriptions") \
            .select("user_id") \
            .eq("stripe_customer_id", customer_id) \
            .single() \
            .execute()

        if not result.data:
            return

        user_id = result.data["user_id"]

        # Update subscription status
        db.table("subscriptions").update({
            "status": "past_due",
            "updated_at": datetime.utcnow().isoformat()
        }).eq("user_id", user_id).execute()

        logger.warning(f"Payment failed for user {user_id}")

    async def cancel_subscription(self, user_id: str, at_period_end: bool = True) -> bool:
        """Cancel a subscription."""
        db = self._get_db()

        # Get subscription
        result = db.table("subscriptions") \
            .select("stripe_subscription_id") \
            .eq("user_id", user_id) \
            .single() \
            .execute()

        if not result.data or not result.data.get("stripe_subscription_id"):
            return False

        try:
            if at_period_end:
                updated_sub = stripe.Subscription.modify(
                    result.data["stripe_subscription_id"],
                    cancel_at_period_end=True
                )
                # Update local DB immediately so the frontend gets correct data
                # without waiting for the Stripe webhook
                update_data = {
                    "cancel_at_period_end": True,
                    "updated_at": datetime.utcnow().isoformat()
                }
                if updated_sub.current_period_start:
                    update_data["current_period_start"] = datetime.fromtimestamp(
                        updated_sub.current_period_start
                    ).isoformat()
                if updated_sub.current_period_end:
                    update_data["current_period_end"] = datetime.fromtimestamp(
                        updated_sub.current_period_end
                    ).isoformat()
                db.table("subscriptions").update(update_data).eq("user_id", user_id).execute()
            else:
                stripe.Subscription.cancel(result.data["stripe_subscription_id"])

            return True
        except Exception as e:
            logger.error(f"Error canceling subscription: {e}")
            return False

    async def sync_subscription(self, user_id: str) -> Dict[str, Any]:
        """
        Sync subscription from Stripe to database.

        This is used after checkout when webhooks aren't configured.
        It fetches the latest subscription from Stripe and updates the database.
        """
        self._check_stripe_available()
        db = self._get_db()

        # Get customer ID from database
        sub_result = db.table("subscriptions") \
            .select("stripe_customer_id") \
            .eq("user_id", user_id) \
            .execute()

        if not sub_result.data or not sub_result.data[0].get("stripe_customer_id"):
            return {"synced": False, "message": "No Stripe customer found"}

        customer_id = sub_result.data[0]["stripe_customer_id"]

        # Get subscriptions from Stripe
        try:
            subscriptions = stripe.Subscription.list(customer=customer_id, status="active", limit=1)

            if not subscriptions.data:
                return {"synced": False, "message": "No active subscription found in Stripe"}

            sub = subscriptions.data[0]

            # Get plan_id from subscription metadata, falling back to price metadata
            plan_id = None

            # Try subscription metadata first (dict-like or attribute access)
            if hasattr(sub, 'metadata') and sub.metadata:
                plan_id = sub.metadata.get("plan_id") if hasattr(sub.metadata, 'get') else sub.metadata.get("plan_id")

            # Fallback: check price/plan metadata
            if not plan_id and sub.get("items") and sub["items"].get("data"):
                price = sub["items"]["data"][0].get("price", {})
                price_metadata = price.get("metadata", {})
                plan_id = price_metadata.get("plan_id")

            # Ultimate fallback based on price amount
            if not plan_id:
                # Get price from subscription
                if sub.get("items") and sub["items"].get("data"):
                    price = sub["items"]["data"][0].get("price", {})
                    amount = price.get("unit_amount", 0)
                    # $9.99 = 999 cents = starter, $19.99 = 1999 cents = pro
                    if amount >= 1999:
                        plan_id = "pro"
                    elif amount >= 999:
                        plan_id = "starter"
                    else:
                        plan_id = "starter"
                else:
                    plan_id = "starter"

            logger.info(f"Sync: Resolved plan_id={plan_id} for user {user_id} (customer={customer_id})")

            # Calculate period dates
            now = datetime.utcnow()
            # Use actual Stripe period dates instead of hardcoded 30 days
            period_start = datetime.fromtimestamp(sub.current_period_start)
            period_end = datetime.fromtimestamp(sub.current_period_end)

            # Plan credits mapping
            plan_credits = {
                "free": 50,
                "starter": 1000,
                "pro": 2000,
                "enterprise": 100000
            }

            # Update subscription
            sub_update_result = db.table("subscriptions").update({
                "plan_id": plan_id,
                "status": "active",
                "stripe_subscription_id": sub.id,
                "current_period_start": period_start.isoformat(),
                "current_period_end": period_end.isoformat(),
                "cancel_at_period_end": sub.cancel_at_period_end,
                "updated_at": now.isoformat()
            }).eq("user_id", user_id).execute()

            if not sub_update_result.data:
                logger.warning(f"Sync: subscriptions update returned no data for user {user_id}")

            # Update credit balance
            monthly_credits = plan_credits.get(plan_id, 100)
            credits_update_result = db.table("credit_balances").update({
                "monthly_credits": monthly_credits,
                "used_credits": 0,  # Reset for new subscription
                "period_start": period_start.isoformat(),
                "period_end": period_end.isoformat(),
                "updated_at": now.isoformat()
            }).eq("user_id", user_id).execute()

            if not credits_update_result.data:
                logger.warning(f"Sync: credit_balances update returned no data for user {user_id}")

            logger.info(f"Synced subscription for user {user_id}: plan={plan_id}, credits={monthly_credits}")

            return {
                "synced": True,
                "plan_id": plan_id,
                "monthly_credits": plan_credits.get(plan_id, 100),
                "status": "active"
            }

        except Exception as e:
            logger.error(f"Error syncing subscription: {e}")
            return {"synced": False, "message": str(e)}


# Singleton
_stripe_service: Optional[StripeService] = None


def get_stripe_service() -> StripeService:
    """Get Stripe service singleton."""
    global _stripe_service
    if _stripe_service is None:
        _stripe_service = StripeService()
    return _stripe_service
