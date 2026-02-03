# Risk Assessment Policy

| Field | Value |
|---|---|
| **Document ID** | NEXTSLIDE-POL-05 |
| **Version** | 1.0 |
| **Classification** | Internal |
| **Effective Date** | February 1, 2026 |
| **Last Review Date** | February 1, 2026 |
| **Next Review Date** | February 1, 2027 |
| **Policy Owner** | CTO |
| **Approved By** | CEO / CTO |

## 1. Purpose

This policy establishes a formal, repeatable process for identifying, analyzing, evaluating, and treating information security risks across the NextSlide platform. NextSlide is an AI-powered presentation generation platform that processes user content through multiple cloud services and AI providers. This policy ensures that risks to the confidentiality, integrity, and availability of customer data and platform services are systematically managed and reduced to acceptable levels.

## 2. Scope

This policy applies to all information assets, systems, processes, and third-party services that support the NextSlide platform, including but not limited to:

- Cloud infrastructure hosted on Render (application hosting, TLS termination, DDoS protection)
- Database and authentication services provided by Supabase (PostgreSQL, Auth, Storage)
- AI processing workloads executed on Modal serverless compute
- Caching and rate-limiting infrastructure on Redis Cloud
- AI content generation via Anthropic (Claude) and OpenAI (GPT-4)
- Payment processing through Stripe
- Error tracking (Sentry), analytics (PostHog), and all Tier 2 and Tier 3 vendor services
- Employee workstations and development environments
- Business processes including customer onboarding, data handling, and incident response

## 3. Definitions

| Term | Definition |
|---|---|
| **Risk** | The potential for an unwanted outcome resulting from a threat exploiting a vulnerability |
| **Threat** | Any circumstance or event with the potential to adversely impact organizational operations or assets |
| **Vulnerability** | A weakness in a system, process, or control that could be exploited by a threat |
| **Likelihood** | The probability that a threat will exploit a vulnerability within a given timeframe |
| **Impact** | The magnitude of harm that could result from a risk event materializing |
| **Risk Appetite** | The level of residual risk the organization is willing to accept in pursuit of its objectives |
| **Risk Register** | A centralized record of identified risks, their assessments, and treatment plans |
| **Residual Risk** | The risk remaining after controls and treatment measures have been applied |
| **Inherent Risk** | The risk level before any controls or mitigations are applied |
| **Risk Treatment** | The process of selecting and implementing measures to modify risk |
| **Control** | A measure that modifies risk, including policies, procedures, and technical safeguards |
| **SPOF** | Single Point of Failure; a component whose failure would cause the entire system or a critical function to become unavailable |

## 4. Policy Statements

### 4.1 Risk Assessment Frequency

NextSlide shall conduct a comprehensive risk assessment at least **annually**, and additionally when any of the following occur:

- A significant change to the platform architecture (e.g., new cloud provider, new AI model integration)
- A security incident or near-miss event
- Addition of a new Tier 1 or Tier 2 vendor
- A material change in regulatory or compliance requirements
- Significant changes to the threat landscape affecting SaaS or AI platforms

### 4.2 Risk Identification Methodology

Risk identification shall follow a structured approach combining multiple inputs:

1. **Asset Inventory Review** -- Enumerate all critical assets including Render deployments, Supabase databases, Modal compute functions, Redis Cloud instances, and API integrations with Anthropic, OpenAI, and Stripe.
2. **Threat Modeling** -- Identify threats specific to AI presentation platforms, including prompt injection, data exfiltration through generated content, unauthorized access to user presentations, and AI model abuse.
3. **Vulnerability Assessment** -- Review dependency scanning results (npm audit, pip-audit), Sentry error patterns, and infrastructure configuration against security baselines.
4. **Vendor Risk Inputs** -- Incorporate findings from SOC 2 reports collected from Tier 1 vendors (Supabase, Render, Stripe, Anthropic, OpenAI) and Tier 2 vendors (Sentry, PostHog, Google Cloud, Modal, Redis Cloud).
5. **Historical Incident Analysis** -- Review past incidents logged in Sentry and internal incident records to identify recurring risk patterns.
6. **Single Point of Failure Analysis** -- Evaluate dependencies on Render (hosting), Supabase (database/auth/storage), and AI providers (Anthropic/OpenAI) as identified SPOFs.

### 4.3 Risk Analysis -- Likelihood and Impact Matrix

Each identified risk shall be scored using the following 5x5 matrix:

**Likelihood Scale:**

| Rating | Score | Description |
|---|---|---|
| Rare | 1 | Less than once per year; no known history |
| Unlikely | 2 | Once per year; has occurred in similar organizations |
| Possible | 3 | Once per quarter; has occurred at NextSlide or direct peers |
| Likely | 4 | Once per month; recurring pattern observed |
| Almost Certain | 5 | Weekly or more frequent; active and ongoing |

