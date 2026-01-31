"""
PQA (Product Qualified Account) Detection Service

Detects when 3+ users share the same corporate email domain and flags the
domain as an enterprise prospect.  Also manages upgrade-prompt lifecycle
(shown / dismissed / converted) and enterprise feature gating per plan.
"""

import logging
from typing import Optional, Dict, Any
from datetime import datetime, timedelta

from services.supabase import get_supabase_client
from services.growth_config_service import get_growth_config

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Free / consumer email providers to ignore
# ---------------------------------------------------------------------------
FREE_EMAIL_PROVIDERS = frozenset([
    "gmail.com",
    "googlemail.com",
    "outlook.com",
    "hotmail.com",
    "yahoo.com",
    "yahoo.co.uk",
    "aol.com",
    "protonmail.com",
    "icloud.com",
    "me.com",
    "mail.com",
    "zoho.com",
    "yandex.com",
    "gmx.com",
    "gmx.net",
    "live.com",
    "msn.com",
    "fastmail.com",
    "tutanota.com",
])

# ---------------------------------------------------------------------------
# Enterprise feature matrix per plan
# ---------------------------------------------------------------------------
ENTERPRISE_FEATURES: Dict[str, Dict[str, Any]] = {
    "free": {
        "brand_kit": False,
        "team_templates": False,
        "team_analytics": False,
    },
    "starter": {
        "brand_kit": False,          # only brand colors
        "team_templates": False,
        "team_analytics": False,
        "brand_colors": True,
    },
    "pro": {
        "brand_kit": True,           # logo + colors + fonts
        "team_templates": False,
        "team_analytics": False,
        "brand_colors": True,
    },
    "enterprise": {
        "brand_kit": True,
        "team_templates": True,
        "team_analytics": True,
        "brand_colors": True,
    },
}

FEATURE_REQUIRED_PLAN: Dict[str, str] = {
    "brand_kit": "Pro",
    "team_templates": "Enterprise",
    "team_analytics": "Enterprise",
}

PQA_THRESHOLD = 3  # minimum users on the same domain to qualify


