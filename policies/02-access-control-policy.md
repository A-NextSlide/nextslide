# Access Control Policy

| Field | Value |
|---|---|
| **Document ID** | NEXTSLIDE-POL-02 |
| **Version** | 1.0 |
| **Classification** | Internal |
| **Effective Date** | February 1, 2026 |
| **Last Review Date** | February 1, 2026 |
| **Next Review Date** | February 1, 2027 |
| **Policy Owner** | Chief Technology Officer (CTO) |
| **Approved By** | CEO / CTO |

## 1. Purpose

This policy establishes the access control requirements for all NextSlide systems, services, and data. It defines how authentication, authorization, and session management are implemented and enforced across the NextSlide AI presentation generation platform to protect customer data, company assets, and infrastructure from unauthorized access.

## 2. Scope

This policy applies to all NextSlide systems and infrastructure, including:

- The React/TypeScript single-page application hosted on Render (static site)
- The Python FastAPI backend hosted on Render
- Supabase managed PostgreSQL database and authentication services
- Third-party integrations: Anthropic, OpenAI, Google Gemini, Stripe
- Administrative interfaces and dashboards (Render, Supabase, GitHub)
- All employees, contractors, and automated service accounts that interact with these systems

## 3. Definitions

| Term | Definition |
|---|---|
| **PKCE** | Proof Key for Code Exchange; an OAuth 2.0 extension used by Supabase Auth to secure the authorization code flow |
| **RLS** | Row-Level Security; a PostgreSQL feature enforced by Supabase that restricts data access at the row level |
| **JWT** | JSON Web Token; the bearer token format issued by Supabase Auth after successful authentication |
| **MFA** | Multi-Factor Authentication; a method requiring two or more verification factors to gain access |
| **Least Privilege** | The principle that users and systems receive only the minimum permissions necessary to perform their function |
| **Service Account** | A non-human identity used for system-to-system communication, such as the Supabase service key |
| **TTL** | Time-to-Live; the duration a cached value remains valid before it must be refreshed |

## 4. Policy Statements

### 4.1 Principle of Least Privilege

All access to NextSlide systems SHALL be granted based on the principle of least privilege. Users and service accounts receive only the permissions required to perform their assigned duties. Elevated access MUST be justified, approved by the CTO, and documented. Standing administrative privileges are prohibited unless explicitly authorized during quarterly access reviews.

### 4.2 Authentication Methods

NextSlide supports the following authentication methods, all managed through Supabase Auth:

1. **Email and Password** -- Passwords are hashed using bcrypt before storage. Supabase Auth handles all hashing operations; plaintext passwords are never stored or logged by NextSlide systems.
2. **Google OAuth** -- Federated authentication via Google using the PKCE OAuth 2.0 flow. Supabase Auth acts as the relying party.
3. **Magic Link** -- A passwordless authentication method where a one-time link is sent to the user's verified email address.
4. **API Key** -- For programmatic access via the `X-API-Key` header. API keys are generated per-user, stored in hashed form in the `api_keys` table, and rate-limited to 60 requests per minute per key.

All authentication methods issue a JWT and refresh token pair upon successful verification. No authentication method may bypass Supabase Auth.

### 4.3 Token Validation and Session Management

- All JWT tokens MUST be validated server-side via the Supabase Auth API. Local JWT decoding without server verification is explicitly prohibited.
- Token validation results are cached in an in-memory dictionary with a 5-minute TTL, implemented in `session_manager.py`. This cache reduces latency while maintaining a bounded window of trust.
- Supabase Auth API calls use a 1.5-second connection timeout and a 2.0-second read timeout to prevent service degradation.
- Sessions are stored in an in-memory dictionary with a 5-minute TTL. The system SHALL NOT fall back to unverified tokens if the cache entry expires or the Supabase Auth API is unreachable.
- Refresh tokens are used to obtain new JWTs before expiry. Token auto-refresh is triggered with a 5-minute buffer before token expiration.

### 4.4 Row-Level Security (RLS)

All user-facing tables in the Supabase PostgreSQL database enforce Row-Level Security policies. The standard RLS predicate is `user_id = auth.uid()`, applied to the following tables:

- `decks`
- `user_decks`
- `subscriptions`
- `api_keys`
- `attachments`

RLS ensures that authenticated users can only read and modify their own data. RLS policies MUST NOT be disabled in production. Any change to RLS policies requires CTO approval and a documented review.

### 4.5 Administrative Access

- Administrative operations are protected by the `verify_admin_role()` function, which validates the Bearer token, inspects user roles and claims, and caches the result for 5 minutes. All admin access attempts are audit-logged.
- The frontend enforces a double-verification pattern: the `AdminProtectedRoute` component checks admin status independently of the backend to prevent UI-level privilege escalation.
- Standard authenticated routes use the `ProtectedRoute` component, which verifies a valid session before rendering protected content.
- Admin account creation MUST be approved by the CTO and recorded in the access management log.

