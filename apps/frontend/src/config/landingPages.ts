export interface UseCaseDetail {
  name: string;
  description: string;
  examplePrompt: string;
  icon: string;
}

export interface LandingPageConfig {
  slug: string;
  title: string;
  metaTitle: string;
  metaDescription: string;
  headline: string;
  subheadline: string;
  features: { icon: string; title: string; description: string }[];
  useCases: string[];
  useCaseDetails?: UseCaseDetail[]; // Rich use case details for expandable section
  ctaText: string;
  ctaSubtext: string;
  templateCategory?: string; // Links to template gallery category
  communityCategory?: string; // Maps to community/showcase category for featured decks
  heroGradient: string; // Tailwind gradient classes
}

// Use-Case Landing Pages
export const useCaseLandingPages: LandingPageConfig[] = [
  {
    slug: 'pitch-deck',
    title: 'AI Pitch Deck Maker',
    metaTitle: 'Create a Pitch Deck in 60 Seconds with AI | NextSlide',
    metaDescription: 'Generate professional pitch decks instantly with AI. Perfect for startups, fundraising, and investor presentations. Free to start.',
    headline: 'Create a Pitch Deck in 60 Seconds',
    subheadline: 'AI-powered pitch decks that impress investors. Just describe your startup and watch the magic happen.',
    features: [
      { icon: 'Zap', title: 'Instant Generation', description: 'Describe your startup and get a complete pitch deck in seconds' },
      { icon: 'TrendingUp', title: 'Investor-Ready', description: 'Professional layouts designed for fundraising success' },
      { icon: 'Palette', title: 'Fully Customizable', description: 'Edit every slide, chart, and visual to match your brand' },
      { icon: 'Share2', title: 'Easy Sharing', description: 'Share with investors via link or export to PowerPoint' },
    ],
    useCases: ['Seed Round Pitch', 'Series A Deck', 'Demo Day Presentation', 'Investor Update'],
    useCaseDetails: [
      { name: 'Seed Round Pitch', description: 'Craft a compelling narrative that turns a 10-minute coffee chat into a term sheet. AI structures your problem, solution, market size, and ask into a format VCs actually read.', examplePrompt: 'Seed round pitch deck for an AI-powered legal tech startup raising $2M', icon: 'Sparkles' },
      { name: 'Series A Deck', description: 'Show momentum, market ownership, and a clear path to 10x. AI builds data-heavy slides with growth charts, cohort analysis, and unit economics that tell your scaling story.', examplePrompt: 'Series A deck showing 3x YoY growth for a B2B SaaS platform', icon: 'TrendingUp' },
      { name: 'Demo Day Presentation', description: 'Every second counts on stage. AI creates ultra-concise slides with one big idea per screen — designed to be digested in 15 seconds flat.', examplePrompt: 'YC Demo Day pitch for a marketplace connecting freelance designers', icon: 'Zap' },
      { name: 'Investor Update', description: 'Keep your investors engaged and responsive. AI formats your KPIs, milestones, and asks into a clean monthly or quarterly update they actually look forward to.', examplePrompt: 'Monthly investor update showing MRR growth and product milestones', icon: 'BarChart3' },
    ],
    ctaText: 'Create Your Pitch Deck Free',
    ctaSubtext: 'No credit card required. Generate your first deck in 60 seconds.',
    templateCategory: 'business',
    communityCategory: 'business',
    heroGradient: 'from-blue-600 via-purple-600 to-indigo-700',
  },
  {
    slug: 'sales-deck',
    title: 'AI Sales Deck Maker',
    metaTitle: 'AI-Powered Sales Presentations | NextSlide',
    metaDescription: 'Create compelling sales decks with AI. Close more deals with professional presentations that highlight your value proposition.',
    headline: 'Sales Presentations That Close Deals',
    subheadline: 'AI creates persuasive sales decks tailored to your product, audience, and goals.',
    features: [
      { icon: 'Target', title: 'Audience-Focused', description: 'AI tailors messaging to your target customer persona' },
      { icon: 'BarChart3', title: 'Data-Driven', description: 'Automatic charts and metrics that prove your value' },
      { icon: 'Sparkles', title: 'Professional Design', description: 'Polished slides that reflect enterprise quality' },
      { icon: 'Clock', title: 'Save Hours', description: 'What takes hours manually, AI does in seconds' },
    ],
    useCases: ['Product Demo', 'Quarterly Business Review', 'Client Proposal', 'Partnership Pitch'],
    useCaseDetails: [
      { name: 'Product Demo', description: 'Transform feature walkthroughs into stories that convert. AI builds demo decks that lead with the problem, wow with the solution, and end with an irresistible next step.', examplePrompt: 'Product demo deck for a project management tool targeting enterprise teams', icon: 'Sparkles' },
      { name: 'Quarterly Business Review', description: 'Present clean metrics that prove your value. AI organizes retention data, expansion revenue, and support SLAs into a QBR your champion can forward to their VP.', examplePrompt: 'QBR presentation showing 40% efficiency improvement for a logistics client', icon: 'BarChart3' },
      { name: 'Client Proposal', description: 'Win deals with proposals that sell themselves. AI structures pain points, your solution, ROI projections, and pricing into a format that closes.', examplePrompt: 'Client proposal for a $200K digital transformation consulting engagement', icon: 'Target' },
      { name: 'Partnership Pitch', description: 'Align roadmaps and win strategic partners. AI creates decks that show mutual value, integration opportunities, and a clear co-selling framework.', examplePrompt: 'Partnership pitch deck for a CRM integration targeting Salesforce ecosystem', icon: 'Users' },
    ],
    ctaText: 'Build Your Sales Deck',
    ctaSubtext: 'Start free. Upgrade when you need more.',
    templateCategory: 'business',
    communityCategory: 'business',
    heroGradient: 'from-emerald-600 via-teal-600 to-cyan-700',
  },
  {
    slug: 'education',
    title: 'AI Presentations for Education',
    metaTitle: 'Create Course Materials with AI | NextSlide for Education',
    metaDescription: 'Generate engaging educational presentations with AI. Perfect for lectures, courses, workshops, and training materials.',
    headline: 'Create Course Materials in Minutes',
    subheadline: 'AI-powered presentations for educators who want to focus on teaching, not slide design.',
    features: [
      { icon: 'GraduationCap', title: 'Educational Layouts', description: 'Designs optimized for learning and retention' },
      { icon: 'BookOpen', title: 'Content-Rich', description: 'AI generates comprehensive, accurate content' },
      { icon: 'Users', title: 'Student-Friendly', description: 'Clear, engaging visuals that keep students focused' },
      { icon: 'Download', title: 'Multi-Format', description: 'Export as slides, PDF handouts, or web pages' },
    ],
    useCases: ['University Lectures', 'Online Courses', 'Workshop Materials', 'Training Programs'],
    useCaseDetails: [
      { name: 'University Lectures', description: 'Build complete lecture decks in minutes instead of hours. AI creates structured slides with learning objectives, key concepts, diagrams, and review questions your students will actually engage with.', examplePrompt: 'Introductory psychology lecture covering cognitive biases and decision-making', icon: 'GraduationCap' },
      { name: 'Online Courses', description: 'Create module-by-module course content that keeps students coming back. AI designs visually consistent slides with clear progression and built-in knowledge checks.', examplePrompt: 'Online course module on Python programming for data science beginners', icon: 'BookOpen' },
      { name: 'Workshop Materials', description: 'Interactive workshops need great slides. AI creates materials with exercise instructions, group activity frameworks, and clear takeaways participants can reference later.', examplePrompt: 'Design thinking workshop for product managers with hands-on exercises', icon: 'Users' },
      { name: 'Training Programs', description: 'Onboard faster with professional training materials. AI builds structured programs with skills checklists, process diagrams, and assessment checkpoints.', examplePrompt: 'New employee onboarding training covering company tools and workflows', icon: 'Sparkles' },
    ],
    ctaText: 'Create Your First Lesson',
    ctaSubtext: 'Free for educators. No design skills needed.',
    templateCategory: 'education',
    communityCategory: 'education',
    heroGradient: 'from-amber-500 via-orange-500 to-red-500',
  },
  {
    slug: 'marketing',
    title: 'AI Marketing Presentations',
    metaTitle: 'Marketing Presentation Templates | NextSlide AI',
    metaDescription: 'Create stunning marketing presentations with AI. Strategy decks, campaign reports, social media plans, and more.',
    headline: 'Marketing Presentations That Stand Out',
    subheadline: 'From strategy decks to campaign reports, AI creates presentations that make your marketing shine.',
    features: [
      { icon: 'Megaphone', title: 'Brand-Aligned', description: 'AI matches your brand colors, fonts, and voice' },
      { icon: 'LineChart', title: 'Metrics & Analytics', description: 'Beautiful charts showing campaign performance' },
      { icon: 'Lightbulb', title: 'Creative Layouts', description: 'Eye-catching designs that capture attention' },
      { icon: 'Repeat', title: 'Easy Updates', description: 'Quickly update decks for weekly or monthly reports' },
    ],
    useCases: ['Marketing Strategy', 'Campaign Report', 'Social Media Plan', 'Content Calendar'],
    useCaseDetails: [
      { name: 'Marketing Strategy', description: 'Present your marketing vision with authority. AI builds strategy decks with market analysis, channel plans, budget allocation charts, and KPI frameworks that get executive buy-in.', examplePrompt: 'Q1 marketing strategy deck for a DTC skincare brand entering the US market', icon: 'Target' },
      { name: 'Campaign Report', description: 'Turn campaign data into a compelling story. AI creates reports with conversion funnels, A/B test results, ROI breakdowns, and clear recommendations that justify your spend.', examplePrompt: 'Monthly campaign performance report showing 3x ROAS on paid social', icon: 'BarChart3' },
      { name: 'Social Media Plan', description: 'Plan your social presence with precision. AI generates platform strategies, content calendars, audience analysis, and benchmark metrics in a shareable deck.', examplePrompt: 'Social media strategy for a B2B SaaS company launching on LinkedIn and Twitter', icon: 'Megaphone' },
      { name: 'Content Calendar', description: 'Visualize your content roadmap beautifully. AI creates calendar decks with content pillars, publishing schedules, theme weeks, and performance tracking frameworks.', examplePrompt: 'Q2 content calendar for a fitness brand across blog, YouTube, and Instagram', icon: 'Lightbulb' },
    ],
    ctaText: 'Create Marketing Deck',
    ctaSubtext: 'Professional presentations in seconds.',
    templateCategory: 'marketing',
    communityCategory: 'marketing',
    heroGradient: 'from-pink-600 via-rose-600 to-red-600',
  },
];

