# Incident Response Policy

| Field | Value |
|---|---|
| **Document ID** | NEXTSLIDE-POL-04 |
| **Version** | 1.0 |
| **Classification** | Internal |
| **Effective Date** | February 1, 2026 |
| **Last Review Date** | February 1, 2026 |
| **Next Review Date** | February 1, 2027 |
| **Policy Owner** | Chief Technology Officer (CTO) |
| **Approved By** | CEO / CTO |

## 1. Purpose

This policy establishes a structured and repeatable incident response capability for NextSlide. It defines how security incidents and service disruptions affecting the NextSlide AI presentation generation platform are detected, classified, contained, eradicated, and recovered from. The goal is to minimize the impact of incidents on users, protect the confidentiality and integrity of data processed through our infrastructure (Supabase, Render, Modal, AI providers), and ensure timely communication with stakeholders. This policy also mandates post-incident review to drive continuous improvement of NextSlide's security posture.

## 2. Scope

This policy applies to:

- All security incidents, service disruptions, and near-miss events affecting NextSlide production systems.
- All NextSlide employees, contractors, and third-party service providers who detect, report, or respond to incidents.
- All production infrastructure components, including:
  - The React/TypeScript frontend and Python FastAPI backend hosted on Render.
  - Supabase managed PostgreSQL database, authentication services, and storage.
  - Modal serverless compute infrastructure for AI workload processing.
  - Third-party integrations: Anthropic Claude, OpenAI GPT-4, Google Gemini, Stripe.
  - Monitoring and alerting systems: Sentry error tracking, health check endpoints, circuit breaker state monitoring.
  - Supporting services: Redis (rate limiting), PostHog (analytics), Cloudflare (CDN/DDoS).

## 3. Definitions

| Term | Definition |
|---|---|
| **Incident** | Any event that compromises the confidentiality, integrity, or availability of NextSlide systems, data, or services, or that violates a security policy. |
| **Security Incident** | An incident involving unauthorized access, data breach, credential compromise, exploitation of a vulnerability, or malicious activity targeting NextSlide systems. |
| **Service Disruption** | An event causing degradation or loss of NextSlide platform availability to end users, regardless of whether a security breach is involved. |
| **Incident Commander (IC)** | The individual responsible for coordinating the overall incident response effort. For P1 and P2 incidents, this is the CTO or their designee. |
| **Post-Incident Review (PIR)** | A structured review conducted after incident resolution to identify root cause, contributing factors, and improvement actions. Also known as a postmortem. |
| **Circuit Breaker** | A fault-tolerance pattern implemented for Supabase connectivity (25-failure threshold, 30-second timeout) that automatically transitions to an open state to prevent cascading failures. |
| **Runbook** | A documented set of procedures for responding to a specific type of incident or operational scenario. |
| **Evidence Preservation** | The collection and secure storage of logs, screenshots, configuration snapshots, and other artifacts relevant to incident investigation. |
| **Escalation** | The process of elevating an incident to a higher severity level or notifying additional stakeholders when defined thresholds are met. |

## 4. Policy Statements

### 4.1 Incident Classification

All incidents SHALL be classified using the following severity levels. Classification determines response time targets, communication requirements, and escalation procedures.

| Severity | Label | Description | Examples | Response Time | Resolution Target |
|---|---|---|---|---|---|
| **P1** | Critical | Complete service outage affecting all users, confirmed data breach, or credential compromise | Full platform outage, Supabase data breach, leaked API keys (ANTHROPIC_API_KEY, STRIPE_SECRET_KEY), compromised admin credentials | 15 minutes | 4 hours |
| **P2** | High | Significant service degradation, partial outage, or actively exploited security vulnerability | AI generation failures across providers, Supabase partial outage triggering circuit breaker, XSS or injection attack detected, partial payment processing failure | 1 hour | 8 hours |
| **P3** | Medium | Minor service degradation or non-critical component failure with limited user impact | Single AI provider failure (with fallback available), elevated error rates in Sentry, PostHog analytics outage, non-critical Render service restart | 4 hours | 24 hours |
| **P4** | Low | Cosmetic issues, minor bugs, or informational security alerts with no material impact | UI rendering inconsistencies, non-exploitable vulnerability identified in dependency scan, informational Sentry alerts, minor logging anomalies | 24 hours | 72 hours |

Severity MAY be escalated at any time during the response if new information indicates greater impact. Severity SHALL NOT be downgraded without Incident Commander approval.

### 4.2 Response Phases

All incident responses SHALL follow these six phases in sequence:

1. **Detection** -- An incident is identified through automated alerting, manual observation, or external report. The detection source and initial observations are documented immediately.
2. **Triage** -- The on-call engineer assesses the incident, assigns an initial severity classification, and designates an Incident Commander. For P1 incidents, the CTO is notified immediately.
3. **Containment** -- Immediate actions are taken to limit the blast radius. This may include revoking compromised credentials, enabling maintenance mode, blocking malicious IPs via rate limiting or Cloudflare, or isolating affected systems.
4. **Eradication** -- The root cause is identified and eliminated. This includes patching vulnerabilities, removing malicious code or accounts, rotating compromised secrets, and verifying the fix does not introduce regressions.
5. **Recovery** -- Systems are restored to normal operation. This includes deploying fixes via Render, verifying Supabase database integrity, confirming circuit breaker state reset, validating health check endpoints, and monitoring Sentry for recurrence.
6. **Post-Incident Review** -- A structured review is conducted to document the timeline, root cause, contributing factors, and corrective actions. See Section 4.7.

