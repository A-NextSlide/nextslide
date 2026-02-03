# Data Classification and Handling Policy

| Field | Value |
|---|---|
| **Document ID** | NEXTSLIDE-POL-06 |
| **Version** | 1.0 |
| **Classification** | Internal |
| **Effective Date** | February 1, 2026 |
| **Last Review Date** | February 1, 2026 |
| **Next Review Date** | February 1, 2027 |
| **Policy Owner** | Chief Technology Officer (CTO) |
| **Approved By** | CEO / CTO |

## 1. Purpose

This policy defines the data classification framework for NextSlide, an AI-powered presentation generation platform. It establishes four classification tiers, assigns specific NextSlide data assets to each tier, and prescribes handling requirements governing storage, transmission, access, and disposal. Proper data classification ensures that information assets receive security controls proportionate to their sensitivity and that NextSlide meets its confidentiality obligations to users, partners, and regulatory bodies.

## 2. Scope

This policy applies to all data created, received, processed, stored, or transmitted by NextSlide systems, including:

- Data at rest in Supabase managed PostgreSQL databases.
- Data in transit between the React/TypeScript frontend, FastAPI backend, and third-party services.
- Data processed by Modal serverless compute during AI generation workloads.
- Data synchronized via Yjs CRDT WebSocket connections during real-time collaboration.
- Data held by third-party processors including Stripe, Anthropic, OpenAI, Google, Sentry, and PostHog.
- Configuration data, environment variables, and deployment artifacts on Render.
- Logs, audit trails, and observability data across all systems.

All personnel, contractors, and third-party service providers handling NextSlide data must comply with the classification and handling requirements defined herein.

## 3. Definitions

| Term | Definition |
|---|---|
| **Data Classification** | The process of categorizing data assets based on their sensitivity and the impact of unauthorized disclosure, modification, or loss. |
| **Data Owner** | The individual or role responsible for a specific data asset, including its classification, authorized access, and lifecycle management. |
| **Data Custodian** | The individual or team responsible for implementing the technical controls required by the data's classification tier. |
| **Handling Requirements** | The mandatory security controls for storage, transmission, access, and disposal of data at a given classification tier. |
| **PII Redaction** | The process of removing or masking personally identifiable information from data, implemented in NextSlide via the PIIRedactionFilter in logging_config.py, which filters emails, tokens, API keys, and base64-encoded data. |
| **Row-Level Security (RLS)** | Supabase PostgreSQL feature enforcing row-level access policies so that authenticated users can only access their own data. |
| **Environment Variable** | A configuration value injected at runtime, used by NextSlide to store secrets such as DATABASE_URL, API keys, and encryption keys in Render and Modal environments. |

## 4. Policy Statements

### 4.1 Classification Tiers

All NextSlide data shall be assigned to one of four classification tiers. Data that has not been explicitly classified shall be treated as CONFIDENTIAL until a formal classification is assigned.

#### 4.1.1 CRITICAL

Data whose unauthorized disclosure, modification, or loss would cause severe harm to NextSlide operations, user trust, or regulatory standing. CRITICAL data provides direct access to core systems or enables impersonation, financial fraud, or mass data exfiltration.

**NextSlide CRITICAL data assets include:**