// Industry Landing Pages
export const industryLandingPages: LandingPageConfig[] = [
  {
    slug: 'startups',
    title: 'NextSlide for Startups',
    metaTitle: 'AI Presentations for Startups | NextSlide',
    metaDescription: 'The fastest way for startups to create pitch decks, investor updates, and team presentations. Used by 1000+ startups.',
    headline: 'The Startup Presentation Tool',
    subheadline: 'From pitch decks to board updates, create professional presentations as fast as your startup moves.',
    features: [
      { icon: 'Rocket', title: 'Move Fast', description: 'Generate decks in seconds, not hours' },
      { icon: 'DollarSign', title: 'Free to Start', description: 'Generous free tier for early-stage startups' },
      { icon: 'Users', title: 'Team Collaboration', description: 'Share and collaborate with your whole team' },
      { icon: 'Award', title: 'Investor-Ready', description: 'Professional designs that impress VCs' },
    ],
    useCases: ['Pitch Deck', 'Investor Update', 'Board Meeting', 'Product Demo', 'Team All-Hands'],
    useCaseDetails: [
      { name: 'Pitch Deck', description: 'Your startup deserves slides as ambitious as your vision. AI creates pitch decks with market sizing charts, traction metrics, and competitive moats that make VCs lean forward.', examplePrompt: 'Pitch deck for a fintech startup disrupting cross-border payments', icon: 'Rocket' },
      { name: 'Investor Update', description: 'Keep investors engaged between rounds. AI formats your monthly wins, KPIs, burn rate, and asks into a polished update they actually read and respond to.', examplePrompt: 'Monthly investor update for a Series A healthtech startup', icon: 'BarChart3' },
      { name: 'Board Meeting', description: 'Walk into the board room prepared. AI builds structured board decks with financial dashboards, strategic initiative updates, risk registers, and decision items.', examplePrompt: 'Quarterly board meeting deck with financial review and 2025 strategy', icon: 'Briefcase' },
      { name: 'Product Demo', description: 'Show, don\'t tell. AI creates product demo decks with clean workflow diagrams, feature highlights, and competitive comparisons that turn demos into deals.', examplePrompt: 'Product demo deck for an AI writing assistant targeting enterprise teams', icon: 'Sparkles' },
      { name: 'Team All-Hands', description: 'Energize your team with transparent, inspiring all-hands decks. AI builds presentations with company metrics, team wins, roadmap updates, and culture moments.', examplePrompt: 'Monthly all-hands deck celebrating milestones and sharing product roadmap', icon: 'Users' },
    ],
    ctaText: 'Start Building Free',
    ctaSubtext: 'Join 1,000+ startups using NextSlide.',
    communityCategory: 'business',
    heroGradient: 'from-violet-600 via-purple-600 to-fuchsia-600',
  },
  {
    slug: 'educators',
    title: 'NextSlide for Educators',
    metaTitle: 'AI Presentations for Educators | NextSlide',
    metaDescription: 'Save hours on lesson planning. AI creates engaging educational presentations for lectures, courses, and workshops.',
    headline: 'Presentations Made for Teaching',
    subheadline: 'Spend less time on slides, more time on students. AI creates beautiful educational content.',
    features: [
      { icon: 'Clock', title: 'Save Time', description: 'Create a full lecture in minutes, not hours' },
      { icon: 'Brain', title: 'Engaging Content', description: 'AI creates content optimized for learning' },
      { icon: 'Palette', title: 'Visual Learning', description: 'Automatic diagrams, charts, and illustrations' },
      { icon: 'Share2', title: 'Easy Distribution', description: 'Share slides with students via link or export' },
    ],
    useCases: ['Lecture Slides', 'Course Modules', 'Workshop Materials', 'Student Handouts'],
    useCaseDetails: [
      { name: 'Lecture Slides', description: 'Create full lecture decks with learning objectives, concept explanations, visual diagrams, and review questions — all structured for maximum student engagement and retention.', examplePrompt: 'Organic chemistry lecture covering reaction mechanisms and stereochemistry', icon: 'GraduationCap' },
      { name: 'Course Modules', description: 'Build self-contained modules that work in any LMS. AI creates consistent, progressive content with built-in assessments and clear learning pathways.', examplePrompt: 'Data analytics course module on SQL fundamentals for business students', icon: 'BookOpen' },
      { name: 'Workshop Materials', description: 'Make workshops unforgettable. AI designs interactive slides with timed exercises, group discussion prompts, and takeaway checklists participants keep.', examplePrompt: 'Creative writing workshop with guided exercises and peer review framework', icon: 'Users' },
      { name: 'Student Handouts', description: 'Give students something worth keeping. AI generates clean summary slides with key formulas, concept maps, and study guides they can reference for exams.', examplePrompt: 'Study guide handout for AP Biology covering genetics and evolution', icon: 'Download' },
    ],
    ctaText: 'Create Your First Lesson',
    ctaSubtext: 'Free for individual educators.',
    communityCategory: 'education',
    heroGradient: 'from-sky-500 via-blue-600 to-indigo-600',
  },
  {
    slug: 'marketers',
    title: 'NextSlide for Marketers',
    metaTitle: 'AI Presentations for Marketers | NextSlide',
    metaDescription: 'Create marketing presentations, strategy decks, and campaign reports in seconds with AI.',
    headline: 'Marketing Decks, Supercharged',
    subheadline: 'Strategy presentations, campaign reports, and pitches -- all generated by AI in your brand style.',
    features: [
      { icon: 'Zap', title: 'Instant Decks', description: 'From brief to beautiful deck in 60 seconds' },
      { icon: 'BarChart3', title: 'Data Stories', description: 'Turn metrics into compelling visual narratives' },
      { icon: 'Palette', title: 'On-Brand', description: 'AI applies your brand guidelines automatically' },
      { icon: 'Repeat', title: 'Template Library', description: 'Pre-built templates for every marketing need' },
    ],
    useCases: ['Strategy Deck', 'Campaign Report', 'Client Pitch', 'Social Media Plan'],
    useCaseDetails: [
      { name: 'Strategy Deck', description: 'Get leadership buy-in with a strategy deck that\'s all signal, no noise. AI builds decks with market analysis, competitive positioning, budget breakdowns, and clear action plans.', examplePrompt: 'Annual marketing strategy for a SaaS company entering the European market', icon: 'Target' },
      { name: 'Campaign Report', description: 'Make data tell your story. AI generates beautiful reports with attribution models, funnel metrics, cost analysis, and next-quarter recommendations that justify every dollar.', examplePrompt: 'End-of-year campaign report showing 200% increase in qualified leads', icon: 'BarChart3' },
      { name: 'Client Pitch', description: 'Win more agency clients with pitches that demonstrate strategic thinking. AI creates custom decks with audience insights, creative concepts, and projected outcomes.', examplePrompt: 'Agency pitch for a luxury fashion brand\'s holiday campaign', icon: 'Sparkles' },
      { name: 'Social Media Plan', description: 'Plan your social strategy like a pro. AI generates platform-specific plans with content calendars, audience segmentation, and engagement benchmarks.', examplePrompt: 'TikTok and Instagram strategy for a new CPG brand targeting Gen Z', icon: 'Megaphone' },
    ],
    ctaText: 'Start Creating Free',
    ctaSubtext: 'No design skills needed.',
    communityCategory: 'marketing',
    heroGradient: 'from-orange-500 via-red-500 to-pink-600',
  },
  {
    slug: 'consultants',
    title: 'NextSlide for Consultants',
    metaTitle: 'AI Presentations for Consultants | NextSlide',
    metaDescription: 'Create polished consulting deliverables in seconds. Strategy presentations, analysis decks, and client reports.',
    headline: 'Consulting-Grade Presentations',
    subheadline: 'Deliver McKinsey-quality slides without the McKinsey timeline. AI handles the design while you focus on insights.',
    features: [
      { icon: 'Briefcase', title: 'Professional Polish', description: 'Enterprise-ready designs that impress clients' },
      { icon: 'BarChart3', title: 'Data Visualization', description: 'Beautiful charts from your analysis data' },
      { icon: 'FileText', title: 'Framework Templates', description: 'SWOT, Porter\'s Five Forces, BCG Matrix, and more' },
      { icon: 'Lock', title: 'Confidential', description: 'Your data stays private and secure' },
    ],
    useCases: ['Client Deliverable', 'Strategy Analysis', 'Market Research', 'Change Management'],
    useCaseDetails: [
      { name: 'Client Deliverable', description: 'Deliver slides your clients frame on the wall. AI creates structured consulting deliverables with executive summaries, analysis frameworks, prioritized recommendations, and implementation roadmaps.', examplePrompt: 'Strategic consulting deliverable for a retail chain\'s digital transformation', icon: 'Briefcase' },
      { name: 'Strategy Analysis', description: 'SWOT, Porter\'s Five Forces, BCG Matrix — all beautifully formatted. AI builds analysis decks with clean frameworks, competitive data tables, and actionable strategic options.', examplePrompt: 'Competitive strategy analysis for a SaaS company entering the healthcare vertical', icon: 'BarChart3' },
      { name: 'Market Research', description: 'Present research findings that drive decisions. AI creates data-rich decks with market sizing, trend analysis, consumer segmentation, and opportunity mapping.', examplePrompt: 'Market research report on the $50B plant-based food industry', icon: 'Target' },
      { name: 'Change Management', description: 'Navigate organizational change with clear communication. AI builds change management decks with stakeholder maps, timeline phases, risk frameworks, and success metrics.', examplePrompt: 'Change management plan for migrating 5,000 employees to a new CRM system', icon: 'Users' },
    ],
    ctaText: 'Build Your First Deck',
    ctaSubtext: 'Professional consulting decks in seconds.',
    communityCategory: 'business',
    heroGradient: 'from-slate-700 via-zinc-700 to-neutral-800',
  },
];

export function getAllLandingPages(): LandingPageConfig[] {
  return [...useCaseLandingPages, ...industryLandingPages];
}

export function getLandingPageBySlug(slug: string): LandingPageConfig | undefined {
  return getAllLandingPages().find(p => p.slug === slug);
}
