# Network Security Policy

| Field | Value |
|---|---|
| **Document ID** | NEXTSLIDE-POL-17 |
| **Version** | 1.0 |
| **Classification** | Internal |
| **Effective Date** | February 1, 2026 |
| **Last Review Date** | February 1, 2026 |
| **Next Review Date** | February 1, 2027 |
| **Policy Owner** | CTO |
| **Approved By** | CEO / CTO |

## 1. Purpose

This policy defines the network security controls, boundary protections, and traffic management requirements for the NextSlide AI presentation generation platform. It establishes standards for origin controls, content security policies, rate limiting, security headers, DDoS protection, and network segmentation to protect the platform against unauthorized access, injection attacks, and denial-of-service threats.

## 2. Scope

This policy applies to all network infrastructure, communications, and traffic management systems within the NextSlide platform, including:

- All HTTP/HTTPS and WebSocket connections to and from NextSlide services.
- Cross-origin resource sharing (CORS) configurations.
- Content Security Policy (CSP) headers and browser security controls.
- Rate limiting and abuse prevention mechanisms.
- DDoS mitigation and CDN configurations.
- Network boundaries between NextSlide components and third-party services.
- Firewall rules and cloud provider network security groups.

## 3. Definitions

| Term | Definition |
|---|---|
| **CORS** | Cross-Origin Resource Sharing, an HTTP mechanism that allows controlled access from different origins. |
| **CSP** | Content Security Policy, an HTTP header that controls which resources the browser can load. |
| **Rate Limiting** | Restricting the number of requests a client can make within a defined time window. |
| **DDoS** | Distributed Denial of Service, an attack that overwhelms a service with traffic from multiple sources. |
| **CDN** | Content Delivery Network, a distributed network of servers that delivers content based on geographic proximity. |
| **WAF** | Web Application Firewall, a security layer that filters and monitors HTTP traffic. |
| **Open Redirect** | A vulnerability where an application redirects users to an attacker-controlled URL. |
| **Origin** | The combination of scheme, hostname, and port that identifies a web resource's source. |
| **WSS** | WebSocket Secure, the encrypted variant of the WebSocket protocol running over TLS. |
| **HSTS** | HTTP Strict Transport Security, a header instructing browsers to only use HTTPS. |

## 4. Policy Statements

### 4.1 CORS Configuration

Cross-origin requests to NextSlide APIs are restricted to an explicit whitelist of approved origins. The following origins are permitted:

| Approved Origin | Purpose |
|---|---|
| `https://app.nextslide.ai` | Primary application frontend |
| `https://www.nextslide.ai` | Marketing website and landing pages |
| `https://nextslide.ai` | Root domain |
| `https://*.nextslide.ai` (regex match) | Subdomain pattern for staging, preview, and feature branch deployments |

All CORS configurations MUST adhere to the following rules:

- The `Access-Control-Allow-Origin` header MUST only return origins present in the whitelist. Wildcard (`*`) origins are prohibited in production.
- `Access-Control-Allow-Credentials` MUST be set to `true` only for whitelisted origins.
- `Access-Control-Allow-Methods` MUST be restricted to the HTTP methods actually used by each endpoint.
- `Access-Control-Allow-Headers` MUST enumerate specific allowed headers rather than using wildcards.
- Preflight response caching (`Access-Control-Max-Age`) SHOULD be set to 3600 seconds (1 hour) to reduce preflight request volume.
- Any changes to the CORS whitelist require CTO approval and a documented security review.

### 4.2 Content Security Policy

The NextSlide frontend enforces a Content Security Policy via HTTP response headers. Each directive is defined and maintained as follows:

| CSP Directive | Value | Purpose |
|---|---|---|
| `default-src` | `'self'` | Baseline restriction: only load resources from the same origin unless overridden by a more specific directive. |
| `script-src` | `'self' 'unsafe-inline' 'unsafe-eval' *.posthog.com *.sentry.io *.chatbase.co` | Allow JavaScript execution from same origin and approved analytics (PostHog), monitoring (Sentry), and support (Chatbase) providers. `'unsafe-inline'` and `'unsafe-eval'` are required by the current frontend framework and should be replaced with nonce-based CSP when feasible. |
| `connect-src` | `*.supabase.co *.nextslide.ai *.posthog.com *.sentry.io api.openai.com api.anthropic.com *.googleapis.com` | Restrict XHR, Fetch, and WebSocket connections to approved backend services and AI API endpoints. |
| `frame-src` | `accounts.google.com` | Allow embedding Google OAuth consent screen in an iframe for authentication. All other framing is blocked. |
| `object-src` | `'none'` | Block all plugin-based content (Flash, Java, Silverlight) to eliminate legacy attack vectors. |
| `base-uri` | `'self'` | Prevent `<base>` tag injection that could redirect relative URLs to attacker-controlled domains. |