**Impact Scale:**

| Rating | Score | Description |
|---|---|---|
| Negligible | 1 | No customer impact; internal inconvenience only |
| Minor | 2 | Brief service degradation (<15 min); fewer than 10 users affected |
| Moderate | 3 | Partial outage (15 min--4 hours); data access delayed but not lost |
| Major | 4 | Full service outage (4--24 hours); potential data exposure affecting subset of users |
| Critical | 5 | Extended outage (>24 hours); confirmed data breach; regulatory notification required |

**Risk Rating Matrix:**

| | Negligible (1) | Minor (2) | Moderate (3) | Major (4) | Critical (5) |
|---|---|---|---|---|---|
| **Almost Certain (5)** | Medium (5) | High (10) | High (15) | Critical (20) | Critical (25) |
| **Likely (4)** | Low (4) | Medium (8) | High (12) | Critical (16) | Critical (20) |
| **Possible (3)** | Low (3) | Medium (6) | Medium (9) | High (12) | Critical (15) |
| **Unlikely (2)** | Low (2) | Low (4) | Medium (6) | Medium (8) | High (10) |
| **Rare (1)** | Low (1) | Low (2) | Low (3) | Low (4) | Medium (5) |

**Risk Rating Thresholds:**

- **Critical (16--25):** Immediate action required. CTO must be notified within 24 hours. Treatment plan due within 7 days.
- **High (10--15):** Action required within 30 days. Must be tracked in the risk register with an assigned owner.
- **Medium (5--9):** Action required within 90 days. Monitored quarterly.
- **Low (1--4):** Accept or monitor. Reviewed during annual risk assessment.

### 4.4 Risk Register

All identified risks shall be recorded in the NextSlide Risk Register with the following fields:

| Field | Description |
|---|---|
| Risk ID | Unique identifier (e.g., RISK-2026-001) |
| Date Identified | Date the risk was first recorded |
| Risk Description | Clear description of the risk scenario |
| Affected Asset(s) | Systems or services impacted (e.g., Supabase, Render, Modal) |
| Threat Source | Origin of the threat (external attacker, vendor, internal, environmental) |
| Existing Controls | Controls currently in place (e.g., circuit breaker, TLS, encryption) |
| Likelihood (1--5) | Probability rating |
| Impact (1--5) | Impact rating |
| Inherent Risk Score | Likelihood x Impact before treatment |
| Treatment Option | Avoid, Mitigate, Transfer, or Accept |
| Treatment Plan | Specific actions to reduce risk |
| Risk Owner | Individual responsible for managing the risk |
| Target Date | Deadline for treatment completion |
| Residual Risk Score | Expected risk score after treatment |
| Status | Open, In Progress, Closed, Accepted |

The Risk Register shall be maintained by the CTO and reviewed quarterly.

### 4.5 Risk Treatment Options

For each identified risk, one of the following treatment strategies shall be selected:

1. **Avoid** -- Eliminate the risk by removing the activity or asset. Example: declining to integrate a vendor that cannot demonstrate adequate security controls.
2. **Mitigate** -- Reduce the likelihood or impact through additional controls. Example: implementing the circuit breaker pattern (25 failures triggers OPEN state, 30-second timeout) to mitigate cascading failures from Supabase connectivity issues.
3. **Transfer** -- Shift the risk to a third party through insurance, contracts, or outsourcing. Example: relying on Render's SOC 2 Type II certified DDoS protection and TLS termination rather than managing these controls internally.
4. **Accept** -- Acknowledge the risk and take no further action when the risk falls within the organization's risk appetite. Example: accepting the risk of temporary AI generation unavailability when both Anthropic and OpenAI experience simultaneous outages, given the low likelihood.

All Critical and High risks must have an active treatment plan. Risk acceptance for Critical risks requires written approval from both the CEO and CTO.

### 4.6 Fraud Risk Considerations (CC3.3)

NextSlide shall specifically assess fraud risks including:

- **Unauthorized access to customer data** -- Risk of employees or external actors accessing presentation content, user accounts, or payment information stored in Supabase.
- **Payment fraud** -- Risk of fraudulent transactions processed through Stripe, including stolen payment methods and subscription abuse.
- **AI abuse** -- Risk of users exploiting AI generation capabilities (Anthropic Claude, OpenAI GPT-4) for generating harmful, deceptive, or fraudulent content.
- **Account takeover** -- Risk of credential stuffing or social engineering attacks against Supabase Auth.
- **Insider threat** -- Risk of employees with privileged access to Render, Supabase, or Modal environments misusing their access.
- **Management override of controls** -- Risk that individuals with administrative access bypass established security controls.