- Supabase service role key (bypasses RLS; grants unrestricted database access).
- DATABASE_URL (PostgreSQL connection string with credentials).
- ANTHROPIC_API_KEY (grants access to Claude AI generation on NextSlide's billing account).
- OPENAI_API_KEY (grants access to GPT-4 AI generation on NextSlide's billing account).
- GOOGLE_API_KEY (grants access to Gemini AI generation on NextSlide's billing account).
- STRIPE_SECRET_KEY (grants full access to NextSlide's Stripe account, including payment operations).
- SLACK_TOKEN_ENCRYPTION_KEY (symmetric key used to encrypt Slack OAuth tokens at rest).
- User passwords (bcrypt hashed by Supabase Auth; the hashes themselves are CRITICAL).
- Supabase JWT secret (used to sign and verify all authentication tokens).
- Database backup encryption keys.

#### 4.1.2 CONFIDENTIAL

Data whose unauthorized disclosure would harm individual users, compromise their privacy, or expose NextSlide to legal or reputational risk. CONFIDENTIAL data includes personal information, user-generated content, and authentication artifacts.

**NextSlide CONFIDENTIAL data assets include:**

- User email addresses (stored in Supabase auth.users table).
- User profile information (display names, avatar URLs).
- JWT access and refresh tokens issued by Supabase Auth.
- API keys issued to users (stored as hashed values in Supabase).
- Slack OAuth tokens (encrypted at rest using SLACK_TOKEN_ENCRYPTION_KEY).
- User presentation content (slides, speaker notes, images, themes).
- Yjs CRDT collaboration documents and synchronization state.
- Payment metadata including Stripe customer IDs, subscription status, and invoice references (card numbers and CVVs never touch NextSlide servers per Stripe PCI DSS compliance).
- User credit balances and adjustment history.
- Password reset tokens and email verification tokens.
- User session data and device fingerprints.

#### 4.1.3 INTERNAL

Data intended for use within NextSlide operations that is not sensitive to individual users but should not be publicly disclosed. Unauthorized disclosure of INTERNAL data would provide limited operational intelligence to adversaries.

**NextSlide INTERNAL data assets include:**

- System and application logs with PII redacted via PIIRedactionFilter (emails, tokens, API keys, and base64 data stripped).
- Audit logs from the audit_logs table in Supabase (admin actions, user management events, credit adjustments).
- Rate limiting configurations (slowapi rules, Redis thresholds).
- Deployment configurations and Render service settings (excluding secrets).
- Sentry error tracking data (configured with send_default_pii: false, 10% trace sampling).
- PostHog product analytics data (US-hosted instance).
- Circuit breaker configuration parameters (25-failure threshold, 30-second timeout for Supabase connectivity).
- Internal architecture documentation and system diagrams.
- Security header configurations (HSTS, CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy).
- CORS origin whitelist entries (app.nextslide.ai, www.nextslide.ai, nextslide.ai).
- Feature flags and A/B test configurations.
- Non-production environment configurations.

#### 4.1.4 PUBLIC

Data explicitly intended for public access or already publicly available. No harm results from its disclosure.

**NextSlide PUBLIC data assets include:**

- Marketing website content (nextslide.ai landing pages).
- Public API documentation and developer guides.
- Public presentation content (decks with the is_public flag set to true).
- Content Security Policy (CSP) headers (visible in HTTP responses).
- .env.example files in the source repository (containing placeholder variable names without values).
- Open-source dependency lists (package.json, requirements.txt).
- Public-facing terms of service and privacy policy.
- Public changelog and release notes.

### 4.2 Handling Requirements

#### 4.2.1 CRITICAL Data Handling

| Control | Requirement |
|---|---|
| **Storage** | Must be stored in encrypted secrets management systems. Environment variables containing CRITICAL data (DATABASE_URL, API keys, encryption keys) must be stored in Render's encrypted environment variable store or Modal's secrets infrastructure. Never stored in source code, configuration files, logs, or client-side code. |
| **Transmission** | Must be transmitted only over TLS 1.2 or higher. CRITICAL secrets must never appear in URL parameters, HTTP headers visible in logs, or WebSocket messages. API keys must be injected server-side by the FastAPI backend and never exposed to the React frontend. |
| **Access** | Restricted to the minimum set of personnel required for operational necessity. Access to Supabase service role key and DATABASE_URL limited to the CTO and designated senior engineers. All access must be logged. No shared credentials permitted. |
| **Disposal** | Must be cryptographically destroyed when no longer needed. API key rotation must invalidate prior keys. Database credentials must be rotated upon personnel departure. Backup media containing CRITICAL data must be securely wiped using NIST 800-88 compliant methods. |

#### 4.2.2 CONFIDENTIAL Data Handling

| Control | Requirement |
|---|---|
| **Storage** | Must be stored in Supabase PostgreSQL with Row-Level Security (RLS) policies enforced. User presentation content must be accessible only to the content owner and explicitly shared collaborators. Slack OAuth tokens must be encrypted at rest using the SLACK_TOKEN_ENCRYPTION_KEY. Passwords must be stored only as bcrypt hashes (handled by Supabase Auth). |
| **Transmission** | Must be transmitted only over TLS 1.2 or higher. Yjs CRDT WebSocket connections for real-time collaboration must use secure WebSocket (wss://) protocol. JWT tokens must be transmitted via HTTP-only cookies or Authorization headers, never in URL parameters. |
| **Access** | Governed by Supabase RLS policies ensuring users access only their own data. Backend API endpoints must validate JWT tokens via Supabase Auth before returning CONFIDENTIAL data. Admin access to CONFIDENTIAL data must be logged in the audit_logs table. |
| **Disposal** | User data must be deleted upon verified account deletion request. Presentation content and collaboration state must be purged from Supabase and any cached representations. Stripe customer data deletion must be requested via Stripe API upon account closure. Retention periods defined in NEXTSLIDE-POL-07. |

#### 4.2.3 INTERNAL Data Handling

| Control | Requirement |
|---|---|
| **Storage** | May be stored in standard infrastructure systems (Supabase, Render, Sentry, PostHog) without additional encryption beyond platform defaults. PII redaction must be applied to all logs before storage via the PIIRedactionFilter. |
| **Transmission** | Must be transmitted over TLS. Internal APIs between NextSlide services on Render must use HTTPS. Sentry and PostHog data transmission must use the vendors' standard encrypted transport. |
| **Access** | Restricted to NextSlide personnel with a legitimate business need. Access to audit logs, Sentry dashboards, and PostHog analytics should be role-appropriate. No external sharing without CTO approval. |
| **Disposal** | May follow standard deletion procedures. Log retention periods apply per NEXTSLIDE-POL-07 and NEXTSLIDE-POL-14. Sentry and PostHog data subject to vendor retention policies. |

#### 4.2.4 PUBLIC Data Handling

| Control | Requirement |
|---|---|
| **Storage** | No special storage requirements. Public content may be stored in standard systems and CDN caches (Cloudflare/Render CDN). |
| **Transmission** | Should be served over HTTPS for integrity but no confidentiality requirement. Public decks served through Render CDN with standard caching. |
| **Access** | No access restrictions. Public decks (is_public flag) are accessible without authentication. |
| **Disposal** | No special disposal requirements. CDN caches may retain public content per standard TTL configurations. |

### 4.3 Classification Responsibilities

Data owners are responsible for assigning the correct classification tier to data assets under their control. When data from multiple tiers is combined (e.g., a log entry containing both INTERNAL system data and a CONFIDENTIAL email address), the combined data must be handled at the highest applicable tier unless the sensitive elements are effectively redacted. The PIIRedactionFilter in logging_config.py exists specifically to strip CONFIDENTIAL elements (emails, tokens, API keys, base64 data) from logs so that the resulting log data can be classified as INTERNAL rather than CONFIDENTIAL.

### 4.4 Reclassification

Data classification must be reviewed when:

- The nature or sensitivity of the data changes (e.g., a private deck is made public via the is_public flag, reclassifying its content from CONFIDENTIAL to PUBLIC).
- Business or regulatory requirements change.
- A data breach or near-miss suggests that the current classification is insufficient.

Reclassification requests must be submitted to the CTO and documented in the audit_logs table.

### 4.5 Third-Party Data Handling

Third-party processors must handle NextSlide data in accordance with the classification tier assigned to that data. Contracts and data processing agreements must specify handling requirements consistent with this policy. Key third-party handling obligations:

- **Stripe** must maintain PCI DSS compliance for all payment card data. NextSlide servers never process or store card numbers.
- **Supabase** must maintain encryption at rest for all database storage containing CRITICAL and CONFIDENTIAL data.
- **Sentry** must respect the send_default_pii: false configuration, ensuring no PII is transmitted to Sentry systems.
- **AI providers (Anthropic, OpenAI, Google)** must not retain user presentation content beyond the duration of the API request, per their respective data processing agreements.

## 5. Roles and Responsibilities

| Role | Responsibilities |
|---|---|
| **CTO (Policy Owner)** | Maintains the data classification framework. Approves classification tier assignments for new data types. Reviews reclassification requests. Ensures handling requirements are technically enforced. |
| **Data Owners** | Assign classification tiers to data assets under their control. Ensure data is handled according to its tier. Initiate reclassification when circumstances change. |
| **Engineering Team (Data Custodians)** | Implement technical controls per handling requirements: Supabase RLS policies, PIIRedactionFilter, encryption at rest, TLS configuration, secrets management in Render/Modal, and Sentry/PostHog configuration. |
| **All Personnel** | Handle data according to its classification tier. Do not store CRITICAL data outside approved secrets management systems. Report suspected data misclassification or mishandling to the CTO. |

## 6. Related Policies

| Document ID | Policy Title | Relationship |
|---|---|---|
| NEXTSLIDE-POL-01 | Information Security Policy | Master policy; this policy operates under its authority. |
| NEXTSLIDE-POL-07 | Data Retention and Disposal Policy | Defines retention periods and disposal procedures referenced in handling requirements. |
| NEXTSLIDE-POL-14 | Logging, Monitoring, and Audit Policy | Governs the classification and handling of log data, audit trails, and PII redaction standards. |
| NEXTSLIDE-POL-15 | Privacy Policy | Governs user consent, data subject rights, and privacy obligations for CONFIDENTIAL personal data. |
| NEXTSLIDE-POL-02 | Access Control Policy | Defines access control mechanisms (Supabase RLS, CORS, RBAC) referenced in handling requirements. |
| NEXTSLIDE-POL-05 | Encryption and Key Management Policy | Governs encryption standards and key lifecycle for CRITICAL encryption keys and CONFIDENTIAL data at rest. |
| NEXTSLIDE-POL-13 | Third-Party and Vendor Management Policy | Governs third-party data handling obligations referenced in Section 4.5. |

## 7. Compliance and Enforcement

All personnel must comply with the classification and handling requirements defined in this policy. Violations include but are not limited to:

- Storing CRITICAL secrets (API keys, database credentials, encryption keys) in source code, chat messages, or unencrypted files.
- Transmitting CONFIDENTIAL user data (email addresses, presentation content, payment metadata) over unencrypted channels.
- Disabling or bypassing the PIIRedactionFilter, resulting in CONFIDENTIAL data appearing in INTERNAL-classified logs.
- Sharing INTERNAL operational data (Sentry errors, audit logs, deployment configs) with external parties without CTO approval.
- Failing to reclassify data when its sensitivity changes.

Violations shall result in disciplinary action proportionate to the severity and intent, up to and including termination. Violations involving CRITICAL data may also trigger the Incident Response Policy (NEXTSLIDE-POL-08).

## 8. Exceptions

Exceptions to handling requirements must be requested in writing to the CTO, include a justification and risk assessment, and propose compensating controls. Exceptions are time-limited to a maximum of 90 days and must be documented. No exception shall permit CRITICAL data to be stored in plaintext outside approved secrets management systems.

## 9. Review Schedule

This policy shall be reviewed:

- Annually, on or before the Next Review Date.
- When new categories of data are introduced to the NextSlide platform (e.g., new AI provider integrations, new user data fields, new third-party services).
- Following any data breach, near-miss, or material change to the handling of CRITICAL or CONFIDENTIAL data.
- Upon changes to applicable legal or regulatory requirements affecting data classification.

## 10. Revision History

| Version | Date | Author | Description |
|---|---|---|---|
| 1.0 | February 1, 2026 | CTO | Initial policy establishing four-tier data classification framework with NextSlide-specific data asset assignments and handling requirements for Supabase, Render, Modal, Stripe, and AI provider integrations. |

---

**SOC 2 Trust Service Criteria:** CC6.1, CC6.7, C1.1, C1.2