CSP violations MUST be monitored via the `report-uri` or `report-to` directive when available. Any modifications to CSP directives require CTO approval and testing in a staging environment before production deployment.

### 4.3 Rate Limiting

NextSlide implements rate limiting using `slowapi` backed by Redis Cloud to protect against abuse and ensure fair resource allocation. The following limits are enforced:

| Endpoint Category | Rate Limit | Window | Scope |
|---|---|---|---|
| AI generation endpoints (`/api/generate/*`) | 10 requests | Per minute | Per authenticated user |
| Authentication endpoints (`/api/auth/*`) | 20 requests | Per minute | Per IP address |
| API read endpoints (`/api/decks/*`, `/api/users/*`) | 100 requests | Per minute | Per authenticated user |
| API write endpoints (`/api/decks/*/update`) | 30 requests | Per minute | Per authenticated user |
| File upload endpoints (`/api/upload/*`) | 10 requests | Per minute | Per authenticated user |
| WebSocket connections | 5 connections | Concurrent | Per authenticated user |
| **Global ceiling** | **1000 requests** | **Per minute** | **Per IP address** |

Rate limiting behavior:

- Requests exceeding the limit MUST receive an HTTP 429 (Too Many Requests) response with a `Retry-After` header.
- Rate limit counters are stored in Redis with TTL-based expiration matching the rate window.
- Rate limit bypass tokens for internal services or approved partners require CTO approval.
- Rate limiting MUST be applied before computationally expensive operations (AI generation, image processing) to prevent resource exhaustion.

### 4.4 Security Headers

The following HTTP security headers MUST be present on all responses from NextSlide services:

| Header | Value (Backend) | Value (Frontend) | Purpose |
|---|---|---|---|
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` | `max-age=31536000; includeSubDomains` | Force HTTPS for all connections for one year, including subdomains. |
| `X-Content-Type-Options` | `nosniff` | `nosniff` | Prevent browsers from MIME-sniffing responses away from declared Content-Type. |
| `X-Frame-Options` | `DENY` | `SAMEORIGIN` | Backend: block all framing. Frontend: allow same-origin framing for internal embedding. |
| `X-XSS-Protection` | `1; mode=block` | `1; mode=block` | Enable browser XSS filtering and block rendering if an attack is detected. |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | `strict-origin-when-cross-origin` | Send full referrer for same-origin requests; only origin for cross-origin. |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), payment=()` | `camera=(), microphone=(), geolocation=(), payment=()` | Disable access to device APIs not used by NextSlide. |
| `Content-Security-Policy` | N/A (API responses) | See Section 4.2 | Control resource loading in the browser. |

Security headers MUST be validated as part of the CI/CD pipeline. Missing or misconfigured headers in production MUST be treated as a severity-2 incident and remediated within 24 hours.

### 4.5 DDoS Protection

NextSlide employs a layered DDoS mitigation strategy:

- **Layer 7 (Application)**: Cloudflare CDN provides edge-level DDoS mitigation, bot detection, and traffic filtering for all inbound requests before they reach Render.
- **Layer 4 (Transport)**: Render's infrastructure provides transport-layer DDoS protection as part of its managed hosting platform.
- **Application Layer**: Rate limiting (Section 4.3) provides additional protection against application-layer volumetric attacks.

DDoS mitigation configuration:

- Cloudflare MUST be configured in proxy mode (orange cloud) for all DNS records serving web traffic.
- Cloudflare security level SHOULD be set to "Medium" or higher.
- Challenge pages MUST be enabled for suspicious traffic patterns.
- Origin server IP addresses MUST NOT be publicly exposed outside of Cloudflare's proxy.
- The engineering team MUST have documented runbook procedures for escalating DDoS mitigation during active attacks, including Cloudflare "Under Attack" mode activation.

### 4.6 Network Boundaries

All communications between NextSlide components and external services MUST follow defined network boundaries with appropriate authentication:

| Source | Destination | Protocol | Authentication Method | Data Classification |
|---|---|---|---|---|
| User browser | Render (Frontend) | HTTPS (TLS 1.2+) | Session cookie / JWT | Public + Authenticated |
| User browser | Render (Backend API) | HTTPS (TLS 1.2+) | Bearer token (JWT) | Authenticated |
| User browser | Render (WebSocket) | WSS (TLS 1.2+) | JWT on connection | Authenticated |
| Render (Backend) | Supabase (PostgreSQL) | HTTPS + PostgreSQL SSL | API Key + JWT (Row Level Security) | Confidential |
| Render (Backend) | Supabase (Storage) | HTTPS | API Key + JWT | Confidential |
| Render (Backend) | Anthropic API | HTTPS (TLS 1.2+) | API Key (Bearer) | Internal |
| Render (Backend) | OpenAI API | HTTPS (TLS 1.2+) | API Key (Bearer) | Internal |
| Render (Backend) | Google Cloud APIs | HTTPS (TLS 1.2+) | OAuth / API Key | Internal |
| Render (Backend) | Modal | HTTPS (TLS 1.2+) | Auth Token | Internal |
| Render (Backend) | Redis Cloud | TLS | Connection string (password) | Internal |
| Render (Backend) | Stripe API | HTTPS (TLS 1.2+) | API Key (Bearer) | Confidential |
| Render (Backend) | Resend API | HTTPS (TLS 1.2+) | API Key | Internal |

