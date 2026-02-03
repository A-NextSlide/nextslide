# Encryption Policy

| Field | Value |
|---|---|
| **Document ID** | NEXTSLIDE-POL-07 |
| **Version** | 1.0 |
| **Classification** | Internal |
| **Effective Date** | February 1, 2026 |
| **Last Review Date** | February 1, 2026 |
| **Next Review Date** | February 1, 2027 |
| **Policy Owner** | CTO |
| **Approved By** | CEO / CTO |

## 1. Purpose

This policy establishes the encryption standards and cryptographic controls required to protect NextSlide data in transit and at rest. It defines minimum cipher suite requirements, key management procedures, and certificate lifecycle practices to ensure the confidentiality and integrity of user content, authentication credentials, and platform communications across all NextSlide infrastructure components.

## 2. Scope

This policy applies to all data processed, transmitted, or stored by the NextSlide AI presentation generation platform, including:

- All network communications between users, frontend, backend, and third-party services.
- All persistent data stored in PostgreSQL (Supabase), object storage (AWS S3 via Supabase), and cache layers (Redis).
- All sensitive credentials including passwords, API keys, authentication tokens, and encryption keys.
- All employees, contractors, and automated systems that handle cryptographic material.

## 3. Definitions

| Term | Definition |
|---|---|
| **TLS** | Transport Layer Security, the cryptographic protocol used to secure network communications. |
| **HSTS** | HTTP Strict Transport Security, a response header forcing browsers to use HTTPS. |
| **AES-256** | Advanced Encryption Standard with 256-bit key length, used for data at rest. |
| **bcrypt** | An adaptive password hashing function with built-in salting. |
| **CSP** | Content Security Policy, an HTTP header controlling resource loading origins. |
| **HSM** | Hardware Security Module, a dedicated device for cryptographic key management. |
| **AEAD** | Authenticated Encryption with Associated Data, providing confidentiality and integrity. |
| **Key Rotation** | The scheduled replacement of cryptographic keys to limit exposure from compromise. |
| **PFS** | Perfect Forward Secrecy, ensuring session keys cannot be compromised by long-term key disclosure. |

## 4. Policy Statements

### 4.1 Encryption in Transit

All network communications to, from, and within the NextSlide platform MUST use TLS 1.2 or higher. TLS 1.0 and 1.1 are explicitly prohibited. The following table defines encryption requirements for each connection type:

| Connection | Protocol | Minimum Version | Enforcement Point |
|---|---|---|---|
| User to Frontend | HTTPS | TLS 1.2+ | Render TLS termination |
| User to Backend API | HTTPS | TLS 1.2+ | Render TLS termination |
| Backend to Supabase (PostgreSQL) | HTTPS / PostgreSQL SSL | TLS 1.2+ | Supabase managed |
| Backend to Supabase (Storage) | HTTPS | TLS 1.2+ | Supabase managed |
| Backend to Anthropic API | HTTPS | TLS 1.2+ | Anthropic endpoint |
| Backend to OpenAI API | HTTPS | TLS 1.2+ | OpenAI endpoint |
| Backend to Google Cloud APIs | HTTPS | TLS 1.2+ | Google endpoint |
| Backend to Redis Cloud | TLS | TLS 1.2+ | Redis Cloud managed |
| Backend to Modal | HTTPS | TLS 1.2+ | Modal endpoint |
| Backend to Stripe | HTTPS | TLS 1.2+ | Stripe endpoint |
| Backend to Resend (email) | HTTPS | TLS 1.2+ | Resend endpoint |
| WebSocket connections | WSS | TLS 1.2+ | Render TLS termination |

### 4.2 HSTS Enforcement

All NextSlide domains MUST serve the Strict-Transport-Security header with the following parameters:

- `max-age=31536000` (one year).
- `includeSubDomains` directive enabled to cover all subdomains.
- HSTS preload submission SHOULD be pursued for primary domains.

Plaintext HTTP connections MUST redirect to HTTPS with a 301 permanent redirect before any content is served.

### 4.3 Encryption at Rest

All persistent data stores MUST encrypt data at rest using AES-256 or equivalent:

| Data Store | Encryption Method | Key Management |
|---|---|---|
| PostgreSQL (Supabase) | AES-256 | Supabase / AWS managed keys |
| Object Storage (Supabase/AWS S3) | AES-256 | AWS managed keys (SSE-S3 or SSE-KMS) |
| Redis Cloud | Provider-managed encryption | Redis Cloud managed keys |

Application-level encryption keys (e.g., `SLACK_TOKEN_ENCRYPTION_KEY`) MUST be stored as environment variables within the Render deployment platform and MUST NOT be committed to source control.

### 4.4 Sensitive Data Encryption

#### 4.4.1 Password Hashing

All user passwords MUST be hashed using bcrypt with a minimum cost factor of 10 as implemented by Supabase Auth. Plaintext passwords MUST NOT be stored, logged, or transmitted except during the initial authentication request over TLS.

#### 4.4.2 Slack Token Encryption

Slack workspace tokens MUST be encrypted at the application layer using the `SLACK_TOKEN_ENCRYPTION_KEY` before storage in the database. The encryption key MUST be a minimum of 256 bits and rotated according to the key rotation schedule defined in Section 4.7.

#### 4.4.3 API Key Storage

Third-party API keys stored in the database MUST be hashed before persistence. Original key values are only available at creation time and cannot be recovered.

#### 4.4.4 JWT Token Handling