### 4.3 Detection Sources

NextSlide relies on the following detection mechanisms. All personnel are responsible for reporting potential incidents regardless of source.

| Detection Source | Description | Typical Trigger |
|---|---|---|
| **Sentry Alerts** | Automated error tracking configured with alerting rules for elevated error rates, new unhandled exceptions, and performance degradation | New error spike, unhandled exception in production, response time threshold exceeded |
| **Circuit Breaker State Changes** | The Supabase circuit breaker (25-failure threshold, 30-second timeout) transitions to OPEN state, indicating persistent database connectivity failure | Supabase connectivity loss, database overload |
| **Health Check Failures** | Backend health check endpoints (`/health`, `/api/health`) return non-200 responses or fail to respond within timeout | Render instance failure, backend crash, dependency outage |
| **Render Deployment Failures** | Automated deployment pipeline reports build or deployment failure | Failed deployment, misconfigured environment variables |
| **User Reports** | Customers report issues through support channels or in-application feedback | Feature failures, data inconsistencies, unexpected behavior |
| **Audit Log Anomalies** | Review of the `audit_logs` table in Supabase reveals unauthorized access patterns or policy violations | Unusual admin activity, unauthorized data access attempts |
| **Rate Limit Alerts** | Slowapi/Redis rate limiting triggers excessive rejection alerts indicating potential abuse or attack | Brute-force attempts, DDoS, credential stuffing |

### 4.4 Incident Runbooks

Documented runbooks SHALL be maintained for the following scenarios. Runbooks are stored alongside this policy and reviewed quarterly.

| Scenario | Key Procedures |
|---|---|
| **Supabase Outage** | Circuit breaker auto-mitigation activates at 25 failures. Monitor circuit breaker state. If auto-recovery does not occur within 30 seconds, manually verify Supabase status page, check connection parameters, and perform manual circuit breaker reset. Escalate to Supabase support if outage persists beyond 15 minutes. |
| **Render Outage** | Verify Render status page. Check if outage is regional or global. If frontend only, confirm CDN cache is serving static assets. If backend is affected, monitor health check endpoints and prepare for manual restart or redeployment once Render recovers. |
| **AI Provider Failure** | Identify which provider (Anthropic, OpenAI, Google Gemini) is affected. Verify fallback providers are operational. If all providers fail, enable degraded mode messaging in the UI. Monitor Sentry for user-facing error rates. |
| **Data Breach** | Immediately engage the Incident Commander (CTO). Contain the breach by revoking affected credentials and blocking unauthorized access. Preserve all evidence (logs, database snapshots, Sentry events). Assess scope of data exposure. Notify affected users within 72 hours per privacy obligations. Engage legal counsel if PII is involved. |
| **DDoS Attack** | Verify attack characteristics via Cloudflare analytics and rate limiting metrics. Tighten rate limits if necessary. Engage Cloudflare DDoS protection features. If attack overwhelms Render, coordinate with Render support. Document attack vectors for post-incident analysis. |

### 4.5 Communication Plan

Timely and accurate communication is critical during incident response.

**Internal Communication:**

- **P1/P2 Incidents:** Immediately notify all engineering personnel via the designated Slack incident channel. Send email notification to the CTO and CEO. Post status updates every 30 minutes until resolution.
- **P3 Incidents:** Notify the engineering team via Slack. Post status updates every 2 hours.
- **P4 Incidents:** Log in the incident tracking system. No real-time notification required unless the issue escalates.

**External Communication:**

- **Status Page:** Update the public status page within 30 minutes of P1 incident detection and within 1 hour for P2 incidents. Provide estimated time to resolution when available.
- **Customer Notification:** For incidents involving data breaches or extended outages (exceeding 4 hours), notify affected customers via email with a description of the incident, impact assessment, and remediation steps. Customer notifications for data breaches SHALL be sent within 72 hours of confirmation.
- **Regulatory Notification:** If the incident involves a data breach affecting PII, assess regulatory notification requirements under applicable privacy laws. Engage legal counsel before external disclosure.

### 4.6 Escalation Matrix

| Condition | Escalation Action |
|---|---|
| P3 or P4 incident not resolved within its target resolution time | Escalate to P2; notify CTO |
| P2 incident not resolved within 4 hours | Escalate to P1; CTO assumes Incident Commander role |
| Any suspected data breach or credential compromise | Immediately classify as P1; notify CTO and CEO |
| Circuit breaker remains in OPEN state for more than 5 minutes | Classify as minimum P2; engage database operations runbook |
| Multiple simultaneous P3 incidents | Assess for common root cause; consider escalation to P2 |
| External party reports vulnerability being actively exploited | Classify as minimum P2; engage containment procedures immediately |

