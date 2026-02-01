# NextSlide SOC 2 Compliance Readiness Document

**Prepared for:** Delve SOC 2 Audit
**Date:** February 1, 2026
**Application:** NextSlide - AI Presentation Generation Platform
**Prepared by:** NextSlide Engineering Team

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Delve Audit Process & Timeline](#2-delve-audit-process--timeline)
3. [System Architecture Overview](#3-system-architecture-overview)
4. [Trust Service Criteria Mapping (CC1-CC9)](#4-trust-service-criteria-mapping)
5. [Authentication & Access Control](#5-authentication--access-control)
6. [API Security & Input Validation](#6-api-security--input-validation)
7. [Data Protection & Encryption](#7-data-protection--encryption)
8. [Logging, Monitoring & Incident Response](#8-logging-monitoring--incident-response)
9. [Change Management & SDLC](#9-change-management--sdlc)
10. [Vendor & Third-Party Risk Management](#10-vendor--third-party-risk-management)
11. [Infrastructure & Network Security](#11-infrastructure--network-security)
12. [Database Security & Row-Level Security](#12-database-security--row-level-security)
13. [Frontend Security Controls](#13-frontend-security-controls)
14. [Personnel Security & HR](#14-personnel-security--hr)
15. [Required Policies Inventory](#15-required-policies-inventory)
16. [Remediation Completed](#16-remediation-completed)
17. [Remaining Manual Action Items](#17-remaining-manual-action-items)
18. [Evidence Inventory](#18-evidence-inventory)
19. [Anticipated Auditor Questions & Answers](#19-anticipated-auditor-questions--answers)
20. [Environment Variables & Secrets Management](#20-environment-variables--secrets-management)
21. [Complete API Endpoint Inventory](#21-complete-api-endpoint-inventory)
22. [File & Dependency Reference](#22-file--dependency-reference)

---

## 1. Executive Summary

### Current Readiness Level: ~65% (post-remediation)

NextSlide is an AI-powered presentation generation platform consisting of:
- **Frontend**: React/TypeScript SPA deployed on Render (static site)
- **Backend**: Python FastAPI application deployed on Render
- **Database**: Supabase (managed PostgreSQL with Row-Level Security)
- **Compute**: Modal serverless for heavy workloads
- **Collaboration**: Yjs CRDT with WebSocket server

### What Has Been Done (Automated Remediation)
- Removed hardcoded production database credentials from source code
- Fixed exception handler information leakage (internal errors no longer exposed to users)
- Locked down CORS to explicit production origins only
- Added security headers middleware (HSTS, CSP, X-Frame-Options, X-Content-Type-Options)
- Implemented DOMPurify XSS sanitization across 21 frontend files
- Removed unverified JWT token fallback (eliminated signature bypass)
- Added PII redaction filter for production logs
- Fixed open redirect vulnerability in email confirmation flow
- Expanded rate limiting configuration to cover all endpoint categories
- Pinned all Python dependencies to exact versions
- Pinned all Docker base images to specific digests
- Created `.env.example` files for both backend and frontend
- Removed hardcoded API keys from 6 seed scripts

### What Still Requires Manual Action
- Rotate all previously exposed API keys and database credentials
- Move frontend-exposed secrets (OpenAI, Google) to backend proxy
- Enable MFA for all admin/employee accounts
- Set up Dependabot or Snyk for automated vulnerability scanning
- Run `npm audit fix` to address frontend dependency vulnerabilities
- Write and adopt the 20 required SOC 2 policies (see Section 15)
- Set up centralized logging/SIEM
- Document and test disaster recovery procedures
- Add pre-commit hooks for secret scanning (e.g., git-secrets, trufflehog)
- Implement CSRF token protection

---

## 2. Delve Audit Process & Timeline

### About Delve
Delve is an AI-powered SOC 2 compliance platform that streamlines the audit process. They partner with AICPA-certified auditors and use automation to reduce the traditional audit timeline.

### Delve's SOC 2 Process

**Phase 1: Onboarding (~30 minutes)**
- Connect integrations (GitHub, AWS/cloud, HR tools, identity providers)
- Delve's AI maps existing controls to SOC 2 criteria
- Gap analysis generated automatically

**Phase 2: Readiness Assessment (1-2 weeks)**
- Review gap analysis findings
- Implement missing controls
- Draft required policies (Delve provides templates)
- Collect evidence for existing controls

**Phase 3: Type I Audit (1-3 weeks after readiness)**
- Point-in-time assessment of controls
- Auditor reviews evidence and tests controls
- Results in Type I report

**Phase 4: Type II Observation Period (3-12 months)**
- Controls must operate effectively over the observation window
- Minimum 3 months for first Type II
- Continuous evidence collection required
- Auditor performs periodic testing

### Delve's 6 Priority Control Areas
1. **Identity & Access Management (IAM)** - SSO, MFA, role-based access
2. **Logging & Monitoring** - Centralized logs, alerting, incident detection
3. **Change Management** - Code review, CI/CD, deployment controls
4. **Encryption** - Data at rest and in transit
5. **Vulnerability Management** - Scanning, patching, dependency updates
6. **Personnel Security** - Background checks, security training, onboarding/offboarding

### What Delve Will Ask For
- Integration access to: GitHub, Render (hosting), Supabase (database), Sentry (monitoring)
- List of employees with roles and access levels
- Written policies (they provide templates for all 20)
- Evidence of controls operating (logs, screenshots, configurations)
- Vendor risk assessments for critical third parties

---

## 3. System Architecture Overview

### High-Level Architecture

```
                    Internet
                       │
                       ▼
              ┌─────────────────┐
              │   Cloudflare    │  (DNS, CDN, DDoS Protection)
              │   / Render CDN  │
              └────────┬────────┘
                       │
          ┌────────────┼────────────┐
          │            │            │
          ▼            ▼            ▼
    ┌──────────┐ ┌──────────┐ ┌──────────┐
    │ Frontend │ │ Backend  │ │WebSocket │
    │ (Static) │ │ (FastAPI)│ │ (Yjs)    │
    │ Render   │ │ Render   │ │ Render   │
    └──────────┘ └────┬─────┘ └──────────┘
                      │
         ┌────────────┼────────────────┐
         │            │                │
         ▼            ▼                ▼
   ┌──────────┐ ┌──────────┐    ┌──────────┐
   │ Supabase │ │  Modal   │    │  Redis   │
   │ (DB+Auth │ │(Compute) │    │(Rate Lim)│
   │ +Storage)│ │          │    │          │
   └──────────┘ └──────────┘    └──────────┘
         │
         ▼
   ┌──────────────────────────────────────┐
   │         External AI Services         │
   │  Anthropic · OpenAI · Google Gemini  │
   │  SerpAPI · Firecrawl · Brandfetch    │
   └──────────────────────────────────────┘
```

### Component Breakdown

| Component | Technology | Hosting | Purpose |
|-----------|-----------|---------|---------|
| Frontend | React 18.3 + TypeScript + Vite | Render (Static Site) | User interface, SPA |
| Backend | Python 3.11 + FastAPI | Render (Web Service) | API server, business logic |
| Database | PostgreSQL 15 (Supabase) | Supabase Cloud (AWS) | Primary data store |
| Auth | Supabase Auth | Supabase Cloud | JWT authentication, OAuth |
| Storage | Supabase Storage | Supabase Cloud (S3) | File uploads, images |
| Compute | Modal | Modal Cloud | Heavy AI workloads |
| Job Queue | arq (Redis-based) | Redis Cloud | Background deck generation |
| Collaboration | Yjs + y-websocket | Render (Docker) | Real-time editing (disabled by default) |
| Error Tracking | Sentry | Sentry Cloud | Error monitoring, performance |
| Analytics | PostHog | PostHog Cloud (US) | Product analytics |
| Payments | Stripe | Stripe Cloud | Subscriptions, billing |

### Data Flow

```
User Action (Browser)
    │
    ├─► Frontend validates input (Zod, DOMPurify)
    │
    ├─► API call with Bearer JWT token
    │       │
    │       ├─► CORS validation (origin whitelist)
    │       ├─► Rate limiter check (slowapi)
    │       ├─► Security headers added
    │       ├─► JWT validated via Supabase Auth API
    │       │
    │       ├─► Business logic (FastAPI endpoint)
    │       │       │
    │       │       ├─► Supabase DB query (RLS enforced)
    │       │       ├─► AI API call (Anthropic/OpenAI/Gemini)
    │       │       ├─► Modal dispatch (if heavy compute)
    │       │       └─► Background job enqueue (arq/Redis)
    │       │
    │       └─► Response with security headers
    │
    └─► Frontend renders response (DOMPurify sanitized)
```

### Network Boundaries

| Boundary | Source | Destination | Protocol | Authentication |
|----------|--------|-------------|----------|----------------|
| User → Frontend | Browser | Render CDN | HTTPS (TLS 1.2+) | None (public) |
| Frontend → Backend | Browser | Render | HTTPS | Bearer JWT |
| Backend → Supabase | Render | Supabase Cloud | HTTPS | API Key + JWT |
| Backend → Modal | Render | Modal Cloud | HTTPS | Modal Auth Token |
| Backend → AI APIs | Render | Various | HTTPS | API Keys |
| Backend → Redis | Render | Redis Cloud | TLS | Connection string |
| Backend → Stripe | Render | Stripe | HTTPS | Secret Key |
| WebSocket | Browser | Render | WSS | Session-based |

---

## 4. Trust Service Criteria Mapping

### CC1: Control Environment

| Criteria | Description | Status | Evidence |
|----------|-------------|--------|----------|
| CC1.1 | Organization demonstrates commitment to integrity and ethics | NEEDS POLICY | Need: Code of Conduct policy |
| CC1.2 | Board/management exercises oversight | NEEDS POLICY | Need: Board oversight documentation |
| CC1.3 | Management establishes structure and authority | PARTIAL | Team roles defined in Render/Supabase; need formal org chart |
| CC1.4 | Commitment to competence | PARTIAL | Hiring practices exist; need formal job descriptions with security requirements |
| CC1.5 | Accountability for internal controls | NEEDS POLICY | Need: Information Security Policy defining accountability |

### CC2: Communication and Information

| Criteria | Description | Status | Evidence |
|----------|-------------|--------|----------|
| CC2.1 | Quality information for internal control | PARTIAL | Sentry alerts, PostHog analytics exist; need formal reporting |
| CC2.2 | Internal communication of objectives and responsibilities | NEEDS POLICY | Need: Security awareness training program |
| CC2.3 | Communication with external parties | PARTIAL | Privacy policy exists; need external communication procedures |

### CC3: Risk Assessment

| Criteria | Description | Status | Evidence |
|----------|-------------|--------|----------|
| CC3.1 | Specifies suitable objectives | NEEDS POLICY | Need: Risk Assessment Policy |
| CC3.2 | Identifies and assesses risks | IN PROGRESS | This audit serves as initial risk assessment |
| CC3.3 | Considers potential for fraud | NEEDS POLICY | Need: Anti-fraud controls documentation |
| CC3.4 | Identifies and assesses significant change | PARTIAL | GitHub PR process exists; need formal change risk assessment |

### CC4: Monitoring Activities

| Criteria | Description | Status | Evidence |
|----------|-------------|--------|----------|
| CC4.1 | Ongoing and separate evaluations | PARTIAL | Sentry monitoring, health checks exist; need scheduled reviews |
| CC4.2 | Evaluates and communicates deficiencies | IN PROGRESS | This document; need formal deficiency tracking |

### CC5: Control Activities

| Criteria | Description | Status | Evidence |
|----------|-------------|--------|----------|
| CC5.1 | Selects and develops control activities | IMPLEMENTED | Rate limiting, auth, CORS, security headers, input validation |
| CC5.2 | Selects and develops technology controls | IMPLEMENTED | RLS, JWT validation, encryption in transit, DOMPurify |
| CC5.3 | Deploys through policies and procedures | PARTIAL | Technical controls deployed; need written policies |

### CC6: Logical and Physical Access Controls

| Criteria | Description | Status | Evidence |
|----------|-------------|--------|----------|
| CC6.1 | Logical access security software/infrastructure | IMPLEMENTED | Supabase Auth, JWT, RLS, admin role checks |
| CC6.2 | Prior to issuing credentials, registers authorized users | IMPLEMENTED | Email verification, OAuth, magic link |
| CC6.3 | Authorization to access | IMPLEMENTED | RLS policies, deck ownership checks, admin verification |
| CC6.4 | Restrictions on physical access | N/A | Cloud-hosted (Render, Supabase, Modal handle physical security) |
| CC6.5 | Disposal of assets | N/A | Cloud-hosted |
| CC6.6 | Protection from external threats | IMPLEMENTED | CORS, rate limiting, CSP, security headers, DOMPurify |
| CC6.7 | Restriction and management of system credentials | PARTIAL | Env vars used; need MFA, credential rotation policy |
| CC6.8 | Prevention/detection of unauthorized software | PARTIAL | Dependency pinning; need vulnerability scanning |

### CC7: System Operations

| Criteria | Description | Status | Evidence |
|----------|-------------|--------|----------|
| CC7.1 | Detection and monitoring of security events | IMPLEMENTED | Sentry error tracking, audit logs, circuit breaker |
| CC7.2 | Monitoring system components for anomalies | PARTIAL | Health checks, circuit breaker; need SIEM |
| CC7.3 | Evaluates security events | PARTIAL | Sentry alerts; need formal incident response process |
| CC7.4 | Response to identified security incidents | NEEDS POLICY | Need: Incident Response Policy and runbooks |
| CC7.5 | Identifies and evaluates vulnerabilities | PARTIAL | This audit; need recurring vulnerability scanning |

### CC8: Change Management

| Criteria | Description | Status | Evidence |
|----------|-------------|--------|----------|
| CC8.1 | Management of changes to infrastructure and software | PARTIAL | GitHub PRs, Render deploys; need formal change management policy |

### CC9: Risk Mitigation

| Criteria | Description | Status | Evidence |
|----------|-------------|--------|----------|
| CC9.1 | Identifies and assesses risks from business partners and vendors | NEEDS POLICY | Need: Vendor Risk Management Policy |
| CC9.2 | Assesses risk from changes in vendors | NEEDS POLICY | Need: Vendor review process |

### Availability (A1) - If In Scope

| Criteria | Description | Status | Evidence |
|----------|-------------|--------|----------|
| A1.1 | Processing capacity to meet availability commitments | PARTIAL | Render auto-scaling, Modal serverless; need SLA documentation |
| A1.2 | Environmental protections and recovery | PARTIAL | Cloud-hosted; need BCP/DR documentation |
| A1.3 | Recovery of infrastructure and data | NEEDS POLICY | Need: Disaster Recovery Plan and testing |

---

## 5. Authentication & Access Control

### Authentication Architecture

**Technology Stack:**
- Supabase Auth (JWT-based)
- PKCE OAuth 2.0 flow for frontend
- Token validation via Supabase API (server-side, no local JWT decode)

**Authentication Methods:**

| Method | Endpoint | Rate Limit | Description |
|--------|----------|------------|-------------|
| Email/Password | `POST /auth/signin` | 10/min | Standard login with bcrypt password hashing (Supabase) |
| Email/Password Signup | `POST /auth/signup` | 5/hour | New user registration with email verification |
| Google OAuth | `POST /auth/google/signin` | 10/min | OAuth 2.0 via Google, PKCE flow |
| Magic Link | `POST /auth/magic-link/send` | 10/min | Passwordless login via email link |
| Password Reset | `POST /auth/password/reset` | 3/hour | Reset password via email link |
| Token Refresh | `POST /auth/refresh` | 10/min | Refresh expired access tokens |
| API Key | `X-API-Key` header | 60/min/key | Developer API (Public v1) |

**Token Lifecycle:**
```
1. User authenticates → Supabase issues access_token (JWT) + refresh_token
2. Access token stored in localStorage by Supabase SDK
3. Frontend includes Bearer token in all API requests
4. Backend validates token via Supabase API call (not local decode)
5. Token validated with 1.5s connect / 2.0s read timeout
6. Valid tokens cached for 5 minutes (session_manager.py)
7. Token near expiry → frontend refreshes automatically (5-min buffer)
8. Refresh fails → user redirected to login
```

**Session Management Implementation:**
- File: `apps/backend/services/session_manager.py`
- Token cache: In-memory dict with 5-minute TTL
- No unverified token fallback (removed during remediation)
- Cache eviction on 401 responses

**Admin Access Control:**
- File: `apps/backend/api/requests/api_admin.py` (line 169)
- `verify_admin_role()` validates Bearer token against Supabase
- Checks user roles/claims for admin permission
- Returns HTTP 401 if not admin
- Frontend double-checks: context cache + backend endpoint verification
- Admin verification cached 5 minutes per user ID

### Authorization Model

| Resource | Access Control | Implementation |
|----------|---------------|----------------|
| User Decks | Owner only (RLS) | Supabase RLS policy: `user_id = auth.uid()` |
| Shared Decks | Owner + shared users | `user_decks` association table |
| Public Decks | Anyone | `is_public` flag on deck, no auth required |
| Admin Panel | Admin role only | `verify_admin_role()` + frontend `AdminProtectedRoute` |
| API v1 | API key holder | `X-API-Key` header, hashed for rate limiting |
| File Uploads | Authenticated users | Bearer token required, Supabase Storage RLS |

### What's Missing
- **MFA**: Not currently enforced for any account type
- **SSO/SAML**: Not implemented (Supabase supports it, not enabled)
- **Session timeout**: Relies on JWT expiry (Supabase default ~1 hour)
- **Concurrent session limits**: Not enforced
- **IP allowlisting**: Not implemented for admin access
- **Password complexity**: Relies on Supabase defaults

---

## 6. API Security & Input Validation

### CORS Configuration

**File:** `apps/backend/api/chat_server.py` (lines 252-268)

```
Production Origins:
  - https://app.nextslide.ai
  - https://www.nextslide.ai
  - https://nextslide.ai

Development Origins (non-production only):
  - localhost:3000, localhost:5173
  - 127.0.0.1:*
  - Local network IPs

Allowed Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS
Allowed Headers: Authorization, Content-Type, Accept, Origin,
                 X-Requested-With, X-Request-ID, Cache-Control
Max Age: 3600 seconds
```

### Security Headers (Backend Middleware)

**File:** `apps/backend/api/chat_server.py` (lines 269-281)

| Header | Value | Purpose |
|--------|-------|---------|
| X-Content-Type-Options | nosniff | Prevent MIME sniffing |
| X-Frame-Options | DENY | Prevent clickjacking |
| X-XSS-Protection | 1; mode=block | Legacy XSS protection |
| Strict-Transport-Security | max-age=31536000; includeSubDomains | Force HTTPS |
| Referrer-Policy | strict-origin-when-cross-origin | Control referrer info |
| Permissions-Policy | camera=(), microphone=(), geolocation=() | Disable browser APIs |
| Content-Security-Policy | frame-ancestors 'none' | Prevent embedding |

### Rate Limiting Configuration

**Implementation:** slowapi (Python) wrapping the `limits` library
**Backend:** Redis (production) / In-memory (development)
**File:** `apps/backend/config/rate_limits.py`

| Category | Limit | Scope |
|----------|-------|-------|
| Global Default | 200/minute | Per IP/API key |
| Application Ceiling | 1,000/minute | All clients combined |
| Chat/Streaming | 30/minute, burst 5/10sec | Per user |
| Deck Creation | 10/minute | Per user |
| File Upload | 20/minute | Per user |
| File Analysis | 15/minute | Per user |
| Auth General | 10/minute | Per IP |
| Auth Signup | 5/hour | Per IP |
| Password Reset | 3/hour | Per IP |
| Admin | 60/minute | Per admin |
| Sharing | 30/minute | Per user |
| Public Deck View | 60/minute | Per IP |
| Public Search | 20/minute | Per IP |
| Tool Generation | 5/hour, burst 2/min | Per IP (unauthenticated) |
| Developer API v1 | 60/minute | Per API key |
| API v1 Concurrent | 20 max | Per API key |

### Input Validation

| Layer | Technology | Coverage |
|-------|-----------|----------|
| Frontend | Zod schemas, React Hook Form | Form inputs |
| Frontend | DOMPurify v3.3.1 | All dangerouslySetInnerHTML + innerHTML |
| Backend | Pydantic models | Request body validation on all endpoints |
| Backend | Supabase RLS | Database-level access control |
| Backend | slowapi | Rate limiting and abuse prevention |

### Exception Handling

**File:** `apps/backend/api/chat_server.py` (lines 314-335)

- Global exception handler catches all unhandled errors
- Returns generic error message: `"An unexpected error occurred. Please try again later."`
- Error code: `INTERNAL_ERROR`
- Full stack trace logged server-side only (with PII redaction)
- CORS headers included in error responses

### Open Redirect Protection

**File:** `apps/backend/api/requests/api_auth.py`

- `ALLOWED_REDIRECT_DOMAINS` whitelist: `nextslide.ai`, `app.nextslide.ai`, `www.nextslide.ai`, `localhost`
- `_is_safe_redirect()` validates all redirect URLs against whitelist
- Applied to email confirmation `next` parameter
- Rejects redirects to external domains

---

## 7. Data Protection & Encryption

### Encryption in Transit

| Connection | Protocol | Enforcement |
|-----------|----------|-------------|
| User → Frontend | TLS 1.2+ | HSTS header (31536000s, includeSubDomains) |
| User → Backend | TLS 1.2+ | HSTS header, Render TLS termination |
| Backend → Supabase | TLS 1.2+ | Supabase enforces TLS |
| Backend → AI APIs | TLS 1.2+ | API providers enforce TLS |
| Backend → Redis | TLS | Redis Cloud TLS connection |
| Backend → Modal | TLS 1.2+ | Modal enforces TLS |
| Backend → Stripe | TLS 1.2+ | Stripe enforces TLS |
| WebSocket | WSS | TLS-encrypted WebSocket |

### Encryption at Rest

| Data Store | Encryption | Provider |
|-----------|-----------|----------|
| PostgreSQL (Supabase) | AES-256 at rest | Supabase/AWS (transparent) |
| Supabase Storage (S3) | AES-256 at rest | AWS S3 server-side encryption |
| Redis | Provider-managed | Redis Cloud encryption |
| Render Volumes | Provider-managed | Render infrastructure |

### Sensitive Data Handling

| Data Type | Storage | Protection |
|-----------|---------|------------|
| User passwords | Supabase Auth | bcrypt hashing (never stored plaintext) |
| JWT tokens | Memory (backend cache, 5min TTL) | Not persisted to disk |
| API keys | Supabase DB | Hashed before storage |
| Slack tokens | Supabase DB | Encrypted with SLACK_TOKEN_ENCRYPTION_KEY |
| Payment data | Stripe (never touches our servers) | PCI DSS compliant via Stripe |
| User emails | Supabase DB | RLS-protected, PII redacted in logs |

### PII Handling

**PII Redaction in Logs:**
- File: `apps/backend/config/logging_config.py`
- `PIIRedactionFilter` class applied to all production log handlers
- Regex patterns redact:
  - Email addresses → `[EMAIL_REDACTED]`
  - Bearer/JWT tokens → `[TOKEN_REDACTED]`
  - API keys (sk-*, pk-*, etc.) → `[KEY_REDACTED]`
  - Long base64 strings → `[BASE64_REDACTED]`

**Sentry Configuration:**
- `send_default_pii: false` (no PII sent to Sentry)
- 10% trace sampling (reduces data exposure)
- Debug event filtering enabled

**PostHog Configuration:**
- Password fields masked in session recordings
- Person profiles created (contains email for user identification)
- Session recording enabled (potential PII in screen captures)

### Data Retention

| Data Type | Retention | Notes |
|-----------|-----------|-------|
| User accounts | Indefinite | No automatic deletion currently |
| Deck data | Indefinite | User can manually delete |
| Audit logs | Indefinite | Stored in Supabase |
| Error logs (Sentry) | 90 days | Sentry default retention |
| Analytics (PostHog) | Per PostHog plan | PostHog managed |
| Session recordings | Per PostHog plan | PostHog managed |
| Redis cache | Ephemeral | TTL-based expiry |
| JWT token cache | 5 minutes | In-memory, auto-expires |

**Action Required:** Formal data retention policy needs to be documented.

---

## 8. Logging, Monitoring & Incident Response

### Logging Architecture

**Backend Logging:**
- Framework: Python `logging` module
- File: `apps/backend/config/logging_config.py`
- Production level: WARNING (minimal)
- PII redaction: Enabled in production
- Format: `[%(asctime)s] %(levelname)s [%(name)s] %(message)s`

**Log Categories:**
| Category | What's Logged | Where |
|----------|--------------|-------|
| Application errors | Stack traces, error messages | Sentry + stdout |
| Authentication events | Login success/failure (no PII) | stdout (Render logs) |
| Admin actions | Action type, user ID, timestamp | `audit_logs` table |
| API requests | Method, path, status code, timing | stdout (Render logs) |
| Rate limit violations | IP/key hash, endpoint, limit hit | stdout |
| Circuit breaker events | State changes, failure counts | stdout |
| Debug logs (frontend) | JavaScript errors from browser | In-memory (max 100) |

**What's NOT Logged:**
- User passwords (never available to backend)
- Full JWT tokens (redacted)
- Email addresses (redacted in production)
- API keys (redacted)
- Request/response bodies (not logged)
- Credit card data (never touches our servers)

### Monitoring Stack

| Tool | Purpose | Coverage |
|------|---------|----------|
| **Sentry** | Error tracking, performance | Backend + Frontend |
| **PostHog** | Product analytics, funnel analysis | Frontend events |
| **Render Dashboard** | Server metrics, deployment logs | Infrastructure |
| **Supabase Dashboard** | Database metrics, auth logs | Database + Auth |
| **Health Endpoints** | Service availability | Custom endpoints |

### Health Check Endpoints

| Endpoint | What It Checks |
|----------|---------------|
| `GET /api/health` | Backend alive, Supabase circuit breaker status |
| `GET /api/health/supabase` | Supabase connectivity, latency |
| `GET /admin/services/health` | All service statuses (admin only) |

### Circuit Breaker (Supabase)

**File:** `apps/backend/services/supabase.py` (lines 66-142)

```
Failure Threshold: 25 consecutive failures
Open Timeout: 30 seconds before retry
States: CLOSED → OPEN → HALF_OPEN → CLOSED
```

- Prevents cascading failures during Supabase outages
- Auto-recovers when Supabase becomes available
- Admin can manually reset via `POST /admin/reset-circuit-breaker`

### Audit Logging

**File:** `apps/backend/api/requests/api_admin.py` (line 216)

**Events Tracked:**
- User management actions (suspend, ban, role change)
- Credit adjustments
- Deck deletions by admin
- Configuration changes
- All admin API calls

**Audit Log Fields:**
```json
{
  "action": "user_suspended",
  "admin_user_id": "uuid",
  "target_user_id": "uuid",
  "timestamp": "ISO 8601",
  "details": { "reason": "..." },
  "ip_address": "redacted"
}
```

### Incident Response (Current State)

**What exists:**
- Sentry alerts for new/recurring errors
- Render deployment failure notifications
- Circuit breaker auto-detection for Supabase outages
- Admin health check dashboard

**What's needed:**
- Formal Incident Response Policy
- Incident severity classification (P1/P2/P3/P4)
- On-call rotation schedule
- Incident communication templates
- Post-incident review process
- Runbooks for common scenarios

---

## 9. Change Management & SDLC

### Source Code Management

| Aspect | Implementation |
|--------|---------------|
| Repository | GitHub (private repository) |
| Branching | Feature branches off main |
| Code Review | Pull requests required |
| CI/CD | Render auto-deploy on merge |
| Environments | Development (local), Production (Render) |

### Deployment Pipeline

```
Developer workstation
    │
    ├─► Feature branch created
    ├─► Code changes committed
    ├─► Push to GitHub
    │
    ▼
GitHub Pull Request
    │
    ├─► Code review by team member
    ├─► TypeScript compilation check
    ├─► Merge to main branch
    │
    ▼
Render Auto-Deploy
    │
    ├─► Build triggered on push
    ├─► Frontend: npm install + vite build
    ├─► Backend: Docker build + deploy
    ├─► Health check verification
    │
    ▼
Production
```

### Dependency Management

**Backend (Python):**
- File: `apps/backend/requirements.txt`
- All 30+ packages pinned to exact versions (`==`)
- Git dependencies pinned to commit hashes
- Example: `anthropic==0.34.2`, `fastapi==0.115.0`

**Frontend (Node.js):**
- File: `apps/frontend/package.json`
- Dependencies use semver ranges (`^`)
- Lock file: `package-lock.json`
- **Action needed:** Pin to exact versions or use lock file in CI

**Docker Base Images:**
- All pinned to specific versions: `node:18.20-alpine3.20`
- Prevents supply chain attacks via tag mutation

### What's Needed for SOC 2
- Formal Change Management Policy
- Change request template and approval workflow
- Rollback procedures documentation
- Pre-deployment testing requirements
- Emergency change process
- Change advisory board (CAB) for significant changes

---

## 10. Vendor & Third-Party Risk Management

### Critical Vendors (Tier 1 - Data Processing)

| Vendor | Service | Data Shared | SOC 2? | BAA/DPA? |
|--------|---------|------------|--------|----------|
| **Supabase** | Database, Auth, Storage | All user data | Yes (SOC 2 Type II) | Yes |
| **Render** | Hosting, CDN | Application code, logs | Yes (SOC 2 Type II) | Yes |
| **Stripe** | Payments | Billing info (never raw card data) | Yes (PCI DSS Level 1, SOC 2) | Yes |
| **Anthropic** | AI (Claude) | Presentation content | Yes (SOC 2 Type II) | DPA available |
| **OpenAI** | AI (GPT-4) | Presentation content, outlines | Yes (SOC 2 Type II) | DPA available |

### Important Vendors (Tier 2 - Analytics/Monitoring)

| Vendor | Service | Data Shared | SOC 2? | BAA/DPA? |
|--------|---------|------------|--------|----------|
| **Sentry** | Error tracking | Error data, traces | Yes (SOC 2 Type II) | DPA available |
| **PostHog** | Analytics | User events, sessions | Yes (SOC 2 Type II) | DPA available |
| **Google Cloud** | OAuth, Gemini AI | OAuth tokens, content | Yes (SOC 2 Type II) | Yes |
| **Modal** | Serverless compute | Deck generation data | SOC 2 in progress | DPA available |
| **Redis Cloud** | Caching, rate limiting | Rate limit keys (hashed) | Yes (SOC 2 Type II) | Yes |

### Other Vendors (Tier 3 - Peripheral)

| Vendor | Service | Data Shared |
|--------|---------|------------|
| SerpAPI | Image search | Search queries |
| Firecrawl | Web scraping | URLs |
| Brandfetch | Brand data | Brand names |
| Resend | Email delivery | User emails |
| Chatbase | Support chat | User conversations |
| Nango | OAuth abstraction | OAuth tokens |

### Vendor Risk Assessment Actions Required
- Collect SOC 2 reports from all Tier 1 vendors
- Execute DPAs with all data-processing vendors
- Document vendor access and data flows
- Establish vendor review schedule (annual)
- Define vendor offboarding procedures

---

## 11. Infrastructure & Network Security

### Hosting Infrastructure

**Render (Primary Host):**
- SOC 2 Type II certified
- TLS termination at edge
- DDoS protection included
- Auto-scaling capabilities
- Isolated build environments
- Private networking between services available

**Supabase (Database Host):**
- SOC 2 Type II certified
- Hosted on AWS
- Automatic backups
- Point-in-time recovery
- Connection pooling (PgBouncer)
- Network isolation

### Network Controls

| Control | Implementation | Status |
|---------|---------------|--------|
| TLS/HTTPS | All connections encrypted | IMPLEMENTED |
| HSTS | 1-year max-age with includeSubDomains | IMPLEMENTED |
| CORS | Explicit origin whitelist | IMPLEMENTED |
| CSP | Restrictive Content-Security-Policy | IMPLEMENTED |
| Rate Limiting | Per-endpoint with global ceiling | IMPLEMENTED |
| DDoS Protection | Render/Cloudflare CDN | IMPLEMENTED |
| Firewall | Cloud provider managed | DELEGATED |
| VPN/Private Network | Not implemented | OPTIONAL |
| IP Allowlisting | Not implemented | RECOMMENDED |

### Content Security Policy (Frontend)

**File:** `apps/frontend/public/_headers`

```
default-src 'self'
script-src 'self' 'unsafe-inline' 'unsafe-eval'
           https://*.posthog.com
           https://*.sentry.io
           https://*.chatbase.co
style-src 'self' 'unsafe-inline'
          https://fonts.googleapis.com
font-src 'self' https://fonts.gstatic.com data:
img-src 'self' data: blob:
        https://*.supabase.co
        https://*.unsplash.com
        https://*.pexels.com
        https://images.unsplash.com
        https://*.nextslide.ai
connect-src 'self'
            https://*.supabase.co
            https://*.nextslide.ai
            https://*.posthog.com
            https://*.sentry.io
            wss://*.nextslide.ai
            https://api.openai.com
            https://*.anthropic.com
            https://*.google.com
            https://*.googleapis.com
frame-src 'self' https://accounts.google.com
object-src 'none'
base-uri 'self'
```

**CSP Notes:**
- `unsafe-inline` and `unsafe-eval` are present for React/Vite compatibility
- Future improvement: implement nonce-based CSP to remove `unsafe-inline`
- All external domains explicitly whitelisted

---

## 12. Database Security & Row-Level Security

### PostgreSQL Configuration (Supabase)

**Connection Security:**
- Connection pooling via PgBouncer
- SSL/TLS required for all connections
- Service key bypasses RLS (admin operations only)
- Anon key respects all RLS policies

**Circuit Breaker Configuration:**
```python
MAX_CONNECTIONS = 10
MAX_KEEPALIVE_CONNECTIONS = 5
CONNECT_TIMEOUT = 5.0 seconds
READ_TIMEOUT = 30.0 seconds
WRITE_TIMEOUT = 30.0 seconds
CONNECTION_MAX_AGE = 300 seconds (5 minutes)
CIRCUIT_BREAKER_FAILURE_THRESHOLD = 25
CIRCUIT_BREAKER_TIMEOUT = 30 seconds
```

### Row-Level Security (RLS) Policies

RLS is enabled on all user-facing tables. Policies enforce:

| Table | Policy | Rule |
|-------|--------|------|
| `decks` | SELECT | `user_id = auth.uid() OR is_public = true` |
| `decks` | INSERT | `user_id = auth.uid()` |
| `decks` | UPDATE | `user_id = auth.uid()` |
| `decks` | DELETE | `user_id = auth.uid()` |
| `user_decks` | ALL | `user_id = auth.uid()` |
| `subscriptions` | ALL | `user_id = auth.uid()` |
| `api_keys` | ALL | `user_id = auth.uid()` |
| `attachments` | ALL | `user_id = auth.uid()` |

### Database Migrations

**Location:** `apps/backend/migrations/`

Recent security-related migrations:
- `028_add_social_follow_notification_type.sql`
- `029_security_hardening.sql`
- `030_security_linter_fixes.sql`
- `031_rls_initplan_performance.sql` (RLS optimization)
- `032_drop_redundant_policies_and_indexes.sql`
- `033_merge_overlapping_policies.sql`

### Backup & Recovery

| Aspect | Implementation |
|--------|---------------|
| Automated Backups | Supabase daily backups (included) |
| Point-in-Time Recovery | Supabase Pro plan feature |
| Manual Exports | Admin can export via Supabase dashboard |
| Backup Encryption | AES-256 (Supabase/AWS managed) |
| Backup Testing | **NOT DOCUMENTED** - needs formal process |
| DR Testing | **NOT DOCUMENTED** - needs formal process |

---

## 13. Frontend Security Controls

### XSS Prevention

**DOMPurify Integration:**
- Library: `dompurify@3.3.1` with `@types/dompurify@3.0.5`
- Applied to all 21 files using `dangerouslySetInnerHTML` or `.innerHTML`
- Sanitizes all user-generated HTML content before rendering
- TypeScript compilation verified clean (zero errors post-implementation)

**Files with DOMPurify protection:**
- `CustomComponentRenderer.tsx` - User-generated component HTML
- `DiagramRenderer.tsx` - Diagram SVG content
- `MathRenderer.tsx` - Math equation rendering
- `compileRenderCode.ts` - Dynamic code compilation output
- `SharedSlideRenderer.tsx` - Shared deck content
- `chart.tsx` - Chart SVG output
- `SlideGeneratingUI.tsx` - Generation progress HTML
- And 14 additional component files

### Client-Side Storage Security

| Storage | Data | Sensitivity |
|---------|------|-------------|
| localStorage | Supabase auth tokens | Medium (managed by Supabase SDK, encrypted in transit) |
| sessionStorage | Deck navigation state, redirect paths | Low |
| IndexedDB | Yjs collaboration documents | Low (deck content for offline) |
| Cookies | None used directly | N/A |

### Authentication Guards

| Component | File | Protection |
|-----------|------|------------|
| `ProtectedRoute` | `src/components/ProtectedRoute.tsx` | Redirects unauthenticated users to `/login` |
| `AdminProtectedRoute` | `src/components/AdminProtectedRoute.tsx` | Double-verifies admin role via backend |

### API Client Security

**File:** `apps/frontend/src/services/apiClient.ts`

- Automatic Bearer token injection on all requests
- 401 retry with token refresh (once, then hard reset)
- Content-Type validation on responses
- Error extraction without exposing internals
- `skipAuth` flag for intentionally public endpoints

### Error Handling

- Global `ErrorBoundary` component catches React crashes
- Sentry captures all unhandled errors (production only)
- Console error suppression for known framework noise (750+ patterns)
- Error messages shown to users are generic/friendly

---

## 14. Personnel Security & HR

### Current State
This area requires the most attention for SOC 2. The following needs to be established:

### Required Items

| Item | Status | Action Required |
|------|--------|----------------|
| Background checks | NOT IMPLEMENTED | Implement for all new hires |
| Security awareness training | NOT IMPLEMENTED | Annual training program |
| Acceptable use policy | NOT WRITTEN | Draft and distribute |
| Onboarding checklist | NOT DOCUMENTED | Create with access provisioning steps |
| Offboarding checklist | NOT DOCUMENTED | Create with access revocation steps |
| Access review schedule | NOT IMPLEMENTED | Quarterly access reviews |
| NDA/Confidentiality agreements | VERIFY | Ensure all employees/contractors have signed |
| Role definitions | PARTIAL | Formalize in HR system |
| Security incident reporting | NOT DOCUMENTED | Create reporting procedure |

### Recommended Actions
1. Implement security awareness training (can use tools like KnowBe4 or free alternatives)
2. Document onboarding/offboarding procedures with access provisioning
3. Schedule quarterly access reviews (who has access to what)
4. Ensure NDAs are signed and on file
5. Create acceptable use policy
6. Implement background check process

---

## 15. Required Policies Inventory

SOC 2 requires approximately 20 written policies. Below is the complete list with current status:

| # | Policy | Status | Priority | Notes |
|---|--------|--------|----------|-------|
| 1 | **Information Security Policy** | NOT WRITTEN | CRITICAL | Master policy covering security program |
| 2 | **Access Control Policy** | PARTIAL (technical controls exist) | CRITICAL | Document access management procedures |
| 3 | **Change Management Policy** | NOT WRITTEN | CRITICAL | PR process exists but not documented |
| 4 | **Incident Response Policy** | NOT WRITTEN | CRITICAL | Need IR plan and runbooks |
| 5 | **Risk Assessment Policy** | IN PROGRESS (this document) | HIGH | Formalize risk assessment process |
| 6 | **Data Classification Policy** | NOT WRITTEN | HIGH | Define data sensitivity levels |
| 7 | **Encryption Policy** | PARTIAL (implemented, not documented) | HIGH | Document encryption standards |
| 8 | **Vulnerability Management Policy** | NOT WRITTEN | HIGH | Need scanning and patching process |
| 9 | **Business Continuity Plan** | NOT WRITTEN | HIGH | Need BCP and DR documentation |
| 10 | **Disaster Recovery Plan** | NOT WRITTEN | HIGH | Need DR procedures and testing |
| 11 | **Vendor Management Policy** | NOT WRITTEN | HIGH | Need vendor assessment process |
| 12 | **Acceptable Use Policy** | NOT WRITTEN | MEDIUM | Employee device and access usage |
| 13 | **Password Policy** | PARTIAL (Supabase defaults) | MEDIUM | Document requirements |
| 14 | **Data Retention Policy** | NOT WRITTEN | MEDIUM | Define retention periods |
| 15 | **Privacy Policy** | EXISTS (public-facing) | LOW | Review for SOC 2 alignment |
| 16 | **Physical Security Policy** | N/A (cloud-hosted) | LOW | Reference cloud provider policies |
| 17 | **Network Security Policy** | PARTIAL (implemented) | MEDIUM | Document network controls |
| 18 | **Logging & Monitoring Policy** | PARTIAL (implemented) | MEDIUM | Document log management |
| 19 | **Code of Conduct** | NOT WRITTEN | MEDIUM | Ethics and integrity |
| 20 | **Security Training Policy** | NOT WRITTEN | MEDIUM | Training program details |

**Delve provides templates for all of these policies.** During onboarding, they'll generate drafts based on your infrastructure.

---

## 16. Remediation Completed

The following security issues were identified and fixed during the SOC 2 readiness assessment:

### P0 - Critical (Fixed)

| Issue | Fix | File |
|-------|-----|------|
| Hardcoded production database password in source code | Removed fallback, requires DATABASE_URL env var | `apps/backend/api/requests/outline_agent/theme_executor.py` |
| Exception handler leaking internal error details to users | Returns generic "An unexpected error occurred" message | `apps/backend/api/chat_server.py` |
| Unverified JWT token fallback (signature bypass) | Removed entire fallback block, returns None on failure | `apps/backend/services/session_manager.py` |

### P1 - High (Fixed)

| Issue | Fix | File(s) |
|-------|-----|---------|
| XSS via unsanitized dangerouslySetInnerHTML | Added DOMPurify.sanitize() to all 21 affected files | 21 frontend component files |
| CORS allowing wildcard methods/headers | Locked to explicit allow lists | `apps/backend/api/chat_server.py` |
| Missing security headers | Added HSTS, CSP, X-Frame-Options, etc. | Backend middleware + `_headers` file |
| Open redirect in email confirmation | Added ALLOWED_REDIRECT_DOMAINS whitelist | `apps/backend/api/requests/api_auth.py` |
| PII (emails, tokens) in production logs | Added PIIRedactionFilter with regex patterns | `apps/backend/config/logging_config.py` |
| Hardcoded API keys in seed scripts | Removed, require SEED_API_KEY env var | 6 seed script files |

### P2 - Medium (Fixed)

| Issue | Fix | File(s) |
|-------|-----|---------|
| No rate limits on auth endpoints | Added comprehensive rate limit configuration | `apps/backend/config/rate_limits.py` |
| Unpinned Python dependencies | Pinned all 30+ packages to exact versions | `apps/backend/requirements.txt` |
| Unpinned Docker base images | Pinned to `node:18.20-alpine3.20` | 3 Dockerfiles |
| No .env.example files | Created comprehensive examples | Both backend and frontend |
| Frontend missing security headers | Added full header set with CSP | `apps/frontend/public/_headers` |

---

## 17. Remaining Manual Action Items

### Immediate (Before Delve Onboarding)

| # | Action | Priority | Owner | Notes |
|---|--------|----------|-------|-------|
| 1 | **Rotate all exposed API keys** | CRITICAL | Engineering | Anthropic, OpenAI, Supabase service key, database password |
| 2 | **Enable MFA for admin accounts** | CRITICAL | Admin | Supabase dashboard → Auth → MFA settings |
| 3 | **Move frontend secrets to backend proxy** | HIGH | Engineering | VITE_OPENAI_API_KEY, VITE_GOOGLE_CLIENT_SECRET should not be in browser |
| 4 | **Run npm audit fix** | HIGH | Engineering | Address known npm vulnerability alerts |
| 5 | **Set up Dependabot or Snyk** | HIGH | Engineering | Automated vulnerability scanning for both Python and Node |

### Short-Term (Within 2 Weeks)

| # | Action | Priority | Owner | Notes |
|---|--------|----------|-------|-------|
| 6 | **Write all 20 SOC 2 policies** | HIGH | Management | Use Delve templates |
| 7 | **Set up centralized logging** | HIGH | Engineering | Render logs → external SIEM (e.g., Datadog, Logz.io) |
| 8 | **Add pre-commit secret scanning** | MEDIUM | Engineering | trufflehog or git-secrets |
| 9 | **Document data retention policy** | MEDIUM | Management | Define periods for all data types |
| 10 | **Set up access review process** | MEDIUM | Management | Quarterly reviews of who has access to what |

### Medium-Term (Before Type I Audit)

| # | Action | Priority | Owner | Notes |
|---|--------|----------|-------|-------|
| 11 | **Implement CSRF protection** | MEDIUM | Engineering | Add CSRF tokens to state-changing requests |
| 12 | **Document BCP/DR procedures** | HIGH | Management | Business continuity and disaster recovery |
| 13 | **Test DR procedures** | HIGH | Engineering | Run actual disaster recovery test |
| 14 | **Implement formal change management** | MEDIUM | Engineering | Change request forms, approval workflow |
| 15 | **Security awareness training** | MEDIUM | Management | Initial training for all employees |
| 16 | **Vendor risk assessments** | MEDIUM | Management | Collect SOC 2 reports from critical vendors |
| 17 | **Background checks** | MEDIUM | HR | For all employees with production access |
| 18 | **Onboarding/offboarding checklists** | MEDIUM | HR | With access provisioning/deprovisioning |

---

## 18. Evidence Inventory

This section catalogs evidence that can be provided to auditors for each control area.

### Access Control Evidence

| Evidence | Location | Type |
|----------|----------|------|
| CORS configuration | `apps/backend/api/chat_server.py:252-268` | Code review |
| JWT validation logic | `apps/backend/services/session_manager.py` | Code review |
| RLS policies | Supabase dashboard → Database → Policies | Screenshot |
| Admin role verification | `apps/backend/api/requests/api_admin.py:169` | Code review |
| Rate limiting config | `apps/backend/config/rate_limits.py` | Code review |
| Protected routes | `apps/frontend/src/components/ProtectedRoute.tsx` | Code review |
| Admin route protection | `apps/frontend/src/components/AdminProtectedRoute.tsx` | Code review |
| API key management | `apps/backend/services/api_key_service.py` | Code review |

### Encryption Evidence

| Evidence | Location | Type |
|----------|----------|------|
| HSTS header | `apps/backend/api/chat_server.py:275` | Code review |
| CSP header | `apps/frontend/public/_headers` | Code review |
| Supabase encryption | Supabase SOC 2 report | Vendor report |
| TLS configuration | Render dashboard → Services | Screenshot |
| Slack token encryption | `apps/backend/services/slack/slack_auth.py:27` | Code review |

### Monitoring Evidence

| Evidence | Location | Type |
|----------|----------|------|
| Sentry configuration | `apps/backend/api/chat_server.py:85-103` | Code review |
| PII redaction filter | `apps/backend/config/logging_config.py` | Code review |
| Audit logging | `apps/backend/api/requests/api_admin.py:216` | Code review |
| Health check endpoints | `apps/backend/api/chat_server.py` | API test |
| Circuit breaker | `apps/backend/services/supabase.py:66-142` | Code review |
| PostHog analytics | `apps/frontend/src/services/analytics.ts` | Code review |

### Change Management Evidence

| Evidence | Location | Type |
|----------|----------|------|
| GitHub branch protection | GitHub → Settings → Branches | Screenshot |
| Pull request history | GitHub → Pull Requests | Screenshot |
| Deployment history | Render dashboard → Deploys | Screenshot |
| Dependency pinning | `apps/backend/requirements.txt` | Code review |
| Docker image pinning | All Dockerfiles | Code review |

### Input Validation Evidence

| Evidence | Location | Type |
|----------|----------|------|
| DOMPurify sanitization | 21 frontend component files | Code review |
| Pydantic models | All API endpoint files | Code review |
| Open redirect protection | `apps/backend/api/requests/api_auth.py` | Code review |
| File upload validation | `apps/frontend/src/utils/fileUploadUtils.ts` | Code review |

---

## 19. Anticipated Auditor Questions & Answers

### Authentication & Access Control

**Q: How do users authenticate to your application?**
> Users authenticate via Supabase Auth using one of four methods: email/password (with bcrypt hashing), Google OAuth (PKCE flow), magic link (passwordless), or API key (developer API). All authentication results in a JWT that is validated server-side via the Supabase Auth API on every request. We do not decode JWTs locally - validation is always done by calling Supabase's `/auth/v1/user` endpoint.

**Q: Is MFA enforced?**
> MFA is supported by our auth provider (Supabase) but is not currently enforced. This is on our immediate action item list to enable before the audit. We plan to enforce MFA for all admin accounts and offer optional MFA for standard users.

**Q: How do you manage admin access?**
> Admin access is verified through a two-layer system. The backend validates the user's JWT token and checks for admin role claims in their Supabase profile (`verify_admin_role()` in `api_admin.py`). The frontend independently verifies admin status via a backend API call with 5-minute caching. All admin actions are logged to the `audit_logs` table.

**Q: How are API keys managed?**
> API keys are issued through the admin panel and stored hashed in the database. Each key is rate-limited to 60 requests/minute with a maximum of 20 concurrent deck generations. Keys can be revoked by admins. API key hashes (not raw keys) are used for rate limiting identification.

**Q: How do you handle password management?**
> Passwords are managed entirely by Supabase Auth. Our backend never sees raw passwords. Supabase uses bcrypt hashing. Password reset is rate-limited to 3 attempts per hour per IP address.

**Q: How do you handle session management?**
> JWT access tokens are issued by Supabase with a default expiry (~1 hour). The frontend automatically refreshes tokens before expiry (5-minute buffer). The backend caches validated tokens for 5 minutes to reduce Supabase API calls. On logout, all local storage is cleared and the token cache is invalidated.

### Data Protection

**Q: How is data encrypted in transit?**
> All connections use TLS 1.2 or higher. We enforce HTTPS via HSTS headers with a max-age of 31,536,000 seconds (1 year) including subdomains. All service-to-service communication (backend to Supabase, AI APIs, Redis) uses TLS. WebSocket connections use WSS (TLS-encrypted).

**Q: How is data encrypted at rest?**
> All data at rest is encrypted using AES-256. Supabase uses AWS's transparent disk encryption for PostgreSQL. File uploads are stored in Supabase Storage (S3-backed) with server-side encryption. Redis data is encrypted by the cloud provider. Slack OAuth tokens are additionally encrypted with a dedicated encryption key before database storage.

**Q: Do you process or store credit card information?**
> No. All payment processing is handled by Stripe. Credit card numbers, CVVs, and other payment details never touch our servers. We only store Stripe customer IDs and subscription metadata.

**Q: How do you handle PII?**
> PII in production logs is automatically redacted by our `PIIRedactionFilter`, which uses regex patterns to replace emails, JWT tokens, API keys, and long base64 strings with redaction markers. Sentry is configured with `send_default_pii: false`. User emails are stored in the database protected by RLS policies.

**Q: What is your data retention policy?**
> [ACTION REQUIRED: Formal policy needs to be written. Current state: User data retained indefinitely until manually deleted. Error logs retained 90 days via Sentry. Analytics retained per PostHog plan. JWT cache expires in 5 minutes.]

### Monitoring & Incident Response

**Q: How do you monitor for security events?**
> We use Sentry for error tracking and performance monitoring (10% sampling). PostHog tracks product analytics. All admin actions are logged to an audit trail. The circuit breaker monitors Supabase connectivity. Health check endpoints verify service availability. Render provides infrastructure-level monitoring.

**Q: What happens when an error occurs in production?**
> Errors are captured by Sentry with full stack traces (PII redacted). Users see a generic error message ("An unexpected error occurred. Please try again later.") - no internal details are exposed. The error is categorized and alert rules can trigger notifications.

**Q: Do you have an incident response plan?**
> [ACTION REQUIRED: Formal IR plan needs to be written. Current state: Sentry alerts notify the team. Circuit breaker auto-mitigates Supabase outages. Admin can view service health via the admin panel.]

**Q: How do you handle vulnerability disclosures?**
> [ACTION REQUIRED: Need to establish a vulnerability disclosure policy and security contact.]

### Change Management

**Q: How are changes deployed to production?**
> Code changes go through GitHub pull requests with code review. On merge to the main branch, Render automatically builds and deploys the application. The frontend is built with Vite (static site), and the backend runs in Docker containers.

**Q: How do you manage dependencies?**
> All Python backend dependencies are pinned to exact versions in `requirements.txt`. Docker base images are pinned to specific versions (e.g., `node:18.20-alpine3.20`). We plan to implement Dependabot for automated vulnerability scanning.

**Q: Do you have a rollback procedure?**
> Render supports instant rollback to previous deploys via the dashboard. [ACTION REQUIRED: Document formal rollback procedure.]

### Infrastructure

**Q: Where is your application hosted?**
> Frontend and backend are hosted on Render (SOC 2 Type II certified). Database and authentication are on Supabase (SOC 2 Type II certified, AWS-hosted). Heavy compute runs on Modal. Redis is hosted on Redis Cloud (SOC 2 Type II certified).

**Q: How do you handle DDoS protection?**
> DDoS protection is provided by our hosting provider (Render) and CDN layer. Additionally, we implement application-level rate limiting via slowapi with per-endpoint limits and a global ceiling of 1,000 requests/minute across all clients.

**Q: Do you perform penetration testing?**
> [ACTION REQUIRED: Schedule annual penetration testing. This security audit serves as an initial assessment.]

### Vendor Management

**Q: Which third parties have access to customer data?**
> Our critical data-processing vendors are: Supabase (database/auth), Render (hosting), Anthropic (AI - presentation content), OpenAI (AI - outlines), Google (OAuth, AI), and Stripe (payments). All process data necessary for their function. We have DPAs/BAAs in place [ACTION REQUIRED: verify all DPAs are signed].

**Q: Do your vendors have SOC 2 reports?**
> Yes, our primary vendors (Supabase, Render, Stripe, Redis Cloud) all have SOC 2 Type II reports. Anthropic and OpenAI also maintain SOC 2 certifications. [ACTION REQUIRED: Collect and archive current SOC 2 reports from all vendors.]

---

## 20. Environment Variables & Secrets Management

### Backend Environment Variables

**Core Infrastructure:**
| Variable | Purpose | Sensitivity |
|----------|---------|-------------|
| `SUPABASE_URL` | Supabase project URL | Low (public) |
| `SUPABASE_KEY` / `SUPABASE_ANON_KEY` | Anonymous API key | Low (public, RLS-restricted) |
| `SUPABASE_SERVICE_KEY` | Service role key (bypasses RLS) | **CRITICAL** |
| `DATABASE_URL` | Direct PostgreSQL connection string | **CRITICAL** |
| `REDIS_URL` | Redis connection string | HIGH |

**AI/LLM API Keys:**
| Variable | Purpose | Sensitivity |
|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | Claude API access | **CRITICAL** |
| `OPENAI_API_KEY` | OpenAI API access | **CRITICAL** |
| `GOOGLE_API_KEY` / `GEMINI_API_KEY` | Google AI access | HIGH |
| `GROQ_API_KEY` | Groq inference | HIGH |
| `PPLX_API_KEY` / `PERPLEXITY_API_KEY` | Perplexity access | HIGH |

**Payment & External Services:**
| Variable | Purpose | Sensitivity |
|----------|---------|-------------|
| `STRIPE_SECRET_KEY` | Stripe API access | **CRITICAL** |
| `STRIPE_WEBHOOK_SECRET` | Webhook signature validation | HIGH |
| `SERPAPI_API_KEY` | Media search | MEDIUM |
| `BRANDFETCH_BRAND_API_KEY` | Brand data | MEDIUM |
| `FIRECRAWL_API_KEY` | Web scraping | MEDIUM |
| `RESEND_API_KEY` | Email delivery | HIGH |

**Security:**
| Variable | Purpose | Sensitivity |
|----------|---------|-------------|
| `SLACK_TOKEN_ENCRYPTION_KEY` | Encrypt Slack OAuth tokens | **CRITICAL** |
| `WEBHOOK_SIGNING_SECRET` | Webhook verification | HIGH |
| `SLACK_SIGNING_SECRET` | Slack request verification | HIGH |

### Frontend Environment Variables

| Variable | Purpose | Sensitivity | Browser Exposed? |
|----------|---------|-------------|-----------------|
| `VITE_SUPABASE_URL` | Supabase URL | Low | Yes (public) |
| `VITE_SUPABASE_ANON_KEY` | Anon key | Low | Yes (RLS-protected) |
| `VITE_OPENAI_API_KEY` | OpenAI access | **HIGH** | **Yes (should be proxied)** |
| `VITE_GOOGLE_CLIENT_SECRET` | OAuth secret | **HIGH** | **Yes (should be proxied)** |
| `VITE_GOOGLE_CLIENT_ID` | OAuth client ID | Low | Yes (public) |
| `VITE_GOOGLE_API_KEY` | Google API | MEDIUM | Yes |
| `VITE_POSTHOG_KEY` | Analytics | Low | Yes (public) |
| `VITE_SENTRY_DSN` | Error tracking | Low | Yes (public) |
| `VITE_CHATBASE_BOT_ID` | Support chat | Low | Yes (public) |

**Action Required:** `VITE_OPENAI_API_KEY` and `VITE_GOOGLE_CLIENT_SECRET` must be moved to backend proxy to prevent browser exposure.

### Secrets Storage

| Environment | Method | Access Control |
|-------------|--------|----------------|
| Development | `.env` files (gitignored) | Developer machines |
| Production | Render Environment Variables | Render dashboard access |
| CI/CD | GitHub Secrets (if applicable) | Repository admin access |

### .env.example Files

Both backend and frontend have `.env.example` files with:
- All required variables listed with placeholder values
- Grouped by category (infrastructure, AI, payments, etc.)
- Comments explaining each variable's purpose
- No real secrets included

---

## 21. Complete API Endpoint Inventory

### Authentication Endpoints (`/auth/*`)

| Method | Path | Auth | Rate Limit | Purpose |
|--------|------|------|------------|---------|
| POST | `/auth/signup` | None | 5/hour | User registration |
| POST | `/auth/signin` | None | 10/min | User login |
| POST | `/auth/magic-link/send` | None | 10/min | Send magic link |
| POST | `/auth/magic-link/verify` | None | 10/min | Verify magic link |
| POST | `/auth/google/signin` | None | 10/min | Google OAuth login |
| POST | `/auth/google/signup` | None | 10/min | Google OAuth signup |
| POST | `/auth/check-email` | None | 10/min | Check if email exists |
| GET | `/auth/confirm` | None | 10/min | Email confirmation (redirect protected) |
| GET | `/auth/me` | Bearer | 200/min | Current user profile |
| POST | `/auth/refresh` | Bearer | 10/min | Refresh token |
| POST | `/auth/signout` | Bearer | 200/min | Logout |
| PUT | `/auth/profile/{id}` | Bearer | 200/min | Update profile |
| GET | `/auth/decks` | Bearer | 200/min | List user decks |
| GET | `/auth/decks/{uuid}` | Bearer | 200/min | Get single deck |
| GET | `/auth/decks/{uuid}/full` | Bearer | 200/min | Full deck with slides |
| GET | `/auth/shared-decks` | Bearer | 200/min | Get shared decks |
| POST | `/auth/decks` | Bearer | 10/min | Create deck |
| PUT | `/auth/decks/{uuid}` | Bearer | 200/min | Update deck (ownership check) |
| DELETE | `/auth/decks/{uuid}` | Bearer | 200/min | Delete deck (ownership required) |
| POST | `/auth/decks/{uuid}/associate` | Bearer | 200/min | Associate deck to user |
| POST | `/auth/password/reset` | None | 3/hour | Password reset |
| PUT | `/auth/password` | Bearer | 200/min | Update password |

### Admin Endpoints (`/admin/*`)

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/admin/check` | Admin | Verify admin access |
| GET | `/admin/users` | Admin | List all users |
| GET | `/admin/users/{id}` | Admin | Get user details |
| PUT | `/admin/users/{id}` | Admin | Update user |
| POST | `/admin/users/{id}/actions` | Admin | User actions (suspend, ban) |
| GET | `/admin/users/{id}/credits` | Admin | View credit balance |
| PUT | `/admin/users/{id}/credits` | Admin | Adjust credits |
| GET | `/admin/decks` | Admin | List all decks |
| GET | `/admin/decks/{id}/full` | Admin | Full deck data |
| PATCH | `/admin/decks/{id}` | Admin | Update deck metadata |
| DELETE | `/admin/decks/{id}` | Admin | Delete any deck |
| GET | `/admin/audit-logs` | Admin | View audit trail |
| GET | `/admin/analytics/*` | Admin | Analytics endpoints |
| GET | `/admin/services/health` | Admin | Service health |
| GET | `/admin/services/config` | Admin | Configuration info |
| GET | `/admin/costs` | Admin | Cost breakdown |

### Public Developer API v1 (`/v1/*`)

| Method | Path | Auth | Rate Limit | Purpose |
|--------|------|------|------------|---------|
| POST | `/v1/decks` | API Key | 60/min | Create deck |
| GET | `/v1/decks/{id}/status` | API Key | 60/min | Check generation status |
| GET | `/v1/decks/{id}` | API Key | 60/min | Get completed deck |
| GET | `/v1/decks` | API Key | 60/min | List user's decks |
| DELETE | `/v1/decks/{id}` | API Key | 60/min | Delete deck |

### Generation & AI Endpoints

| Method | Path | Auth | Rate Limit | Purpose |
|--------|------|------|------------|---------|
| POST | `/api/deck/create` | Bearer | 10/min | Create from outline |
| POST | `/api/deck/create-from-outline` | Bearer | 10/min | Stream creation |
| POST | `/api/deck/compose-stream` | Bearer | 10/min | Compose with streaming |
| GET | `/api/deck/{id}/status` | Bearer | 200/min | Generation status |
| POST | `/api/openai/generate-outline` | Bearer | 200/min | Generate outline |
| POST | `/api/openai/generate-outline-stream` | Bearer | 200/min | Stream outline |
| POST | `/api/chat` | Bearer | 30/min | AI chat |

### Public/Community Endpoints

| Method | Path | Auth | Rate Limit | Purpose |
|--------|------|------|------------|---------|
| GET | `/api/public/deck/{slug}` | None | 60/min | View public deck |
| GET | `/api/community/*` | None/Bearer | 60/min | Community showcase |
| GET | `/api/health` | None | None | Health check |
| GET | `/api/health/supabase` | None | None | Supabase health |

### Other Endpoints

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/api/media/search` | Bearer | Media search |
| POST | `/api/media/proxy` | Bearer | Proxy external media |
| POST | `/api/file-analysis` | Bearer | Analyze uploaded file |
| POST | `/api/billing/*` | Bearer | Billing operations |
| POST | `/api/tool/generate` | None | Tool page generation (rate limited) |
| POST | `/api/debug-log` | None | Frontend error collection |

---

## 22. File & Dependency Reference

### Key Backend Files

| File | Purpose | Security Relevance |
|------|---------|-------------------|
| `api/chat_server.py` | Main FastAPI app, middleware, CORS | Central security configuration |
| `services/session_manager.py` | JWT validation, token caching | Authentication core |
| `services/supabase_auth_service.py` | User management, auth flows | PII handling, logging |
| `services/supabase.py` | Database client, circuit breaker | Connection security |
| `config/rate_limits.py` | Rate limiting configuration | Abuse prevention |
| `config/logging_config.py` | Log config, PII redaction | Data protection |
| `services/api_rate_limiter.py` | slowapi rate limiter setup | API protection |
| `api/requests/api_auth.py` | Auth endpoints, redirect protection | Authentication |
| `api/requests/api_admin.py` | Admin panel, audit logging | Access control |
| `api/requests/api_public_v1.py` | Developer API | API key management |
| `services/stripe_service.py` | Payment processing | Financial data |
| `worker.py` | Background job worker | Async processing |
| `modal_app.py` | Serverless compute | Remote execution |

### Key Frontend Files

| File | Purpose | Security Relevance |
|------|---------|-------------------|
| `src/integrations/supabase/client.ts` | Supabase client setup | PKCE flow, auth config |
| `src/context/SupabaseAuthContext.tsx` | Auth context, session management | Token handling |
| `src/services/authService.ts` | Token retrieval, refresh | Credential management |
| `src/services/apiClient.ts` | API client, auth injection | Request security |
| `src/services/analytics.ts` | PostHog analytics | Data collection |
| `src/components/ProtectedRoute.tsx` | Route protection | Access control |
| `src/components/AdminProtectedRoute.tsx` | Admin route protection | Privilege verification |
| `src/utils/fileUploadUtils.ts` | File upload handling | File validation |
| `src/utils/errorHandler.ts` | Global error handling | Error information control |
| `src/config/environment.ts` | Environment config | URL configuration |
| `public/_headers` | Security headers, CSP | Browser security |
| `vite.config.ts` | Build config, dev proxy | Development security |

### Python Dependencies (Pinned)

```
anthropic==0.34.2
fastapi==0.115.0
httpx==0.27.2
pydantic==2.9.2
uvicorn==0.31.0
slowapi==0.1.9
python-jose==3.3.0
sentry-sdk[fastapi]==2.14.0
stripe==10.11.0
posthog==3.7.0
supabase==2.8.1
pillow==10.4.0
arq==0.26.1
```
(See `apps/backend/requirements.txt` for complete list)

### Key Frontend Dependencies

```
react@18.3.1
@supabase/supabase-js@2.49.1
dompurify@3.3.1
@sentry/react@10.27.0
posthog-js@1.324.1
zustand@5.0.3
zod@3.23.8
yjs@13.6.26
y-websocket@3.0.0
tiptap@2.11.7+
axios@1.8.4
```
(See `apps/frontend/package.json` for complete list)

---

## Appendix A: SOC 2 Quick Reference

### Trust Service Categories

| Category | Code | Description |
|----------|------|-------------|
| Security | CC1-CC9 | Protection against unauthorized access |
| Availability | A1 | System available for operation and use |
| Processing Integrity | PI1 | System processing is complete, valid, accurate |
| Confidentiality | C1 | Confidential information is protected |
| Privacy | P1 | Personal information collected/used/retained properly |

### Type I vs Type II

| Aspect | Type I | Type II |
|--------|--------|---------|
| Scope | Point-in-time assessment | Period of time (3-12 months) |
| What it proves | Controls are designed | Controls operate effectively |
| Timeline | 1-3 weeks | 3+ month observation |
| Cost | Lower | Higher |
| Value | Baseline | Full compliance evidence |

### Delve-Specific Tips
1. Connect all integrations during onboarding (GitHub, Render, Supabase, Sentry)
2. Use Delve's policy templates - they're pre-mapped to SOC 2 criteria
3. Evidence collection is largely automated through integrations
4. Focus on the 6 priority areas: IAM, Logging, Change Mgmt, Encryption, Vuln Mgmt, Personnel
5. Start with Type I, then begin Type II observation period immediately after

---

## Appendix B: Delve Onboarding Checklist

- [ ] Create Delve account and start onboarding
- [ ] Connect GitHub integration
- [ ] Connect Render integration
- [ ] Connect Supabase integration (if available)
- [ ] Connect Sentry integration
- [ ] Connect PostHog integration (if available)
- [ ] Connect identity provider (Google Workspace / Supabase Auth)
- [ ] Upload org chart / employee list
- [ ] Upload existing policies (privacy policy, ToS)
- [ ] Review auto-generated gap analysis
- [ ] Begin drafting missing policies from templates
- [ ] Schedule kickoff with assigned auditor
- [ ] Designate internal compliance champion
- [ ] Set up evidence collection cadence (weekly/monthly)

---

*Document generated: February 1, 2026*
*Last updated: February 1, 2026*
*NextSlide Engineering Team*
