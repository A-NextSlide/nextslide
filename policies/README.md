# NextSlide SOC 2 Policy Framework

| Field | Value |
|---|---|
| **Version** | 1.0 |
| **Date** | February 1, 2026 |
| **Classification** | Internal |
| **Maintained By** | CTO |

## Introduction

NextSlide is committed to maintaining the highest standards of security, availability, and confidentiality for our AI-powered presentation generation platform. This document serves as the master index for the NextSlide SOC 2 Policy Framework, which comprises 20 policies aligned with the AICPA Trust Service Criteria. Together, these policies govern how NextSlide protects user data, manages infrastructure risks, and maintains operational integrity across our technology stack (React/TypeScript frontend, Python FastAPI backend, Supabase PostgreSQL database, Modal serverless compute, and third-party AI provider integrations).

All policies are reviewed annually on a staggered quarterly schedule. Personnel are expected to familiarize themselves with the policies relevant to their role and to consult this index when cross-referencing related controls.

## How to Use This Document

- **For auditors:** Start with the SOC 2 Trust Service Criteria Cross-Reference matrix to locate the policies relevant to each criteria category. Each policy's footer lists the specific TSC codes it addresses.
- **For new employees:** Begin with NEXTSLIDE-POL-01 (Information Security Policy) for an overview of the entire program, then review NEXTSLIDE-POL-12 (Acceptable Use Policy) and NEXTSLIDE-POL-20 (Security Training and Awareness Policy).
- **For engineers:** Focus on NEXTSLIDE-POL-02 (Access Control), NEXTSLIDE-POL-03 (Change Management), NEXTSLIDE-POL-08 (Secure SDLC), and NEXTSLIDE-POL-04 (Incident Response).
- **For creating new policies:** Use `POLICY_TEMPLATE.md` as the starting point for any new policy document.

## Policy Inventory

| Document ID | Policy Name | File | Policy Owner | SOC 2 Criteria |
|---|---|---|---|---|
| NEXTSLIDE-POL-01 | Information Security Policy | `01-information-security-policy.md` | CTO | CC1.1, CC1.2, CC1.3, CC1.4, CC1.5, CC2.1, CC5.3 |
| NEXTSLIDE-POL-02 | Access Control Policy | `02-access-control-policy.md` | CTO | CC6.1, CC6.2, CC6.3, CC6.6, CC6.7, CC6.8 |
| NEXTSLIDE-POL-03 | Change Management Policy | `03-change-management-policy.md` | CTO | CC8.1, CC8.2, CC8.3 |
| NEXTSLIDE-POL-04 | Incident Response Policy | `04-incident-response-policy.md` | CTO | CC7.3, CC7.4, CC7.5, CC2.3 |
| NEXTSLIDE-POL-05 | Risk Assessment and Management Policy | `05-risk-assessment-policy.md` | CTO | CC3.1, CC3.2, CC3.3, CC9.1 |
| NEXTSLIDE-POL-06 | Data Classification and Handling Policy | `06-data-classification-policy.md` | CTO | C1.1, C1.2, CC6.5 |
| NEXTSLIDE-POL-07 | Encryption and Key Management Policy | `07-encryption-policy.md` | CTO | C1.1, CC6.1, CC6.7 |
| NEXTSLIDE-POL-08 | Secure Software Development Lifecycle Policy | `08-secure-sdlc-policy.md` | CTO | CC7.1, CC8.1, CC8.2 |
| NEXTSLIDE-POL-09 | Business Continuity and Disaster Recovery Policy | `09-business-continuity-policy.md` | CTO | A1.1, A1.2, A1.3 |
| NEXTSLIDE-POL-10 | Availability and Capacity Management Policy | `10-availability-policy.md` | CTO | A1.1, A1.2 |
| NEXTSLIDE-POL-11 | Vulnerability Management Policy | `11-vulnerability-management-policy.md` | CTO | CC7.1, CC9.1 |
| NEXTSLIDE-POL-12 | Acceptable Use Policy | `12-acceptable-use-policy.md` | CEO | CC1.1, CC1.4 |
| NEXTSLIDE-POL-13 | Password Policy | `13-password-policy.md` | CTO | CC6.1, CC6.6 |
| NEXTSLIDE-POL-14 | Privacy Policy | `14-privacy-policy.md` | CEO | P1.1, P1.2, C1.1, C1.2 |
| NEXTSLIDE-POL-15 | Data Retention and Disposal Policy | `15-data-retention-policy.md` | CTO | P1.1, CC2.3 |
| NEXTSLIDE-POL-16 | Physical Security Policy | `16-physical-security-policy.md` | CEO | CC6.4, CC6.5 |
| NEXTSLIDE-POL-17 | Third-Party and Vendor Management Policy | `17-vendor-management-policy.md` | CTO | CC6.4, CC5.2, CC9.2 |
| NEXTSLIDE-POL-18 | Logging, Monitoring, and Audit Policy | `18-logging-monitoring-policy.md` | CTO | CC4.1, CC4.2, CC7.2 |
| NEXTSLIDE-POL-19 | Code of Conduct | `19-code-of-conduct.md` | CEO | CC1.1, CC1.4 |
| NEXTSLIDE-POL-20 | Security Training and Awareness Policy | `20-security-training-policy.md` | CEO | CC1.4, CC2.2 |

