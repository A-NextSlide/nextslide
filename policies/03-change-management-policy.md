# Change Management Policy

| Field | Value |
|---|---|
| **Document ID** | NEXTSLIDE-POL-03 |
| **Version** | 1.0 |
| **Classification** | Internal |
| **Effective Date** | February 1, 2026 |
| **Last Review Date** | February 1, 2026 |
| **Next Review Date** | February 1, 2027 |
| **Policy Owner** | Chief Technology Officer (CTO) |
| **Approved By** | CEO / CTO |

## 1. Purpose

This policy establishes the change management controls governing modifications to the NextSlide AI presentation generation platform. It defines the requirements for proposing, reviewing, approving, deploying, and rolling back changes to application code, infrastructure configuration, database schemas, and third-party dependencies. The objective is to minimize the risk of service disruption, security regression, and data loss while maintaining development velocity appropriate for NextSlide's operational needs.

## 2. Scope

This policy applies to all changes affecting:

- The React/TypeScript frontend application and its build pipeline (npm, Vite).
- The Python FastAPI backend service and its Docker-based deployment.
- The Supabase PostgreSQL database, including schema migrations in `apps/backend/migrations/`.
- Third-party dependency versions for Python (requirements.txt), Node.js (package.json, package-lock.json), and Docker base images.
- Infrastructure configuration on Render (environment variables, service settings, build commands).
- CI/CD pipeline configuration and deployment triggers.
- Third-party integrations including Anthropic, OpenAI, Google Gemini, Stripe, Sentry, and PostHog.
- Git repository settings, branch protection rules, and access controls on GitHub.

All personnel who contribute code or modify infrastructure configuration are subject to this policy.

## 3. Definitions

| Term | Definition |
|---|---|
| **Change Request** | A documented proposal to modify any system, application, configuration, or dependency within the NextSlide platform. In standard operations, a GitHub Pull Request serves as the change request. |
| **Pull Request (PR)** | A GitHub mechanism for proposing code changes from a feature branch into the main branch, including a description of the change, linked issues, and review assignments. |
| **Change Advisory Board (CAB)** | A group consisting of the CTO and senior engineering personnel who evaluate significant or high-risk changes before approval. |
| **Standard Change** | A pre-approved, low-risk, repeatable change that follows an established procedure (e.g., minor dependency patch updates, copy changes, non-functional UI adjustments). |
| **Emergency Change** | A change required to restore service availability or remediate an active security vulnerability that bypasses the standard review process with post-implementation review. |
| **Rollback** | The process of reverting the production environment to a previous known-good deployment state using Render's instant rollback capability. |
| **Feature Branch** | A Git branch created from the main branch to isolate development work for a specific feature, bug fix, or improvement. |
| **Database Migration** | A versioned, incremental change to the Supabase PostgreSQL database schema managed through migration files in `apps/backend/migrations/`. |

## 4. Policy Statements

### 4.1 Change Request Workflow

All changes to the NextSlide codebase shall follow the standard GitHub Pull Request workflow:

1. **Branch Creation:** Developers create a feature branch from the `main` branch. Branch names should follow the convention `feature/`, `fix/`, `chore/`, or `hotfix/` followed by a descriptive identifier.
2. **Development:** Changes are implemented and committed to the feature branch with descriptive commit messages.
3. **Pull Request Submission:** A Pull Request is opened against the `main` branch with a clear title, description of the change, testing performed, and any relevant issue or ticket references.
4. **Code Review:** At least one reviewer other than the author must review and approve the Pull Request before merge. Reviewers shall evaluate correctness, security implications, performance impact, and adherence to coding standards.
5. **Automated Checks:** TypeScript compilation must pass without errors for frontend changes. All automated checks configured in the CI pipeline must succeed before merge is permitted.
6. **Merge:** Upon approval and passing checks, the Pull Request is merged into the `main` branch.
7. **Auto-Deploy:** Render automatically triggers a production deployment upon merge to `main`. The frontend undergoes an `npm install && vite build` process. The backend undergoes a Docker image build and deployment.

### 4.2 Code Review Requirements

All Pull Requests require a minimum of one approving review from a team member who did not author the change. Reviewers shall evaluate:

