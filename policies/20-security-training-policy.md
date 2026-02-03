# Security Training and Awareness Policy

| Field | Value |
|---|---|
| **Document ID** | NEXTSLIDE-POL-20 |
| **Version** | 1.0 |
| **Classification** | Internal |
| **Effective Date** | February 1, 2026 |
| **Last Review Date** | February 1, 2026 |
| **Next Review Date** | February 1, 2027 |
| **Policy Owner** | Chief Executive Officer (CEO) |
| **Approved By** | CEO / CTO |

## 1. Purpose

This policy establishes the security training and awareness program for NextSlide. It ensures that all personnel possess the knowledge and skills necessary to protect NextSlide's AI presentation generation platform, user data, and infrastructure from security threats. A well-informed workforce is the first line of defense against social engineering, phishing, insecure coding practices, and accidental data exposure. This policy defines training requirements by role, frequency, content, and compliance verification mechanisms.

## 2. Scope

This policy applies to:

- All NextSlide employees, regardless of role or seniority.
- All contractors and third-party personnel with access to NextSlide systems, code repositories, or data.
- All roles within the organization, including engineering, product, design, marketing, and executive leadership.
- Training related to the security of all NextSlide systems, including:
  - The React/TypeScript frontend and Python FastAPI backend hosted on Render.
  - Supabase managed PostgreSQL database, authentication, and storage services.
  - Modal serverless compute infrastructure.
  - Third-party integrations: Anthropic Claude, OpenAI GPT-4, Google Gemini, Stripe.
  - Monitoring systems: Sentry, PostHog.
  - Source code repositories and CI/CD pipelines on GitHub.

## 3. Definitions

| Term | Definition |
|---|---|
| **Security Awareness Training** | General training provided to all personnel covering foundational security concepts, company policies, threat recognition, and incident reporting procedures. |
| **Role-Based Training** | Specialized training tailored to the security responsibilities and risks associated with a specific job function (e.g., developer, administrator, executive). |
| **Secure Coding Training** | Technical training for software engineers covering secure development practices, vulnerability prevention, and security testing relevant to NextSlide's technology stack. |
| **OWASP Top 10** | The Open Web Application Security Project's list of the ten most critical web application security risks, used as a baseline for developer security training. |
| **Phishing Simulation** | A controlled exercise that sends simulated phishing emails to personnel to assess awareness and reinforce training on recognizing social engineering attacks. |
| **Training Completion Record** | A documented record confirming that an individual has completed a required training module, including the date, content covered, and assessment result (if applicable). |
| **DOMPurify** | A JavaScript library used in the NextSlide frontend to sanitize user-generated HTML content and prevent Cross-Site Scripting (XSS) attacks. |

## 4. Policy Statements

### 4.1 Onboarding Security Training

All new personnel (employees and contractors) SHALL complete security onboarding training within their first week of engagement. Onboarding training SHALL cover the following topics at a minimum:

1. **Security Policies Overview** -- Introduction to the NextSlide Information Security Program and the policy framework (NEXTSLIDE-POL-01 through NEXTSLIDE-POL-20). Personnel must acknowledge they have read and understood the Information Security Policy (NEXTSLIDE-POL-01) and the Acceptable Use Policy.
2. **Data Classification** -- Overview of NextSlide's data classification tiers as defined in the Data Classification and Handling Policy (NEXTSLIDE-POL-06), including the handling requirements for each tier (CRITICAL, CONFIDENTIAL, INTERNAL, PUBLIC).
3. **Acceptable Use** -- Rules governing the use of NextSlide systems, devices, and credentials. Emphasis on prohibitions against sharing credentials, storing secrets in source code, and accessing user data without authorization.
4. **Incident Reporting** -- How to recognize and report potential security incidents. Introduction to the Incident Response Policy (NEXTSLIDE-POL-04), severity classifications (P1-P4), and reporting channels (Slack incident channel, direct notification to CTO for suspected breaches).
5. **Access and Authentication** -- Overview of NextSlide's authentication methods (Supabase Auth, JWT, API keys), the principle of least privilege, and MFA requirements for administrative access.

New personnel SHALL NOT be granted access to production systems until onboarding security training is completed and documented.

### 4.2 Annual Security Awareness Refresher

All personnel SHALL complete an annual security awareness refresher training. The refresher SHALL be completed within 30 calendar days of the notification date. The annual refresher SHALL cover:

