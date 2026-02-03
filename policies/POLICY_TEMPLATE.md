# [Policy Title]

<!-- Replace [Policy Title] with the full name (title case). Do not include the Document ID in the title. -->

| Field | Value |
|---|---|
| **Document ID** | NEXTSLIDE-POL-[NN] |
| **Version** | [FILL IN -- start at 1.0] |
| **Classification** | Internal |
| **Effective Date** | [FILL IN -- e.g., February 1, 2026] |
| **Last Review Date** | [FILL IN -- same as Effective Date for new policies] |
| **Next Review Date** | [FILL IN -- one year from Effective Date] |
| **Policy Owner** | [FILL IN -- CTO for technical policies, CEO for organizational policies] |
| **Approved By** | CEO / CTO |

<!-- Document ID: Use the next available number in NEXTSLIDE-POL-NN. Check README.md for the current inventory. -->

## 1. Purpose

<!-- 2-4 sentences: WHY this policy exists, what it protects, and how it relates to NextSlide's platform. -->

[FILL IN]

## 2. Scope

<!-- Define WHO (employees, contractors, third parties) and WHAT (systems, data, environments) this policy covers. Reference NextSlide components: React/TS frontend on Render, FastAPI backend on Render, Supabase (PostgreSQL + Auth + Storage), Modal serverless, AI providers (Anthropic, OpenAI, Gemini), Stripe, Sentry, PostHog, Redis, Cloudflare. -->

This policy applies to:

- [FILL IN -- personnel scope]
- [FILL IN -- systems and infrastructure scope]
- [FILL IN -- data scope]
- [FILL IN -- environment scope: production, staging, development]

## 3. Definitions

<!-- Define technical terms and acronyms. Include NextSlide-specific terms (RLS, PKCE, Circuit Breaker) if referenced. Alphabetize. Keep definitions to 1-2 sentences. -->

| Term | Definition |
|---|---|
| **[Term 1]** | [Definition] |
| **[Term 2]** | [Definition] |
| **[Term 3]** | [Definition] |

## 4. Policy Statements

<!-- Core of the policy. Use numbered subsections (4.1, 4.2, ...). Use SHALL for mandatory, SHOULD for recommended, MAY for optional. Reference NextSlide infrastructure by name. Include tables for structured data. Cross-reference other policies by ID (e.g., NEXTSLIDE-POL-01). Aim for 4-8 subsections. -->

### 4.1 [First Policy Statement Title]

[FILL IN]

### 4.2 [Second Policy Statement Title]

[FILL IN]

### 4.3 [Third Policy Statement Title]

[FILL IN]

## 5. Roles and Responsibilities

<!-- At minimum: Policy Owner, CTO, CEO, Engineering Team, All Personnel. Each responsibility should be a concrete action. -->

| Role | Responsibilities |
|---|---|
| **[Policy Owner Role]** | [FILL IN] |
| **CTO** | [FILL IN] |
| **CEO** | [FILL IN] |
| **Engineering Team** | [FILL IN] |
| **All Personnel** | [FILL IN] |

## 6. Related Policies

<!-- Always include NEXTSLIDE-POL-01. Check README.md for the full inventory. Explain the relationship. -->

| Document ID | Policy Title | Relationship |
|---|---|---|
| NEXTSLIDE-POL-01 | Information Security Policy | Master policy governing the overall security program. |
| [NEXTSLIDE-POL-NN] | [Policy Title] | [FILL IN -- explain how this policy relates] |

## 7. Compliance and Enforcement

<!-- State that compliance is mandatory. Describe disciplinary range (warning to termination). Mention automated controls (RLS, rate limiting) where applicable. -->

[FILL IN]

## 8. Exceptions

<!-- Exceptions require written request to Policy Owner with: specific control exempted, risk justification, compensating controls, proposed duration (max 90 days). Note any non-exemptible controls. -->

[FILL IN]

## 9. Review Schedule

<!-- Annual review is mandatory. List trigger events for unscheduled reviews. -->

This policy shall be reviewed:

- Annually, on or before the Next Review Date listed in the document header.
- [FILL IN -- additional review triggers specific to this policy]

## 10. Revision History

| Version | Date | Author | Description |
|---|---|---|---|
| 1.0 | [FILL IN] | [FILL IN -- role, not name] | Initial policy creation. [FILL IN -- brief summary] |

---

<!-- SOC 2 criteria: CC1 (Control Environment), CC2 (Communication), CC3 (Risk Assessment), CC4 (Monitoring), CC5 (Control Activities), CC6 (Access), CC7 (Operations), CC8 (Change Mgmt), CC9 (Risk Mitigation), A1 (Availability), C1 (Confidentiality), P1 (Privacy). See README.md cross-reference matrix. -->

**SOC 2 Trust Service Criteria:** [FILL IN -- e.g., CC6.1, CC6.2, CC6.3]