### 4.7 Post-Incident Review (PIR)

A Post-Incident Review SHALL be conducted:

- Within **48 hours** of resolution for P1 and P2 incidents.
- Within **5 business days** of resolution for P3 incidents.
- P4 incidents do not require formal PIR but may be reviewed at the team's discretion.

Each PIR SHALL document:

1. **Incident Timeline** -- A chronological account from detection through resolution, including all key actions, decisions, and communications.
2. **Root Cause Analysis** -- The underlying technical or procedural cause of the incident, using a structured method (e.g., Five Whys).
3. **Contributing Factors** -- Environmental, process, or tooling factors that enabled or exacerbated the incident.
4. **Impact Assessment** -- Number of affected users, duration of impact, data exposure scope (if applicable), and financial impact estimate.
5. **Corrective Actions** -- Specific, assigned, and time-bound actions to prevent recurrence. Each action SHALL have an owner and a deadline.
6. **Detection Effectiveness** -- Assessment of how quickly the incident was detected and whether monitoring coverage was adequate.
7. **Lessons Learned** -- Observations that may improve future incident response, including tooling, process, and communication improvements.

PIR documents SHALL be stored in the designated incident archive and retained for a minimum of three years.

### 4.8 Evidence Preservation

During any security incident (P1 or P2), the following evidence SHALL be preserved before any remediation that might alter the evidence:

- Sentry error events and stack traces related to the incident.
- Relevant entries from the `audit_logs` table in Supabase.
- Application and infrastructure logs from Render for the affected time period.
- Database query logs and connection metrics from Supabase.
- Circuit breaker state transition logs.
- Screenshots or recordings of anomalous behavior.
- Network traffic logs from Cloudflare (if applicable to the incident).
- Configuration snapshots of affected services at the time of the incident.

Evidence SHALL be stored in a dedicated, access-restricted location separate from production systems. Evidence integrity SHALL be maintained through checksums or other tamper-detection mechanisms. Evidence SHALL be retained for a minimum of one year, or longer if required by legal or regulatory obligations.

## 5. Roles and Responsibilities

| Role | Responsibilities |
|---|---|
| **CTO (Policy Owner / Incident Commander for P1/P2)** | Owns this policy. Serves as Incident Commander for P1 and P2 incidents. Approves severity escalation and de-escalation. Authorizes external communications regarding security incidents. Ensures PIR completion and corrective action follow-through. |
| **CEO** | Approves customer-facing incident communications for data breaches. Authorizes engagement of external counsel or forensic investigators. Approves policy exceptions. |
| **On-Call Engineer** | First responder for detected incidents. Performs initial triage and severity classification. Executes containment procedures per applicable runbook. Escalates to Incident Commander when severity warrants. |
| **Engineering Team** | Executes eradication and recovery procedures. Provides technical analysis for PIR. Implements corrective actions from PIR findings. Maintains and updates runbooks. |
| **All Personnel** | Report potential incidents immediately through designated channels. Cooperate with incident investigation. Preserve evidence when instructed. |

## 6. Related Policies

| Document ID | Policy Title | Relationship |
|---|---|---|
| NEXTSLIDE-POL-01 | Information Security Policy | Master policy governing the security program under which this incident response capability operates. |
| NEXTSLIDE-POL-10 | Business Continuity and Disaster Recovery Policy | Defines recovery objectives (RTO/RPO) and continuity procedures that complement incident response. |
| NEXTSLIDE-POL-18 | Logging, Monitoring, and Audit Policy | Governs the monitoring and alerting systems (Sentry, audit logs, health checks) that serve as incident detection sources. |

## 7. Compliance and Enforcement

All personnel are required to comply with this policy. Failure to report a known or suspected incident, deliberate destruction of incident evidence, or unauthorized disclosure of incident details to external parties may result in disciplinary action up to and including termination of employment or contract. Automated detection and alerting controls (Sentry alerts, circuit breaker monitoring, health checks) enforce portions of this policy at the system level.

## 8. Exceptions

Exceptions to incident response procedures must be approved by the CTO in writing. No exception may waive the requirement to preserve evidence during a security incident or to conduct a PIR for P1/P2 incidents. Approved exceptions SHALL be documented with a justification, compensating controls, and an expiration date not exceeding 90 days.

## 9. Review Schedule

This policy shall be reviewed:

- Annually, on or before the Next Review Date listed in the document header.
- Following every P1 incident, as part of the PIR corrective action process.
- Upon significant changes to NextSlide infrastructure, monitoring capabilities, or incident detection tooling.
- Upon changes to applicable legal or regulatory requirements regarding breach notification.

## 10. Revision History

| Version | Date | Author | Description |
|---|---|---|---|
| 1.0 | February 1, 2026 | CTO | Initial policy creation establishing incident classification (P1-P4), six-phase response lifecycle, detection sources, runbooks, communication plan, escalation matrix, PIR requirements, and evidence preservation procedures. |

---

**SOC 2 Trust Service Criteria:** CC7.3, CC7.4, CC7.5, CC2.3
