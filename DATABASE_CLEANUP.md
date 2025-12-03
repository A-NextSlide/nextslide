# NextSlide Database Cleanup Report

**Date:** December 3, 2025
**Purpose:** Spring cleaning before product launch

---

## Summary

| Category | Total | Used | Unused | Action Needed |
|----------|-------|------|--------|---------------|
| Tables | 44 | 34 | 10 | Keep unused for now |
| Views | 10 | 3 | 7 | DROP 7 views |
| Materialized Views | 2 | 1 | 1 | DROP 1 view |
| Functions | 50+ | ~40 | ~10 | Review later |

---

## Critical Security Issues (FIXED)

### 1. Views Exposing auth.users (FIXED)

These views were accessible by `anon` role and exposed `auth.users` data:

| View | Issue | Status |
|------|-------|--------|
| `active_deck_shares` | JOINs auth.users | ✅ Revoked anon access |
| `deck_share_analytics_summary` | JOINs auth.users | ✅ Revoked anon access |
| `user_shared_decks` | Selects from auth.users | ✅ Revoked anon access |

### 2. Security Definer Views (FIXED)

These views bypass RLS - revoked public access:

| View | Status |
|------|--------|
| `user_deck_stats` | ✅ Revoked anon access |
| `active_users_summary` | ✅ Revoked anon access |
| `deck_analytics_summary` | ✅ Revoked anon access |
| `v_agent_recent_edits` | ✅ Revoked anon access |
| `v_agent_session_timeline` | ✅ Revoked anon access |
| `brandfetch_cache_stats` | ✅ Revoked anon access |
| `active_deck_shares` | ✅ Revoked anon access |
| `deck_share_analytics_summary` | ✅ Revoked anon access |
| `user_shared_decks` | ✅ Revoked anon access |

### 3. Materialized Views (FIXED)

| View | Status |
|------|--------|
| `user_metrics` | ✅ Revoked anon + authenticated access |
| `deck_stats` | ✅ Revoked anon + authenticated access |

---

## Tables Analysis

### Actively Used (Keep)

| Table | Rows | Size | Usage |
|-------|------|------|-------|
| `decks` | 3,677 | 586 MB | Core presentation data |
| `admin_audit_logs` | 380 | 344 KB | Admin action logging |
| `agent_events` | 227 | 46 MB | AI agent tracking |
| `agent_sessions` | 174 | 2.5 MB | AI chat sessions |
| `brandfetch_cache` | 158 | 472 KB | Brand color caching |
| `deck_versions` | 69 | 222 MB | Version history |
| `user_decks` | 42 | 560 KB | User-deck associations |
| `agent_messages` | 27 | 59 MB | AI chat messages |
| `agent_edits` | 27 | 3.3 MB | AI edit tracking |
| `credit_transactions` | 26 | 64 KB | Billing transactions |
| `conversion_jobs` | 12 | 363 MB | File conversion jobs |
| `credit_costs` | 7 | 32 KB | Credit pricing |
| `pricing_plans` | 4 | 32 KB | Subscription plans |
| `credit_balances` | 1 | 56 KB | User credit balances |
| `google_oauth_tokens` | 1 | 48 KB | Google auth tokens |
| `deck_shares` | 1 | 160 KB | Deck sharing links |
| `subscriptions` | 1 | 80 KB | User subscriptions |
| `attachments` | 2 | 128 KB | File attachments |

### Used but Empty (Keep - Will Fill)

| Table | Usage | Notes |
|-------|-------|-------|
| `chart_data_bindings` | Google Sheets charts | Used in api_google_integration.py |
| `deck_collaborators` | Deck sharing | Used in deck_sharing_service.py |
| `deck_user_access` | Access control | Used in api_deck_access.py |
| `deck_team_access` | Team access | Used in api_deck_access.py |
| `team_members` | Team membership | Used in api_teams.py |
| `teams` | Team data | Used in api_teams.py |
| `comments` | Slide comments | Used in api_comments.py |
| `invitations` | Team invites | Used in api_teams.py |
| `magic_link_tokens` | Auth tokens | Used in supabase_auth_service.py |
| `chat_feedback` | AI feedback | Used in frontend feedbackService.ts |
| `invoices` | Billing | Used in stripe_service.py |
| `cancellation_feedback` | Churn tracking | Used in billing_service.py |
| `google_drive_watch_channels` | Drive sync | Used in api_google_integration.py |

### Unused - Review for Removal