- Correctness and completeness of the implementation.
- Security implications, including input validation (Zod on frontend, Pydantic on backend), XSS prevention (DOMPurify), and proper authentication/authorization checks.
- Impact on existing functionality and potential for regressions.
- Adherence to NextSlide coding standards and architectural patterns.
- Appropriate error handling and logging (ensuring no PII leakage per the PIIRedactionFilter configuration).
- Database migration safety (reversibility, data preservation, index impact).

Self-review and self-merge are prohibited except under the Emergency Change process defined in Section 4.7.

### 4.3 Pre-Deployment Testing

Before a Pull Request is submitted for review, the author shall verify:

- The application builds successfully (TypeScript compilation for frontend, Docker build for backend).
- Existing functionality is not broken by the change (manual or automated regression testing as applicable).
- New features or fixes include appropriate test coverage where feasible.
- Database migrations have been tested against a development or staging database and are reversible.
- Environment variable changes have been documented and coordinated with deployment configuration on Render.

### 4.4 Dependency Management

NextSlide enforces strict dependency version controls to prevent supply chain attacks and ensure reproducible builds:

- **Python Dependencies:** All packages in `apps/backend/requirements.txt` are pinned to exact versions using the `==` operator (e.g., `anthropic==0.34.2`, `fastapi==0.115.0`). Version upgrades require explicit Pull Requests with testing of the new version.
- **Docker Base Images:** All Dockerfiles pin base images to specific version tags (e.g., `node:18.20-alpine3.20`). Base image updates require explicit Pull Requests with security review.
- **Git Dependencies:** Any dependencies sourced from Git repositories are pinned to specific commit hashes rather than branch names or tags.
- **Node.js Dependencies:** Frontend packages use semver ranges (`^`) in `package.json` with an accompanying `package-lock.json` that locks resolved versions. Both files must be committed together. Running `npm install` without updating the lock file is prohibited in CI.
- **Dependency Updates:** Dependency version changes shall be treated as standalone changes with their own Pull Requests where possible, rather than bundled with feature work, to simplify review and rollback.

### 4.5 Render Deployment and Rollback

NextSlide uses Render for hosting with auto-deploy configured on the `main` branch:

- **Auto-Deploy Trigger:** Every merge to `main` automatically initiates a production deployment on Render.
- **Frontend Build:** The static site service executes `npm install && npx vite build` to produce the production bundle.
- **Backend Build:** The web service builds a Docker image from the project Dockerfile and deploys the resulting container.
- **Deployment Verification:** After each deployment, engineering personnel shall verify service health via the health check endpoints (`GET /api/health`, `GET /api/health/supabase`, `GET /admin/services/health`).
- **Rollback Procedure:** If a deployment introduces a defect or degradation, Render supports instant rollback to the previous successful deployment. The CTO or designated on-call engineer is authorized to initiate rollback. Rollback does not require a Pull Request but shall be documented with a post-incident note.

### 4.6 Database Migration Procedures

Database schema changes carry elevated risk due to their potential for data loss and service disruption:

- All migrations shall be stored as versioned files in `apps/backend/migrations/` and committed through the standard Pull Request process.
- Migrations must be forward-compatible wherever possible (additive changes preferred over destructive changes).
- Destructive migrations (column drops, table drops, data type changes) require CAB review as defined in Section 4.8.
- Migrations shall be tested against a non-production database before merge.
- Rollback scripts or compensating migrations shall be prepared for any migration that modifies existing data or removes schema elements.
- Migration execution in production shall be coordinated with deployment timing to avoid inconsistency between application code and database schema.

### 4.7 Emergency Change Process

When an active security vulnerability, data integrity issue, or service outage requires immediate remediation, the following emergency change process applies:

1. The on-call engineer or CTO identifies the emergency condition and documents the issue.
2. A hotfix branch (`hotfix/` prefix) is created from `main`.
3. The fix is implemented with the minimum viable change to resolve the issue.
4. If a second reviewer is available, expedited review is performed. If no reviewer is available, the CTO may approve and merge the change unilaterally.
5. The change is merged to `main`, triggering auto-deploy on Render.
6. Health checks are verified immediately after deployment.
7. Within 24 hours of the emergency change, a post-implementation review is conducted. A standard Pull Request documenting the change rationale and any follow-up work is created retroactively if the original was merged without full review.

