# Password and Credential Management Policy

| Field | Value |
|---|---|
| **Document ID** | NEXTSLIDE-POL-13 |
| **Version** | 1.0 |
| **Classification** | Internal |
| **Effective Date** | February 1, 2026 |
| **Last Review Date** | February 1, 2026 |
| **Next Review Date** | February 1, 2027 |
| **Policy Owner** | Chief Technology Officer (CTO) |
| **Approved By** | CEO / CTO |

## 1. Purpose

This policy defines the standards for password management, credential handling, and secrets management across the NextSlide platform. It ensures that all authentication credentials -- user passwords, API keys, service tokens, and infrastructure secrets -- are created, stored, transmitted, and rotated in a manner that protects NextSlide systems and customer data from unauthorized access.

## 2. Scope

This policy applies to:

- All user-facing passwords managed through Supabase Auth
- API keys issued to NextSlide users for programmatic access
- Infrastructure secrets including database credentials, third-party API keys (Anthropic, OpenAI, Google Gemini, Stripe), and service tokens
- Encryption keys such as `SLACK_TOKEN_ENCRYPTION_KEY`
- All employees, contractors, and automated systems that create, store, or use credentials within the NextSlide ecosystem

## 3. Definitions

| Term | Definition |
|---|---|
| **bcrypt** | An adaptive password hashing function used by Supabase Auth to securely store user passwords |
| **Credential** | Any secret value used for authentication or authorization, including passwords, API keys, tokens, and encryption keys |
| **Secret** | A credential or cryptographic key that must be protected from unauthorized disclosure |
| **Magic Link** | A single-use, time-limited URL sent to a user's email address that authenticates the user without requiring a password |
| **Hashed Storage** | The practice of storing only the cryptographic hash of a credential rather than the original value |
| **Environment Variable** | A key-value pair set in the hosting environment (Render) used to inject secrets at runtime without embedding them in code |
| **Credential Rotation** | The process of replacing an active credential with a new one and revoking the old credential |

## 4. Policy Statements

### 4.1 User Password Standards

All user passwords for the NextSlide application are managed exclusively through Supabase Auth. The following requirements apply:

1. **Minimum Length**: Passwords MUST be at least 8 characters long.
2. **Complexity**: Passwords MUST contain at least one uppercase letter, one lowercase letter, and one numeric digit.
3. **Hashing**: Supabase Auth hashes all passwords using bcrypt before storage. Plaintext passwords are never stored, logged, or accessible to NextSlide application code.
4. **Transmission**: Passwords are transmitted only over HTTPS (TLS 1.2 or higher). The NextSlide backend never receives or processes raw passwords; Supabase Auth handles the entire password verification flow.
5. **History**: Users are encouraged to avoid reusing recent passwords. Supabase Auth enforces this where configured.
6. **Expiration**: Password expiration is not currently enforced for end users but is recommended every 365 days for administrative accounts. This will be re-evaluated during annual policy review.

### 4.2 Passwordless Authentication

NextSlide offers Magic Link authentication as a passwordless alternative. Magic links are:

- Single-use and time-limited (expiration configured in Supabase Auth)
- Sent only to the email address registered to the user account
- Subject to the same rate limits as other authentication endpoints (10 requests per minute)

Users who authenticate exclusively via Magic Link or Google OAuth are not required to set a password.

### 4.3 Password Reset

- Password reset is initiated by the user through the NextSlide application, which delegates to Supabase Auth.
- Password reset requests are rate-limited to 3 attempts per hour per IP address to mitigate brute-force and abuse.
- Reset links are sent to the registered email address and expire after a time limit defined in Supabase Auth configuration.
- The system does not disclose whether an email address is registered during the reset flow to prevent user enumeration.

### 4.4 API Key Management

- API keys are generated per user for programmatic access to the NextSlide API v1 endpoints.
- Keys are stored in hashed form in the `api_keys` table, protected by Row-Level Security (`user_id = auth.uid()`). The original key value is displayed to the user only once at creation time.
- API keys are transmitted via the `X-API-Key` HTTP header. They MUST NOT be sent in URL query parameters or request bodies.
- API keys are rate-limited to 60 requests per minute per key.
- Users may revoke their own API keys at any time through the application interface.
- API keys MUST be rotated at least annually. Keys associated with offboarded users are revoked within 24 hours of separation.

### 4.5 JWT Token Lifecycle

- Supabase Auth issues a JWT access token and a refresh token upon successful authentication.
- JWTs are validated server-side via the Supabase Auth API. Local JWT decoding without server verification is prohibited.
- Token validation results are cached in an in-memory dictionary with a 5-minute TTL (implemented in `session_manager.py`) to reduce authentication latency.
- Token auto-refresh is initiated with a 5-minute buffer before the access token expires, ensuring uninterrupted user sessions.
- If token validation fails and no valid cache entry exists, the session is terminated. The system does not fall back to unverified or expired tokens.

