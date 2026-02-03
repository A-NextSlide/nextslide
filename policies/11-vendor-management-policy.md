# Vendor Management Policy

| Field | Value |
|---|---|
| **Document ID** | NEXTSLIDE-POL-11 |
| **Version** | 1.0 |
| **Classification** | Internal |
| **Effective Date** | February 1, 2026 |
| **Last Review Date** | February 1, 2026 |
| **Next Review Date** | February 1, 2027 |
| **Policy Owner** | CEO |
| **Approved By** | CEO / CTO |

## 1. Purpose

This policy establishes the requirements for selecting, assessing, monitoring, and managing third-party vendors that process, store, or have access to NextSlide data or systems. NextSlide's AI presentation generation platform relies on a network of cloud service providers and SaaS vendors. This policy ensures that vendor relationships do not introduce unacceptable risk to the confidentiality, integrity, or availability of customer data and platform services.

## 2. Scope

This policy applies to all third-party vendors, service providers, and sub-processors that:

- Process, store, or transmit NextSlide customer data
- Provide infrastructure or platform services used by NextSlide
- Have access to NextSlide systems, networks, or environments
- Provide services that, if disrupted, could impact NextSlide operations

This includes all current Tier 1, Tier 2, and Tier 3 vendors as classified in this policy, as well as any future vendor relationships.

## 3. Definitions

| Term | Definition |
|---|---|
| **Vendor** | Any third-party organization that provides products or services to NextSlide |
| **Sub-Processor** | A vendor's own third-party that processes NextSlide customer data on the vendor's behalf |
| **DPA** | Data Processing Agreement; a contractual agreement governing how a vendor processes personal data |
| **SOC 2 Report** | Service Organization Control report that evaluates a vendor's controls relevant to security, availability, processing integrity, confidentiality, and privacy |
| **Tier 1 Vendor** | Critical data processing vendor; handles customer data directly and is essential for platform operation |
| **Tier 2 Vendor** | Analytics, monitoring, or supporting vendor; may process limited data and supports platform operations |
| **Tier 3 Vendor** | Peripheral vendor; limited or no access to customer data; provides supplementary functionality |
| **Vendor Risk Assessment** | A structured evaluation of the security, compliance, and operational risks posed by a vendor relationship |
| **BAA** | Business Associate Agreement; applicable if HIPAA-regulated data is processed |

## 4. Policy Statements

### 4.1 Vendor Classification

All vendors shall be classified into one of three tiers based on the nature and sensitivity of their data access and their criticality to NextSlide operations.

#### Tier 1 -- Critical Data Processing

Tier 1 vendors directly process, store, or have access to customer data and are essential for core platform functionality. These vendors require the highest level of due diligence, contractual protection, and ongoing monitoring.

| Vendor | Service | Data Access | Compliance | DPA Status |
|---|---|---|---|---|
| **Supabase** | Database, Authentication, File Storage | Full customer data: presentations, user profiles, auth credentials, uploaded files | SOC 2 Type II (AWS-hosted) | Executed |
| **Render** | Application Hosting, CDN, TLS Termination | Application code, environment variables, request logs; data in transit | SOC 2 Type II | Executed |
| **Stripe** | Payment Processing | Payment methods, billing addresses, subscription data, transaction history | PCI DSS Level 1, SOC 2 Type II | Executed |
| **Anthropic** | AI Content Generation (Claude) | Presentation content submitted for AI processing (prompts and generated output) | SOC 2 Type II | Available; to be executed |
| **OpenAI** | AI Content Generation (GPT-4) | Presentation content submitted for AI processing (prompts and generated output) | SOC 2 Type II | Available; to be executed |

#### Tier 2 -- Analytics, Monitoring, and Supporting Services

Tier 2 vendors provide operational support services. They may process limited data and contribute to platform reliability but do not directly handle the full scope of customer data.

| Vendor | Service | Data Access | Compliance | DPA Status |
|---|---|---|---|---|
| **Sentry** | Error Tracking (Backend + Frontend) | Error context, stack traces, user identifiers in error reports, request metadata | SOC 2 Type II | Available; to be executed |
| **PostHog** | Product Analytics | Anonymized/pseudonymized usage events, feature flags, session data | SOC 2 Type II | Available; to be executed |
| **Google Cloud** | OAuth Authentication, Gemini AI | OAuth tokens, user email for authentication; content for Gemini AI processing | SOC 2 Type II | Executed |
| **Modal** | Serverless Compute (Heavy AI Workloads) | Presentation content processed during AI generation; ephemeral processing only | SOC 2 in progress | Available; to be executed |
| **Redis Cloud** | Caching, Rate Limiting | Cached data (ephemeral), rate limiting counters, session references | SOC 2 Type II | Executed |

#### Tier 3 -- Peripheral Services

Tier 3 vendors provide supplementary functionality with limited or no access to sensitive customer data. Their unavailability would degrade specific features but would not prevent core platform operation.

