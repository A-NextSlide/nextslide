# Privacy Policy (Internal)

| Field | Value |
|---|---|
| **Document ID** | NEXTSLIDE-POL-15 |
| **Version** | 1.0 |
| **Classification** | Internal |
| **Effective Date** | February 1, 2026 |
| **Last Review Date** | February 1, 2026 |
| **Next Review Date** | February 1, 2027 |
| **Policy Owner** | CEO |
| **Approved By** | CEO / CTO |

## 1. Purpose

This policy establishes the internal privacy framework for the NextSlide AI presentation generation platform. It defines how personal data is collected, processed, shared with sub-processors, and protected throughout its lifecycle. This is the internal SOC 2-aligned privacy policy governing operational practices and is maintained separately from the public-facing privacy notice presented to users in the application (LegalModal.tsx).

## 2. Scope

This policy applies to all personal data processed by the NextSlide platform, including:

- Personal data of registered users (name, email, authentication credentials, payment information).
- Content data created by users (presentations, uploaded images, transcripts).
- Behavioral data collected through analytics and session recording.
- Technical data collected through error monitoring and application logs.
- Data shared with or processed by third-party sub-processors.

This policy applies to all NextSlide employees, contractors, and third-party service providers who access or process personal data on behalf of NextSlide.

## 3. Definitions

| Term | Definition |
|---|---|
| **Personal Data** | Any information relating to an identified or identifiable natural person, as defined by GDPR Article 4(1). |
| **Data Controller** | NextSlide, as the entity determining the purposes and means of processing personal data. |
| **Data Processor** | A third-party entity that processes personal data on behalf of NextSlide. |
| **Sub-processor** | A third party engaged by NextSlide to process personal data as part of service delivery. |
| **Data Subject** | An individual whose personal data is processed by NextSlide. |
| **DPA** | Data Processing Agreement, a contract governing the processing of personal data by a processor. |
| **DPIA** | Data Protection Impact Assessment, a process to identify and minimize privacy risks. |
| **PII** | Personally Identifiable Information. |
| **Breach** | An incident resulting in unauthorized access to, disclosure of, or loss of personal data. |
| **Privacy by Design** | The principle of embedding privacy protections into system architecture from the outset. |

## 4. Policy Statements

### 4.1 Sub-processor Registry

NextSlide engages the following sub-processors for data processing. Each sub-processor is classified by tier based on the nature and sensitivity of data access:

#### Tier 1: Data Processing (Direct access to user data)

| Sub-processor | Purpose | Data Processed | Hosting Region | SOC 2 Status | DPA Status |
|---|---|---|---|---|---|
| **Supabase** | Database, authentication, file storage | User accounts, credentials, deck content, uploaded media | US (AWS) | SOC 2 Type II | Required / In Place |
| **Render** | Application hosting, TLS termination | Application runtime data, request metadata | US | SOC 2 Type II | Required / In Place |
| **Stripe** | Payment processing | Payment method details, billing records | US | PCI DSS + SOC 2 | Required / In Place |
| **Anthropic** | AI content generation (Claude) | Prompt data (deck outlines, user instructions) | US | SOC 2 Type II | Required / In Place |
| **OpenAI** | AI content generation (GPT) | Prompt data (deck outlines, user instructions) | US | SOC 2 Type II | Required / In Place |

#### Tier 2: Analytics and Monitoring (Operational data access)

| Sub-processor | Purpose | Data Processed | Hosting Region | SOC 2 Status | DPA Status |
|---|---|---|---|---|---|
| **Sentry** | Error monitoring and crash reporting | Error stack traces, request metadata (PII redacted) | US | SOC 2 Type II | Required / In Place |
| **PostHog** | Product analytics and session recording | Usage events, session recordings (passwords masked) | US / EU | SOC 2 Type II | Required / In Place |
| **Google Cloud** | OAuth authentication, AI services | OAuth tokens, AI prompt data | US | SOC 2 Type II | Required / In Place |
| **Modal** | Serverless compute for background tasks | Deck generation payloads | US | SOC 2 In Progress | Required / Pending |
| **Redis Cloud** | Caching and rate limiting | Session tokens, rate limit counters (ephemeral) | US | SOC 2 Type II | Required / In Place |