### 4.6 Infrastructure Secrets Management

All infrastructure secrets MUST be managed according to the following standards:

1. **Production Environment**: Secrets are stored as Render environment variables. They are injected at runtime and are not accessible through the application's file system or source code.
2. **Development Environment**: Secrets are stored in `.env` files that are listed in `.gitignore` and MUST NOT be committed to the repository. The `.env.example` file documents required variables with placeholder values and is safe to commit.
3. **Prohibited Practices**: Hardcoding credentials in source code is strictly prohibited. Any hardcoded credentials discovered during code review or security assessment MUST be rotated immediately and the offending code remediated. Prior instances have been identified and remediated as part of NextSlide's security hardening process.
4. **Access to Secrets**: Only personnel with a documented need-to-know may access production environment variables in the Render dashboard. Access is logged and reviewed quarterly.

### 4.7 Encryption Keys and Service Tokens

- **Slack Integration Tokens**: Slack OAuth tokens are encrypted at rest using `SLACK_TOKEN_ENCRYPTION_KEY`, which is stored as a Render environment variable. The encryption key MUST be rotated annually or immediately if a compromise is suspected.
- **Supabase Service Key**: The service key bypasses Row-Level Security and is restricted to backend server-side use only. It MUST NOT be exposed to the frontend or logged. See NEXTSLIDE-POL-02 Section 4.9 for additional controls.
- **Third-Party API Keys**: Keys for Anthropic, OpenAI, Google Gemini, and Stripe are stored as Render environment variables. They MUST NOT be committed to source control, logged, or exposed in error responses. The `PIIRedactionFilter` redacts API keys from production logs as an additional safeguard.

### 4.8 Credential Rotation Schedule

| Credential Type | Rotation Frequency | Responsible Party |
|---|---|---|
| User passwords (admin) | Recommended every 365 days | Account holder |
| User API keys | At least annually | Account holder |
| Supabase service key | Annually or upon compromise | CTO |
| Third-party API keys (Anthropic, OpenAI, Google, Stripe) | Annually or upon compromise | CTO / Engineering |
| SLACK_TOKEN_ENCRYPTION_KEY | Annually or upon compromise | CTO / Engineering |
| Render deploy hooks and tokens | Annually or upon compromise | CTO |

Credential rotation events MUST be documented, including the date, the credential rotated, and the person responsible.

### 4.9 Credential Incident Response

If a credential is suspected or confirmed to be compromised:

1. The credential MUST be revoked or rotated immediately.
2. The incident MUST be reported to the CTO and handled under the incident response procedures defined in NEXTSLIDE-POL-01.
3. An investigation MUST determine the scope of unauthorized access, if any.
4. Affected users MUST be notified if their credentials or data were exposed.
5. A post-incident review MUST identify the root cause and corrective actions.

## 5. Roles and Responsibilities

| Role | Responsibility |
|---|---|
| **CTO (Policy Owner)** | Maintains this policy; manages infrastructure secrets rotation; approves access to production credentials |
| **Engineering Team** | Implements password and credential controls in code; maintains `PIIRedactionFilter`, `session_manager.py`, and hashing mechanisms; ensures `.env` files are gitignored |
| **All Employees** | Create strong passwords; protect credentials from disclosure; report suspected compromises immediately |
| **End Users** | Choose passwords meeting complexity requirements; safeguard API keys; revoke compromised credentials |
| **CEO** | Co-approves policy; approves exceptions |

## 6. Related Policies

| Document ID | Policy Title |
|---|---|
| NEXTSLIDE-POL-01 | Information Security Policy |
| NEXTSLIDE-POL-02 | Access Control Policy |
| NEXTSLIDE-POL-07 | Encryption Policy |

## 7. Compliance and Enforcement

Compliance with this policy is mandatory for all personnel and systems. Automated controls enforce key aspects of this policy: Supabase Auth enforces password hashing and complexity, rate limiters restrict password reset abuse, and `PIIRedactionFilter` prevents credential leakage in logs. Violations discovered through code review, security assessment, or audit will result in immediate remediation and may lead to disciplinary action. Intentional exposure of credentials is treated as a security incident.

## 8. Exceptions

Exceptions to password complexity or rotation requirements MUST be approved by the CTO in writing. Each exception must include a risk assessment, compensating controls, and an expiration date not exceeding 6 months. Approved exceptions are tracked and reviewed at each quarterly access review per NEXTSLIDE-POL-02.

## 9. Review Schedule

This policy is reviewed annually or when significant changes occur to NextSlide's authentication infrastructure (e.g., changes to Supabase Auth configuration, new credential types, new integrations). The CTO initiates and oversees the review. Security incidents involving credentials may trigger an immediate out-of-cycle review.

## 10. Revision History

| Version | Date | Author | Description |
|---|---|---|---|
| 1.0 | February 1, 2026 | CTO | Initial policy creation |

---

**SOC 2 Trust Service Criteria:** CC6.1, CC6.7
