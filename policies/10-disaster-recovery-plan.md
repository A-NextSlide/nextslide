# Disaster Recovery Plan

| Field | Value |
|---|---|
| **Document ID** | NEXTSLIDE-POL-10 |
| **Version** | 1.0 |
| **Classification** | Internal |
| **Effective Date** | February 1, 2026 |
| **Last Review Date** | February 1, 2026 |
| **Next Review Date** | February 1, 2027 |
| **Policy Owner** | CTO |
| **Approved By** | CEO / CTO |

## 1. Purpose

This Disaster Recovery Plan (DRP) defines the technical procedures for recovering NextSlide platform services following a disaster or significant service disruption. This plan provides scenario-based runbooks for each critical failure mode, ensuring that the engineering team can restore services within the recovery objectives defined in the Business Continuity Plan (NEXTSLIDE-POL-09): RTO of 4 hours and RPO of 24 hours for database services.

## 2. Scope

This plan covers the technical recovery of all NextSlide platform components:

- Render application hosting (frontend and backend)
- Supabase database (PostgreSQL), authentication, and file storage
- Modal serverless compute
- Redis Cloud caching and rate limiting
- AI provider integrations (Anthropic Claude, OpenAI GPT-4)
- Supporting integrations (Stripe, Sentry, PostHog, and all Tier 2/3 services)
- Backup verification and data integrity validation

This plan does not cover business process continuity or customer communication, which are addressed in NEXTSLIDE-POL-09 (Business Continuity Plan).

## 3. Definitions

| Term | Definition |
|---|---|
| **DRP** | Disaster Recovery Plan; technical procedures for restoring systems and data after a disruption |
| **Runbook** | A step-by-step procedure for responding to a specific incident type |
| **RTO** | Recovery Time Objective; maximum time to restore service (4 hours for critical services) |
| **RPO** | Recovery Point Objective; maximum acceptable data loss (24 hours for database) |
| **PITR** | Point-in-Time Recovery; the ability to restore a database to a specific moment using continuous WAL archiving |
| **Rollback** | The process of reverting to a previous known-good deployment or state |
| **Failover** | Switching operations to a redundant system when the primary fails |
| **WAL** | Write-Ahead Log; a log of all database changes used for point-in-time recovery |

## 4. Policy Statements

### 4.1 Runbook: Supabase Outage

**Scenario:** Supabase services (database, auth, or storage) become unavailable.

**Detection:**
- Circuit breaker transitions to OPEN state after 25 consecutive failures
- Health check `/api/health/supabase` reports connectivity failure or elevated latency
- Sentry alerts triggered for database connection errors
- Health check `/api/health` reports degraded backend status

**Immediate Response (0--15 minutes):**
1. Verify the outage is not a NextSlide-specific issue by checking the Supabase status page.
2. Confirm circuit breaker status via `/api/health` endpoint.
3. Verify PgBouncer connection pool status if partial connectivity exists.
4. Notify the engineering team and CTO per the communication plan.

**Short-Term Mitigation (15--60 minutes):**
1. If circuit breaker is OPEN, the backend automatically serves error responses without overwhelming Supabase.
2. Confirm Redis Cloud is serving cached data where applicable.
3. Monitor Supabase status page for estimated resolution time.
4. If Supabase reports resolution, manually reset the circuit breaker via `POST /admin/reset-circuit-breaker` and monitor recovery.

**Recovery (1--4 hours):**
1. If Supabase remains down beyond 2 hours, prepare for database restoration.
2. Identify the most recent daily backup (automatic, AES-256 encrypted).
3. If point-in-time recovery is needed, identify the target timestamp using the RPO of 24 hours as the maximum acceptable loss.
4. Initiate PITR through the Supabase dashboard or API to restore to the last known-good state.
5. Validate data integrity by running consistency checks against known record counts and checksums.
6. Verify authentication services are functional by testing login flows.
7. Verify file storage accessibility for user-uploaded assets.

**Post-Recovery Validation:**
- Confirm `/api/health/supabase` reports healthy connectivity and acceptable latency
- Confirm `/admin/services/health` reports all services operational
- Verify circuit breaker is in CLOSED state
- Run automated integration tests against the restored database
- Confirm user login, presentation access, and file upload functionality

