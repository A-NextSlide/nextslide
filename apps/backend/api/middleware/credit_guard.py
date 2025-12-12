"""
Credit Guard Middleware

Checks user credits before allowing AI operations.
Returns appropriate error if credits are insufficient.
"""

import logging
from functools import wraps
from typing import Optional, Callable
from fastapi import HTTPException, Depends

from services.billing_service import get_billing_service, CreditAction

logger = logging.getLogger(__name__)


class InsufficientCreditsError(HTTPException):
    """Raised when user doesn't have enough credits."""

    def __init__(self, action: str, required: int, remaining: int):
        super().__init__(
            status_code=402,  # Payment Required
            detail={
                "error": "insufficient_credits",
                "message": f"Not enough credits for {action}",
                "required": required,
                "remaining": remaining,
                "upgrade_url": "/pricing"
            }
        )


async def check_user_credits(user_id: str, action: CreditAction) -> tuple[bool, int, int]:
    """
    Check if user has enough credits for an action.

    Returns: (has_credits, cost, remaining)
    """
    billing = get_billing_service()
    return await billing.check_credits(user_id, action)


async def consume_user_credits(
    user_id: str,
    action: CreditAction,
    metadata: Optional[dict] = None,
    description: Optional[str] = None
) -> tuple[bool, int, int]:
    """
    Consume credits for an action.

    Returns: (success, remaining_credits, overage_credits)
    """
    billing = get_billing_service()
    return await billing.consume_credits(user_id, action, metadata, description)


def require_credits(action: CreditAction):
    """
    Decorator for endpoints that require credits.

    Usage:
        @router.post("/generate")
        @require_credits(CreditAction.SLIDE_GENERATION)
        async def generate_slide(user: dict = Depends(get_current_user)):
            ...
    """
    def decorator(func: Callable):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # Get user from kwargs (assumes get_current_user dependency)
            user = kwargs.get('user')
            if not user:
                # Try to find in args
                for arg in args:
                    if isinstance(arg, dict) and 'id' in arg:
                        user = arg
                        break

            if not user or 'id' not in user:
                logger.warning("No user found for credit check")
                return await func(*args, **kwargs)

            user_id = user['id']

            # Check credits
            has_credits, cost, remaining = await check_user_credits(user_id, action)

            if not has_credits:
                raise InsufficientCreditsError(action.value, cost, remaining)

            # Execute the function
            result = await func(*args, **kwargs)

            # Consume credits after successful execution
            await consume_user_credits(
                user_id,
                action,
                metadata={"endpoint": func.__name__}
            )

            return result

        return wrapper
    return decorator


class CreditGuard:
    """
    Context manager for credit operations.

    Usage:
        async with CreditGuard(user_id, CreditAction.SLIDE_GENERATION) as guard:
            if guard.has_credits:
                # Do the operation
                await guard.consume()  # Consume after success
    """

    def __init__(self, user_id: str, action: CreditAction, auto_check: bool = True):
        self.user_id = user_id
        self.action = action
        self.auto_check = auto_check
        self.has_credits = False
        self.cost = 0
        self.remaining = 0
        self._consumed = False

    async def __aenter__(self):
        if self.auto_check:
            self.has_credits, self.cost, self.remaining = await check_user_credits(
                self.user_id, self.action
            )
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        # Don't consume if there was an exception
        pass

    async def check(self) -> bool:
        """Manually check credits."""
        self.has_credits, self.cost, self.remaining = await check_user_credits(
            self.user_id, self.action
        )
        return self.has_credits

    async def consume(self, metadata: Optional[dict] = None) -> bool:
        """Consume credits after successful operation."""
        if self._consumed:
            return True

        if not self.has_credits:
            return False

        success, self.remaining, _ = await consume_user_credits(
            self.user_id,
            self.action,
            metadata=metadata
        )
        self._consumed = success
        return success

    def raise_if_insufficient(self):
        """Raise error if credits are insufficient."""
        if not self.has_credits:
            raise InsufficientCreditsError(self.action.value, self.cost, self.remaining)


async def get_user_credit_balance(user_id: str):
    """Get user's credit balance for API responses."""
    billing = get_billing_service()
    balance = await billing.get_user_balance(user_id)
    if not balance:
        return None

    return {
        "remaining": balance.remaining_credits,
        "total": balance.monthly_credits + balance.purchased_credits,
        "used": balance.used_credits,
        "plan": balance.plan_id
    }