Fraud risk assessments shall be incorporated into the annual risk assessment cycle and findings reported to the CEO.

### 4.7 Change-Related Risk Assessment (CC3.4)

Risk assessments shall be performed in conjunction with significant changes to the NextSlide platform, including:

- Migration to new cloud providers or regions
- Addition or replacement of Tier 1 vendors (database, hosting, payments, AI providers)
- Architectural changes to the backend (e.g., new API endpoints, changes to circuit breaker configuration)
- Changes to authentication or authorization mechanisms in Supabase Auth
- Introduction of new AI models or changes to AI processing pipelines on Modal
- Changes to data retention, backup, or encryption practices
- Deployment of new frontend or mobile applications

Change-related risk assessments shall be documented before the change is approved and shall include rollback considerations (e.g., Render instant rollback capability).

### 4.8 Risk Appetite Statement

NextSlide maintains the following risk appetite:

- **Zero tolerance** for risks that could result in unauthorized disclosure of customer presentation content, personal data, or payment information.
- **Low appetite** for risks to platform availability, targeting 99.9% uptime with RTO of 4 hours and RPO of 24 hours for database recovery.
- **Moderate appetite** for risks related to AI generation quality or temporary feature degradation, provided core platform functionality (viewing and managing existing presentations) remains available.
- **Low appetite** for compliance and regulatory risks, including SOC 2 trust service criteria violations.

This risk appetite statement shall be reviewed annually by the CEO and CTO and updated to reflect changes in business strategy or regulatory requirements.

### 4.9 Risk Reporting

Risk assessment results and risk register updates shall be reported as follows:

- **Quarterly:** CTO presents a summary of open risks, treatment progress, and any newly identified risks to the executive team.
- **Annually:** A comprehensive risk assessment report is prepared, including trend analysis, changes to the risk landscape, and recommendations for the upcoming year.
- **Ad hoc:** Critical risks (score 16--25) are reported to the CEO within 24 hours of identification.
- **Vendor-triggered:** Significant findings from vendor SOC 2 report reviews or vendor security incidents are reported within 5 business days.

## 5. Roles and Responsibilities

| Role | Responsibilities |
|---|---|
| **CEO** | Approves risk appetite statement; reviews annual risk assessment report; approves acceptance of Critical risks; ensures adequate resources for risk management |
| **CTO** | Owns the risk assessment process; maintains the Risk Register; conducts or delegates risk assessments; reports risk posture quarterly; ensures change-related risk assessments are performed |
| **Engineering Team** | Identifies technical risks during development and operations; implements risk treatment measures; reports vulnerabilities and incidents; participates in risk identification workshops |
| **All Employees** | Reports potential risks and security concerns; complies with risk treatment measures; participates in risk awareness activities |

## 6. Related Policies

| Policy | Relevance |
|---|---|
| NEXTSLIDE-POL-01 (Information Security Policy) | Overarching security framework that this risk assessment process supports |
| NEXTSLIDE-POL-04 (Incident Response Plan) | Incident data feeds into risk identification; risk assessments inform incident preparedness |
| NEXTSLIDE-POL-09 (Business Continuity Plan) | BIA and continuity requirements are key inputs to the risk assessment process |

## 7. Compliance and Enforcement

Failure to conduct risk assessments as required by this policy, or failure to report identified risks, constitutes a policy violation. Violations may result in:

- Mandatory remedial training
- Formal written warning
- Revocation of system access privileges
- Disciplinary action, up to and including termination

The CTO is responsible for monitoring compliance with this policy through quarterly risk register reviews and annual risk assessment completion tracking.

## 8. Exceptions

Exceptions to this policy must be submitted in writing to the CTO and must include:

- A description of the exception and its duration
- Justification for why the policy requirement cannot be met
- Compensating controls that will be applied
- A plan to return to full compliance

Exceptions to risk assessment frequency or risk acceptance thresholds require approval from both the CEO and CTO. All exceptions shall be logged and reviewed during the annual risk assessment.

## 9. Review Schedule

| Activity | Frequency | Responsible Party |
|---|---|---|
| Full risk assessment | Annually (minimum) | CTO |
| Risk register review | Quarterly | CTO |
| Risk appetite statement review | Annually | CEO / CTO |
| Fraud risk assessment | Annually | CTO |
| Change-related risk assessments | Per change | CTO / Engineering Team |
| Policy review and update | Annually | CTO |

## 10. Revision History

| Version | Date | Author | Description |
|---|---|---|---|
| 1.0 | February 1, 2026 | CTO | Initial policy creation |

---

**SOC 2 Trust Service Criteria:** CC3.1, CC3.2, CC3.3, CC3.4, CC9.1
