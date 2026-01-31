"""
Referral Service

Handles:
- Referral code generation and lookup
- Referral tracking (signup, activation, reward)
- Credit awarding for referrer and referee
- Referral statistics
"""

import os
import string
import secrets
import logging
from typing import Optional, Dict, Any, List
from datetime import datetime

from services.supabase import get_supabase_client
from services.growth_config_service import get_growth_config

logger = logging.getLogger(__name__)

# Credit rewards
REFEREE_SIGNUP_CREDITS = 25   # Credits awarded to the new user on signup
REFERRER_ACTIVATION_CREDITS = 50  # Credits awarded to referrer when referee creates first deck


def _generate_code(length: int = 8) -> str:
    """Generate a short, URL-friendly alphanumeric code."""
    alphabet = string.ascii_lowercase + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


class ReferralService:
    """Service for managing referral program."""

    def _get_client(self):
        return get_supabase_client()

    # ------------------------------------------------------------------
    # Referral Code Management
    # ------------------------------------------------------------------

    async def get_or_create_referral_code(self, user_id: str) -> Dict[str, Any]:
        """
        Get the user's referral code, creating one if it doesn't exist.

        Returns: {"code": "abc12345", "created_at": "..."}
        """
        try:
            client = self._get_client()

            # Check for existing code
            result = client.table("referral_codes").select("*").eq("user_id", user_id).execute()

            if result.data and len(result.data) > 0:
                return {
                    "code": result.data[0]["code"],
                    "created_at": result.data[0]["created_at"],
                }

            # Generate a unique code
            for _ in range(10):
                code = _generate_code()
                try:
                    insert_result = client.table("referral_codes").insert({
                        "user_id": user_id,
                        "code": code,
                    }).execute()

                    if insert_result.data:
                        logger.info(f"Created referral code '{code}' for user {user_id}")
                        return {
                            "code": insert_result.data[0]["code"],
                            "created_at": insert_result.data[0]["created_at"],
                        }
                except Exception as dup_err:
                    # Code collision -- retry
                    if "unique" in str(dup_err).lower() or "duplicate" in str(dup_err).lower():
                        continue
                    raise

            raise RuntimeError("Failed to generate a unique referral code after 10 attempts")

        except Exception as e:
            logger.error(f"Error getting/creating referral code for {user_id}: {e}")
            raise

    async def create_referral_code(self, user_id: str, custom_code: Optional[str] = None) -> Dict[str, Any]:
        """
        Create a referral code for the user.
        If custom_code is provided, validate and claim it.
        Otherwise generate a random one.

        Returns: {"code": "...", "created_at": "..."}
        Raises RuntimeError if custom_code is invalid or taken.
        """
        try:
            client = self._get_client()

            # Check if user already has a code
            existing = client.table("referral_codes").select("*").eq("user_id", user_id).execute()
            if existing.data and len(existing.data) > 0:
                raise RuntimeError("You already have a referral code")

            if custom_code:
                # Validate: 3-20 chars, alphanumeric + hyphens
                import re
                if not re.match(r'^[a-zA-Z0-9][a-zA-Z0-9-]{1,18}[a-zA-Z0-9]$', custom_code):
                    raise RuntimeError("Code must be 3-20 characters, alphanumeric and hyphens only, cannot start/end with hyphen")
                code = custom_code.lower()
                # Check uniqueness
                taken = client.table("referral_codes").select("id").eq("code", code).execute()
                if taken.data and len(taken.data) > 0:
                    raise RuntimeError("This code is already taken")
                try:
                    insert_result = client.table("referral_codes").insert({
                        "user_id": user_id,
                        "code": code,
                    }).execute()
                    if insert_result.data:
                        logger.info(f"Created custom referral code '{code}' for user {user_id}")
                        return {
                            "code": insert_result.data[0]["code"],
                            "created_at": insert_result.data[0]["created_at"],
                        }
                except Exception as dup_err:
                    if "unique" in str(dup_err).lower() or "duplicate" in str(dup_err).lower():
                        raise RuntimeError("This code is already taken")
                    raise
            else:
                # Generate random code
                for _ in range(10):
                    code = _generate_code()
                    try:
                        insert_result = client.table("referral_codes").insert({
                            "user_id": user_id,
                            "code": code,
                        }).execute()
                        if insert_result.data:
                            logger.info(f"Created referral code '{code}' for user {user_id}")
                            return {
                                "code": insert_result.data[0]["code"],
                                "created_at": insert_result.data[0]["created_at"],
                            }
                    except Exception as dup_err:
                        if "unique" in str(dup_err).lower() or "duplicate" in str(dup_err).lower():
                            continue
                        raise

            raise RuntimeError("Failed to generate a unique referral code after 10 attempts")

        except RuntimeError:
            raise
        except Exception as e:
            logger.error(f"Error creating referral code for {user_id}: {e}")
            raise

    async def lookup_referral_code(self, code: str) -> Optional[Dict[str, Any]]:
        """Look up a referral code and return owner info."""
        try:
            client = self._get_client()
            result = (
                client.table("referral_codes")
                .select("user_id, code, created_at")
                .eq("code", code)
                .execute()
            )

            if result.data and len(result.data) > 0:
                row = result.data[0]
                # Fetch referrer display name
                user_result = client.table("users").select("email, full_name").eq("id", row["user_id"]).execute()
                referrer_name = None
                if user_result.data and len(user_result.data) > 0:
                    referrer_name = user_result.data[0].get("full_name") or user_result.data[0].get("email", "").split("@")[0]

                return {
                    "referrer_id": row["user_id"],
                    "code": row["code"],
                    "referrer_name": referrer_name,
                }
            return None

        except Exception as e:
            logger.error(f"Error looking up referral code '{code}': {e}")
            return None

    # ------------------------------------------------------------------
    # Referral Tracking
    # ------------------------------------------------------------------

    async def track_referral_signup(self, referee_id: str, referral_code: str) -> Optional[Dict[str, Any]]:
        """
        Track that a new user signed up via a referral code.
        Awards signup credits to the referee.

        Returns the referral record, or None on failure.
        """
        try:
            client = self._get_client()

            # Look up the code to find the referrer
            code_info = await self.lookup_referral_code(referral_code)
            if not code_info:
                logger.warning(f"Referral code '{referral_code}' not found during signup tracking")
                return None

            referrer_id = code_info["referrer_id"]

            # Don't allow self-referral
            if referrer_id == referee_id:
                logger.warning(f"Self-referral attempt blocked: user {referee_id}")
                return None

            # Check if referee already has a referral record
            existing = client.table("referrals").select("id").eq("referee_id", referee_id).execute()
            if existing.data and len(existing.data) > 0:
                logger.info(f"Referee {referee_id} already has a referral record, skipping")
                return existing.data[0]

            # Read credit amounts from config (fallback to constants)
            referee_credits = get_growth_config().get_int("referral.referee_signup_credits", REFEREE_SIGNUP_CREDITS)

            # Create referral record
            referral = client.table("referrals").insert({
                "referrer_id": referrer_id,
                "referee_id": referee_id,
                "referral_code": referral_code,
                "status": "signed_up",
                "referee_credits_awarded": referee_credits,
            }).execute()

            if referral.data:
                # Award signup bonus credits to the referee
                await self._award_credits(referee_id, referee_credits, f"Referral signup bonus (code: {referral_code})")
                logger.info(f"Tracked referral signup: referrer={referrer_id}, referee={referee_id}, code={referral_code}")
                return referral.data[0]

            return None

        except Exception as e:
            logger.error(f"Error tracking referral signup for referee {referee_id}: {e}")
            return None

    async def activate_referral(self, referee_id: str) -> bool:
        """
        Called when the referee creates their first presentation.
        Awards activation credits to the referrer.
        """
        try:
            client = self._get_client()

            # Find the referral record for this referee
            result = (
                client.table("referrals")
                .select("*")
                .eq("referee_id", referee_id)
                .eq("status", "signed_up")
                .execute()
            )

            if not result.data or len(result.data) == 0:
                return False

            referral = result.data[0]
            referrer_id = referral["referrer_id"]
            now = datetime.utcnow().isoformat()

            # Read credit amount from config (fallback to constant)
            referrer_credits = get_growth_config().get_int("referral.referrer_activation_credits", REFERRER_ACTIVATION_CREDITS)

            # Update referral status to activated
            client.table("referrals").update({
                "status": "rewarded",
                "activated_at": now,
                "rewarded_at": now,
                "referrer_credits_awarded": referrer_credits,
            }).eq("id", referral["id"]).execute()

            # Award credits to the referrer
            await self._award_credits(
                referrer_id,
                referrer_credits,
                f"Referral reward: friend created a presentation"
            )

            logger.info(f"Activated referral: referrer={referrer_id} awarded {referrer_credits} credits for referee={referee_id}")
            return True

        except Exception as e:
            logger.error(f"Error activating referral for referee {referee_id}: {e}")
            return False

    # ------------------------------------------------------------------
    # Stats & Listing
    # ------------------------------------------------------------------

    async def get_referral_stats(self, user_id: str) -> Dict[str, Any]:
        """Get referral dashboard stats for a user."""
        try:
            client = self._get_client()

            # Get or create the referral code
            code_info = await self.get_or_create_referral_code(user_id)

            # Get all referrals for this user
            referrals = (
                client.table("referrals")
                .select("status, referrer_credits_awarded")
                .eq("referrer_id", user_id)
                .execute()
            )

            data = referrals.data or []
            total_referrals = len(data)
            total_signups = sum(1 for r in data if r["status"] in ("signed_up", "activated", "rewarded"))
            total_activated = sum(1 for r in data if r["status"] in ("activated", "rewarded"))
            total_credits_earned = sum(r.get("referrer_credits_awarded", 0) for r in data)

            return {
                "code": code_info["code"],
                "total_referrals": total_referrals,
                "total_signups": total_signups,
                "total_activated": total_activated,
                "total_credits_earned": total_credits_earned,
            }

        except Exception as e:
            logger.error(f"Error getting referral stats for {user_id}: {e}")
            raise

    async def get_referral_list(self, user_id: str) -> List[Dict[str, Any]]:
        """Get list of referrals for a user."""
        try:
            client = self._get_client()

            referrals = (
                client.table("referrals")
                .select("id, referee_id, referral_code, status, referrer_credits_awarded, referee_credits_awarded, created_at, activated_at, rewarded_at")
                .eq("referrer_id", user_id)
                .order("created_at", desc=True)
                .execute()
            )

            result = []
            for ref in referrals.data or []:
                # Get referee email (partially masked)
                referee_email = None
                try:
                    user_result = client.table("users").select("email").eq("id", ref["referee_id"]).execute()
                    if user_result.data and len(user_result.data) > 0:
                        email = user_result.data[0].get("email", "")
                        referee_email = self._mask_email(email)
                except Exception:
                    pass

                result.append({
                    "id": ref["id"],
                    "referee_email": referee_email or "Unknown",
                    "status": ref["status"],
                    "referrer_credits_awarded": ref.get("referrer_credits_awarded", 0),
                    "referee_credits_awarded": ref.get("referee_credits_awarded", 0),
                    "created_at": ref["created_at"],
                    "activated_at": ref.get("activated_at"),
                    "rewarded_at": ref.get("rewarded_at"),
                })

            return result

        except Exception as e:
            logger.error(f"Error getting referral list for {user_id}: {e}")
            return []

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _mask_email(email: str) -> str:
        """Partially mask an email: j***n@gmail.com"""
        if not email or "@" not in email:
            return "***"
        local, domain = email.split("@", 1)
        if len(local) <= 2:
            masked_local = local[0] + "***"
        else:
            masked_local = local[0] + "***" + local[-1]
        return f"{masked_local}@{domain}"

    async def _award_credits(self, user_id: str, credits: int, description: str) -> bool:
        """
        Award bonus credits to a user by adding to purchased_credits
        and logging a credit transaction.
        """
        try:
            client = self._get_client()

            # Get current balance
            balance_result = client.table("credit_balances").select("purchased_credits").eq("user_id", user_id).execute()
            if not balance_result.data or len(balance_result.data) == 0:
                logger.warning(f"No credit balance found for user {user_id} -- cannot award {credits} credits")
                return False

            current_purchased = balance_result.data[0].get("purchased_credits", 0)

            # Update purchased_credits
            client.table("credit_balances").update({
                "purchased_credits": current_purchased + credits,
                "updated_at": datetime.utcnow().isoformat(),
            }).eq("user_id", user_id).execute()

            # Log transaction
            client.table("credit_transactions").insert({
                "user_id": user_id,
                "amount": credits,
                "balance_after": current_purchased + credits,
                "transaction_type": "referral_bonus",
                "description": description,
                "metadata": {"source": "referral", "credits": credits},
            }).execute()

            logger.info(f"Awarded {credits} referral credits to user {user_id}: {description}")
            return True

        except Exception as e:
            logger.error(f"Error awarding {credits} credits to {user_id}: {e}")
            return False


# ---------------------------------------------------------------------------
# Singleton
# ---------------------------------------------------------------------------
_referral_service: Optional[ReferralService] = None


def get_referral_service() -> ReferralService:
    """Get referral service singleton."""
    global _referral_service
    if _referral_service is None:
        _referral_service = ReferralService()
    return _referral_service