### 4.2 Runbook: Render Outage

**Scenario:** Render platform outage causes complete NextSlide frontend and backend unavailability.

**Detection:**
- External uptime monitoring reports NextSlide as unreachable
- `/api/health` endpoint is not responding
- Sentry stops receiving events (potential indicator of complete outage)

**Immediate Response (0--15 minutes):**
1. Verify the outage via the Render status page.
2. Attempt to access the Render dashboard to assess the scope of the outage.
3. Notify the engineering team and CTO.
4. Update the customer-facing status page (if hosted independently).

**Short-Term Mitigation (15--60 minutes):**
1. If Render reports a localized issue, assess whether redeployment to a different Render region is possible.
2. If Render's instant rollback is available, verify that the outage is not caused by a recent deployment and rollback if necessary.

**Recovery (1--4 hours):**
1. If Render reports an estimated resolution time within RTO, wait for platform recovery.
2. If Render outage is expected to exceed RTO (4 hours):
   a. Retrieve the latest application code from the Git repository.
   b. Prepare deployment configuration for an alternative hosting platform.
   c. Deploy the backend and frontend to the alternative platform.
   d. Update DNS records to point to the new deployment.
   e. Verify connectivity to Supabase, Redis Cloud, and AI providers from the new platform.
3. After Render recovery, evaluate whether to migrate back or remain on the alternative platform.

**Post-Recovery Validation:**
- Confirm `/api/health` returns healthy status
- Verify TLS certificates are valid and HTTPS is functioning
- Confirm auto-scaling is operational
- Run end-to-end tests covering presentation creation, viewing, and sharing
- Verify Sentry is receiving error events from both frontend and backend

### 4.3 Runbook: AI Provider Failure

**Scenario:** One or both AI providers (Anthropic Claude, OpenAI GPT-4) become unavailable, preventing new presentation generation.

**Detection:**
- Sentry alerts for elevated AI API error rates
- Health check `/admin/services/health` reports AI provider degradation
- User reports of failed presentation generation

**Single Provider Failure (0--15 minutes):**
1. Identify which provider is affected (Anthropic or OpenAI).
2. Verify the outage via the provider's status page.
3. Confirm that the application is routing requests to the available provider.
4. Monitor error rates in Sentry to confirm failover is functioning.

**Dual Provider Failure (0--30 minutes):**
1. Confirm both providers are unavailable.
2. Notify the engineering team and CTO.
3. Enable graceful degradation mode:
   - Existing presentations remain fully accessible (view, edit, share, export).
   - New generation requests display an informative message explaining temporary unavailability.
   - Queue generation requests for automatic retry when service is restored if technically feasible.

**Recovery:**
1. Monitor provider status pages for resolution.
2. When a provider comes back online, verify API connectivity and response quality.
3. Gradually increase traffic to the recovered provider while monitoring for errors.
4. Process any queued generation requests.
5. Disable graceful degradation mode once both providers are confirmed stable.

**Post-Recovery Validation:**
- Generate test presentations using both Anthropic and OpenAI
- Verify Modal compute functions are executing correctly for heavy workloads
- Confirm error rates in Sentry have returned to baseline
- Verify that any queued requests were processed successfully

### 4.4 Runbook: Data Breach

**Scenario:** Confirmed or suspected unauthorized access to customer data stored in Supabase, Render, or any other NextSlide system.

**Detection:**
- Anomalous database queries detected in Supabase logs
- Sentry alerts for unusual API access patterns
- Third-party notification (vendor, researcher, or customer report)
- Unauthorized access to admin endpoints (`/admin/services/health`, `/admin/reset-circuit-breaker`)

**Immediate Response (0--1 hour):**
1. Activate the Incident Response Plan (NEXTSLIDE-POL-04).
2. Isolate affected systems to prevent further unauthorized access:
   - Rotate compromised API keys and database credentials.
   - Revoke suspicious Supabase Auth sessions.
   - If the breach involves Render, rotate deployment tokens and environment variables.
