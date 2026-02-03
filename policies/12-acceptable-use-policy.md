# Acceptable Use Policy

| Field | Value |
|---|---|
| **Document ID** | NEXTSLIDE-POL-12 |
| **Version** | 1.0 |
| **Classification** | Internal |
| **Effective Date** | February 1, 2026 |
| **Last Review Date** | February 1, 2026 |
| **Next Review Date** | February 1, 2027 |
| **Policy Owner** | CEO |
| **Approved By** | CEO / CTO |

## 1. Purpose

This policy defines the acceptable use of NextSlide company systems, infrastructure, and resources by all personnel. It establishes clear expectations for responsible behavior when interacting with development tools, production infrastructure, customer data, and third-party services to protect NextSlide, its customers, and its employees from security risks, legal liability, and reputational harm.

## 2. Scope

This policy applies to:

- All employees, contractors, interns, and temporary workers with access to NextSlide systems
- All company-owned and personally owned devices used to access NextSlide resources (BYOD)
- All NextSlide infrastructure: GitHub repositories, Render hosting, Supabase database and auth services, Stripe payment integration, and AI provider APIs (Anthropic, OpenAI, Google Gemini)
- All forms of electronic communication conducted through or about NextSlide systems

## 3. Definitions

| Term | Definition |
|---|---|
| **Company Systems** | All hardware, software, services, and infrastructure operated or licensed by NextSlide, including GitHub, Render, Supabase, Stripe, and AI provider accounts |
| **BYOD** | Bring Your Own Device; a personally owned device used to access company systems |
| **Sensitive Data** | Any data classified as Confidential or Restricted under NEXTSLIDE-POL-06, including customer content, authentication credentials, and payment information |
| **AI Provider** | A third-party service (Anthropic, OpenAI, Google Gemini) to which NextSlide sends user content for AI-powered presentation generation |
| **Production Environment** | The live Render-hosted infrastructure serving NextSlide customers, including the frontend static site, FastAPI backend, and Supabase database |
| **Exfiltration** | The unauthorized transfer of data from company systems to external destinations |

## 4. Policy Statements

### 4.1 General Use of Company Systems

NextSlide provides access to development and production systems for business purposes. Personnel are expected to use these systems responsibly, professionally, and in accordance with all company policies. Limited personal use is permitted provided it does not interfere with job responsibilities, consume excessive resources, or introduce security risks.

### 4.2 Development Infrastructure

The following systems are authorized for NextSlide development and operations:

| System | Authorized Use |
|---|---|
| **GitHub** | Source code management, pull requests, code review, CI/CD pipelines, issue tracking |
| **Render** | Application hosting, environment variable management, deployment, logs |
| **Supabase Dashboard** | Database management, Auth configuration, RLS policy management, API key management |
| **Stripe Dashboard** | Payment configuration, subscription management, webhook management |
| **AI Provider Consoles** | API key management, usage monitoring, model configuration |

Access to these systems MUST be limited to the minimum necessary for the individual's role. Production dashboards (Render, Supabase, Stripe) require explicit authorization from the CTO as defined in NEXTSLIDE-POL-02.

### 4.3 Device Security Requirements

All devices used to access NextSlide systems -- whether company-owned or personal (BYOD) -- MUST meet the following minimum security standards:

1. **Full-disk encryption** MUST be enabled (e.g., FileVault on macOS, BitLocker on Windows, LUKS on Linux).
2. **Screen lock** MUST activate automatically after no more than 5 minutes of inactivity and require authentication to unlock.
3. **Operating system and software** MUST be kept up to date with the latest security patches. Critical patches MUST be applied within 14 days of release.
4. **Antimalware protection** is required on Windows devices and recommended on all other platforms.
5. **Devices MUST NOT be jailbroken or rooted** if used to access NextSlide systems.

### 4.4 Remote Work Security

NextSlide operates as a remote-friendly organization. Personnel accessing company systems remotely MUST observe the following:

1. **Network Security**: Use of a VPN is recommended when connecting from public or untrusted networks (coffee shops, airports, hotels). Home Wi-Fi networks MUST use WPA2 or WPA3 encryption with a strong passphrase.
2. **Physical Security**: Devices must not be left unattended in public spaces. Screens must be positioned to prevent shoulder surfing when working in public.
3. **Secure Connections**: All access to NextSlide infrastructure is over HTTPS/TLS. Personnel MUST NOT disable certificate validation or use unencrypted protocols for any system interaction.

### 4.5 Prohibited Activities

The following activities are strictly prohibited:

1. **Unauthorized Access**: Attempting to access systems, accounts, or data beyond one's authorized permissions, including attempting to bypass Row-Level Security policies, manipulating JWTs, or using the Supabase service key without authorization.
2. **Data Exfiltration**: Copying, transferring, or transmitting NextSlide customer data, source code, or credentials to unauthorized external systems, personal accounts, or third parties.
3. **Security Control Bypass**: Disabling, circumventing, or tampering with security controls including rate limiters, `ProtectedRoute` or `AdminProtectedRoute` guards, `PIIRedactionFilter`, or RLS policies.
4. **Credential Misuse**: Sharing passwords, API keys, or access tokens with unauthorized individuals. Using another person's credentials. Storing credentials in source code, wikis, or messaging platforms.
5. **Malicious Activity**: Deploying malware, running unauthorized network scans, performing denial-of-service attacks, or engaging in any activity that disrupts NextSlide services.
6. **Unauthorized Data Processing**: Sending customer data to services not approved for NextSlide use, or processing data in ways inconsistent with NextSlide's privacy commitments and data classification standards.
7. **License Violations**: Using software in violation of its license terms or installing pirated software on devices used to access NextSlide systems.

### 4.6 AI Provider Usage Guidelines

NextSlide integrates with Anthropic, OpenAI, and Google Gemini to generate presentation content. The following rules govern the use of AI providers:

1. **Authorized Data**: User-submitted presentation prompts and content are sent to AI providers for processing as part of normal platform operation. This is the intended and authorized use of these services.
2. **Prohibited Submissions**: Personnel MUST NOT manually submit the following to AI provider consoles or playgrounds: NextSlide source code, infrastructure credentials, customer personally identifiable information (PII), or data classified as Restricted under NEXTSLIDE-POL-06.
3. **Development and Testing**: When using AI provider APIs for development or testing, use synthetic or anonymized data. Do not use real customer content.
4. **Data Retention Awareness**: Personnel should be aware that AI providers may retain submitted data per their own data processing agreements. All data sent to AI providers must be consistent with NextSlide's contractual obligations with those providers.
5. **New AI Services**: Integrating with any AI provider or model not already approved (Anthropic, OpenAI, Google Gemini) requires written approval from the CTO.

### 4.7 Software Installation

1. Personnel may install development tools and software necessary for their role without prior approval, provided the software is obtained from legitimate sources and is appropriately licensed.
2. Installation of the following categories of software requires CTO approval: network scanning tools, remote access tools (beyond standard SSH), security testing tools, and any software that modifies system network configuration.
3. Browser extensions with broad permissions (access to all sites, ability to read page content) are discouraged on browsers used to access NextSlide production dashboards.

### 4.8 Email and Communications

1. Company communication channels (email, Slack, messaging) are provided for business use. Communications should be professional, respectful, and compliant with company values.
2. Credentials, API keys, tokens, and other secrets MUST NOT be transmitted via email, Slack messages, or any unencrypted communication channel. Use the approved secrets management process (Render environment variables) as defined in NEXTSLIDE-POL-13.
3. Personnel should exercise caution with links and attachments in unsolicited messages to prevent phishing attacks.

### 4.9 Data Handling

All data handled by NextSlide personnel MUST be treated according to its classification level as defined in NEXTSLIDE-POL-06 (Data Classification and Handling Policy). Key principles include:

1. **Customer Content**: Presentation data, uploaded attachments, and user-generated content are classified as Confidential. Access is restricted by RLS policies in production and by role-based access in administrative contexts.
2. **Credentials and Keys**: All authentication credentials, API keys, and encryption keys are classified as Restricted. They MUST be stored only in approved locations (Render environment variables, Supabase Auth, hashed in database).
3. **Payment Data**: Stripe handles all card data. NextSlide systems never process, store, or transmit cardholder data. Personnel MUST NOT attempt to access or intercept payment information.
4. **Logs**: Production logs are filtered by `PIIRedactionFilter` to redact emails, tokens, and API keys. Personnel accessing raw logs must treat them as Confidential.

### 4.10 Monitoring Notice

NextSlide reserves the right to monitor, log, audit, and review all activity on company systems, including but not limited to network traffic, application access logs, administrative actions, and deployment activity. Monitoring is conducted to ensure compliance with company policies, detect security incidents, and maintain system integrity. By using NextSlide systems, personnel acknowledge and consent to this monitoring. Admin access attempts are audit-logged as described in NEXTSLIDE-POL-02.

### 4.11 BYOD Policy

Personnel who use personal devices to access NextSlide systems accept the following conditions:

1. The device MUST meet all security requirements defined in Section 4.3.
2. NextSlide source code and customer data stored locally on personal devices MUST be limited to what is necessary for current work and removed when no longer needed.
3. In the event of device loss, theft, or personnel separation, the individual must report the incident immediately and cooperate with any remote wipe or access revocation procedures.
4. NextSlide is not responsible for loss of personal data on BYOD devices resulting from security measures taken to protect company data.

### 4.12 Social Media Guidelines

1. Personnel MUST NOT disclose confidential or proprietary NextSlide information on social media platforms, including system architecture details, security configurations, customer data, or internal business metrics.
2. When posting about NextSlide in a professional capacity, personnel should clearly indicate they are representing the company and adhere to approved messaging.
3. Personal social media activity should not create the appearance of speaking on behalf of NextSlide unless authorized to do so.

## 5. Roles and Responsibilities

| Role | Responsibility |
|---|---|
| **CEO (Policy Owner)** | Maintains this policy; sets organizational expectations for acceptable use; approves exceptions |
| **CTO** | Enforces technical controls supporting this policy; approves software installation exceptions; approves new AI provider integrations |
| **Engineering Team** | Adheres to development infrastructure guidelines; maintains security controls; reports violations |
| **All Personnel** | Read, understand, and comply with this policy; report violations or suspected security incidents; maintain device security |
| **Team Leads** | Ensure team members understand acceptable use requirements; escalate compliance concerns |

## 6. Related Policies

| Document ID | Policy Title |
|---|---|
| NEXTSLIDE-POL-01 | Information Security Policy |
| NEXTSLIDE-POL-06 | Data Classification and Handling Policy |
| NEXTSLIDE-POL-19 | Vendor Management Policy |

## 7. Compliance and Enforcement

Compliance with this policy is mandatory for all personnel with access to NextSlide systems. Violations are taken seriously and may result in:

- Verbal or written warning for minor or first-time violations
- Temporary suspension of system access pending investigation
- Termination of employment or contract for serious or repeated violations
- Legal action in cases involving data theft, unauthorized disclosure, or malicious activity

Suspected violations should be reported to the CEO or CTO. All reports are investigated and treated confidentially to the extent possible.

## 8. Exceptions

Exceptions to this policy require written approval from the CEO. Exception requests must include the specific policy provision being exempted, the business justification, the risk to NextSlide, proposed compensating controls, and a proposed duration. Approved exceptions are documented and reviewed semi-annually. Security research or penetration testing activities conducted with CTO authorization are exempt from Section 4.5 prohibitions for the approved scope and duration.

## 9. Review Schedule

This policy is reviewed annually by the CEO in coordination with the CTO. Reviews assess whether the policy reflects current company systems, work practices, and threat landscape. Out-of-cycle reviews may be triggered by significant changes in infrastructure (e.g., new hosting provider, new AI integrations), security incidents, or employee feedback.

## 10. Revision History

| Version | Date | Author | Description |
|---|---|---|---|
| 1.0 | February 1, 2026 | CEO | Initial policy creation |

---

**SOC 2 Trust Service Criteria:** CC1.1, CC1.4, CC6.8