No direct connections between external users and backend data stores (Supabase, Redis) are permitted. All data store access MUST be mediated through the NextSlide backend API.

### 4.7 WebSocket Security

WebSocket connections used for real-time features (generation progress, collaboration) MUST comply with the following:

- All WebSocket connections MUST use the WSS (WebSocket Secure) protocol over TLS 1.2+.
- Authentication MUST be validated on connection establishment using a JWT token.
- WebSocket connections MUST be subject to the concurrent connection limits defined in Section 4.3.
- Idle WebSocket connections MUST be terminated after 5 minutes of inactivity using server-side heartbeat mechanisms.
- WebSocket message payloads MUST be validated and sanitized before processing.
- WebSocket connections from non-whitelisted origins (Section 4.1) MUST be rejected.

### 4.8 Firewall and Cloud Provider Security

Firewall and network-level security controls are managed by cloud infrastructure providers:

- **Render**: Managed firewall rules restrict inbound traffic to HTTPS (443) and WSS. SSH access to application containers is restricted to Render's internal management plane.
- **Supabase**: Database connections are restricted by Supabase's managed network controls. Direct database connections from non-Supabase-managed IPs are blocked by default.
- **Redis Cloud**: Access is restricted to authenticated connections with TLS. Network-level IP whitelisting SHOULD be configured where supported.

NextSlide does not manage raw firewall rules. Any requirement for custom network-level controls MUST be implemented through provider-supported configuration and documented in the infrastructure runbook.

### 4.9 Open Redirect Protection

To prevent open redirect vulnerabilities that could be used for phishing:

- All application redirects MUST validate the target URL against the `ALLOWED_REDIRECT_DOMAINS` whitelist maintained in backend configuration.
- The whitelist includes: `app.nextslide.ai`, `www.nextslide.ai`, `nextslide.ai`, and `accounts.google.com` (for OAuth flow).
- Redirects to domains not on the whitelist MUST be blocked and logged as a security event.
- User-supplied redirect URLs (e.g., `?next=` parameters) MUST be validated server-side before execution.
- Relative redirects within the application are permitted without domain validation.

## 5. Roles and Responsibilities

| Role | Responsibility |
|---|---|
| **CTO** | Policy ownership, approval of CORS and CSP changes, rate limit exceptions, network architecture decisions. |
| **Engineering Team** | Implementation of CORS, CSP, rate limiting, and security headers; monitoring of rate limit metrics and DDoS events; WebSocket security implementation. |
| **DevOps / Infrastructure** | Cloudflare configuration, Render network settings, Redis Cloud access controls, certificate management, DDoS runbook maintenance. |
| **Security Lead** | Periodic security header audits, penetration testing of network boundaries, CORS and CSP review, open redirect testing. |
| **All Employees** | Reporting of suspected DDoS attacks, unauthorized network access, or misconfigured security controls. |

## 6. Related Policies

- **NEXTSLIDE-POL-01** - Information Security Policy
- **NEXTSLIDE-POL-07** - Encryption Policy
- **NEXTSLIDE-POL-02** - Access Control Policy

## 7. Compliance and Enforcement

Non-compliance with this policy may result in disciplinary action up to and including termination. Systems found to be non-compliant (e.g., missing security headers, CORS misconfiguration, disabled rate limiting) MUST be remediated within 24 hours of discovery. Critical network security issues (e.g., exposed origin IPs, disabled DDoS protection) require immediate remediation and an incident report.

## 8. Exceptions

Exceptions to this policy require written approval from the CTO and MUST include:

- The specific network security control being excepted.
- A risk assessment documenting the threat exposure created by the exception.
- Compensating controls to mitigate the identified risk.
- A defined expiration date not exceeding 90 days.

Exceptions to CORS whitelisting or rate limiting for third-party integrations MUST include a review of the third party's security posture.

## 9. Review Schedule

This policy is reviewed annually or upon:

- Changes to NextSlide's hosting infrastructure or CDN provider.
- Addition of new API endpoints or WebSocket channels.
- Discovery of network-level vulnerabilities or incidents.
- Changes to threat landscape requiring updated DDoS mitigation strategies.
- Modifications to third-party service integrations affecting network boundaries.

## 10. Revision History

| Version | Date | Author | Description |
|---|---|---|---|
| 1.0 | February 1, 2026 | CTO | Initial policy creation. |

---

**SOC 2 Trust Service Criteria:** CC6.1 (Logical and Physical Access Controls), CC6.6 (Security of System Boundaries), CC7.2 (Monitoring of System Components)