- Updates to NextSlide security policies enacted since the prior training cycle.
- Emerging threats relevant to SaaS platforms and AI-powered applications, including prompt injection, model manipulation, and API abuse.
- Review of incident trends observed at NextSlide, including anonymized summaries from Post-Incident Reviews.
- Password hygiene and credential management best practices.
- Physical security awareness for remote work environments.
- Data handling reminders aligned with the Data Classification Policy (NEXTSLIDE-POL-06).
- Privacy obligations for handling user presentation content and personal data.

### 4.3 Developer-Specific Security Training

All engineers with commit access to NextSlide code repositories or access to production infrastructure SHALL complete developer-specific security training during onboarding and annually thereafter. This training SHALL cover:

1. **OWASP Top 10** -- Comprehensive review of the current OWASP Top 10 web application security risks, with examples relevant to the NextSlide technology stack (React frontend, FastAPI backend, PostgreSQL database).
2. **Secure Coding Practices** -- Language-specific secure coding guidance for TypeScript/React (frontend) and Python/FastAPI (backend), including secure error handling, output encoding, and defense-in-depth patterns.
3. **DOMPurify Usage** -- Correct implementation of DOMPurify for sanitizing user-generated and AI-generated HTML content to prevent XSS attacks. Common bypass patterns and testing techniques.
4. **Input Validation** -- Proper use of Zod (frontend schema validation) and Pydantic (backend request validation) to enforce input constraints. Common validation bypass techniques and how to prevent them.
5. **Secrets Management** -- Secure handling of environment variables, API keys (ANTHROPIC_API_KEY, OPENAI_API_KEY, SUPABASE_KEY, STRIPE_SECRET_KEY), and credentials. Rules for `.env` file management, gitignore configuration, and Render environment variable usage.
6. **Dependency Security** -- Identifying and remediating vulnerabilities in third-party packages. Using `npm audit` (frontend) and `pip-audit` or `safety` (backend) to scan for known vulnerabilities. Understanding the risk of supply chain attacks.
7. **Supabase RLS Awareness** -- Understanding Row-Level Security policies, how they protect user data, and the risks of misconfigured or missing RLS policies.
8. **Security Headers** -- Understanding the purpose and configuration of security headers (HSTS, CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy) and CORS origin whitelisting.

### 4.4 Role-Based Training Requirements

In addition to the general and developer-specific training described above, the following role-based training modules are required:

**Administrators (CTO, personnel with admin dashboard access):**

- Access management procedures: provisioning, deprovisioning, quarterly access reviews.
- Audit log review: interpreting entries in the `audit_logs` table in Supabase, identifying anomalous patterns, and triggering incident response when warranted.
- Supabase and Render administrative security: dashboard access controls, MFA enforcement, service key management.
- Third-party vendor security review processes as defined in the Vendor Management Policy (NEXTSLIDE-POL-13).

**Engineers (all software development personnel):**

- Secure Software Development Lifecycle (SDLC): security requirements gathering, threat modeling, secure design patterns, security testing, and secure deployment practices.
- Code review security checklist: a structured checklist for identifying security issues during pull request reviews, covering authentication, authorization, input validation, output encoding, error handling, logging (with PII redaction), and dependency updates.
- CI/CD pipeline security: protecting GitHub Actions workflows, managing deployment secrets, and ensuring build integrity.

**All Staff:**

- Phishing awareness: recognizing phishing emails, suspicious links, and social engineering tactics. Understanding the risks of credential harvesting and business email compromise.
- Social engineering defense: identifying pretexting, tailgating (for in-person contexts), and other manipulation techniques.
- Reporting procedures: how to report suspected phishing, social engineering attempts, or other security concerns without fear of reprisal.

### 4.5 Training Tracking and Completion Records

All training activities SHALL be tracked with the following information recorded for each individual:

| Field | Description |
|---|---|
| **Employee/Contractor Name** | Full name of the individual |
| **Training Module** | Name and version of the training completed |
| **Training Type** | Onboarding, Annual Refresher, Developer-Specific, or Role-Based |
| **Completion Date** | Date the training was completed |
| **Assessment Score** | Score on any knowledge assessment (pass/fail threshold: 80%) |
| **Acknowledgment** | Confirmation that the individual has read and accepted relevant policies |
| **Next Due Date** | Date by which the next occurrence of this training must be completed |