class PqaService:
    """Service for PQA detection and upgrade-prompt management."""

    def _get_client(self):
        return get_supabase_client()

    # ------------------------------------------------------------------
    # Domain helpers
    # ------------------------------------------------------------------

    def extract_domain(self, email: str) -> Optional[str]:
        """
        Return the email domain if it is a corporate address.

        Returns ``None`` for free email providers or malformed addresses.
        """
        if not email or "@" not in email:
            return None

        domain = email.strip().lower().split("@")[-1]

        if domain in FREE_EMAIL_PROVIDERS:
            return None

        return domain

    # ------------------------------------------------------------------
    # Domain stats
    # ------------------------------------------------------------------

    def update_domain_stats(self, domain: str) -> dict:
        """
        Recount users with *domain*, upsert ``pqa_domains``, and set
        ``is_pqa`` when the threshold is met.
        """
        try:
            client = self._get_client()

            # Count users whose email ends with @<domain>
            user_result = (
                client.table("users")
                .select("id", count="exact")
                .ilike("email", f"%@{domain}")
                .execute()
            )
            user_count = user_result.count if user_result.count is not None else 0

            # Count decks created by those users
            deck_count = 0
            if user_count > 0:
                user_ids = [u["id"] for u in (user_result.data or [])]
                if user_ids:
                    deck_result = (
                        client.table("decks")
                        .select("uuid", count="exact")
                        .in_("user_id", user_ids)
                        .execute()
                    )
                    deck_count = deck_result.count if deck_result.count is not None else 0

            threshold = get_growth_config().get_int("pqa.threshold", PQA_THRESHOLD)
            is_pqa = user_count >= threshold
            now = datetime.utcnow().isoformat()

            # Upsert domain row
            upsert_data = {
                "domain": domain,
                "user_count": user_count,
                "total_decks": deck_count,
                "is_pqa": is_pqa,
                "last_updated_at": now,
            }

            result = (
                client.table("pqa_domains")
                .upsert(upsert_data, on_conflict="domain")
                .execute()
            )

            row = result.data[0] if result.data else upsert_data
            logger.info(
                "PQA domain updated: %s  users=%d  decks=%d  is_pqa=%s",
                domain,
                user_count,
                deck_count,
                is_pqa,
            )
            return row

        except Exception as exc:
            logger.error("update_domain_stats(%s) failed: %s", domain, exc)
            return {
                "domain": domain,
                "user_count": 0,
                "total_decks": 0,
                "is_pqa": False,
            }

    # ------------------------------------------------------------------
    # PQA status check
    # ------------------------------------------------------------------

    def check_pqa_status(self, user_id: str) -> dict:
        """
        Check whether *user_id*'s domain qualifies as PQA.

        Returns ``{"is_pqa": bool, "domain": str, "user_count": int,
        "company_name": str}``.
        """
        try:
            client = self._get_client()

            # Fetch the user's email
            user_result = (
                client.table("users")
                .select("email")
                .eq("id", user_id)
                .execute()
            )

            if not user_result.data:
                return {
                    "is_pqa": False,
                    "domain": "",
                    "user_count": 0,
                    "company_name": "",
                }

            email = user_result.data[0].get("email", "")
            domain = self.extract_domain(email)

            if not domain:
                return {
                    "is_pqa": False,
                    "domain": "",
                    "user_count": 0,
                    "company_name": "",
                }

            # Check pqa_domains table
            domain_result = (
                client.table("pqa_domains")
                .select("*")
                .eq("domain", domain)
                .execute()
            )

            if domain_result.data:
                row = domain_result.data[0]
                company_name = domain.split(".")[0].capitalize()
                return {
                    "is_pqa": row.get("is_pqa", False),
                    "domain": domain,
                    "user_count": row.get("user_count", 0),
                    "company_name": company_name,
                }

            # Domain not yet tracked - derive from a fresh count
            stats = self.update_domain_stats(domain)
            company_name = domain.split(".")[0].capitalize()
            return {
                "is_pqa": stats.get("is_pqa", False),
                "domain": domain,
                "user_count": stats.get("user_count", 0),
                "company_name": company_name,
            }

        except Exception as exc:
            logger.error("check_pqa_status(%s) failed: %s", user_id, exc)
            return {
                "is_pqa": False,
                "domain": "",
                "user_count": 0,
                "company_name": "",
            }

    # ------------------------------------------------------------------
    # Prompt lifecycle
    # ------------------------------------------------------------------

    def get_pqa_prompt_status(self, user_id: str) -> dict:
        """
        Should we show an upgrade prompt to *user_id*?

        Returns ``{"should_show": bool, "prompt_type": str, "domain": str,
        "user_count": int}``.

        The prompt is suppressed if the user dismissed it within the last 7
        days.
        """
        try:
            pqa = self.check_pqa_status(user_id)

            if not pqa.get("is_pqa"):
                return {
                    "should_show": False,
                    "prompt_type": "",
                    "domain": "",
                    "user_count": 0,
                }

            client = self._get_client()
            seven_days_ago = (datetime.utcnow() - timedelta(days=7)).isoformat()

            # Check for recent dismissals
            dismiss_result = (
                client.table("pqa_upgrade_prompts")
                .select("id, dismissed_at")
                .eq("user_id", user_id)
                .eq("prompt_type", "pqa_team_detected")
                .not_.is_("dismissed_at", "null")
                .gte("dismissed_at", seven_days_ago)
                .execute()
            )

            if dismiss_result.data and len(dismiss_result.data) > 0:
                return {
                    "should_show": False,
                    "prompt_type": "pqa_team_detected",
                    "domain": pqa.get("domain", ""),
                    "user_count": pqa.get("user_count", 0),
                    "reason": "dismissed_recently",
                }

            # Check for conversion (already upgraded)
            convert_result = (
                client.table("pqa_upgrade_prompts")
                .select("id, converted_at")
                .eq("user_id", user_id)
                .not_.is_("converted_at", "null")
                .execute()
            )

            if convert_result.data and len(convert_result.data) > 0:
                return {
                    "should_show": False,
                    "prompt_type": "pqa_team_detected",
                    "domain": pqa.get("domain", ""),
                    "user_count": pqa.get("user_count", 0),
                    "reason": "already_converted",
                }

            return {
                "should_show": True,
                "prompt_type": "pqa_team_detected",
                "domain": pqa.get("domain", ""),
                "user_count": pqa.get("user_count", 0),
                "company_name": pqa.get("company_name", ""),
            }

        except Exception as exc:
            logger.error("get_pqa_prompt_status(%s) failed: %s", user_id, exc)
            return {
                "should_show": False,
                "prompt_type": "",
                "domain": "",
                "user_count": 0,
            }

    def dismiss_pqa_prompt(self, user_id: str, prompt_type: str) -> bool:
        """Record that *user_id* dismissed a PQA prompt."""
        try:
            client = self._get_client()
            pqa = self.check_pqa_status(user_id)
            now = datetime.utcnow().isoformat()

            client.table("pqa_upgrade_prompts").insert({
                "user_id": user_id,
                "domain": pqa.get("domain", ""),
                "prompt_type": prompt_type,
                "shown_at": now,
                "dismissed_at": now,
            }).execute()

            logger.info("PQA prompt dismissed: user=%s type=%s", user_id, prompt_type)
            return True

        except Exception as exc:
            logger.error("dismiss_pqa_prompt(%s, %s) failed: %s", user_id, prompt_type, exc)
            return False

    def record_pqa_conversion(self, user_id: str) -> bool:
        """Record that a PQA user upgraded."""
        try:
            client = self._get_client()
            pqa = self.check_pqa_status(user_id)
            now = datetime.utcnow().isoformat()

            client.table("pqa_upgrade_prompts").insert({
                "user_id": user_id,
                "domain": pqa.get("domain", ""),
                "prompt_type": "pqa_team_detected",
                "shown_at": now,
                "converted_at": now,
            }).execute()

            # Mark domain as notified
            if pqa.get("domain"):
                client.table("pqa_domains").update({
                    "notified": True,
                    "last_updated_at": now,
                }).eq("domain", pqa["domain"]).execute()

            logger.info("PQA conversion recorded: user=%s domain=%s", user_id, pqa.get("domain"))
            return True

        except Exception as exc:
            logger.error("record_pqa_conversion(%s) failed: %s", user_id, exc)
            return False

    # ------------------------------------------------------------------
    # Main entry point
    # ------------------------------------------------------------------

    def detect_pqa_for_user(self, user_id: str, email: str) -> dict:
        """
        Full PQA detection flow for a single user.

        1. Extract domain (skip free providers).
        2. Update aggregate stats.
        3. Return PQA status.
        """
        domain = self.extract_domain(email)

        if not domain:
            return {
                "is_pqa": False,
                "domain": "",
                "user_count": 0,
                "company_name": "",
            }

        stats = self.update_domain_stats(domain)
        company_name = domain.split(".")[0].capitalize()

        return {
            "is_pqa": stats.get("is_pqa", False),
            "domain": domain,
            "user_count": stats.get("user_count", 0),
            "company_name": company_name,
        }

    # ------------------------------------------------------------------
    # Enterprise feature gating
    # ------------------------------------------------------------------

    def get_enterprise_features_status(self, user_id: str, plan_id: str) -> dict:
        """
        Return which enterprise features are available for *plan_id*.

        The returned dict looks like::

            {
                "plan_id": "pro",
                "features": {
                    "brand_kit": True,
                    "team_templates": False,
                    "team_analytics": False,
                    "brand_colors": True,
                },
                "locked_features": [
                    {"feature": "team_templates", "required_plan": "Enterprise"},
                    {"feature": "team_analytics", "required_plan": "Enterprise"},
                ],
            }
        """
        normalized_plan = (plan_id or "free").lower().strip()

        # Map common plan id variants
        plan_map = {
            "free": "free",
            "starter": "starter",
            "pro": "pro",
            "enterprise": "enterprise",
            "team": "enterprise",
            "business": "enterprise",
        }
        plan_key = plan_map.get(normalized_plan, "free")

        features = ENTERPRISE_FEATURES.get(plan_key, ENTERPRISE_FEATURES["free"])

        locked: list[dict] = []
        for feature_name, required_plan in FEATURE_REQUIRED_PLAN.items():
            if not features.get(feature_name, False):
                locked.append({
                    "feature": feature_name,
                    "required_plan": required_plan,
                })

        return {
            "plan_id": plan_key,
            "features": features,
            "locked_features": locked,
        }


# ---------------------------------------------------------------------------
# Module-level singleton
# ---------------------------------------------------------------------------
_pqa_service: Optional[PqaService] = None


def get_pqa_service() -> PqaService:
    global _pqa_service
    if _pqa_service is None:
        _pqa_service = PqaService()
    return _pqa_service