#### Tier 3: Peripheral Services (Limited or no PII access)

| Sub-processor | Purpose | Data Processed | SOC 2 Status | DPA Status |
|---|---|---|---|---|
| **SerpAPI** | Web search for content research | Search queries (no user PII) | Not certified | Not required |
| **Firecrawl** | Web scraping for content enrichment | URLs (no user PII) | Not certified | Not required |
| **Brandfetch** | Company logo and brand asset retrieval | Company names (no user PII) | Not certified | Not required |
| **Resend** | Transactional email delivery | Recipient email addresses, email content | Not certified | Required / In Place |
| **Chatbase** | In-app support chatbot | User support messages | Not certified | Required / Pending |
| **Nango** | Third-party integration management | OAuth tokens for connected services | Not certified | Required / Pending |

New sub-processors MUST be approved by the CEO before engagement. Tier 1 and Tier 2 sub-processors MUST have a signed DPA in place before any personal data is shared.

### 4.2 Data Subject Rights

NextSlide supports the following data subject rights under GDPR and CCPA:

| Right | Description | Response Timeframe |
|---|---|---|
| **Right of Access** | Data subjects may request a copy of all personal data held about them. | 30 days |
| **Right to Rectification** | Data subjects may request correction of inaccurate personal data. | 30 days |
| **Right to Erasure** | Data subjects may request deletion of their personal data (see NEXTSLIDE-POL-14). | 30 days |
| **Right to Portability** | Data subjects may request their data in a machine-readable format. | 30 days |
| **Right to Restrict Processing** | Data subjects may request limitation of processing in certain circumstances. | 30 days |
| **Right to Object** | Data subjects may object to processing based on legitimate interest. | 30 days |
| **Right to Withdraw Consent** | Data subjects may withdraw consent for optional processing (e.g., analytics). | Immediate |
| **CCPA Right to Know** | California residents may request disclosure of data collection categories and purposes. | 45 days |
| **CCPA Right to Opt-Out** | California residents may opt out of the sale of personal information. | 15 business days |

All data subject requests MUST be logged, tracked, and fulfilled within the specified timeframes. Identity verification is required before processing any request.

### 4.3 Breach Notification Procedures

#### 4.3.1 Detection and Classification

Upon detection of a suspected personal data breach, the following classification MUST be completed within 4 hours:

- **Severity assessment**: Number of affected data subjects and categories of data involved.
- **Impact assessment**: Risk to data subjects' rights and freedoms.
- **Containment status**: Whether the breach is ongoing or has been contained.

#### 4.3.2 Notification Timeline

| Recipient | Notification Trigger | Deadline |
|---|---|---|
| **Supervisory Authority** (e.g., ICO, CNIL) | Breach likely to result in risk to data subjects | 72 hours from awareness |
| **Affected Data Subjects** | Breach likely to result in high risk to rights and freedoms | Without undue delay after authority notification |
| **Sub-processors** | Breach originating from or affecting sub-processor data | 24 hours from awareness |
| **Internal Stakeholders** (CEO, CTO) | All suspected breaches | 4 hours from detection |

#### 4.3.3 Notification Content

Notifications to supervisory authorities MUST include: the nature of the breach, categories and approximate number of affected data subjects, likely consequences, and measures taken or proposed to address the breach.

### 4.4 Privacy Impact Assessments

A DPIA MUST be conducted before:

- Introducing a new sub-processor classified as Tier 1 or Tier 2.
- Implementing new data collection practices or expanding the categories of personal data processed.
- Deploying new AI model integrations that process user content.
- Making architectural changes that alter data flows involving personal data.
- Launching features involving automated decision-making or profiling.

DPIAs MUST be documented, reviewed by the CEO, and retained for a minimum of 3 years.

### 4.5 Data Minimization

NextSlide adheres to the principle of data minimization across all systems:

- **Collection**: Only personal data necessary for the stated purpose is collected. Registration requires only email and password; additional profile data is optional.
- **AI Processing**: User content sent to AI providers (Anthropic, OpenAI) is limited to the minimum context required for generation. Full user profiles are not transmitted.
- **Error Monitoring**: Sentry is configured with `send_default_pii: false` and 10% event sampling to minimize personal data in error reports. The `PIIRedactionFilter` automatically redacts emails (`[EMAIL_REDACTED]`), tokens (`[TOKEN_REDACTED]`), and API keys (`[KEY_REDACTED]`).
- **Analytics**: PostHog password fields are masked in session recordings. Analytics events capture behavioral patterns, not personal data content.
- **Logging**: Application logs MUST NOT contain passwords, API keys, or full authentication tokens.

### 4.6 Cross-Border Data Transfers

NextSlide's primary infrastructure is hosted in the United States. Personal data of users located in the European Economic Area (EEA), United Kingdom, or other jurisdictions with data transfer restrictions is transferred to the US under the following mechanisms:

- **EU-US Data Privacy Framework**: Where applicable for certified sub-processors.
- **Standard Contractual Clauses (SCCs)**: Included in DPAs with all Tier 1 and Tier 2 sub-processors.
- **Supplementary Measures**: Encryption in transit (TLS 1.2+) and at rest (AES-256) as defined in NEXTSLIDE-POL-07.

Transfer impact assessments MUST be conducted for any new sub-processor located outside the EEA and documented as part of the DPIA process.

### 4.7 Privacy by Design

The following privacy-by-design principles are embedded in NextSlide's development practices:

- **Default privacy settings**: New user accounts default to the minimum data sharing configuration.
- **PII redaction at the infrastructure level**: The `PIIRedactionFilter` operates on all outbound error and monitoring data before transmission to third parties.
- **Separation of concerns**: Authentication is managed by Supabase Auth, ensuring passwords never transit through NextSlide application code in plaintext.
- **Ephemeral processing**: JWT tokens are cached in memory with a 5-minute TTL and never written to persistent storage. Redis data is TTL-based and automatically expired.
- **Consent management**: Features requiring additional data processing (e.g., session recording, analytics) are disclosed in the public privacy notice and subject to user consent where required by law.

## 5. Roles and Responsibilities

| Role | Responsibility |
|---|---|
| **CEO** | Policy ownership, final authority on sub-processor approval, breach notification decisions, DPIA review and sign-off. |
| **CTO** | Technical implementation of privacy controls, oversight of PII redaction systems, sub-processor security assessment. |
| **Engineering Team** | Implementation of data minimization controls, PII redaction filters, data subject request fulfillment, privacy-by-design practices. |
| **Customer Support** | Intake of data subject requests, identity verification, communication with data subjects. |
| **Security Lead** | Breach detection and classification, incident response coordination, DPA compliance monitoring. |
| **All Employees** | Awareness of privacy obligations, reporting of suspected breaches, compliance with data handling procedures. |

## 6. Related Policies

- **NEXTSLIDE-POL-01** - Information Security Policy
- **NEXTSLIDE-POL-06** - Data Classification Policy
- **NEXTSLIDE-POL-14** - Data Retention Policy

## 7. Compliance and Enforcement

Violations of this policy may result in disciplinary action up to and including termination. Violations that result in unauthorized disclosure of personal data will be treated as a data breach and subject to the notification procedures defined in Section 4.3. NextSlide maintains a record of processing activities (ROPA) as required by GDPR Article 30, updated no less than quarterly.

## 8. Exceptions

Exceptions to this policy require written approval from the CEO and MUST include:

- The specific policy requirement being excepted.
- A privacy impact assessment for the exception.
- Compensating controls to protect data subject rights.
- A defined expiration date not exceeding 6 months.

Exceptions involving Tier 1 sub-processors without signed DPAs are not permitted.

## 9. Review Schedule

This policy is reviewed annually or upon:

- Changes to applicable privacy regulations (GDPR, CCPA, or new jurisdictional requirements).
- Addition or removal of sub-processors.
- Material changes to data collection practices or AI model integrations.
- Occurrence of a personal data breach.
- Findings from privacy audits or DPIAs.

## 10. Revision History

| Version | Date | Author | Description |
|---|---|---|---|
| 1.0 | February 1, 2026 | CEO | Initial policy creation. |

---

**SOC 2 Trust Service Criteria:** P1.1 (Privacy Criteria Related to Notice), P1.2 (Privacy Criteria Related to Choice and Consent), CC2.3 (Internal Communication of Information)
