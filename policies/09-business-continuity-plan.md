# Business Continuity Plan

| Field | Value |
|---|---|
| **Document ID** | NEXTSLIDE-POL-09 |
| **Version** | 1.0 |
| **Classification** | Internal |
| **Effective Date** | February 1, 2026 |
| **Last Review Date** | February 1, 2026 |
| **Next Review Date** | February 1, 2027 |
| **Policy Owner** | CTO |
| **Approved By** | CEO / CTO |

## 1. Purpose

This Business Continuity Plan (BCP) establishes the framework for maintaining and restoring critical NextSlide platform operations in the event of a disruption. NextSlide is an AI-powered presentation generation platform with dependencies on multiple cloud services. This plan ensures that service interruptions are managed in a structured manner, customer impact is minimized, and recovery targets are met.

## 2. Scope

This plan covers all systems, services, and processes required to operate the NextSlide platform, including:

- Application hosting and delivery (Render)
- Database, authentication, and file storage (Supabase on AWS)
- AI content generation (Anthropic Claude, OpenAI GPT-4)
- Serverless compute for heavy workloads (Modal)
- Caching and rate limiting (Redis Cloud)
- Payment processing (Stripe)
- Error tracking and monitoring (Sentry)
- Analytics (PostHog)
- Supporting services (SerpAPI, Firecrawl, Brandfetch, Resend, Chatbase, Nango)
- Internal communication and coordination processes

This plan does not cover physical office continuity, which is addressed separately given NextSlide's cloud-native architecture.

## 3. Definitions

| Term | Definition |
|---|---|
| **BCP** | Business Continuity Plan; a documented set of procedures for maintaining operations during and after a disruption |
| **RTO** | Recovery Time Objective; the maximum acceptable time to restore a service after a disruption |
| **RPO** | Recovery Point Objective; the maximum acceptable amount of data loss measured in time |
| **BIA** | Business Impact Analysis; the process of determining the criticality of services and the impact of their disruption |
| **SPOF** | Single Point of Failure; a component whose failure causes complete loss of a critical function |
| **Circuit Breaker** | An automated fault-tolerance pattern that prevents cascading failures by halting requests to a failing service |
| **Failover** | The process of switching to a redundant or standby system when the primary system fails |
| **MAO** | Maximum Acceptable Outage; the longest period a service can be unavailable before causing unacceptable business impact |

## 4. Policy Statements

### 4.1 Recovery Objectives

NextSlide maintains the following recovery targets for platform services:

| Service | RTO | RPO | Justification |
|---|---|---|---|
| **Render (Application Hosting)** | 4 hours | N/A (stateless) | Application is stateless; recovery depends on Render platform restoration or redeployment |
| **Supabase (Database)** | 4 hours | 24 hours | Daily automatic backups with AES-256 encryption; point-in-time recovery available on Pro plan |
| **Supabase (Authentication)** | 4 hours | 24 hours | Auth state stored in database; recovery tied to database restoration |
| **Supabase (File Storage)** | 8 hours | 24 hours | User-uploaded assets; lower priority than database and auth |
| **Redis Cloud (Cache)** | 2 hours | N/A (ephemeral) | Cache is reconstructable; loss does not result in data loss |
| **AI Generation (Anthropic/OpenAI)** | 8 hours | N/A | AI generation can be temporarily unavailable; existing presentations remain accessible |
| **Modal (Compute)** | 8 hours | N/A (stateless) | Serverless compute; scales to zero; no persistent state |
| **Stripe (Payments)** | 24 hours | N/A | Payment processing can tolerate brief interruptions; Stripe manages its own redundancy |

### 4.2 Business Impact Analysis

The following Business Impact Analysis identifies the criticality of each NextSlide service:

| Service | Criticality | Impact of Outage | Users Affected |
|---|---|---|---|
| Render (Frontend + Backend) | **Critical** | Complete platform unavailability; no user access | All users |
| Supabase (Database) | **Critical** | No data reads/writes; presentations inaccessible; circuit breaker activates after 25 failures | All users |
| Supabase (Auth) | **Critical** | No login/signup; existing sessions may persist briefly | All users attempting auth |
| Redis Cloud | **High** | Degraded performance; rate limiting disabled; potential for abuse | All users (performance) |
| Anthropic / OpenAI | **High** | No new presentation generation; existing presentations unaffected | Users creating content |
| Modal | **High** | Heavy AI workloads unavailable; basic generation may still function | Users with complex requests |
| Stripe | **Medium** | No new subscriptions or payment updates; existing access unaffected | New/upgrading users |
| Sentry | **Low** | No error tracking; does not affect user-facing functionality | Internal only |
| PostHog | **Low** | No analytics collection; does not affect user-facing functionality | Internal only |