All emergency changes shall be logged in the audit_logs table in Supabase with the action type `emergency_change`.

### 4.8 Change Advisory Board

A Change Advisory Board (CAB) review is required for the following categories of change:

- Database migrations that alter or remove existing columns, tables, or constraints.
- Changes to authentication or authorization logic (Supabase Auth, RLS policies, JWT handling).
- Modifications to third-party API integrations that affect data flow (Anthropic, OpenAI, Stripe).
- Infrastructure changes on Render (service tier changes, environment variable modifications affecting security, new service provisioning).
- Changes to rate limiting thresholds, circuit breaker configuration, or security headers.
- Dependency upgrades with major version bumps.

The CAB consists of the CTO and at least one senior engineer. CAB review may be conducted asynchronously via Pull Request comments or synchronously in a brief review meeting. CAB approval is recorded as an approving review on the Pull Request.

### 4.9 Change Documentation and Traceability

Every change to the NextSlide platform shall be traceable through the following records:

- **GitHub Pull Request:** Title, description, linked issues, reviewer comments, approval records, and merge timestamp.
- **Git History:** Commit messages on the `main` branch reflecting the merged Pull Request.
- **Render Deploy History:** Deployment timestamps, build logs, and deployment status maintained by Render.
- **Audit Logs:** Significant configuration changes recorded in the `audit_logs` table in Supabase (action, admin_user_id, target_user_id, timestamp, details, ip_address).

Change records shall be retained for a minimum of one year for audit and compliance purposes.

## 5. Roles and Responsibilities

| Role | Responsibilities |
|---|---|
| **CEO** | Approves this policy. Provides executive sponsorship for change management governance. |
| **CTO (Policy Owner)** | Owns this policy. Chairs the Change Advisory Board. Authorizes emergency changes. Reviews and approves significant infrastructure and security-related changes. Ensures change management controls are effective. |
| **Engineering Team** | Creates feature branches and Pull Requests following the standard workflow. Conducts code reviews. Verifies deployments via health checks. Prepares and tests database migrations. Documents changes appropriately. |
| **Reviewers** | Evaluates Pull Requests for correctness, security, performance, and standards compliance. Provides timely feedback and approval. |
| **On-Call Engineer** | Monitors deployment health post-merge. Initiates rollback when defects are detected. Executes emergency changes when authorized. |

## 6. Related Policies

- **NEXTSLIDE-POL-01** Information Security Policy -- master policy governing the security program under which change management operates.
- **NEXTSLIDE-POL-08** Vulnerability Management Policy -- governs the identification and remediation of vulnerabilities, which may trigger changes managed under this policy.
- **NEXTSLIDE-POL-10** Secure Software Development Lifecycle Policy -- defines secure coding practices that apply during the development phase of the change workflow.

## 7. Compliance and Enforcement

All personnel who contribute code or modify infrastructure are required to comply with this policy. Violations include but are not limited to: merging changes without required reviews, bypassing automated checks, deploying changes outside the approved workflow without emergency authorization, or failing to document significant changes. Violations may result in disciplinary action proportionate to the severity and impact of the non-compliance, up to and including termination of employment or contract.

## 8. Exceptions

Exceptions to this policy must be requested in writing to the CTO, include a justification and risk assessment, and specify the duration and scope of the exception. Emergency changes as defined in Section 4.7 are a recognized exception process and do not require separate exception approval, provided the post-implementation review is completed within 24 hours. All other exceptions are limited to 90 days and must be reviewed upon expiration.

## 9. Review Schedule

This policy shall be reviewed:

- Annually, on or before the Next Review Date listed in the document header.
- Upon significant changes to the CI/CD pipeline, deployment infrastructure, or version control workflow.
- Following any incident caused by a change management failure (e.g., a deployment that required rollback due to inadequate review).
- Upon changes to SOC 2 requirements or auditor findings related to change management.

## 10. Revision History

| Version | Date | Author | Description |
|---|---|---|---|
| 1.0 | February 1, 2026 | CTO | Initial policy creation establishing change management controls for the NextSlide platform, covering GitHub PR workflow, Render auto-deploy, rollback procedures, dependency management, database migrations, emergency changes, and CAB governance. |

---

**SOC 2 Trust Service Criteria:** CC8.1, CC3.4