| Vendor | Service | Data Access |
|---|---|---|
| **SerpAPI** | Image Search | Search queries derived from presentation content (no user PII) |
| **Firecrawl** | URL Content Extraction | URLs submitted by users for content import |
| **Brandfetch** | Brand Asset Retrieval | Brand names submitted by users |
| **Resend** | Transactional Email | User email addresses, email content (notifications, invitations) |
| **Chatbase** | Customer Support Chat | Support conversation content, user identifiers |
| **Nango** | OAuth Token Management | OAuth tokens for third-party integrations |

### 4.2 SOC 2 Report Collection Schedule

NextSlide shall collect and review SOC 2 reports (or equivalent compliance documentation) from vendors according to the following schedule:

| Vendor Tier | Requirement | Collection Frequency | Review Deadline |
|---|---|---|---|
| **Tier 1** | SOC 2 Type II report required | Annually upon report issuance | Within 30 days of receipt |
| **Tier 2** | SOC 2 Type II report required where available | Annually upon report issuance | Within 60 days of receipt |
| **Tier 3** | Security questionnaire or self-attestation acceptable | Upon onboarding and every 2 years | Within 90 days of receipt |

For vendors with SOC 2 reports, the review shall evaluate:
- Any qualified opinions or exceptions noted by the auditor
- Complementary User Entity Controls (CUECs) that NextSlide must implement
- Changes in the scope of the audit from the prior year
- Any sub-processor changes that may affect NextSlide data

**Special Note -- Modal:** Modal's SOC 2 certification is currently in progress. Until certification is obtained, NextSlide shall conduct an enhanced vendor risk assessment of Modal annually, including a review of their security documentation, architecture, and data handling practices. Modal's certification status shall be tracked and escalated to the CTO quarterly.

### 4.3 DPA Requirements by Tier

| Vendor Tier | DPA Requirement | Timeline |
|---|---|---|
| **Tier 1** | DPA mandatory before vendor processes any customer data | Must be executed before vendor onboarding is complete |
| **Tier 2** | DPA required for vendors processing personal data or customer content | Within 90 days of vendor onboarding |
| **Tier 3** | DPA required for vendors processing personal data (e.g., email addresses); recommended for all | Within 180 days of vendor onboarding |

All DPAs must include, at minimum:
- Description of the data processing activities and data types
- Data retention and deletion obligations
- Security requirements and breach notification timelines
- Sub-processor notification and approval rights
- Audit rights or acceptance of SOC 2 reports as audit evidence
- Data transfer mechanisms for cross-border transfers (where applicable)

### 4.4 Vendor Onboarding Process

Before engaging a new vendor, the following steps must be completed:

1. **Business Justification** -- Document the business need and confirm no existing vendor can fulfill the requirement.
2. **Tier Classification** -- Classify the vendor into Tier 1, Tier 2, or Tier 3 based on data access and criticality.
3. **Security Assessment:**
   - Tier 1: Review SOC 2 Type II report, complete vendor risk assessment questionnaire, evaluate DPA terms.
   - Tier 2: Review SOC 2 report or security documentation, complete abbreviated risk assessment.
   - Tier 3: Review publicly available security information, complete basic risk checklist.
4. **Contractual Review** -- Ensure the vendor agreement includes appropriate security, confidentiality, and data protection clauses.
5. **DPA Execution** -- Execute a DPA per the requirements in Section 4.3.
6. **Technical Integration Review** -- CTO or engineering team reviews the technical integration for security implications (API key management, data flows, encryption in transit).
7. **Approval:**
   - Tier 1: Requires CEO and CTO approval.
   - Tier 2: Requires CTO approval.
   - Tier 3: Requires engineering lead approval with CTO notification.
8. **Vendor Register Entry** -- Add the vendor to the NextSlide Vendor Register with all classification, assessment, and contractual details.

### 4.5 Annual Vendor Review

All vendors shall be reviewed annually. The annual review includes:

| Review Activity | Tier 1 | Tier 2 | Tier 3 |
|---|---|---|---|
| SOC 2 report review (or equivalent) | Required | Required (where available) | Security questionnaire |
| DPA status verification | Required | Required | As applicable |
| Vendor incident history review | Required | Required | Recommended |
| Re-classification assessment | Required | Required | Required |
| Sub-processor change review | Required | Required | Not required |
| Performance evaluation | Required | Recommended | Not required |
| Continued business justification | Required | Required | Required |

The annual review shall be completed within Q1 of each calendar year. Results shall be documented and reported to the CEO.

### 4.6 Vendor Risk Assessment Criteria

Vendors shall be assessed against the following criteria:

| Criterion | Weight | Assessment Method |
|---|---|---|
| **Security Certifications** (SOC 2, ISO 27001, PCI DSS) | High | Review audit reports and certifications |
| **Data Encryption** (at rest and in transit) | High | Verify encryption standards (AES-256, TLS 1.2+) |
| **Access Controls** | High | Review access management practices and MFA requirements |
| **Incident Response Capability** | Medium | Review incident response procedures and breach notification timelines |
| **Data Residency and Transfer** | Medium | Verify data storage locations and cross-border transfer mechanisms |
| **Business Continuity** | Medium | Review BCP/DRP capabilities and uptime SLAs |
| **Sub-Processor Management** | Medium | Review sub-processor list and notification procedures |
| **Financial Stability** | Low | Assess vendor viability and funding status |
| **Regulatory Compliance** | As applicable | Verify compliance with relevant regulations (GDPR, CCPA) |

