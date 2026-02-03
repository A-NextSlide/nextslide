# Physical Security Policy

| Field | Value |
|---|---|
| **Document ID** | NEXTSLIDE-POL-16 |
| **Version** | 1.0 |
| **Classification** | Internal |
| **Effective Date** | February 1, 2026 |
| **Last Review Date** | February 1, 2026 |
| **Next Review Date** | February 1, 2027 |
| **Policy Owner** | CTO |
| **Approved By** | CEO / CTO |

## 1. Purpose

This policy establishes the physical security requirements for the NextSlide platform and its workforce. NextSlide is a 100% cloud-hosted AI presentation generation platform with no company-owned data centers, server rooms, or physical computing infrastructure. All production systems, data storage, and processing are delegated to SOC 2 certified cloud service providers. This policy documents that delegation, defines the physical security controls inherited from cloud providers, and establishes workstation and workplace security requirements for NextSlide employees.

## 2. Scope

This policy applies to:

- All NextSlide production infrastructure (hosted entirely by third-party cloud providers)
- All employee workstations (laptops, desktops, and mobile devices) used to access NextSlide systems
- All locations from which employees access NextSlide systems, including home offices and co-working spaces
- Any physical office space used by NextSlide (if applicable)
- Physical media containing NextSlide data (if any)

## 3. Definitions

| Term | Definition |
|---|---|
| **Cloud-Hosted** | Infrastructure, platforms, or services operated entirely by third-party cloud providers in their data centers |
| **Workstation** | Any computing device (laptop, desktop, tablet) used by an employee to access NextSlide systems or data |
| **Endpoint** | A workstation or mobile device that connects to NextSlide systems |
| **FDE** | Full Disk Encryption; encryption of the entire storage volume on a device |
| **Clean Desk** | A practice of ensuring that sensitive information is not left visible or accessible on a desk or workspace when unattended |
| **Physical Security Perimeter** | The physical boundary around areas where information systems or data are located |
| **Inherited Controls** | Security controls implemented and maintained by a third-party provider that NextSlide relies upon rather than implementing directly |
| **MDM** | Mobile Device Management; software used to manage, monitor, and secure employee devices |

## 4. Policy Statements

### 4.1 Cloud Infrastructure Delegation Statement

NextSlide does not own, operate, or maintain any physical data centers, server rooms, network closets, or physical computing infrastructure. All production systems are hosted by third-party cloud service providers. Physical security for production infrastructure is therefore fully delegated to these providers, each of which maintains documented physical security controls as part of their compliance programs.

**This delegation means:**
- NextSlide has no physical servers, storage arrays, or network equipment to protect.
- Physical access to production systems is controlled entirely by the cloud providers.
- Physical security auditing for production infrastructure is covered by provider SOC 2 reports.
- NextSlide's physical security responsibilities are limited to employee workstations, workplace environments, and physical media handling.

### 4.2 Cloud Provider Physical Security References

The following cloud providers host NextSlide production infrastructure and maintain physical security controls as documented in their compliance certifications:

| Provider | Services Hosted | Certification | Physical Security Controls |
|---|---|---|---|
| **Render** | Application hosting (frontend + backend), TLS termination, DDoS protection, auto-scaling, isolated builds | SOC 2 Type II | Data center physical access controls, environmental controls, surveillance, and visitor management per SOC 2 report |
| **Supabase (AWS)** | PostgreSQL database, authentication, file storage, daily backups (AES-256), PgBouncer, network isolation | SOC 2 Type II (Supabase) + SOC 2 Type II (AWS) | AWS data centers: multi-layer physical security, biometric access, 24/7 security staff, environmental controls, redundant power and cooling |
| **Redis Cloud** | Caching, rate limiting | SOC 2 Type II | Cloud-hosted on certified infrastructure; physical controls per provider SOC 2 report |
| **Modal** | Serverless compute for heavy AI workloads | SOC 2 in progress | Cloud infrastructure physical controls; enhanced monitoring pending SOC 2 certification |
| **Stripe** | Payment processing | PCI DSS Level 1, SOC 2 Type II | PCI DSS Level 1 physical security requirements; the most stringent physical security standards in the payment industry |

NextSlide reviews the physical security sections of provider SOC 2 reports as part of the annual vendor review process defined in NEXTSLIDE-POL-11 (Vendor Management Policy). Any findings related to physical security deficiencies in provider reports shall be assessed and documented in the NextSlide Risk Register per NEXTSLIDE-POL-05 (Risk Assessment Policy).

### 4.3 Employee Workstation Security