### 4.3 Single Point of Failure Analysis

NextSlide has identified the following single points of failure:

**SPOF 1: Render (Application Hosting)**
- **Risk:** Complete platform unavailability if Render experiences a global outage.
- **Current Mitigation:** Render provides SOC 2 Type II certified infrastructure with auto-scaling, isolated builds, and DDoS protection. Health checks at `/api/health` provide early warning.
- **Contingency:** If Render outage exceeds RTO, initiate emergency redeployment to an alternative platform (documented in NEXTSLIDE-POL-10).

**SPOF 2: Supabase (Database / Auth / Storage)**
- **Risk:** Loss of all data access, authentication, and file storage. The circuit breaker pattern activates after 25 consecutive failures (transitions to OPEN state, 30-second timeout), preventing cascading failures to the application layer.
- **Current Mitigation:** Supabase runs on AWS with SOC 2 Type II certification, automatic daily backups (AES-256 encrypted), point-in-time recovery on Pro plan, PgBouncer connection pooling, and network isolation.
- **Contingency:** Database can be restored from most recent backup. Point-in-time recovery can minimize data loss below the 24-hour RPO. Circuit breaker prevents application crash during outage.

**SPOF 3: AI Providers (Anthropic / OpenAI)**
- **Risk:** Inability to generate new presentations if both AI providers are simultaneously unavailable.
- **Current Mitigation:** Multiple AI provider integration provides partial redundancy. If one provider fails, the other can serve requests. Existing presentations remain fully accessible regardless of AI provider status.
- **Contingency:** Graceful degradation; users can view, edit, and share existing presentations. New generation requests are queued or deferred with user notification.

### 4.4 Circuit Breaker as Automated Mitigation

The NextSlide backend implements a circuit breaker pattern for Supabase connectivity:

- **Threshold:** 25 consecutive failures trigger the circuit breaker to OPEN state.
- **Timeout:** 30 seconds in OPEN state before transitioning to HALF-OPEN for probe requests.
- **Manual Reset:** Administrators can force-reset the circuit breaker via `POST /admin/reset-circuit-breaker`.
- **Health Monitoring:** Circuit breaker status is exposed at `/api/health` (backend + circuit breaker status), `/api/health/supabase` (connectivity + latency), and `/admin/services/health` (all services, admin only).

The circuit breaker prevents cascading failures by stopping requests to Supabase when it is unresponsive, allowing the backend to return meaningful error responses rather than timing out or crashing.

### 4.5 Communication Plan

#### Internal Communication

| Trigger | Notification | Channel | Timeline |
|---|---|---|---|
| Service degradation detected | Engineering team alerted | Sentry alerts, team messaging | Immediate (automated) |
| Circuit breaker OPEN | CTO notified | Automated alert + team messaging | Within 5 minutes |
| RTO at risk (>2 hours into outage) | CEO + CTO briefed | Direct communication | Within 2 hours |
| BCP activation decision | All team members notified | Team messaging + email | Within 30 minutes of decision |
| Recovery complete | All team members notified | Team messaging + email | Within 1 hour of recovery |

#### Customer Communication

| Trigger | Notification | Channel | Timeline |
|---|---|---|---|
| Outage confirmed (>15 minutes) | Status page updated | Status page | Within 30 minutes |
| Outage exceeds 1 hour | Customer notification | Email via Resend + status page | Within 1.5 hours |
| Progress updates during outage | Status updates | Status page | Every 60 minutes |
| Recovery complete | Resolution notification | Email via Resend + status page | Within 1 hour of recovery |
| Post-incident summary | Incident report shared | Email to affected customers | Within 5 business days |

### 4.6 BCP Team Roles

| Role | Primary Responsibility | Backup |
|---|---|---|
| **BCP Commander (CTO)** | Declares BCP activation; makes recovery decisions; coordinates technical response | CEO |
| **Incident Manager** | Manages incident timeline; coordinates communication; tracks recovery progress | CTO |
| **Technical Lead** | Executes recovery procedures; manages vendor communication for technical issues | Senior Engineer |
| **Communications Lead** | Manages customer-facing communication; updates status page; drafts incident reports | CEO |
| **CEO** | Executive decision-making; customer escalation point; regulatory notification if required | CTO |

### 4.7 Critical Service Dependencies

The following dependency chain must be considered during recovery planning:

```
Render (Hosting) --> serves --> Frontend + Backend API
    |
    +--> Backend API --> requires --> Supabase (DB/Auth/Storage)
    |                         |
    |                         +--> protected by --> Circuit Breaker
    |
    +--> Backend API --> requires --> Redis Cloud (Cache/Rate Limiting)
    |
    +--> Backend API --> requires --> Anthropic / OpenAI (AI Generation)
    |                         |
    |                         +--> heavy workloads via --> Modal (Compute)
    |
    +--> Backend API --> requires --> Stripe (Payments)
```

Recovery must follow this dependency order:
1. Render (hosting must be available first)
2. Supabase (database and auth are prerequisites for all data operations)
3. Redis Cloud (performance and rate limiting)
4. AI providers and Modal (content generation)
5. Stripe (payment processing)

### 4.8 Alternative Processing During Outages

| Scenario | Alternative Processing |
|---|---|
| Supabase outage | Circuit breaker activates; backend returns cached responses where available via Redis; read-only mode if Redis contains recent data; new writes queued for replay after recovery |
| AI provider outage (single) | Automatic failover to alternate AI provider; if Anthropic is down, route to OpenAI and vice versa |
| AI provider outage (both) | Graceful degradation; existing presentations fully accessible; generation requests return informative error; queue requests for retry |
| Redis Cloud outage | Application continues without caching; rate limiting falls back to application-level controls; degraded performance but functional |
| Render outage | No alternative; emergency redeployment to alternate platform if outage exceeds RTO |
| Stripe outage | Existing subscriptions continue; new purchases/upgrades deferred; free tier remains fully functional |

### 4.9 BCP Testing Schedule

| Test Type | Frequency | Description |
|---|---|---|
| **Tabletop Exercise** | Annually | Walk through BCP scenarios with the BCP team; validate roles, communication plan, and decision points |
| **Component Recovery Test** | Semi-annually | Test recovery of individual components (e.g., restore Supabase from backup to a staging environment) |
| **Communication Test** | Annually | Verify that internal and customer notification channels function correctly |
| **Full BCP Simulation** | Every 2 years | End-to-end simulation of a major disruption scenario with timed recovery |

Test results shall be documented, and lessons learned shall be incorporated into BCP updates.

## 5. Roles and Responsibilities

| Role | Responsibilities |
|---|---|
| **CEO** | Approves BCP; authorizes BCP activation for major incidents; serves as customer escalation point; approves external communications |
| **CTO (BCP Owner)** | Maintains and updates the BCP; leads BCP testing; serves as BCP Commander during incidents; ensures recovery objectives are met |
| **Engineering Team** | Executes recovery procedures; monitors health endpoints; manages circuit breaker state; performs post-recovery validation |
| **All Employees** | Understands their role in the BCP; participates in BCP tests; reports disruptions promptly |

## 6. Related Policies

| Policy | Relevance |
|---|---|
| NEXTSLIDE-POL-01 (Information Security Policy) | Overarching security framework; BCP is a key component of the security program |
| NEXTSLIDE-POL-10 (Disaster Recovery Plan) | Technical recovery procedures that support this BCP; scenario-specific runbooks |
| NEXTSLIDE-POL-05 (Risk Assessment Policy) | Risk assessment findings inform BCP priorities and recovery objectives |

## 7. Compliance and Enforcement

All team members are required to understand their BCP responsibilities and participate in scheduled tests. Failure to comply with BCP procedures during an active incident or failure to participate in scheduled testing may result in:

- Mandatory remedial training on BCP procedures
- Formal written warning
- Disciplinary action as appropriate

The CTO is responsible for ensuring BCP compliance through annual testing, documentation reviews, and post-incident assessments.

## 8. Exceptions

Exceptions to BCP requirements (such as deferring a scheduled test) must be approved by the CTO in writing and must include:

- Justification for the exception
- Alternative measures or revised timeline
- Risk assessment of the exception

Exceptions to recovery time objectives require approval from both the CEO and CTO.

## 9. Review Schedule

| Activity | Frequency | Responsible Party |
|---|---|---|
| BCP document review and update | Annually | CTO |
| Recovery objective validation | Annually | CTO / Engineering Team |
| BCP tabletop exercise | Annually | CTO |
| Component recovery test | Semi-annually | Engineering Team |
| Communication plan test | Annually | Communications Lead |
| Vendor dependency review | Annually | CTO |
| Post-incident BCP updates | After each BCP activation | CTO |

## 10. Revision History

| Version | Date | Author | Description |
|---|---|---|---|
| 1.0 | February 1, 2026 | CTO | Initial plan creation |

---

**SOC 2 Trust Service Criteria:** A1.1, A1.2, A1.3, CC9.1