## SOC 2 Trust Service Criteria Cross-Reference

The following matrix maps each SOC 2 Trust Service Criteria category to the NextSlide policies that address it. Auditors and policy reviewers should use this matrix to verify coverage across all criteria.

| Criteria Category | Description | Applicable Policies |
|---|---|---|
| **CC1** | Control Environment | POL-01, POL-19, POL-12, POL-20 |
| **CC2** | Communication and Information | POL-01, POL-04, POL-20, POL-15 |
| **CC3** | Risk Assessment | POL-05, POL-01 |
| **CC4** | Monitoring Activities | POL-18, POL-01 |
| **CC5** | Control Activities | POL-01, POL-02, POL-07, POL-17 |
| **CC6** | Logical and Physical Access Controls | POL-02, POL-06, POL-07, POL-13, POL-16, POL-17 |
| **CC7** | System Operations | POL-04, POL-08, POL-18 |
| **CC8** | Change Management | POL-03, POL-08 |
| **CC9** | Risk Mitigation | POL-05, POL-11 |
| **A1** | Availability | POL-09, POL-10 |
| **C1** | Confidentiality | POL-06, POL-07, POL-14 |
| **P1** | Privacy | POL-14, POL-15 |

## Policy Review Schedule

Policies are reviewed annually on a staggered quarterly schedule to distribute review workload and ensure continuous policy currency.

| Quarter | Review Period | Policies Under Review |
|---|---|---|
| Q1 (Jan-Mar) | February | POL-01, POL-02, POL-03, POL-04, POL-05 |
| Q2 (Apr-Jun) | May | POL-06, POL-07, POL-08, POL-09, POL-10 |
| Q3 (Jul-Sep) | August | POL-11, POL-12, POL-13, POL-14, POL-15 |
| Q4 (Oct-Dec) | November | POL-16, POL-17, POL-18, POL-19, POL-20 |

Unscheduled reviews are triggered by:

- Major security incidents (P1 or P2) affecting controls governed by the policy.
- Significant changes to NextSlide infrastructure, architecture, or third-party integrations.
- Changes to applicable laws, regulations, or contractual requirements.
- Findings from internal or external audits.

## Policy Exception Process

All policy exceptions follow the process defined in each individual policy's Section 8 (Exceptions). The general process is:

1. **Request:** Submit a written exception request to the Policy Owner, including the specific control being exempted, a risk assessment, proposed compensating controls, and a requested duration.
2. **Review:** The Policy Owner evaluates the request and may consult with the CTO or CEO depending on the risk level.
3. **Approval:** Approved exceptions are documented with conditions and an expiration date (maximum 90 days unless otherwise specified in the individual policy).
4. **Tracking:** Active exceptions are reviewed during the quarterly policy review cycle.
5. **Expiration:** Exceptions expire automatically on their documented date and must be re-requested if still needed.

## Document Control

This README and all policies in this directory are subject to version control via Git. Changes to policies require review and approval by the Policy Owner and at least one of CEO or CTO before merging to the main branch. The revision history within each policy document serves as the authoritative change log. This index is updated whenever a new policy is added or an existing policy is renamed or retired.

### File Naming Convention

All policy files follow the pattern `NN-descriptive-name-policy.md`, where `NN` corresponds to the two-digit number in the Document ID (e.g., `04-incident-response-policy.md` for NEXTSLIDE-POL-04). Supporting documents in this directory:

| File | Purpose |
|---|---|
| `README.md` | This master index (you are reading it) |
| `POLICY_TEMPLATE.md` | Reusable template for creating new policies |

### Revision History

| Version | Date | Author | Description |
|---|---|---|---|
| 1.0 | February 1, 2026 | CTO | Initial creation of the SOC 2 Policy Framework index covering 20 policies, TSC cross-reference matrix, review schedule, and exception process. |

---

For questions about this framework, contact the CTO or refer to the Information Security Policy (NEXTSLIDE-POL-01).
