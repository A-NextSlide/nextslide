# Information Security Policy

| Field | Value |
|---|---|
| **Document ID** | NEXTSLIDE-POL-01 |
| **Version** | 1.0 |
| **Classification** | Internal |
| **Effective Date** | February 1, 2026 |
| **Last Review Date** | February 1, 2026 |
| **Next Review Date** | February 1, 2027 |
| **Policy Owner** | Chief Technology Officer (CTO) |
| **Approved By** | CEO / CTO |

## 1. Purpose

This policy establishes the Information Security Program for NextSlide, an AI-powered presentation generation platform. It defines management's commitment to protecting the confidentiality, integrity, and availability of all information assets, including user-generated presentation content, authentication credentials, AI processing pipelines, and supporting infrastructure. This document serves as the master policy governing all subordinate security policies within the NextSlide organization.

## 2. Scope

This policy applies to:

- All NextSlide employees, contractors, and third-party service providers with access to NextSlide systems or data.
- All information assets owned, operated, or managed by NextSlide, including but not limited to:
  - The React/TypeScript single-page application hosted on Render (static site).
  - The Python FastAPI backend service hosted on Render.
  - The Supabase managed PostgreSQL database with Row-Level Security (RLS).
  - Modal serverless compute infrastructure used for AI workload processing.
  - Yjs CRDT-based real-time collaboration services with WebSocket transport.
  - Third-party AI provider integrations (Anthropic Claude, OpenAI GPT-4, Google Gemini).
  - Payment processing via Stripe integration.
  - Monitoring and observability systems including Sentry and PostHog.
- All environments: production, staging, and development.

## 3. Definitions

| Term | Definition |
|---|---|
| **Information Asset** | Any data, system, application, or infrastructure component that holds value to NextSlide, including user presentation content, source code, API keys, and database records. |
| **Information Security Program** | The coordinated set of policies, procedures, technical controls, and organizational structures designed to protect NextSlide's information assets. |
| **Trust Service Criteria (TSC)** | The SOC 2 framework criteria established by the AICPA covering Security, Availability, Processing Integrity, Confidentiality, and Privacy. |
| **Row-Level Security (RLS)** | Supabase PostgreSQL feature that restricts data access at the row level based on the authenticated user's identity and role. |
| **PKCE** | Proof Key for Code Exchange; an OAuth 2.0 extension used by Supabase Auth to secure the authorization code flow against interception attacks. |
| **CRDT** | Conflict-free Replicated Data Type; the Yjs data structure enabling real-time collaborative editing of NextSlide presentations without a central coordination server. |
| **PII** | Personally Identifiable Information; any data that can be used to identify an individual, including email addresses, names, and payment metadata. |
| **Circuit Breaker** | A fault-tolerance pattern implemented for Supabase connectivity (25-failure threshold, 30-second timeout) to prevent cascading failures. |

## 4. Policy Statements

### 4.1 Security Program Establishment

NextSlide shall maintain a formal Information Security Program that addresses the confidentiality, integrity, and availability of all information assets. The program shall be proportionate to the risks faced by the organization and aligned with SOC 2 Trust Service Criteria.

### 4.2 Management Commitment

NextSlide leadership commits to:

- Allocating sufficient resources (personnel, budget, and tooling) for the operation of the Information Security Program.
- Reviewing security posture on a quarterly basis and after any significant security incident.
- Ensuring that security objectives are integrated into business planning and platform development decisions, including the selection of AI providers (Anthropic, OpenAI, Google) and infrastructure services (Render, Supabase, Modal).
- Maintaining executive sponsorship of the security program through the CTO, with ultimate accountability held by the CEO.

### 4.3 Security Objectives

The Information Security Program shall pursue the following objectives:

- **Confidentiality:** Protect user presentation content, authentication credentials, API keys (ANTHROPIC_API_KEY, OPENAI_API_KEY, STRIPE_SECRET_KEY), and personal data from unauthorized disclosure. Enforce data classification tiers as defined in the Data Classification Policy (NEXTSLIDE-POL-06).
- **Integrity:** Ensure the accuracy and completeness of user data stored in Supabase PostgreSQL, presentation content managed through Yjs CRDT synchronization, and AI-generated outputs. Maintain input validation through Zod (frontend), Pydantic (backend), and DOMPurify XSS sanitization.
- **Availability:** Maintain platform uptime targets through Render hosting, Cloudflare/Render CDN for DDoS protection, Redis-backed rate limiting via slowapi, and circuit breaker patterns for Supabase connectivity (25-failure threshold, 30-second timeout).