3. Preserve evidence: capture logs from Supabase, Render, Sentry, and PostHog before any remediation that could alter the evidence.
4. Notify the CTO and CEO immediately.

**Investigation (1--24 hours):**
1. Determine the scope of the breach: what data was accessed, how many users are affected.
2. Identify the attack vector (compromised credentials, application vulnerability, vendor breach).
3. Review Supabase audit logs for unauthorized data access.
4. Review Render deployment logs for unauthorized changes.
5. Assess whether Stripe payment data or personal information was exposed.

**Containment and Recovery (24--72 hours):**
1. Patch the vulnerability or close the attack vector.
2. Force password reset for affected users via Supabase Auth if credentials may be compromised.
3. Rotate all potentially compromised secrets across Render, Supabase, Redis Cloud, and Modal.
4. Restore data from backups if data integrity has been compromised.
5. Deploy security patches and verify with penetration testing.

**Notification:**
- Notify affected users within 72 hours of breach confirmation per applicable data protection requirements.
- Notify relevant regulatory authorities if required by applicable law.
- Prepare a public incident report if the breach affects a significant number of users.

### 4.5 Runbook: DDoS Attack

**Scenario:** Distributed Denial of Service attack targeting NextSlide infrastructure.

**Detection:**
- Render DDoS protection triggers alerts
- Abnormal traffic patterns observed in Render metrics
- Health check `/api/health` shows degraded response times
- Redis Cloud rate limiting triggers at elevated levels

**Immediate Response (0--15 minutes):**
1. Verify the attack via Render's traffic monitoring.
2. Confirm that Render's built-in DDoS protection is actively mitigating the attack.
3. Notify the engineering team and CTO.

**Mitigation (15--60 minutes):**
1. Review and tighten rate limiting rules in Redis Cloud if necessary.
2. If specific attack vectors are identifiable (e.g., specific endpoints or IP ranges), implement additional blocking rules at the Render level.
3. If the attack overwhelms Render's DDoS protection, engage Render support for escalated mitigation.
4. Consider temporarily restricting access to non-essential endpoints to preserve capacity for critical functions.

**Post-Attack Recovery:**
1. Review attack logs and patterns for future prevention.
2. Update rate limiting and blocking rules based on attack analysis.
3. Verify all services are operating normally via `/admin/services/health`.
4. Document the incident per NEXTSLIDE-POL-04 (Incident Response Plan).

### 4.6 Backup Verification Procedures

NextSlide relies on Supabase automatic daily backups as the primary data protection mechanism.

**Backup Characteristics:**
- **Frequency:** Daily automatic backups by Supabase
- **Encryption:** AES-256 encryption at rest
- **Retention:** Per Supabase Pro plan retention policy
- **PITR:** Point-in-time recovery available on Pro plan via continuous WAL archiving

**Verification Schedule:**

| Verification Activity | Frequency | Responsible |
|---|---|---|
| Confirm daily backup completion via Supabase dashboard | Weekly | Engineering Team |
| Restore backup to staging environment and validate data integrity | Quarterly | Engineering Team |
| Test point-in-time recovery to a specific timestamp | Semi-annually | CTO / Engineering Team |
| Verify backup encryption is active | Quarterly | Engineering Team |
| Validate backup restoration meets RPO (24-hour target) | Semi-annually | CTO |

**Backup Validation Checklist (for quarterly restore tests):**
- [ ] Restore completes without errors
- [ ] Row counts match expected values for critical tables (users, presentations, slides)
- [ ] Authentication data is intact and functional
- [ ] File storage references resolve correctly
- [ ] Application can connect to and query the restored database
- [ ] Restore time is within the 4-hour RTO

### 4.7 DR Testing Schedule

| Test Type | Frequency | Scope | Responsible |
|---|---|---|---|
| Backup restore test | Quarterly | Restore Supabase backup to staging; validate data integrity | Engineering Team |
| PITR test | Semi-annually | Restore to specific timestamp; verify data consistency | CTO / Engineering Team |
| Runbook walkthrough | Semi-annually | Review each runbook with the team; update procedures as needed | CTO |
| Render rollback test | Quarterly | Deploy a test change and verify instant rollback functions correctly | Engineering Team |
| Circuit breaker test | Quarterly | Simulate Supabase failure; verify circuit breaker behavior and manual reset via `POST /admin/reset-circuit-breaker` | Engineering Team |
| Full DR simulation | Annually | Simulate a major outage scenario end-to-end; measure actual RTO/RPO | CTO |