Training completion records SHALL be retained for a minimum of three years. The CEO or their designee is responsible for maintaining the training records and sending reminders for upcoming or overdue training.

### 4.6 Non-Completion Consequences

Personnel who fail to complete required training within the specified timeframe SHALL have their access to NextSlide production systems suspended until training is completed. Repeated non-compliance may result in disciplinary action as defined in Section 7. Contractors who fail to complete required training within the specified timeframe SHALL have their system access revoked pending completion.

### 4.7 Training Materials Review

All training materials SHALL be reviewed and updated at least annually by the CTO (for technical content) and the CEO (for policy and awareness content). The review SHALL consider:

- Changes to the NextSlide technology stack, infrastructure, or third-party integrations.
- New vulnerabilities, attack techniques, or threat intelligence relevant to NextSlide's risk profile.
- Findings from Post-Incident Reviews (PIRs) that indicate training gaps.
- Updates to applicable regulations, industry standards, or SOC 2 requirements.
- Feedback from training participants regarding content relevance and clarity.

### 4.8 Compliance Verification

The effectiveness of the security training program SHALL be verified through:

- **Knowledge Assessments:** Quizzes or tests administered at the end of each training module with a minimum passing score of 80%.
- **Phishing Simulations:** At least two phishing simulation exercises per year targeting all personnel with email access. Results are tracked to measure improvement and identify individuals requiring additional training.
- **Code Review Metrics:** For developer-specific training, periodic review of code review comments to assess whether security considerations are being applied in practice.
- **Incident Correlation:** Analysis of security incidents to determine whether training gaps contributed to the incident, feeding findings back into training content updates.

## 5. Roles and Responsibilities

| Role | Responsibilities |
|---|---|
| **CEO (Policy Owner)** | Owns this policy. Ensures adequate resources are allocated for the training program. Reviews training completion metrics quarterly. Approves training material updates. |
| **CTO** | Develops and maintains technical training content (developer-specific and administrator modules). Reviews training materials for technical accuracy. Identifies training needs based on incident trends and technology changes. |
| **Engineering Team Leads** | Ensure their team members complete required training on schedule. Incorporate security review practices into daily development workflows. Provide feedback on training content relevance. |
| **All Personnel** | Complete all required training within specified timeframes. Apply security knowledge in daily work. Report training concerns or suggestions for improvement. |
| **HR / Operations** | Coordinate onboarding training scheduling. Maintain training completion records. Send reminders for upcoming and overdue training. |

## 6. Related Policies

| Document ID | Policy Title | Relationship |
|---|---|---|
| NEXTSLIDE-POL-01 | Information Security Policy | Master policy establishing the security program that this training supports. |
| NEXTSLIDE-POL-19 | Code of Conduct | Defines behavioral expectations reinforced through security awareness training. |
| NEXTSLIDE-POL-12 | Acceptable Use Policy | Governs acceptable use of NextSlide systems, covered during onboarding training. |

## 7. Compliance and Enforcement

All personnel are required to comply with the training requirements defined in this policy. Failure to complete required training within specified timeframes will result in suspension of system access until compliance is achieved. Repeated or willful non-compliance may result in disciplinary action up to and including termination of employment or contract. Managers are accountable for ensuring their direct reports complete required training and may face performance consequences for persistent team non-compliance.

## 8. Exceptions

Exceptions to training requirements (e.g., extended absence, leave of absence) must be requested in writing to the CEO with a proposed alternative completion timeline. Approved exceptions SHALL be documented and SHALL NOT exceed 60 days beyond the original deadline. No exception may waive the requirement for onboarding security training before production system access is granted.

## 9. Review Schedule

This policy shall be reviewed:

- Annually, on or before the Next Review Date listed in the document header.
- Following any security incident where a Post-Incident Review identifies training gaps as a contributing factor.
- Upon significant changes to the NextSlide technology stack, organizational structure, or regulatory requirements.
- When new roles are created that require role-specific training modules.

## 10. Revision History

| Version | Date | Author | Description |
|---|---|---|---|
| 1.0 | February 1, 2026 | CEO | Initial policy creation establishing onboarding training, annual refresher, developer-specific training (OWASP, DOMPurify, Zod/Pydantic, secrets management), role-based modules, tracking requirements, and compliance verification mechanisms. |

---

**SOC 2 Trust Service Criteria:** CC1.4, CC2.2