### 4.4 Organizational Security Roles

NextSlide shall maintain clearly defined security roles and responsibilities. The CTO serves as the Information Security Program owner and is responsible for the design, implementation, and ongoing management of all security controls. Day-to-day security operations, including incident response and vulnerability management, shall be delegated to designated engineering personnel.

### 4.5 Security Governance Structure

The security governance structure consists of:

- **Executive Oversight:** The CEO and CTO jointly approve all security policies and are briefed on security posture quarterly.
- **Policy Review Board:** The CTO and senior engineering leadership review all policies annually or upon material changes to infrastructure, regulatory requirements, or threat landscape.
- **Operational Security:** Engineering teams implement and maintain technical controls including Supabase RLS policies, security headers (HSTS, CSP, X-Frame-Options DENY, X-Content-Type-Options nosniff, Referrer-Policy, Permissions-Policy), CORS origin whitelisting (app.nextslide.ai, www.nextslide.ai, nextslide.ai), and PII redaction filters in logging_config.py.

### 4.6 Risk Management

NextSlide shall conduct risk assessments at least annually and upon significant changes to the platform architecture or third-party integrations. Risk assessments shall evaluate threats to user data confidentiality (presentation content, payment metadata), service availability (Render, Modal, Supabase uptime), and processing integrity (AI output accuracy, CRDT conflict resolution). Identified risks shall be documented, assigned owners, and tracked to resolution or accepted with executive approval.

### 4.7 Policy Framework Overview

This Information Security Policy is the master document governing a comprehensive framework of 20 security policies. All subordinate policies derive their authority from this document and must be read in conjunction with it:

| Document ID | Policy Title |
|---|---|
| NEXTSLIDE-POL-01 | Information Security Policy (this document) |
| NEXTSLIDE-POL-02 | Access Control Policy |
| NEXTSLIDE-POL-03 | Authentication and Password Policy |
| NEXTSLIDE-POL-04 | Network Security Policy |
| NEXTSLIDE-POL-05 | Encryption and Key Management Policy |
| NEXTSLIDE-POL-06 | Data Classification and Handling Policy |
| NEXTSLIDE-POL-07 | Data Retention and Disposal Policy |
| NEXTSLIDE-POL-08 | Incident Response Policy |
| NEXTSLIDE-POL-09 | Business Continuity and Disaster Recovery Policy |
| NEXTSLIDE-POL-10 | Change Management Policy |
| NEXTSLIDE-POL-11 | Vulnerability Management Policy |
| NEXTSLIDE-POL-12 | Acceptable Use Policy |
| NEXTSLIDE-POL-13 | Third-Party and Vendor Management Policy |
| NEXTSLIDE-POL-14 | Logging, Monitoring, and Audit Policy |
| NEXTSLIDE-POL-15 | Privacy Policy |
| NEXTSLIDE-POL-16 | Physical Security Policy |
| NEXTSLIDE-POL-17 | Secure Software Development Lifecycle Policy |
| NEXTSLIDE-POL-18 | Risk Assessment and Management Policy |
| NEXTSLIDE-POL-19 | Code of Conduct |
| NEXTSLIDE-POL-20 | Human Resources Security Policy |

### 4.8 Third-Party Security

NextSlide relies on managed infrastructure and third-party services that process or store user data. Each third-party provider shall be evaluated for security posture before integration and monitored on an ongoing basis as defined in the Third-Party and Vendor Management Policy (NEXTSLIDE-POL-13). Key third-party dependencies include:

- **Supabase:** Managed PostgreSQL with RLS, JWT-based authentication with PKCE OAuth 2.0, and bcrypt password hashing.
- **Render:** Frontend static site hosting and backend API hosting with TLS termination.
- **Modal:** Serverless compute for AI workloads; no persistent user data storage.
- **Stripe:** PCI DSS compliant payment processing; card data never touches NextSlide servers.
- **Anthropic, OpenAI, Google:** AI content generation providers subject to data processing agreements.
- **Sentry:** Error tracking configured with send_default_pii set to false and 10% trace sampling.
- **PostHog:** Product analytics hosted in the US region.
- **Cloudflare:** CDN and DDoS mitigation for frontend assets and API traffic.

### 4.9 Continuous Improvement

The Information Security Program shall be subject to continuous improvement through regular policy reviews, incident post-mortems, vulnerability assessments, and feedback from internal stakeholders. Findings from Sentry error tracking, PostHog usage analytics, and audit log analysis (audit_logs table in Supabase) shall inform security control enhancements.

## 5. Roles and Responsibilities

| Role | Responsibilities |
|---|---|
| **CEO** | Ultimate accountability for the Information Security Program. Approves policies, allocates budget, and sets organizational security culture. |
| **CTO (Policy Owner)** | Designs, implements, and manages the Information Security Program. Owns all technical security decisions including infrastructure architecture, third-party provider selection, and security control implementation. |
| **Engineering Team** | Implements and maintains technical controls including Supabase RLS policies, security headers, CORS configuration, input validation (Zod, Pydantic, DOMPurify), PII redaction filters, and rate limiting. |
| **All Personnel** | Comply with all security policies, report security incidents and suspected vulnerabilities, complete security awareness training, and protect credentials and access tokens. |

## 6. Related Policies

This is the master policy. All policies listed in Section 4.7 (NEXTSLIDE-POL-02 through NEXTSLIDE-POL-20) are subordinate to this document. Key cross-references:

- **NEXTSLIDE-POL-02** Access Control Policy -- governs Supabase RLS, CORS, and role-based access.
- **NEXTSLIDE-POL-05** Encryption and Key Management Policy -- governs API key storage, TLS configuration, and bcrypt hashing.
- **NEXTSLIDE-POL-06** Data Classification and Handling Policy -- defines data tiers and handling requirements.
- **NEXTSLIDE-POL-08** Incident Response Policy -- governs response to security events detected via Sentry and audit logs.
- **NEXTSLIDE-POL-13** Third-Party and Vendor Management Policy -- governs relationships with Supabase, Render, Modal, Stripe, and AI providers.
- **NEXTSLIDE-POL-14** Logging, Monitoring, and Audit Policy -- governs Sentry, PostHog, and audit_logs usage.
- **NEXTSLIDE-POL-19** Code of Conduct -- establishes ethical behavior expectations aligned with security culture.

## 7. Compliance and Enforcement

All personnel are required to comply with this policy and all subordinate policies referenced herein. Violations may result in disciplinary action up to and including termination of employment or contract, consistent with the severity of the violation and applicable law. Deliberate circumvention of security controls, unauthorized access to user presentation data, or unauthorized disclosure of CRITICAL or CONFIDENTIAL classified information (as defined in NEXTSLIDE-POL-06) shall be treated as serious violations.

## 8. Exceptions

Exceptions to this policy must be requested in writing, include a risk assessment and proposed compensating controls, and be approved by the CTO. All approved exceptions shall be documented, time-limited (maximum 90 days), and reviewed upon expiration. No exception shall be granted that would compromise the confidentiality of user data or violate applicable legal or regulatory requirements.

## 9. Review Schedule

This policy shall be reviewed:

- Annually, on or before the Next Review Date listed in the document header.
- Upon any significant change to NextSlide infrastructure (e.g., migration of hosting providers, addition of new AI integrations, changes to authentication architecture).
- Following any major security incident as defined in the Incident Response Policy (NEXTSLIDE-POL-08).
- Upon changes to applicable legal, regulatory, or contractual requirements.

## 10. Revision History

| Version | Date | Author | Description |
|---|---|---|---|
| 1.0 | February 1, 2026 | CTO | Initial policy creation covering the NextSlide Information Security Program, security governance structure, and policy framework of 20 subordinate policies. |

---

**SOC 2 Trust Service Criteria:** CC1.1, CC1.2, CC1.3, CC1.4, CC1.5, CC2.1, CC5.3