### 4.8 Communication During DR Events

During active disaster recovery, the following communication protocols apply:

1. **Internal:** The CTO (or designated Incident Manager) provides status updates to the engineering team every 30 minutes during active recovery.
2. **Executive:** The CEO receives briefings at 1-hour intervals or upon significant status changes.
3. **Customer-Facing:** Status page is updated within 30 minutes of DR activation and every 60 minutes thereafter.
4. **Post-Recovery:** A post-incident review is conducted within 5 business days, and a summary is shared with affected customers.

All DR communications shall clearly state: current status, estimated time to recovery, what services are affected, and what customers should expect.

### 4.9 Post-Recovery Validation

After any disaster recovery event, the following validation must be completed before declaring the incident resolved:

1. All health check endpoints return healthy status: `/api/health`, `/api/health/supabase`, `/admin/services/health`
2. Circuit breaker is in CLOSED state
3. User authentication (login/signup) is functional via Supabase Auth
4. Presentation CRUD operations are working (create, read, update, delete)
5. AI generation produces expected results via both Anthropic and OpenAI
6. File upload and retrieval functions correctly via Supabase Storage
7. Payment processing is operational via Stripe
8. Error tracking is active in Sentry for both frontend and backend
9. Rate limiting is functional via Redis Cloud
10. Auto-scaling is operational on Render

## 5. Roles and Responsibilities

| Role | Responsibilities |
|---|---|
| **CEO** | Authorizes DR activation for major incidents; approves external communications; authorizes emergency expenditures for recovery |
| **CTO (DR Owner)** | Maintains and updates the DRP; leads DR testing; commands recovery operations; makes technical recovery decisions |
| **Engineering Team** | Executes runbook procedures; monitors health endpoints; performs backup restorations; validates recovery; manages circuit breaker |
| **All Employees** | Reports suspected incidents; follows established communication channels; avoids ad hoc changes during recovery |

## 6. Related Policies

| Policy | Relevance |
|---|---|
| NEXTSLIDE-POL-01 (Information Security Policy) | Overarching security framework governing all DR activities |
| NEXTSLIDE-POL-09 (Business Continuity Plan) | Defines recovery objectives (RTO/RPO) and business-level continuity procedures that this DRP implements |
| NEXTSLIDE-POL-04 (Incident Response Plan) | Incident detection and classification procedures that trigger DR activation |

## 7. Compliance and Enforcement

All engineering team members must be familiar with the runbooks relevant to their areas of responsibility. Failure to follow DRP procedures during a disaster recovery event, or failure to participate in scheduled DR testing, may result in:

- Mandatory remedial training
- Formal written warning
- Disciplinary action as appropriate

The CTO is responsible for ensuring DRP compliance through semi-annual testing and post-incident reviews.

## 8. Exceptions

Exceptions to DR testing schedules or procedures must be approved by the CTO and documented with:

- Justification for the exception
- Alternative measures or revised timeline
- Assessment of risk introduced by the exception

Exceptions that affect the ability to meet RTO or RPO targets require approval from both the CEO and CTO.

## 9. Review Schedule

| Activity | Frequency | Responsible Party |
|---|---|---|
| DRP document review and update | Annually | CTO |
| Runbook review and update | Semi-annually | CTO / Engineering Team |
| Backup restore test | Quarterly | Engineering Team |
| PITR test | Semi-annually | CTO / Engineering Team |
| Circuit breaker test | Quarterly | Engineering Team |
| Full DR simulation | Annually | CTO |
| Post-incident DRP updates | After each DR activation | CTO |

## 10. Revision History

| Version | Date | Author | Description |
|---|---|---|---|
| 1.0 | February 1, 2026 | CTO | Initial plan creation |

---

**SOC 2 Trust Service Criteria:** A1.2, A1.3, CC7.4, CC7.5
