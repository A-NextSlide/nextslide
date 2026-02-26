"""
Refund all customers via Stripe.

Usage:
  python scripts/refund_all_customers.py --dry-run    # Preview what will be refunded
  python scripts/refund_all_customers.py --execute     # Actually process refunds
"""

import os
import sys
import argparse
from pathlib import Path
from dotenv import load_dotenv

# Load env
backend_dir = Path(__file__).parent.parent
load_dotenv(backend_dir / ".env")

import stripe

stripe.api_key = os.getenv("STRIPE_SECRET_KEY")
if not stripe.api_key:
    print("ERROR: STRIPE_SECRET_KEY not set in .env")
    sys.exit(1)


def get_all_refundable_charges():
    """Fetch all paid charges that haven't been fully refunded."""
    charges = []
    has_more = True
    starting_after = None

    while has_more:
        params = {"limit": 100, "status": "succeeded"}
        if starting_after:
            params["starting_after"] = starting_after

        result = stripe.Charge.list(**params)
        for charge in result.data:
            # Skip already fully refunded charges
            if charge.refunded:
                continue
            # Skip charges with zero amount
            if charge.amount == 0:
                continue
            charges.append(charge)

        has_more = result.has_more
        if result.data:
            starting_after = result.data[-1].id

    return charges


def dry_run():
    """Show what would be refunded without actually doing it."""
    print("=" * 60)
    print("DRY RUN — No refunds will be processed")
    print("=" * 60)
    print()

    charges = get_all_refundable_charges()

    if not charges:
        print("No refundable charges found.")
        return

    total_cents = 0
    for i, charge in enumerate(charges, 1):
        refundable = charge.amount - charge.amount_refunded
        total_cents += refundable
        email = charge.billing_details.email or charge.receipt_email or "N/A"
        print(
            f"  {i:3d}. {charge.id}  |  {email:30s}  |  "
            f"${refundable / 100:.2f}  |  {charge.created}"
        )

    print()
    print(f"Total charges to refund: {len(charges)}")
    print(f"Total refund amount:     ${total_cents / 100:.2f}")
    print()
    print("To execute refunds, run:")
    print("  python scripts/refund_all_customers.py --execute")


def execute_refunds():
    """Actually process all refunds."""
    charges = get_all_refundable_charges()

    if not charges:
        print("No refundable charges found.")
        return

    total_cents = sum(c.amount - c.amount_refunded for c in charges)
    print(f"About to refund {len(charges)} charges totaling ${total_cents / 100:.2f}")
    print()
    # Confirmation bypassed — approved by operator
    print("Processing refunds...")

    print()
    succeeded = 0
    failed = 0
    for i, charge in enumerate(charges, 1):
        refundable = charge.amount - charge.amount_refunded
        email = charge.billing_details.email or charge.receipt_email or "N/A"
        try:
            stripe.Refund.create(charge=charge.id)
            print(f"  [{i}/{len(charges)}] REFUNDED {charge.id}  |  {email}  |  ${refundable / 100:.2f}")
            succeeded += 1
        except Exception as e:
            print(f"  [{i}/{len(charges)}] FAILED   {charge.id}  |  {email}  |  {e}")
            failed += 1

    print()
    print(f"Done. Succeeded: {succeeded}, Failed: {failed}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Refund all Stripe customers")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--dry-run", action="store_true", help="Preview refunds without processing")
    group.add_argument("--execute", action="store_true", help="Process all refunds")
    args = parser.parse_args()

    if args.dry_run:
        dry_run()
    else:
        execute_refunds()