### 4.6 Multi-Factor Authentication (MFA)

MFA SHALL be enforced for all administrative accounts accessing NextSlide infrastructure (Render, Supabase dashboard, GitHub organization). MFA for end-user admin accounts within the NextSlide application is scheduled for enforcement and will be mandated once Supabase Auth MFA support is configured. Until enforcement, admin users are strongly encouraged to enable MFA through Supabase Auth.

### 4.7 API Key Management

- API keys are issued per user and stored as hashed values in the `api_keys` table, which is protected by RLS (`user_id = auth.uid()`).
- API keys are rate-limited to 60 requests per minute per key under the API v1 endpoint.
- Users may revoke their API keys at any time through the application interface.
- API keys MUST be rotated at least annually. Keys associated with offboarded employees or contractors are revoked immediately.
- API keys MUST NOT be logged, committed to source code, or transmitted in URL query parameters.

### 4.8 Rate Limiting

The following rate limits are enforced to protect against brute-force attacks and abuse:

| Endpoint Category | Rate Limit |
|---|---|
| Authentication | 10 requests/minute |
| Signup | 5 requests/hour |
| Password Reset | 3 requests/hour |
| Chat (AI generation) | 30 requests/minute |
| Deck Creation | 10 requests/minute |
| Admin Endpoints | 60 requests/minute |
| API v1 (per key) | 60 requests/minute |
| Global (per IP) | 200 requests/minute |

Rate limit configurations MUST be reviewed quarterly and adjusted based on observed traffic patterns and threat intelligence.

### 4.9 Service Accounts

- The Supabase service key is a privileged credential that bypasses RLS. Its use is restricted to backend server-side operations that require cross-user data access (e.g., administrative reporting, system migrations).
- The service key is stored as a Render environment variable in production and in `.env` files during local development (gitignored). It MUST NOT be committed to source control or exposed to the frontend.
- All service account credentials are inventoried and reviewed quarterly.

### 4.10 Access Reviews

- Quarterly access reviews MUST be conducted by the CTO or a delegate. Reviews cover all user accounts, admin roles, service accounts, and API keys.
- Inactive accounts (no login for 90 days) are flagged for deactivation.
- Review results are documented and retained for a minimum of one year.

### 4.11 Onboarding and Offboarding

- **Onboarding**: New personnel receive access provisioned through documented requests specifying the required role, systems, and justification. Access is granted only after approval by the direct manager and the CTO (for admin access).
- **Offboarding**: Upon separation, all access is revoked within 24 hours. This includes Supabase accounts, Render access, GitHub organization membership, API keys, and any shared credentials. The offboarding checklist is maintained by the CTO.

## 5. Roles and Responsibilities

| Role | Responsibility |
|---|---|
| **CTO (Policy Owner)** | Maintains this policy; approves admin access and service accounts; conducts quarterly access reviews |
| **Engineering Team** | Implements access controls in code; maintains RLS policies, rate limits, and authentication flows |
| **Team Leads** | Approve access requests for their teams; ensure least privilege compliance |
| **All Employees** | Comply with this policy; report suspected unauthorized access; protect credentials |
| **CEO** | Approves policy exceptions; co-approves policy revisions |

## 6. Related Policies

| Document ID | Policy Title |
|---|---|
| NEXTSLIDE-POL-01 | Information Security Policy |
| NEXTSLIDE-POL-06 | Data Classification and Handling Policy |
| NEXTSLIDE-POL-13 | Password Policy |

## 7. Compliance and Enforcement

All personnel are required to comply with this policy. Violations may result in disciplinary action up to and including termination of employment or contract. Suspected violations should be reported to the CTO immediately. Automated controls (RLS, rate limiting, token validation) enforce this policy at the system level, and any attempt to bypass these controls is treated as a security incident subject to investigation under NEXTSLIDE-POL-01.

## 8. Exceptions

Exceptions to this policy MUST be submitted in writing to the CTO, including the specific control being exempted, a risk justification, compensating controls, and a proposed expiration date. Approved exceptions are logged and reviewed at each quarterly access review. No exception may exceed 12 months without re-approval.

## 9. Review Schedule

This policy is reviewed annually or upon significant changes to NextSlide infrastructure, authentication mechanisms, or regulatory requirements. The CTO is responsible for initiating the review. Interim reviews may be triggered by security incidents, audit findings, or changes to the Supabase Auth configuration.

## 10. Revision History

| Version | Date | Author | Description |
|---|---|---|---|
| 1.0 | February 1, 2026 | CTO | Initial policy creation |

---

**SOC 2 Trust Service Criteria:** CC6.1, CC6.2, CC6.3, CC6.6, CC6.7, CC6.8
