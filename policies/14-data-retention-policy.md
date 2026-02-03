# Data Retention Policy

| Field | Value |
|---|---|
| **Document ID** | NEXTSLIDE-POL-14 |
| **Version** | 1.0 |
| **Classification** | Internal |
| **Effective Date** | February 1, 2026 |
| **Last Review Date** | February 1, 2026 |
| **Next Review Date** | February 1, 2027 |
| **Policy Owner** | CTO |
| **Approved By** | CEO / CTO |

## 1. Purpose

This policy defines the retention periods, disposal procedures, and lifecycle management requirements for all data categories within the NextSlide AI presentation generation platform. It ensures that data is retained only as long as necessary to fulfill its business purpose, meet legal obligations, and satisfy user expectations, while minimizing risk from excessive data accumulation.

## 2. Scope

This policy applies to all data collected, generated, processed, or stored by the NextSlide platform, including:

- User account data and authentication records.
- Presentation content (decks, slides, images, transcripts).
- Application logs, error reports, and audit trails.
- Analytics and session recording data.
- Cache and ephemeral data stores.
- Backups and replicated data across all environments (production, staging).

This policy covers data stored across all NextSlide infrastructure components: Supabase (PostgreSQL and Storage), Redis Cloud, Sentry, PostHog, and Render.

## 3. Definitions

| Term | Definition |
|---|---|
| **Retention Period** | The length of time data is maintained before disposal or anonymization. |
| **Disposal** | The irreversible removal or destruction of data such that it cannot be recovered. |
| **Legal Hold** | A directive to preserve data that may be relevant to pending or anticipated litigation, regardless of retention schedule. |
| **Data Subject** | An individual whose personal data is processed by NextSlide (i.e., a platform user). |
| **Right to Deletion** | A data subject's legal right to request erasure of their personal data under GDPR (Article 17) or CCPA. |
| **Ephemeral Data** | Data that exists temporarily and is automatically purged by system design. |
| **Anonymization** | The irreversible transformation of data so that it can no longer identify an individual. |
| **Soft Delete** | Marking a record as deleted in the application while retaining the underlying data for a defined grace period. |

## 4. Policy Statements

### 4.1 Retention Schedule

The following table defines the authoritative retention periods for each data category in the NextSlide platform:

| Data Category | Storage Location | Retention Period | Deletion Trigger | Responsible Party |
|---|---|---|---|---|
| User account profiles | Supabase PostgreSQL | Indefinite (active accounts) | Account deletion request or 24 months of inactivity | Engineering Team |
| User authentication credentials | Supabase Auth | Tied to account lifecycle | Account deletion | Engineering Team |
| Deck content (slides, text, layouts) | Supabase PostgreSQL | Indefinite (user-deletable) | User-initiated deletion or account deletion | Engineering Team |
| Uploaded images and media | Supabase Storage (AWS S3) | Indefinite (user-deletable) | User-initiated deletion or account deletion | Engineering Team |
| Slide transcripts | Supabase PostgreSQL | Tied to deck lifecycle | Deck deletion or account deletion | Engineering Team |
| Audit logs (user actions, admin actions) | Supabase PostgreSQL | Indefinite | Manual review and archival after 3 years | Engineering Team |
| Error logs and crash reports | Sentry | 90 days | Automatic expiration by Sentry | Sentry (automated) |
| Analytics events | PostHog | Per PostHog plan retention | Automatic expiration by PostHog | PostHog (automated) |
| Session recordings | PostHog | Per PostHog plan retention | Automatic expiration by PostHog | PostHog (automated) |
| Redis cache data | Redis Cloud | Ephemeral (TTL-based) | Automatic key expiration | Redis (automated) |
| JWT token cache | In-memory (backend) | 5 minutes | Automatic memory eviction | Application runtime |
| Rate limiting counters | Redis Cloud | Ephemeral (sliding window) | Automatic key expiration | Redis (automated) |
| Payment records | Stripe | Per Stripe data retention policies | Managed by Stripe | Stripe (automated) |
| Email delivery logs | Resend | Per Resend retention policies | Managed by Resend | Resend (automated) |
| Database backups | Supabase (automated) | Per Supabase plan (7-30 days) | Automatic rotation by Supabase | Supabase (automated) |

### 4.2 Disposal Procedures

#### 4.2.1 Database Records

When a user account or deck is deleted, the following disposal process MUST be executed:

1. **Soft delete**: Mark the record as deleted in the application layer with a timestamp.
2. **Grace period**: Retain soft-deleted data for 30 days to allow for accidental deletion recovery.
3. **Hard delete**: After the 30-day grace period, permanently remove the record from PostgreSQL using `DELETE` statements.
4. **Cascade**: Ensure all related records (slides, images, sharing links, audit references) are included in the cascade deletion.
5. **Verification**: Confirm deletion through a query against the affected tables.

#### 4.2.2 Object Storage (Media Files)

Uploaded images and media files MUST be deleted from Supabase Storage (AWS S3) within 48 hours of the associated deck or account hard deletion. Orphaned files (files not referenced by any active record) SHOULD be identified and purged through a monthly cleanup job.

#### 4.2.3 Third-Party Service Data

For data stored in third-party services (Sentry, PostHog, Stripe), disposal is governed by each provider's data retention configuration. NextSlide MUST configure provider-side retention settings to align with this policy where configurable. Data that cannot be individually deleted from a third-party service will be retained until the provider's automatic expiration applies.

