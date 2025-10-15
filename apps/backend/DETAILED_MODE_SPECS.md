# Detailed Mode Specifications

## Overview
When users select "Detailed" mode, they want DATA-RICH, COMPREHENSIVE presentations with extensive breakdowns, multiple data points, and deep analysis.

---

## Key Differences: Simple vs Detailed

### Simple/Standard Mode (Presentation)
- **Bullets**: 8-15 words, concise and focused
- **Words per Slide**: 100-150 words
- **Data Points**: Minimal, only when essential
- **Slide Count**: Standard (e.g., 8-10 slides for a topic)
- **Charts**: Only when necessary (~10-20% of slides)
- **Breakdowns**: Single slide per major topic

### Detailed Mode (Detailed Analysis - DATA-RICH)
- **Bullets**: 20-35 words with specific data and context
- **Words per Slide**: 250-400 words
- **Data Points**: MULTIPLE on EVERY slide (numbers, %, dates, specifics)
- **Slide Count**: 20-30% MORE slides (e.g., 12-15+ slides for same topic)
- **Charts**: 40-50% of slides have charts
- **Breakdowns**: 2-3 slides per major topic with granular details

---

## Detailed Mode Requirements

### 1. Bullet Structure
Each bullet should be 20-35 words and include:
- **Specific numbers** (not "significant growth" but "47% YoY growth")
- **Percentages** and metrics
- **Dates** and timeframes
- **Company names** and specific examples
- **Study results** with citations
- **Additional context** and supporting details

**Example:**
```
❌ Presentation: Market is growing rapidly
✅ Detailed Analysis: Global AI market reached $136.5B in 2024, growing at 37.3% CAGR, 
   driven primarily by healthcare ($45B, +52% YoY), automotive ($28B, +38% YoY), 
   and financial services sectors ($19B, +44% YoY), with North America leading adoption
```

### 2. Multi-Level Bullets (Sub-bullets)
Use sub-bullets (indented with 2 spaces) for:
- Supporting data and breakdowns
- Examples and case studies
- Contextual information
- Regional or segment-specific details

**Example:**
```
• AI adoption in healthcare reached $45B in 2024, with 78% growth YoY
  • Electronic health records (EHR) systems: $18.5B (41% of healthcare AI)
  • Medical imaging analysis: $12.2B (27%), reducing diagnosis time by 42%
  • Drug discovery and development: $8.9B (20%), accelerating trials by 6-9 months
  • Virtual health assistants: $5.4B (12%), handling 65% of routine inquiries
```

### 3. Slide Breakdowns
Break down EVERY major topic into 2-3 granular slides:

**Instead of:**
- "Market Overview" (1 slide)

**Create:**
- "Market Size & Growth Trajectory" (1 slide)
  - Global market size, CAGR, historical growth
  - Market maturity by region
  - Growth drivers and accelerators
  
- "Market Segments Analysis" (1 slide)
  - Breakdown by industry vertical with market share
  - Product/service category breakdown
  - Customer segment analysis
  
- "Regional Market Breakdown" (1 slide)
  - North America, Europe, APAC, LATAM, MEA markets
  - Regional growth rates and opportunities
  - Regulatory differences impacting adoption

### 4. Chart Density
Include charts on **40-50%** of content slides:
- Bar/column charts for comparisons
- Line charts for trends over time
- Pie charts for market share breakdowns
- Each chart should have 5-8 data points

### 5. Metadata & Sources
Every slide should have:
- **Subtitle**: Contextual information under the main title
- **Captions**: Sources, dates, study names
- **Citations**: Link to research, reports, company data

**Example:**
```
Title: Market Size & Growth Trajectory
Subtitle: Global AI Market Analysis 2020-2024 with 2025-2030 Projections

[Content with data]

Caption: Source: McKinsey Global AI Report 2024, Gartner Market Analysis Q3 2024
```

### 6. Specificity Requirements
NO generic statements! Every claim needs specific data:

**❌ Bad (Generic):**
- "Many companies are adopting AI"
- "Costs have decreased significantly"
- "Customer satisfaction improved"

**✅ Good (Specific):**
- "73% of Fortune 500 companies deployed AI in operations by Q3 2024, up from 41% in 2022"
- "Average cloud AI compute costs dropped from $2.45/hour to $0.78/hour (68% reduction) between 2023-2024"
- "Enterprise customers reported 42-point NPS increase (from 38 to 80) following AI chatbot implementation, with response times improving from 4.2 to 0.8 minutes"

### 7. Depth Requirements
For each topic, explain:
- **WHY**: Root causes, drivers, motivations
- **HOW**: Mechanisms, processes, technical details
- **WHAT**: Outcomes, results, deliverables
- **WHO**: Stakeholders, players, beneficiaries
- **WHEN**: Timelines, milestones, deadlines
- **WHERE**: Geographic, market, or organizational locations

### 8. Examples & Case Studies
Include real-world examples:
- Company names (e.g., "Microsoft Azure's AI revenue grew 54% to $6.8B in Q2 2024")
- Case studies (e.g., "Mayo Clinic's AI diagnostic system reduced false positives by 31%")
- Specific implementations (e.g., "Toyota's predictive maintenance AI saved $47M annually across 14 plants")

### 9. Comparative Data
Whenever possible, include:
- Year-over-year comparisons
- Before/after metrics
- Industry benchmarks
- Competitor comparisons
- Regional differences