JWT tokens MUST be cached in memory only, with a maximum time-to-live of 5 minutes. JWT tokens MUST NOT be written to persistent storage or application logs.

### 4.5 Content Security Policy

The NextSlide frontend MUST enforce the following CSP directives to prevent injection attacks and unauthorized resource loading:

| Directive | Value | Rationale |
|---|---|---|
| `default-src` | `'self'` | Restrict all resource loading to same origin by default. |
| `script-src` | `'self' 'unsafe-inline' 'unsafe-eval' posthog sentry chatbase` | Allow scripts from approved analytics and support providers only. |
| `connect-src` | `supabase nextslide posthog sentry openai anthropic google` | Restrict API connections to approved backend and AI service endpoints. |
| `frame-src` | `accounts.google.com` | Allow Google OAuth iframe for authentication flow. |
| `object-src` | `'none'` | Block all plugin-based content (Flash, Java applets). |
| `base-uri` | `'self'` | Prevent base tag injection attacks. |

The use of `'unsafe-inline'` and `'unsafe-eval'` in `script-src` SHOULD be reduced over time through adoption of nonce-based CSP as framework support permits. Any additions to CSP directives require CTO approval and a documented security review.

### 4.6 Certificate Management

TLS certificate provisioning and renewal are delegated to managed infrastructure providers:

- **Render**: Automatic certificate issuance and renewal via Let's Encrypt for all NextSlide domains.
- **Supabase**: Managed certificates for database and storage endpoints.
- **Cloudflare**: Managed edge certificates for CDN and DDoS protection layer.

The engineering team MUST monitor certificate expiration through provider dashboards and set up alerting for any certificate with fewer than 14 days remaining. Certificate pinning MUST NOT be implemented to avoid availability risks from rotation.

### 4.7 Key Rotation Schedule

| Key / Secret | Rotation Frequency | Rotation Method |
|---|---|---|
| `SLACK_TOKEN_ENCRYPTION_KEY` | Annually or upon suspected compromise | Re-encrypt existing tokens with new key, update environment variable. |
| Supabase API keys | Annually or upon suspected compromise | Regenerate via Supabase dashboard, update environment variables. |
| Third-party API keys (OpenAI, Anthropic, etc.) | Annually or upon suspected compromise | Regenerate via provider dashboard, update environment variables. |
| JWT signing secrets | Annually or upon suspected compromise | Rotate via Supabase Auth configuration. |
| Redis connection credentials | Annually or upon suspected compromise | Regenerate via Redis Cloud, update connection strings. |

Emergency key rotation MUST be initiated within 4 hours of any confirmed or suspected key compromise. All key rotations MUST be logged in the audit trail with the identity of the operator and the reason for rotation.

### 4.8 Prohibited Encryption Practices

The following practices are explicitly prohibited:

- Use of TLS 1.0 or TLS 1.1 for any connection.
- Use of SSL 2.0 or SSL 3.0.
- Use of MD5 or SHA-1 for cryptographic hashing (non-integrity-check purposes).
- Use of DES, 3DES, or RC4 cipher suites.
- Storage of plaintext passwords, API keys, or encryption keys in source code, configuration files committed to version control, or application logs.
- Transmission of sensitive data over unencrypted channels.
- Use of custom or proprietary encryption algorithms.
- Disabling certificate validation in production code.

## 5. Roles and Responsibilities

| Role | Responsibility |
|---|---|
| **CTO** | Policy ownership, approval of encryption standard changes, oversight of key management practices. |
| **Engineering Team** | Implementation of encryption controls, monitoring certificate and key expiration, executing key rotations. |
| **DevOps / Infrastructure** | Configuration of TLS settings on Render, monitoring provider-managed encryption, environment variable management. |
| **Security Lead** | Periodic review of cipher suites, vulnerability scanning for cryptographic weaknesses, incident response for key compromise. |
| **All Employees** | Compliance with prohibited practices, reporting suspected key exposure immediately. |

## 6. Related Policies

- **NEXTSLIDE-POL-01** - Information Security Policy
- **NEXTSLIDE-POL-06** - Data Classification Policy
- **NEXTSLIDE-POL-17** - Network Security Policy

## 7. Compliance and Enforcement

Violations of this policy may result in disciplinary action up to and including termination. Systems found to be non-compliant with encryption requirements MUST be remediated within 48 hours of discovery or taken offline until compliant. Automated scanning SHOULD be implemented to detect unencrypted connections and weak cipher suites in production.

## 8. Exceptions

Exceptions to this policy require written approval from the CTO and MUST include:

- A description of the specific requirement being excepted.
- A risk assessment documenting the impact of the exception.
- Compensating controls to mitigate the identified risk.
- A defined expiration date not exceeding 90 days, after which the exception must be re-evaluated.

All active exceptions MUST be tracked in the policy exception register and reviewed quarterly.

## 9. Review Schedule

This policy is reviewed annually or upon significant changes to:

- NextSlide infrastructure or vendor relationships.
- Industry encryption standards or best practices.
- Regulatory requirements affecting data protection.
- Discovery of vulnerabilities in approved cryptographic algorithms.

## 10. Revision History

| Version | Date | Author | Description |
|---|---|---|---|
| 1.0 | February 1, 2026 | CTO | Initial policy creation. |

---

**SOC 2 Trust Service Criteria:** CC6.1 (Logical and Physical Access Controls), CC6.7 (Encryption of Data in Transit), C1.1 (Confidentiality of Information)