All employee workstations used to access NextSlide systems, code repositories, or customer data must meet the following requirements:

#### 4.3.1 Disk Encryption

- **Full disk encryption (FDE) is mandatory** on all workstations.
- macOS devices must use FileVault with a strong passphrase.
- Windows devices must use BitLocker with TPM-backed encryption.
- Linux devices must use LUKS or equivalent full disk encryption.
- Encryption must be enabled before the device is used to access any NextSlide systems.

#### 4.3.2 Screen Lock

- Automatic screen lock must be configured to activate after a maximum of **5 minutes** of inactivity.
- A strong password, PIN (minimum 6 digits), or biometric authentication must be required to unlock.
- Manual screen lock (e.g., keyboard shortcut) must be used whenever leaving a workstation unattended, even briefly.

#### 4.3.3 Operating System and Software Updates

- Operating system security updates must be applied within **7 days** of release.
- Critical security patches (rated Critical or High by the vendor) must be applied within **72 hours**.
- Automatic update mechanisms should be enabled where available.

#### 4.3.4 Antivirus and Endpoint Protection

- Endpoint protection software with real-time scanning must be active on all workstations.
- macOS built-in protections (XProtect, Gatekeeper) are the minimum acceptable baseline for Mac devices.
- Endpoint protection definitions must be updated automatically.

#### 4.3.5 Firewall

- The operating system firewall must be enabled on all workstations.
- Unnecessary inbound ports and services must be disabled.

#### 4.3.6 Secure Authentication

- All access to NextSlide systems (Render, Supabase, Sentry, GitHub, etc.) must use strong, unique passwords and multi-factor authentication (MFA) where supported.
- SSH keys used for repository access must be protected with a passphrase and must use Ed25519 or RSA-4096 (minimum) key algorithms.
- API keys and secrets must never be stored in plaintext on workstations; use environment variables or a secrets manager.

### 4.4 Secure Disposal of Equipment and Media

When workstations or storage media are decommissioned, the following procedures must be followed:

| Asset Type | Disposal Method |
|---|---|
| **Laptops / Desktops** | Perform a full disk wipe using a secure erase tool (e.g., Apple Erase All Content and Settings, DBAN for Windows/Linux) before reuse, donation, or recycling. Verify the wipe by confirming the drive cannot be read. |
| **External Storage** (USB drives, external HDDs) | Secure erase using manufacturer tools or physical destruction if the device cannot be reliably wiped. |
| **SSDs** | Use the manufacturer's secure erase command (ATA Secure Erase or NVMe Format) to ensure all data blocks are cleared. |
| **Physical Documents** | Cross-cut shredding for any printed materials containing NextSlide data, credentials, or architecture diagrams. |
| **Mobile Devices** | Factory reset with verification that all data has been removed before disposal or repurposing. |

A disposal log shall be maintained recording the device type, serial number (if applicable), disposal method, date, and the individual who performed the disposal.

### 4.5 Home Office and Remote Work Requirements

Given NextSlide's cloud-native and remote-friendly operations, employees working from home or remote locations must maintain the following:

1. **Private Workspace** -- Work involving NextSlide systems or customer data should be performed in a private area where screens are not visible to unauthorized individuals (family members, visitors, passersby).
2. **Secure Network** -- Home Wi-Fi networks must use WPA3 or WPA2 encryption with a strong, unique password. Default router credentials must be changed. Public Wi-Fi may only be used with an active VPN connection.
3. **Physical Device Security** -- Workstations must not be left unattended and accessible to unauthorized individuals. When not in use, laptops should be stored securely (e.g., in a locked drawer or cabinet) if the workspace is shared.
4. **No Shoulder Surfing** -- Employees should use privacy screens when working in public or shared environments where others can view the display.
5. **Printed Materials** -- Printing of NextSlide customer data, credentials, or sensitive technical documentation is strongly discouraged. If printing is necessary, materials must be securely stored and shredded when no longer needed.

### 4.6 Office Security (If Applicable)

If NextSlide maintains a physical office space, the following controls apply:

1. **Access Control** -- Office access must be restricted to authorized personnel using key cards, keys, or access codes. Access credentials must not be shared.
2. **Visitor Management** -- All visitors must be signed in, provided with a visitor badge, and escorted by a NextSlide employee at all times. Visitor logs shall be maintained for a minimum of 90 days.
3. **Server / Network Equipment** -- Any on-premises network equipment (routers, switches, access points) must be secured in a locked cabinet or closet with access restricted to authorized personnel.
4. **Surveillance** -- If the office contains network equipment or is used for handling sensitive data, security cameras covering entry/exit points are recommended.
5. **After-Hours Security** -- The office must be locked and secured when unoccupied. Alarm systems are recommended for offices containing company equipment.