#### 4.2.4 Backups

Database backups are managed by Supabase and are automatically rotated according to the Supabase plan tier (7 to 30 days). Deleted data will naturally age out of the backup rotation within this window. In cases requiring immediate purge from backups (e.g., legal order), NextSlide will coordinate with Supabase support.

### 4.3 Right to Deletion

NextSlide respects data subject rights under GDPR (Article 17, Right to Erasure) and CCPA (Right to Delete). The following procedures apply:

#### 4.3.1 Request Processing

1. Deletion requests may be submitted through the NextSlide account settings, via email to the designated privacy contact, or through the in-app support channel.
2. The identity of the requestor MUST be verified before processing.
3. Requests MUST be acknowledged within 48 hours of receipt.
4. Deletion MUST be completed within 30 calendar days of a verified request, as required by GDPR.

#### 4.3.2 Scope of Deletion

Upon a verified deletion request, NextSlide MUST delete:

- The user's account profile and authentication credentials.
- All decks, slides, images, and transcripts owned by the user.
- All sharing links and collaboration records associated with the user's content.
- Analytics data identifiable to the user where technically feasible (PostHog user identification).

NextSlide MAY retain the following after a deletion request:

- Anonymized, aggregated analytics data that cannot identify the individual.
- Records required for legal compliance, fraud prevention, or legitimate business interest as permitted by applicable law.
- Audit log entries where required for security or compliance purposes, with personal identifiers anonymized.

#### 4.3.3 Deletion Confirmation

The data subject MUST be notified upon completion of the deletion process, including a summary of what data was removed and any data retained with the legal basis for retention.

### 4.4 Backup Retention

- Automated database backups are retained for 7 to 30 days depending on the Supabase plan tier.
- Backups are encrypted at rest using AES-256 as defined in NEXTSLIDE-POL-07.
- Backup restoration MUST be limited to authorized personnel and logged in the audit trail.
- Backup data MUST NOT be used for purposes other than disaster recovery without CTO approval.

### 4.5 Legal Hold Procedures

When NextSlide receives notice of pending or anticipated litigation, regulatory investigation, or audit:

1. The CEO or legal counsel MUST issue a legal hold notice identifying the affected data categories and custodians.
2. All automated disposal processes for the identified data MUST be suspended immediately.
3. Affected personnel MUST be notified of their obligation to preserve relevant data.
4. The legal hold MUST remain in effect until explicitly released by the CEO or legal counsel.
5. Legal holds override all retention periods defined in this policy.
6. A register of all active legal holds MUST be maintained and reviewed monthly.

### 4.6 Inactive Account Handling

User accounts with no login activity for 24 consecutive months SHOULD be flagged for review. Before deletion of inactive accounts:

1. A notification email MUST be sent to the registered email address 30 days before planned deletion.
2. A second notification MUST be sent 7 days before planned deletion.
3. If the user does not respond or log in, the account and associated data enter the standard disposal procedure (Section 4.2).

## 5. Roles and Responsibilities

| Role | Responsibility |
|---|---|
| **CTO** | Policy ownership, approval of retention period changes, oversight of disposal process compliance. |
| **Engineering Team** | Implementation of automated retention and disposal mechanisms, execution of deletion requests, orphan file cleanup. |
| **CEO** | Issuance and release of legal holds, final authority on exceptions to retention periods. |
| **Customer Support** | Intake and identity verification for data deletion requests, communication with data subjects. |
| **Security Lead** | Audit of disposal procedures, verification that deleted data is irrecoverable, review of third-party retention configurations. |
| **All Employees** | Compliance with legal hold notices, reporting data that may be outside defined retention policies. |

## 6. Related Policies

- **NEXTSLIDE-POL-01** - Information Security Policy
- **NEXTSLIDE-POL-06** - Data Classification Policy
- **NEXTSLIDE-POL-15** - Privacy Policy

## 7. Compliance and Enforcement

Failure to comply with defined retention periods or disposal procedures may result in regulatory penalties, legal liability, and disciplinary action. Systems that store data beyond their defined retention period MUST be remediated within 30 days of discovery. Unauthorized data destruction (destruction outside of defined procedures) is a policy violation subject to investigation.

## 8. Exceptions

Exceptions to defined retention periods require written approval from the CTO and MUST include:

- The specific data category and current retention period.
- The requested retention period (longer or shorter) and business justification.
- A risk assessment addressing privacy, security, and compliance implications.
- A defined expiration date for the exception, not exceeding 12 months.

Active exceptions are tracked in the policy exception register and reviewed quarterly.

## 9. Review Schedule

This policy is reviewed annually or upon:

- Changes to applicable privacy regulations (GDPR, CCPA, or equivalent).
- Addition or removal of data storage infrastructure or third-party processors.
- Significant changes to the data categories collected by NextSlide.
- Feedback from audits or compliance assessments.

## 10. Revision History

| Version | Date | Author | Description |
|---|---|---|---|
| 1.0 | February 1, 2026 | CTO | Initial policy creation. |

---

**SOC 2 Trust Service Criteria:** CC6.5 (Disposal of Confidential Information), C1.1 (Confidentiality of Information), P1.1 (Privacy Criteria Related to Notice)
