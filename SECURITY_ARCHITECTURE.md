# NextSlide Security Architecture

**Document Version:** 1.0
**Last Updated:** December 3, 2025
**Purpose:** SOC2 Type II Compliance Documentation
**Classification:** Internal / Auditor Use

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [System Architecture Overview](#system-architecture-overview)
3. [Authentication & Authorization](#authentication--authorization)
4. [Data Protection](#data-protection)
5. [Database Security](#database-security)
6. [API Security](#api-security)
7. [Infrastructure Security](#infrastructure-security)
8. [Audit & Logging](#audit--logging)
9. [Incident Response](#incident-response)
10. [Security Controls Matrix](#security-controls-matrix)

---

## Executive Summary

NextSlide is a SaaS presentation platform that implements defense-in-depth security across all layers:

| Layer | Protection |
|-------|------------|
| Authentication | Supabase Auth with JWT tokens, server-side validation |
| Authorization | Row Level Security (RLS) on all 36 tables |
| API | Rate limiting, CORS restrictions, input validation |
| Database | Encrypted at rest, RLS policies, service role isolation |
| Infrastructure | HTTPS enforced, cloud-hosted on Render + Supabase |

---

## System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CLIENT LAYER                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐     │
│   │   Web Browser    │    │   Mobile App     │    │   Desktop App    │     │
│   │   (React SPA)    │    │   (Future)       │    │   (Electron)     │     │
│   └────────┬─────────┘    └────────┬─────────┘    └────────┬─────────┘     │
│            │                       │                       │                │
│            └───────────────────────┼───────────────────────┘                │
│                                    │                                         │
│                              HTTPS Only                                      │
│                                    │                                         │
└────────────────────────────────────┼────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              API LAYER                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                        FastAPI Backend                               │   │
│   │                        (Render Cloud)                                │   │
│   ├─────────────────────────────────────────────────────────────────────┤   │
│   │                                                                      │   │
│   │   ┌───────────────┐  ┌───────────────┐  ┌───────────────┐          │   │
│   │   │ CORS          │  │ Auth          │  │ Rate          │          │   │
│   │   │ Middleware    │──│ Middleware    │──│ Limiter       │          │   │
│   │   └───────────────┘  └───────────────┘  └───────────────┘          │   │
│   │           │                  │                  │                    │   │
│   │           ▼                  ▼                  ▼                    │   │
│   │   ┌─────────────────────────────────────────────────────┐          │   │
│   │   │              Request Handlers                        │          │   │
│   │   │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐   │          │   │
│   │   │  │ /api/   │ │ /auth/  │ │ /admin/ │ │/public/ │   │          │   │
│   │   │  │ deck    │ │ user    │ │ admin   │ │ share   │   │          │   │
│   │   │  └─────────┘ └─────────┘ └─────────┘ └─────────┘   │          │   │
│   │   └─────────────────────────────────────────────────────┘          │   │
│   │                              │                                       │   │
│   └──────────────────────────────┼──────────────────────────────────────┘   │
│                                  │                                           │
│                         Service Role Key                                     │
│                         (Server-side only)                                   │
│                                  │                                           │
└──────────────────────────────────┼──────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           DATA LAYER                                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                      Supabase Platform                               │   │
│   ├─────────────────────────────────────────────────────────────────────┤   │
│   │                                                                      │   │
│   │   ┌─────────────────┐     ┌─────────────────┐                      │   │
│   │   │   Auth Service  │     │   Storage       │                      │   │
│   │   │   - JWT tokens  │     │   - slide-media │                      │   │
│   │   │   - Magic links │     │   - Public CDN  │                      │   │
│   │   │   - OAuth       │     │                 │                      │   │
│   │   └─────────────────┘     └─────────────────┘                      │   │
│   │                                                                      │   │
│   │   ┌─────────────────────────────────────────────────────────────┐   │   │
│   │   │                  PostgreSQL Database                         │   │   │
│   │   │                                                              │   │   │
│   │   │   ┌──────────────────────────────────────────────────────┐  │   │   │
│   │   │   │               Row Level Security (RLS)                │  │   │   │
│   │   │   │                                                       │  │   │   │
│   │   │   │   ALL 36 TABLES PROTECTED                            │  │   │   │
│   │   │   │   - User isolation enforced                          │  │   │   │
│   │   │   │   - Service role bypass for backend                  │  │   │   │
│   │   │   │   - Authenticated role for direct access             │  │   │   │
│   │   │   └──────────────────────────────────────────────────────┘  │   │   │
│   │   │                                                              │   │   │
│   │   │   Encryption: AES-256 at rest                               │   │   │
│   │   │   Backups: Daily, 7-day retention                           │   │   │
│   │   └─────────────────────────────────────────────────────────────┘   │   │
│   │                                                                      │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Authentication & Authorization

### Authentication Flow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Client    │     │   Backend   │     │  Supabase   │     │  Database   │
│   Browser   │     │   FastAPI   │     │    Auth     │     │  PostgreSQL │
└──────┬──────┘     └──────┬──────┘     └──────┬──────┘     └──────┬──────┘
       │                   │                   │                   │
       │  1. Login Request │                   │                   │
       │  (email/password) │                   │                   │
       │──────────────────>│                   │                   │
       │                   │                   │                   │
       │                   │  2. Validate      │                   │
       │                   │  Credentials      │                   │
       │                   │──────────────────>│                   │
       │                   │                   │                   │
       │                   │                   │  3. Check User    │
       │                   │                   │──────────────────>│
       │                   │                   │                   │
       │                   │                   │  4. User Data     │
       │                   │                   │<──────────────────│
       │                   │                   │                   │
       │                   │  5. JWT Token     │                   │
       │                   │  (signed, 1hr)    │                   │
       │                   │<──────────────────│                   │
       │                   │                   │                   │
       │  6. Return JWT    │                   │                   │
       │<──────────────────│                   │                   │
       │                   │                   │                   │
       │  7. API Request   │                   │                   │
       │  + Bearer Token   │                   │                   │
       │──────────────────>│                   │                   │
       │                   │                   │                   │
       │                   │  8. Validate JWT  │                   │
       │                   │  (server-side)    │                   │
       │                   │──────────────────>│                   │
       │                   │                   │                   │
       │                   │  9. User Info     │                   │
       │                   │<──────────────────│                   │
       │                   │                   │                   │
       │                   │  10. Query DB     │                   │
       │                   │  (service_role)   │                   │
       │                   │──────────────────────────────────────>│
       │                   │                   │                   │
       │                   │  11. Data         │                   │
       │                   │<──────────────────────────────────────│
       │                   │                   │                   │
       │  12. Response     │                   │                   │
       │<──────────────────│                   │                   │
       │                   │                   │                   │
```

### JWT Token Validation

```python
# Token validation happens in two stages:

# Stage 1: Quick expiry check (middleware.py:173)
# - Decodes JWT without signature verification
# - Only checks expiry timestamp
# - Returns 401 immediately if expired

# Stage 2: Full server-side validation (session_manager.py:49-53)
# - Makes HTTP request to Supabase Auth API
# - Supabase validates signature server-side
# - Returns user data if valid

# Security Note:
# - verify_signature=False is ONLY for quick expiry check
# - Actual validation is ALWAYS done by Supabase server
# - Unverified fallback ONLY works in development (ENVIRONMENT != "production")
```

### Authentication Methods

| Method | Implementation | Security Level |
|--------|---------------|----------------|
| Email/Password | Supabase Auth | Standard |
| Magic Link | SHA256 hashed tokens, 15min expiry | High |
| Google OAuth | Supabase OAuth provider | High |
| Session Tokens | Server-side validation, 5min cache | High |

### Authorization Model

```
┌─────────────────────────────────────────────────────────────────┐
│                    ROLE HIERARCHY                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ┌─────────────┐                                               │
│   │   Admin     │  Full access to admin endpoints               │
│   │   Role      │  Can view all user data, audit logs           │
│   └──────┬──────┘                                               │
│          │                                                       │
│          ▼                                                       │
│   ┌─────────────┐                                               │
│   │   User      │  Access to own data only                      │
│   │   Role      │  RLS policies enforce isolation               │
│   └──────┬──────┘                                               │
│          │                                                       │
│          ▼                                                       │
│   ┌─────────────┐                                               │
│   │ Collaborator│  Access to shared decks                       │
│   │   Role      │  Based on deck_collaborators table            │
│   └──────┬──────┘                                               │
│          │                                                       │
│          ▼                                                       │
│   ┌─────────────┐                                               │
│   │   Public    │  Access to public shared links only           │
│   │   (anon)    │  No auth required, rate limited               │
│   └─────────────┘                                               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Data Protection

### Data Classification

| Classification | Examples | Protection |
|---------------|----------|------------|
| **Critical** | OAuth tokens, passwords | Hashed (SHA256/bcrypt), RLS |
| **Sensitive** | User email, presentations | RLS, encrypted at rest |
| **Internal** | Analytics, logs | Admin-only access |
| **Public** | Shared decks, pricing | Rate limited access |

### Encryption

```
┌─────────────────────────────────────────────────────────────────┐
│                    ENCRYPTION LAYERS                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   Transport Layer                                                │
│   ├── TLS 1.3 (HTTPS enforced)                                  │
│   ├── CORS restricts origins                                    │
│   └── HSTS enabled                                              │
│                                                                  │
│   Application Layer                                              │
│   ├── JWT tokens (RS256 signed)                                 │
│   ├── Magic link tokens (SHA256 hashed)                         │
│   └── Share link passwords (bcrypt hashed)                      │
│                                                                  │
│   Storage Layer                                                  │
│   ├── Database: AES-256 encryption at rest                      │
│   ├── Backups: Encrypted                                        │
│   └── OAuth tokens: RLS protected (encryption planned)          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Token Security

| Token Type | Storage | Hash/Encryption | Expiry |
|------------|---------|-----------------|--------|
| JWT Access | Client memory | RS256 signed | 1 hour |
| JWT Refresh | HttpOnly cookie | RS256 signed | 7 days |
| Magic Link | Database | SHA256 hash | 15 minutes |
| Share Password | Database | bcrypt | N/A |

---

## Database Security

### Row Level Security (RLS)

All 36 tables have RLS enabled with appropriate policies:

```
┌─────────────────────────────────────────────────────────────────┐
│                    RLS POLICY ARCHITECTURE                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ┌───────────────┐     ┌───────────────┐     ┌───────────────┐ │
│   │   Backend     │     │   Frontend    │     │   Direct DB   │ │
│   │   (Python)    │     │   (React)     │     │   Access      │ │
│   └───────┬───────┘     └───────┬───────┘     └───────┬───────┘ │
│           │                     │                     │          │
│           ▼                     ▼                     ▼          │
│   ┌───────────────┐     ┌───────────────┐     ┌───────────────┐ │
│   │ service_role  │     │ authenticated │     │     anon      │ │
│   │ BYPASSES RLS  │     │ RLS ENFORCED  │     │ RLS ENFORCED  │ │
│   └───────────────┘     └───────────────┘     └───────────────┘ │
│                                                                  │
│   Example Policy (decks table):                                  │
│   ┌─────────────────────────────────────────────────────────────┐│
│   │ CREATE POLICY "user_own_decks" ON decks                     ││
│   │   FOR ALL                                                    ││
│   │   USING (auth.uid() = user_id);                             ││
│   │                                                              ││
│   │ -- User can only see/modify their own decks                 ││
│   │ -- Backend uses service_role, bypasses this                 ││
│   │ -- Frontend (if direct) respects this                       ││
│   └─────────────────────────────────────────────────────────────┘│
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Table Security Summary

| Table Category | Tables | RLS | Policies |
|---------------|--------|-----|----------|
| User Data | decks, users, subscriptions | ✅ | Owner-based |
| Teams | teams, team_members | ✅ | Team membership |
| Billing | credit_balances, transactions | ✅ | Service role + owner view |
| Sharing | deck_shares, collaborators | ✅ | Inviter/invitee |
| AI Agent | agent_sessions, messages, edits | ✅ | Session owner |
| Admin | admin_audit_logs | ✅ | Admin role only |

### Database Access Pattern

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                  │
│   Backend Server                                                 │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │                                                          │   │
│   │   1. Authenticate user via Supabase Auth API            │   │
│   │      │                                                   │   │
│   │      ▼                                                   │   │
│   │   2. Validate user has permission for operation         │   │
│   │      │                                                   │   │
│   │      ▼                                                   │   │
│   │   3. Execute query with service_role key                │   │
│   │      (RLS bypassed - backend enforces access control)   │   │
│   │      │                                                   │   │
│   │      ▼                                                   │   │
│   │   4. Return filtered data to user                       │   │
│   │                                                          │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│   Why this pattern?                                              │
│   - Backend can apply complex business logic                    │
│   - Backend can aggregate data across users (for admin)         │
│   - RLS still protects against direct DB access                 │
│   - Defense in depth: auth + business logic + RLS               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## API Security

### Request Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    API REQUEST PIPELINE                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   Incoming Request                                               │
│         │                                                        │
│         ▼                                                        │
│   ┌─────────────────────────────────────────┐                   │
│   │ 1. CORS Middleware                      │                   │
│   │    - Validates Origin header            │                   │
│   │    - Blocks unauthorized domains        │                   │
│   │    - Restricts methods & headers        │                   │
│   └─────────────────┬───────────────────────┘                   │
│                     │                                            │
│                     ▼                                            │
│   ┌─────────────────────────────────────────┐                   │
│   │ 2. Request Logging Middleware           │                   │
│   │    - Assigns request ID                 │                   │
│   │    - Logs request start/end             │                   │
│   │    - Tracks timing                      │                   │
│   └─────────────────┬───────────────────────┘                   │
│                     │                                            │
│                     ▼                                            │
│   ┌─────────────────────────────────────────┐                   │
│   │ 3. Authentication Middleware            │                   │
│   │    - Extracts Bearer token              │                   │
│   │    - Quick expiry check                 │                   │
│   │    - Full server-side validation        │                   │
│   │    - Attaches user to request           │                   │
│   └─────────────────┬───────────────────────┘                   │
│                     │                                            │
│                     ▼                                            │
│   ┌─────────────────────────────────────────┐                   │
│   │ 4. Route Handler                        │                   │
│   │    - Validates input (Pydantic)         │                   │
│   │    - Applies business logic             │                   │
│   │    - Executes database operations       │                   │
│   └─────────────────┬───────────────────────┘                   │
│                     │                                            │
│                     ▼                                            │
│   Response with security headers                                 │
│   - X-Request-ID                                                │
│   - X-Auth-Status                                               │
│   - X-RateLimit-Remaining (when implemented)                    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### CORS Configuration

```python
# Allowed origins (production):
# - https://nextslide.ai
# - https://www.nextslide.ai
# - https://*.nextslide.ai (preview deployments)

# Allowed methods:
# - GET, POST, PUT, DELETE, PATCH, OPTIONS

# Allowed headers:
# - Authorization, Content-Type, Accept, X-Request-ID

# Security headers:
# - Credentials allowed (for cookies)
# - Max-age: 3600 seconds
```

### Endpoint Security

| Endpoint Category | Auth Required | Rate Limit | Notes |
|------------------|---------------|------------|-------|
| `/api/public/*` | No | High | Shared deck viewing |
| `/auth/*` | No | Low | Login, signup, magic links |
| `/api/deck/*` | Yes | Medium | Deck CRUD operations |
| `/api/admin/*` | Yes + Admin Role | Low | Admin operations |
| `/api/billing/*` | Yes | Low | Subscription management |

---

## Infrastructure Security

### Deployment Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    PRODUCTION INFRASTRUCTURE                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │                    Cloudflare                            │   │
│   │                    (DNS + CDN)                           │   │
│   │   - DDoS protection                                      │   │
│   │   - SSL termination                                      │   │
│   │   - Edge caching                                         │   │
│   └─────────────────────────┬───────────────────────────────┘   │
│                             │                                    │
│              ┌──────────────┴──────────────┐                    │
│              ▼                             ▼                     │
│   ┌─────────────────────┐     ┌─────────────────────────────┐  │
│   │   Vercel            │     │   Render                     │  │
│   │   (Frontend)        │     │   (Backend)                  │  │
│   │                     │     │                              │  │
│   │   - React SPA       │     │   - FastAPI                  │  │
│   │   - Edge functions  │     │   - Auto-scaling             │  │
│   │   - Preview deploys │     │   - Zero-trust networking    │  │
│   └─────────────────────┘     └──────────────┬──────────────┘  │
│                                              │                   │
│                                              ▼                   │
│                               ┌─────────────────────────────┐   │
│                               │   Supabase                   │   │
│                               │   (AWS us-west-1)            │   │
│                               │                              │   │
│                               │   - PostgreSQL 15            │   │
│                               │   - Auth service             │   │
│                               │   - Storage (S3)             │   │
│                               │   - Realtime (websockets)    │   │
│                               └─────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Environment Isolation

| Environment | Purpose | Data | Access |
|------------|---------|------|--------|
| Production | Live users | Real data | Restricted |
| Staging | Pre-release testing | Synthetic | Team only |
| Development | Local development | Local DB | Individual |

### Secret Management

```
┌─────────────────────────────────────────────────────────────────┐
│                    SECRET CATEGORIES                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   Server-Side Only (NEVER exposed to frontend):                 │
│   ├── SUPABASE_SERVICE_KEY                                      │
│   ├── STRIPE_SECRET_KEY                                         │
│   ├── STRIPE_WEBHOOK_SECRET                                     │
│   ├── OPENAI_API_KEY                                            │
│   ├── ANTHROPIC_API_KEY                                         │
│   └── TOKEN_ENCRYPTION_KEY                                      │
│                                                                  │
│   Client-Safe (can be in frontend):                             │
│   ├── SUPABASE_URL (public endpoint)                            │
│   ├── SUPABASE_ANON_KEY (limited permissions)                   │
│   └── STRIPE_PUBLISHABLE_KEY                                    │
│                                                                  │
│   Storage:                                                       │
│   ├── Render: Environment variables (encrypted at rest)         │
│   ├── Vercel: Environment variables (encrypted)                 │
│   └── Local: .env files (git-ignored)                           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Audit & Logging

### Audit Log Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    AUDIT LOGGING SYSTEM                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   Admin Actions                                                  │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │ Table: admin_audit_logs                                  │   │
│   │                                                          │   │
│   │ Captured events:                                         │   │
│   │ - User role changes                                      │   │
│   │ - Subscription modifications                             │   │
│   │ - Credit adjustments                                     │   │
│   │ - Data exports                                           │   │
│   │                                                          │   │
│   │ Fields: admin_id, action, target_user_id, details,      │   │
│   │         ip_address, user_agent, timestamp                │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│   User Activity                                                  │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │ Table: user_activity_logs (planned)                      │   │
│   │                                                          │   │
│   │ Captured events:                                         │   │
│   │ - Login/logout                                           │   │
│   │ - Deck creation/deletion                                 │   │
│   │ - Sharing actions                                        │   │
│   │ - Export operations                                      │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│   System Logs                                                    │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │ Platform: Render logs                                    │   │
│   │                                                          │   │
│   │ - Request/response logs                                  │   │
│   │ - Error stack traces                                     │   │
│   │ - Performance metrics                                    │   │
│   │ - API latency                                            │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Log Retention

| Log Type | Retention | Storage |
|----------|-----------|---------|
| Admin Audit | 2 years | PostgreSQL |
| User Activity | 90 days | PostgreSQL |
| System Logs | 30 days | Render |
| Access Logs | 7 days | Cloudflare |

---

## Incident Response

### Security Incident Categories

| Severity | Examples | Response Time |
|----------|----------|---------------|
| Critical | Data breach, auth bypass | Immediate |
| High | API abuse, unauthorized access | 1 hour |
| Medium | Rate limit bypass, data exposure | 4 hours |
| Low | Failed login attempts, minor bugs | 24 hours |

### Response Procedure

```
┌─────────────────────────────────────────────────────────────────┐
│                    INCIDENT RESPONSE FLOW                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   1. DETECTION                                                   │
│      ├── Automated alerts (error rates, auth failures)          │
│      ├── User reports                                           │
│      └── Security scan findings                                 │
│                                                                  │
│   2. TRIAGE                                                      │
│      ├── Assess severity                                        │
│      ├── Identify affected scope                                │
│      └── Assign response team                                   │
│                                                                  │
│   3. CONTAINMENT                                                 │
│      ├── Revoke compromised tokens                              │
│      ├── Block malicious IPs                                    │
│      └── Disable affected features                              │
│                                                                  │
│   4. REMEDIATION                                                 │
│      ├── Patch vulnerability                                    │
│      ├── Reset affected credentials                             │
│      └── Deploy fixes                                           │
│                                                                  │
│   5. RECOVERY                                                    │
│      ├── Restore normal operations                              │
│      ├── Verify fix effectiveness                               │
│      └── Monitor for recurrence                                 │
│                                                                  │
│   6. POST-MORTEM                                                 │
│      ├── Document timeline                                      │
│      ├── Identify root cause                                    │
│      └── Implement preventive measures                          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Security Controls Matrix

### SOC2 Trust Service Criteria Mapping

| Criteria | Control | Implementation | Status |
|----------|---------|----------------|--------|
| **CC6.1** | Logical access | JWT authentication, RLS policies | ✅ |
| **CC6.2** | User registration | Email verification, OAuth | ✅ |
| **CC6.3** | Role-based access | Admin/User/Collaborator roles | ✅ |
| **CC6.6** | System boundaries | CORS, API authentication | ✅ |
| **CC6.7** | Data transmission | TLS 1.3, HTTPS enforced | ✅ |
| **CC7.1** | Security monitoring | Request logging, audit logs | ✅ |
| **CC7.2** | Vulnerability management | Dependency scanning | Partial |
| **CC8.1** | Change management | Git-based deployments | ✅ |
| **PI1.1** | Data retention | Configurable per data type | ✅ |

### Control Evidence

| Control | Evidence Location |
|---------|-------------------|
| Authentication | `services/session_manager.py`, `api/middleware.py` |
| Authorization | RLS policies in database, `verify_admin_role()` |
| Encryption | Supabase encryption at rest, TLS config |
| Audit Logging | `admin_audit_logs` table, Render logs |
| Access Control | `api/requests/api_admin.py` role checks |

---

## Appendix A: Security Checklist

### Pre-Production Checklist

- [x] RLS enabled on all tables (36/36)
- [x] All views use security_invoker
- [x] No views expose auth.users
- [x] Service role key server-side only
- [x] HTTPS enforced
- [x] CORS configured
- [ ] Rate limiting implemented (planned)
- [ ] OAuth token encryption (planned)
- [x] Admin audit logging
- [x] JWT server-side validation

### Production Environment

- [ ] ENVIRONMENT=production set
- [ ] Leaked password protection enabled
- [ ] OTP expiry < 1 hour
- [ ] Postgres patched to latest
- [ ] Stripe webhook secret configured

---

## Appendix B: Key Files Reference

| Purpose | File Path |
|---------|-----------|
| Auth Middleware | `api/middleware.py:98-269` |
| Token Validation | `services/session_manager.py:24-110` |
| Admin Auth | `api/requests/api_admin.py` |
| RLS Policies | Database (pg_policies) |
| Audit Logging | `admin_audit_logs` table |

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | Dec 3, 2025 | Security Audit | Initial release |

---

**Confidential - For Auditor Use Only**