Each criterion shall be rated as Satisfactory, Needs Improvement, or Unsatisfactory. Vendors with any Unsatisfactory rating on a High-weight criterion require a remediation plan or an exception approved by the CEO.

### 4.7 Vendor Offboarding

When a vendor relationship is terminated, the following steps must be completed:

1. **Data Retrieval** -- Export and verify all NextSlide data held by the vendor before termination.
2. **Data Deletion Confirmation** -- Obtain written confirmation from the vendor that all NextSlide data has been deleted per the DPA.
3. **Access Revocation** -- Revoke all API keys, credentials, and access tokens associated with the vendor.
4. **Integration Removal** -- Remove or disable the vendor's integration from the NextSlide codebase and infrastructure.
5. **DNS and Configuration Cleanup** -- Remove any DNS records, environment variables, or configuration references to the vendor.
6. **Vendor Register Update** -- Update the Vendor Register to reflect the termination, including the date and reason.
7. **Post-Offboarding Verification** -- Verify that no data flows to the terminated vendor by monitoring network traffic and application logs for 30 days post-termination.

### 4.8 Sub-Processor Notification

NextSlide shall maintain awareness of sub-processors used by its vendors:

- **Tier 1 vendors** must provide notification of new sub-processors at least 30 days before the sub-processor begins processing NextSlide data. NextSlide reserves the right to object to new sub-processors.
- **Tier 2 vendors** must provide a current list of sub-processors upon request and notify NextSlide of material changes.
- NextSlide shall maintain a sub-processor register for all Tier 1 vendors and update it based on vendor notifications.

Where NextSlide customers have the right to be notified of sub-processor changes (e.g., under GDPR), NextSlide shall pass through vendor sub-processor notifications within 15 business days.

## 5. Roles and Responsibilities

| Role | Responsibilities |
|---|---|
| **CEO (Policy Owner)** | Approves Tier 1 vendor onboarding; reviews annual vendor assessment results; approves exceptions to vendor requirements; owns vendor relationships at the executive level |
| **CTO** | Conducts vendor technical and security assessments; approves Tier 2 vendor onboarding; manages SOC 2 report collection and review; oversees vendor offboarding |
| **Engineering Team** | Implements technical integrations securely; manages API keys and credentials; monitors vendor service health; supports vendor offboarding technical tasks |
| **All Employees** | Reports vendor-related concerns; follows approved vendor usage guidelines; does not engage unauthorized vendors or services |

## 6. Related Policies

| Policy | Relevance |
|---|---|
| NEXTSLIDE-POL-01 (Information Security Policy) | Overarching security framework governing vendor data handling requirements |
| NEXTSLIDE-POL-05 (Risk Assessment Policy) | Vendor risks are incorporated into the organizational risk register and assessment process |
| NEXTSLIDE-POL-15 (Data Classification and Handling Policy) | Defines data classification levels that determine vendor DPA and handling requirements |

## 7. Compliance and Enforcement

Engaging a vendor without following the onboarding process defined in this policy, or failing to conduct required vendor reviews, constitutes a policy violation. Violations may result in:

- Immediate suspension of the unauthorized vendor relationship
- Mandatory remedial training
- Formal written warning
- Disciplinary action, up to and including termination

The CEO is responsible for monitoring compliance with this policy through annual vendor review completion tracking and vendor register audits.

## 8. Exceptions

Exceptions to vendor management requirements must be submitted in writing to the CEO and must include:

- Description of the exception (e.g., vendor cannot provide SOC 2 report)
- Risk assessment of the exception
- Compensating controls (e.g., enhanced monitoring, restricted data access, contractual security requirements)
- Duration of the exception and a plan to resolve it

Current standing exception: Modal's SOC 2 Type II certification is in progress. Compensating controls include enhanced risk assessment, restricted data scope (ephemeral processing only), and quarterly status tracking.

## 9. Review Schedule

| Activity | Frequency | Responsible Party |
|---|---|---|
| Vendor Register review and update | Quarterly | CTO |
| Annual vendor assessments (all tiers) | Annually (Q1) | CEO / CTO |
| SOC 2 report collection and review | Annually (upon issuance) | CTO |
| DPA status verification | Annually | CEO / CTO |
| Sub-processor register update | Quarterly | CTO |
| Policy review and update | Annually | CEO |
| Modal SOC 2 status check | Quarterly | CTO |

## 10. Revision History

| Version | Date | Author | Description |
|---|---|---|---|
| 1.0 | February 1, 2026 | CEO | Initial policy creation |

---

**SOC 2 Trust Service Criteria:** CC9.1, CC9.2, CC2.3