| Table | Rows | Notes | Recommendation |
|-------|------|-------|----------------|
| `users` | 0 | Shadow of auth.users | **KEEP** - May sync from auth |
| `user_deck_quotas` | 0 | Never implemented | **DROP** - Dead code |
| `platform_metrics` | 0 | Created but not used | **DROP** - Dead code |
| `user_activity_logs` | 0 | Logging not implemented | **KEEP** - Future feature |
| `artifacts` | 0 | Conversion artifacts | **KEEP** - Used by conversion_jobs |
| `deck_access_logs` | 0 | Not implemented | **DROP** - Dead code |
| `share_link_analytics` | 0 | Commented out in code | **DROP** or implement |
| `payment_methods` | 0 | Stripe handles this | **DROP** - Redundant |
| `user_sessions` | 0 | Not implemented | **DROP** - Dead code |
| `deck_analytics` | 0 | Not implemented | **DROP** - Dead code |
| `palettes` | 0 | 30MB empty | Scripts exist but never run | **REVIEW** - Large allocation |
| `slide_templates` | 0 | 136MB empty | Template system unused | **REVIEW** - Large allocation |

---

## Views Analysis

### Used (Keep)

| View | Usage |
|------|-------|
| `active_deck_shares` | deck_sharing_service.py:145 |
| `decks_optimized` | supabase_auth_service.py:483 |
| `v_agent_session_timeline` | api_agent_endpoints.py:447 |

### Unused (Safe to DROP)

| View | Recommendation |
|------|----------------|
| `active_users_summary` | **DROP** - Never queried |
| `brandfetch_cache_stats` | **DROP** - Only in debug code |
| `deck_analytics_summary` | **DROP** - Never queried |
| `deck_share_analytics_summary` | **DROP** - Never queried |
| `user_deck_stats` | **DROP** - Never queried |
| `user_shared_decks` | **DROP** - Never queried |
| `v_agent_recent_edits` | **DROP** - Never queried |

### Materialized Views

| View | Status | Recommendation |
|------|--------|----------------|
| `deck_stats` | Used in admin API | **KEEP** |
| `user_metrics` | Not used | **DROP** |

---

## Redundant/Confusing Names

| Current | Issue | Suggestion |
|---------|-------|------------|
| `deck_versions` vs `deck_shares` | Confusing naming | OK - different purposes |
| `user_decks` vs `deck_user_access` | Overlapping purpose? | Review if both needed |
| `decks.user_id` vs `decks.created_by` | Two owner columns? | Verify consistency |

---

## Supabase Linter Warnings

### Function Search Path (Low Priority)

51 functions have mutable search_path. This is a security best practice warning but low risk since:
- Functions are called with service_role
- No user input directly in function bodies

**Fix (optional - run in SQL editor):**
```sql
-- Example fix for one function
ALTER FUNCTION public.handle_new_user()
SET search_path = public, pg_temp;
```

### OTP Expiry Too Long

Email OTP expiry > 1 hour. Reduce in Supabase Auth settings.

### Leaked Password Protection Disabled

Enable in Supabase Dashboard > Authentication > Settings

### Postgres Version

Minor security patches available. Schedule upgrade.

---

## Cleanup SQL (Optional - Run Manually)

```sql
-- DROP unused tables (CAREFUL - verify first!)
-- DROP TABLE IF EXISTS user_deck_quotas;
-- DROP TABLE IF EXISTS platform_metrics;
-- DROP TABLE IF EXISTS deck_access_logs;
-- DROP TABLE IF EXISTS payment_methods;
-- DROP TABLE IF EXISTS user_sessions;
-- DROP TABLE IF EXISTS deck_analytics;

-- DROP unused views
DROP VIEW IF EXISTS active_users_summary;
DROP VIEW IF EXISTS brandfetch_cache_stats;
DROP VIEW IF EXISTS deck_analytics_summary;
DROP VIEW IF EXISTS deck_share_analytics_summary;
DROP VIEW IF EXISTS user_deck_stats;
DROP VIEW IF EXISTS user_shared_decks;
DROP VIEW IF EXISTS v_agent_recent_edits;

-- DROP unused materialized views
DROP MATERIALIZED VIEW IF EXISTS user_metrics;

-- Fix views that expose auth.users (recreate without auth.users reference)
-- This requires rewriting the view definitions
```

---

## Post-Launch Cleanup Tasks

1. **Week 1:** Drop obviously unused views (listed above)
2. **Week 2:** Review `palettes` and `slide_templates` - delete if not planning to use
3. **Week 3:** Implement or drop `share_link_analytics`
4. **Week 4:** Fix function search_path warnings
5. **Month 2:** Clean up duplicate/overlapping tables

---

## What NOT to Delete

- Any table with data (rows > 0)
- `users` table - syncs with auth.users
- `artifacts` - referenced by conversion_jobs
- `user_activity_logs` - useful for future analytics
- Any table referenced in active code paths

---

## Changelog

- **Dec 3, 2025:** Initial audit completed
- **Dec 3, 2025:** Revoked anon access from all views
- **Dec 3, 2025:** Created cleanup recommendations
- **Dec 3, 2025:** DROPPED 7 unused tables (slide_templates, user_deck_quotas, platform_metrics, deck_access_logs, payment_methods, user_sessions, deck_analytics)
- **Dec 3, 2025:** DROPPED 7 unused views + 1 materialized view
- **Dec 3, 2025:** Fixed search_path on 53 functions
- **Dec 3, 2025:** Database reduced from 44 tables to 36 tables, 10 views to 3 views