**Example:**
```
• Cloud AI adoption increased 127% YoY (2023: 34% → 2024: 77% of enterprises)
  • North America leads at 84% adoption, followed by Europe (71%) and APAC (69%)
  • Small businesses (50-250 employees) saw 156% growth in adoption
  • Compared to traditional on-premise AI (12% adoption), cloud-native dominates
```

---

## Slide Count Guidance

### Standard Mode Examples
- **Topic: "AI in Healthcare"** → 8-10 slides
  1. Title
  2. Current Healthcare Challenges
  3. AI Solutions Overview
  4. Key Use Cases
  5. Benefits & Results
  6. Implementation Considerations
  7. Future Outlook
  8. Conclusion

### Detailed Mode Examples
- **Topic: "AI in Healthcare"** → 12-16 slides
  1. Title
  2. Healthcare Landscape: Current Challenges & Pain Points
  3. Global Healthcare AI Market: Size, Growth & Projections
  4. Healthcare AI Segments: EHR, Imaging, Drug Discovery, Virtual Health
  5. Medical Imaging AI: Technologies, Accuracy, and Cost Savings
  6. Electronic Health Records: AI-Powered Data Management & Insights
  7. Drug Discovery & Development: AI Acceleration & Success Rates
  8. Virtual Health Assistants: Patient Engagement & Efficiency Gains
  9. Clinical Outcomes: Before/After Data from Leading Hospitals
  10. ROI Analysis: Cost Savings, Time Reduction, and Patient Outcomes
  11. Implementation: Technical Requirements, Timelines, and Challenges
  12. Regulatory Landscape: FDA Approvals, HIPAA, and Compliance
  13. Regional Adoption: US, Europe, APAC Healthcare AI Comparison
  14. Future Trends: 2025-2030 Projections and Emerging Technologies
  15. Conclusion & Recommendations

---

## Implementation in Prompts

The detailed mode specifications are implemented in:
1. `apps/backend/services/outline/generator.py` - Perplexity outline generation
2. `apps/backend/agents/prompts/generation/outline_prompts.py` - General outline prompts

Key prompt sections:
- **DETAIL LEVEL GUIDANCE**: Sets expectations for bullet length, word count, data density
- **BULLET LIMITS**: Increases from 3-5 to 5-8 bullets per slide
- **Slide Breakdown Instructions**: Explicit examples of how to split topics
- **Chart Density**: Target 40-50% vs 10-20%
- **Metadata Requirements**: Subtitles, captions, sources on every slide

---

## Testing Checklist

When testing detailed mode, verify:
- [ ] Bullets are 15-25 words each with specific data
- [ ] 5-8 bullets per content slide (not 3-5)
- [ ] Sub-bullets present with supporting details
- [ ] Multiple data points on every slide (numbers, %, dates)
- [ ] 20-30% more slides than standard mode
- [ ] Charts present on ~40-50% of slides
- [ ] Subtitles and captions on every slide
- [ ] NO generic statements - all claims backed by specific data
- [ ] Real company names, case studies, and examples
- [ ] Comparative data (YoY, before/after, benchmarks)
- [ ] WHY/HOW/WHAT explanations with supporting data

---

## Example Comparison

### Simple Mode Slide
**Title: Market Growth**
```
• AI market is growing rapidly
• Many companies are investing in AI
• Expected to continue growing
• Key sectors include healthcare and finance
```
**Total: ~60 words, 0 specific data points**

### Detailed Mode Slide
**Title: Market Size & Growth Trajectory**
**Subtitle: Global AI Market 2020-2024 with 2025-2030 Projections**
```
• Global AI market reached $136.5 billion in 2024, growing at 37.3% CAGR from $62.4B in 2020, 
  with enterprise AI spending comprising 68% ($92.8B) of total market value
  • North America accounts for $54.6B (40%), followed by APAC $40.9B (30%), Europe $32.8B (24%)
  • Enterprise AI adoption increased from 34% (2020) to 77% (2024) among Fortune 500 companies
  
• Healthcare AI market leads at $45.2B (33% of total), growing 42% YoY, driven by 
  medical imaging ($12.2B), EHR systems ($18.5B), and drug discovery ($8.9B)
  • Mayo Clinic reported 31% reduction in false positives using AI diagnostics
  • FDA approved 87 new AI-powered medical devices in 2024, up from 23 in 2020
  
• Automotive AI reached $28.4B (21%), with autonomous driving systems ($16.2B) and 
  predictive maintenance ($7.8B) as primary use cases
  • Tesla's FSD Beta reduced accident rates by 47% across 2.1M miles of autonomous driving
  • GM's AI-powered manufacturing optimization saved $127M annually across 12 plants
  
• Financial services AI grew to $26.7B (20%), with fraud detection ($11.2B) and 
  algorithmic trading ($9.3B) leading adoption
  • JPMorgan's COIN AI reviews 12,000 contracts in seconds vs 360,000 hours manually
  • Visa prevented $25B in fraud using AI algorithms, detecting anomalies 92% faster

[Chart: AI Market by Sector 2020-2024 with bar chart showing growth]

Caption: Source: McKinsey Global AI Report 2024, Gartner Market Analysis Q3 2024, 
Company earnings reports Q4 2024
```
**Total: ~230 words, 40+ specific data points, 4 major bullets with sub-bullets**

---

This specification ensures that detailed mode delivers the data-rich, comprehensive presentations users expect when they select that option.