### 4.7 Clean Desk Policy

All NextSlide employees and contractors must adhere to the following clean desk practices:

1. **End of Day** -- At the end of each workday, all sensitive documents, notes, and printed materials must be secured in a locked drawer or shredded.
2. **Unattended Workspace** -- When leaving a workspace unattended (meetings, breaks, end of day), ensure:
   - Workstation screen is locked.
   - No sensitive documents, credentials, or notes are visible.
   - No sticky notes with passwords, API keys, or access codes are affixed to monitors or desks.
3. **Whiteboards and Shared Displays** -- Erase any sensitive information (architecture diagrams, credentials, customer data) from whiteboards and shared displays after meetings.
4. **Removable Media** -- USB drives, external hard drives, and other removable media must be secured when not in use and must not be left in common areas.

### 4.8 Physical Security Incident Reporting

Employees must immediately report the following physical security events to the CTO:

- Loss or theft of a workstation, mobile device, or removable media
- Suspected unauthorized physical access to a workspace or office
- Discovery of unauthorized devices (e.g., unknown USB drives) in the workspace
- Any tampering with workstation hardware
- Loss of printed materials containing sensitive information

Upon report of a lost or stolen device, the following actions shall be taken within 1 hour:

1. Revoke the device's access to all NextSlide systems (Render, Supabase, GitHub, etc.).
2. Terminate active sessions associated with the device.
3. Rotate any credentials that were stored on or accessible from the device.
4. If full disk encryption was enabled, assess the risk of data exposure (encrypted devices present low risk).
5. Document the incident per NEXTSLIDE-POL-04 (Incident Response Plan).

## 5. Roles and Responsibilities

| Role | Responsibilities |
|---|---|
| **CEO** | Approves physical security policy; ensures adequate budget for workstation security measures; reviews physical security incidents |
| **CTO (Policy Owner)** | Maintains the physical security policy; oversees workstation security compliance; reviews cloud provider physical security attestations annually; manages physical security incidents |
| **Engineering Team** | Complies with workstation security requirements; reports physical security events; maintains device encryption and security configurations |
| **All Employees** | Adheres to clean desk policy; secures workstations and credentials; reports lost/stolen devices immediately; follows home office security requirements |

## 6. Related Policies

| Policy | Relevance |
|---|---|
| NEXTSLIDE-POL-01 (Information Security Policy) | Overarching security framework that includes physical security as a control domain |
| NEXTSLIDE-POL-11 (Vendor Management Policy) | Governs the review of cloud provider SOC 2 reports, including physical security controls |
| NEXTSLIDE-POL-12 (Access Control Policy) | Defines logical access controls that complement physical workstation security |

## 7. Compliance and Enforcement

Compliance with this policy is mandatory for all NextSlide employees and contractors. The CTO shall verify compliance through:

- Periodic spot checks of workstation encryption status
- Review of device security configurations during onboarding and annually thereafter
- Verification of cloud provider physical security attestations during annual vendor reviews

Violations of this policy may result in:

- Mandatory remedial action (e.g., immediate encryption of an unencrypted device)
- Formal written warning
- Revocation of system access until compliance is achieved
- Disciplinary action, up to and including termination

Loss of an unencrypted device containing NextSlide data constitutes a security incident and will be handled per NEXTSLIDE-POL-04 (Incident Response Plan).

## 8. Exceptions

Exceptions to this policy must be submitted in writing to the CTO and must include:

- Description of the exception and the specific policy requirement that cannot be met
- Justification (e.g., a device that does not support full disk encryption)
- Compensating controls (e.g., strong application-level encryption, restricted data access)
- Duration of the exception

Exceptions to disk encryption or screen lock requirements require approval from both the CEO and CTO due to the direct risk to data confidentiality.

## 9. Review Schedule

| Activity | Frequency | Responsible Party |
|---|---|---|
| Policy review and update | Annually | CTO |
| Cloud provider physical security attestation review | Annually (as part of vendor review) | CTO |
| Workstation security compliance check | Semi-annually | CTO / Engineering Team |
| Clean desk compliance spot checks | Quarterly | CTO |
| Disposal log review | Annually | CTO |
| Home office security guideline review | Annually | CTO |

## 10. Revision History

| Version | Date | Author | Description |
|---|---|---|---|
| 1.0 | February 1, 2026 | CTO | Initial policy creation |

---

**SOC 2 Trust Service Criteria:** CC6.4, CC6.5
