#!/usr/bin/env python3
"""
Seed script to populate the community_decks table with 80 sample presentations.

Usage:
    cd apps/backend
    python scripts/seed_community_decks.py

This script:
1. Gets or creates user a@nextslide.ai
2. Creates deck entries in the decks table
3. Creates corresponding community_decks entries with status='approved'
"""

import os
import sys
import uuid
import random
from datetime import datetime, timedelta

# Add backend to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

from services.supabase import get_supabase_client

# Sample presentation data organized by category
PRESENTATION_TEMPLATES = {
    "business": [
        {"title": "Q4 2024 Financial Results", "description": "Quarterly financial performance review with key metrics and growth indicators."},
        {"title": "Startup Pitch Deck", "description": "Investment pitch presentation for early-stage funding rounds."},
        {"title": "Annual Business Review", "description": "Comprehensive yearly performance analysis and strategic outlook."},
        {"title": "Market Entry Strategy", "description": "Strategic planning for entering new markets and expanding reach."},
        {"title": "Competitive Analysis Framework", "description": "Structured approach to analyzing market competition and positioning."},
        {"title": "Revenue Growth Playbook", "description": "Proven strategies for accelerating revenue growth."},
        {"title": "Business Model Canvas", "description": "Visual framework for developing and documenting business models."},
        {"title": "Investor Relations Update", "description": "Quarterly update for shareholders and potential investors."},
        {"title": "Strategic Partnership Proposal", "description": "Framework for building strategic business partnerships."},
        {"title": "Cost Optimization Strategy", "description": "Approaches to reducing costs while maintaining quality."},
        {"title": "Executive Summary Template", "description": "Clean executive summary format for board presentations."},
        {"title": "Business Development Plan", "description": "Roadmap for expanding business opportunities."},
        {"title": "Financial Forecast Model", "description": "Projecting financial performance over 3-5 years."},
        {"title": "Merger & Acquisition Overview", "description": "Framework for evaluating M&A opportunities."},
    ],
    "education": [
        {"title": "Introduction to Machine Learning", "description": "Fundamentals of ML algorithms and applications."},
        {"title": "Climate Change Explained", "description": "Understanding the science and impact of climate change."},
        {"title": "History of the Internet", "description": "From ARPANET to modern web technologies."},
        {"title": "Quantum Computing Basics", "description": "Introduction to quantum mechanics in computing."},
        {"title": "Effective Study Techniques", "description": "Science-backed methods for better learning."},
        {"title": "World Geography Overview", "description": "Comprehensive look at global geography and cultures."},
        {"title": "Biology: Cell Structure", "description": "Deep dive into cellular biology and functions."},
        {"title": "Creative Writing Workshop", "description": "Techniques for improving creative writing skills."},
        {"title": "Mathematics Problem Solving", "description": "Strategies for tackling complex math problems."},
        {"title": "Language Learning Tips", "description": "Effective approaches to learning new languages."},
        {"title": "Scientific Method Explained", "description": "Understanding how scientific research is conducted."},
        {"title": "Art History: Renaissance", "description": "Exploring the Renaissance art movement."},
        {"title": "Economics Fundamentals", "description": "Basic economic principles and concepts."},
        {"title": "Psychology Introduction", "description": "Overview of psychological theories and research."},
    ],
    "marketing": [
        {"title": "Social Media Strategy 2025", "description": "Comprehensive social media marketing approach."},
        {"title": "Content Marketing Playbook", "description": "Creating content that drives engagement and conversions."},
        {"title": "Brand Identity Guidelines", "description": "Establishing consistent brand identity across channels."},
        {"title": "Email Marketing Masterclass", "description": "Strategies for effective email campaigns."},
        {"title": "SEO Best Practices", "description": "Optimizing content for search engine visibility."},
        {"title": "Influencer Marketing Guide", "description": "Leveraging influencers for brand growth."},
        {"title": "Customer Journey Mapping", "description": "Understanding and optimizing customer touchpoints."},
        {"title": "Product Launch Campaign", "description": "Framework for successful product launches."},
        {"title": "Marketing Analytics Dashboard", "description": "Key metrics and KPIs for marketing success."},
        {"title": "Paid Advertising Strategy", "description": "Maximizing ROI on paid marketing channels."},
        {"title": "Growth Hacking Techniques", "description": "Innovative strategies for rapid growth."},
        {"title": "Customer Retention Framework", "description": "Building loyalty and reducing churn."},
        {"title": "Viral Marketing Secrets", "description": "Creating shareable content that spreads."},
    ],
    "creative": [
        {"title": "Design Thinking Workshop", "description": "Human-centered approach to problem solving."},
        {"title": "Color Theory Fundamentals", "description": "Understanding color relationships in design."},
        {"title": "Typography Essentials", "description": "Mastering font selection and text layout."},
        {"title": "Photography Composition", "description": "Rules and techniques for better photos."},
        {"title": "Illustration Techniques", "description": "Digital and traditional illustration methods."},
        {"title": "UX Design Principles", "description": "Creating user-friendly digital experiences."},
        {"title": "Motion Graphics Basics", "description": "Introduction to animated visual design."},
        {"title": "Portfolio Showcase", "description": "Presenting creative work professionally."},
        {"title": "Brand Design Process", "description": "From concept to complete brand identity."},
        {"title": "Visual Storytelling", "description": "Using visuals to communicate narratives."},
        {"title": "Creative Brief Template", "description": "Structuring creative project requirements."},
        {"title": "Design System Overview", "description": "Building scalable design frameworks."},
        {"title": "Minimalist Design Guide", "description": "Less is more in modern design."},
    ],
    "technology": [
        {"title": "Cloud Architecture Patterns", "description": "Best practices for cloud infrastructure design."},
        {"title": "Cybersecurity Fundamentals", "description": "Protecting systems from digital threats."},
        {"title": "API Design Best Practices", "description": "Building robust and scalable APIs."},
        {"title": "DevOps Pipeline Setup", "description": "Continuous integration and deployment workflows."},
        {"title": "Microservices Architecture", "description": "Designing distributed system components."},
        {"title": "Database Optimization", "description": "Improving database performance and efficiency."},
        {"title": "AI Implementation Guide", "description": "Practical applications of artificial intelligence."},
        {"title": "Blockchain Technology Overview", "description": "Understanding distributed ledger technology."},
        {"title": "Mobile App Development", "description": "Cross-platform mobile development strategies."},
        {"title": "System Design Interview Prep", "description": "Preparing for technical architecture interviews."},
        {"title": "Tech Stack Comparison", "description": "Evaluating different technology choices."},
        {"title": "Code Review Best Practices", "description": "Effective peer code review processes."},
        {"title": "Agile Development Methods", "description": "Implementing agile software practices."},
    ],
    "personal": [
        {"title": "Personal Finance Basics", "description": "Managing money and building wealth."},
        {"title": "Time Management Mastery", "description": "Techniques for better productivity."},
        {"title": "Public Speaking Tips", "description": "Overcoming fear and presenting confidently."},
        {"title": "Career Development Plan", "description": "Mapping your professional growth journey."},
        {"title": "Work-Life Balance", "description": "Finding harmony between work and personal life."},
        {"title": "Goal Setting Framework", "description": "Effective methods for achieving goals."},
        {"title": "Networking Strategies", "description": "Building professional relationships."},
        {"title": "Interview Preparation Guide", "description": "Preparing for successful job interviews."},
        {"title": "Personal Branding", "description": "Building your professional reputation."},
        {"title": "Leadership Skills Development", "description": "Growing as a leader in any context."},
        {"title": "Mindfulness & Meditation", "description": "Practices for mental well-being."},
        {"title": "Healthy Lifestyle Habits", "description": "Building sustainable health routines."},
        {"title": "Resume Writing Guide", "description": "Creating impactful resumes."},
    ]
}

# Color themes for variety
COLOR_THEMES = [
    {"primary": "#3B82F6", "secondary": "#1E40AF", "accent": "#60A5FA", "background": "#F8FAFC", "text": "#1E293B"},
    {"primary": "#8B5CF6", "secondary": "#6D28D9", "accent": "#A78BFA", "background": "#FAF5FF", "text": "#1E1B4B"},
    {"primary": "#10B981", "secondary": "#059669", "accent": "#34D399", "background": "#F0FDF4", "text": "#14532D"},
    {"primary": "#F59E0B", "secondary": "#D97706", "accent": "#FBBF24", "background": "#FFFBEB", "text": "#78350F"},
    {"primary": "#EF4444", "secondary": "#DC2626", "accent": "#F87171", "background": "#FEF2F2", "text": "#7F1D1D"},
    {"primary": "#EC4899", "secondary": "#DB2777", "accent": "#F472B6", "background": "#FDF2F8", "text": "#831843"},
    {"primary": "#06B6D4", "secondary": "#0891B2", "accent": "#22D3EE", "background": "#ECFEFF", "text": "#164E63"},
    {"primary": "#6366F1", "secondary": "#4F46E5", "accent": "#818CF8", "background": "#EEF2FF", "text": "#312E81"},
    {"primary": "#14B8A6", "secondary": "#0D9488", "accent": "#2DD4BF", "background": "#F0FDFA", "text": "#134E4A"},
    {"primary": "#F97316", "secondary": "#EA580C", "accent": "#FB923C", "background": "#FFF7ED", "text": "#7C2D12"},
]

# Tags pool for variety
TAG_POOLS = {
    "business": ["strategy", "finance", "growth", "startup", "investment", "enterprise", "leadership", "operations", "planning"],
    "education": ["learning", "science", "history", "tutorial", "course", "students", "research", "academic", "knowledge"],
    "marketing": ["digital", "brand", "social media", "content", "advertising", "analytics", "engagement", "conversion", "campaigns"],
    "creative": ["design", "art", "visual", "creative", "UX", "UI", "branding", "portfolio", "aesthetic"],
    "technology": ["software", "cloud", "security", "development", "data", "AI", "coding", "systems", "infrastructure"],
    "personal": ["productivity", "career", "wellness", "skills", "growth", "self-improvement", "motivation", "success", "habits"],
}


def generate_slide_id():
    """Generate a unique slide ID."""
    return str(uuid.uuid4())


def generate_component_id():
    """Generate a unique component ID."""
    return str(uuid.uuid4())[:8]


def create_title_slide(title: str, subtitle: str, theme: dict) -> dict:
    """Create a title slide."""
    return {
        "id": generate_slide_id(),
        "title": title,
        "components": [
            {
                "id": generate_component_id(),
                "type": "Background",
                "props": {
                    "backgroundType": "gradient",
                    "gradientType": "linear",
                    "gradientAngle": 135,
                    "gradientStops": [
                        {"color": theme["primary"], "position": 0},
                        {"color": theme["secondary"], "position": 100}
                    ],
                    "opacity": 1
                }
            },
            {
                "id": generate_component_id(),
                "type": "TiptapTextBlock",
                "props": {
                    "position": {"x": 120, "y": 380},
                    "width": 1680,
                    "height": 150,
                    "texts": [
                        {
                            "text": title,
                            "fontSize": 72,
                            "fontWeight": 700,
                            "textColor": "#FFFFFF",
                            "style": []
                        }
                    ],
                    "textAlign": "center",
                    "verticalAlign": "middle",
                    "zIndex": 10
                }
            },
            {
                "id": generate_component_id(),
                "type": "TiptapTextBlock",
                "props": {
                    "position": {"x": 120, "y": 550},
                    "width": 1680,
                    "height": 60,
                    "texts": [
                        {
                            "text": subtitle,
                            "fontSize": 28,
                            "fontWeight": 400,
                            "textColor": "#FFFFFF",
                            "style": []
                        }
                    ],
                    "textAlign": "center",
                    "verticalAlign": "top",
                    "zIndex": 10
                }
            }
        ]
    }


def create_content_slide(title: str, content_points: list, theme: dict, slide_num: int) -> dict:
    """Create a content slide with bullet points."""
    bullet_components = []
    y_position = 280

    for i, point in enumerate(content_points[:5]):  # Max 5 points
        bullet_components.append({
            "id": generate_component_id(),
            "type": "TiptapTextBlock",
            "props": {
                "position": {"x": 120, "y": y_position},
                "width": 1680,
                "height": 80,
                "texts": [
                    {
                        "text": f"• {point}",
                        "fontSize": 32,
                        "fontWeight": 400,
                        "textColor": theme["text"],
                        "style": []
                    }
                ],
                "textAlign": "left",
                "verticalAlign": "middle",
                "zIndex": 10 + i
            }
        })
        y_position += 100

    return {
        "id": generate_slide_id(),
        "title": title,
        "components": [
            {
                "id": generate_component_id(),
                "type": "Background",
                "props": {
                    "backgroundType": "color",
                    "backgroundColor": theme["background"],
                    "opacity": 1
                }
            },
            {
                "id": generate_component_id(),
                "type": "TiptapTextBlock",
                "props": {
                    "position": {"x": 120, "y": 100},
                    "width": 1680,
                    "height": 100,
                    "texts": [
                        {
                            "text": title,
                            "fontSize": 48,
                            "fontWeight": 700,
                            "textColor": theme["primary"],
                            "style": []
                        }
                    ],
                    "textAlign": "left",
                    "verticalAlign": "middle",
                    "zIndex": 5
                }
            },
            *bullet_components
        ]
    }


def create_stat_slide(title: str, stats: list, theme: dict) -> dict:
    """Create a statistics slide with big numbers."""
    stat_components = []
    x_positions = [200, 700, 1200]

    for i, stat in enumerate(stats[:3]):  # Max 3 stats
        stat_components.extend([
            {
                "id": generate_component_id(),
                "type": "TiptapTextBlock",
                "props": {
                    "position": {"x": x_positions[i], "y": 350},
                    "width": 400,
                    "height": 120,
                    "texts": [
                        {
                            "text": stat["value"],
                            "fontSize": 72,
                            "fontWeight": 900,
                            "textColor": theme["primary"],
                            "style": []
                        }
                    ],
                    "textAlign": "center",
                    "verticalAlign": "middle",
                    "zIndex": 10 + i * 2
                }
            },
            {
                "id": generate_component_id(),
                "type": "TiptapTextBlock",
                "props": {
                    "position": {"x": x_positions[i], "y": 480},
                    "width": 400,
                    "height": 60,
                    "texts": [
                        {
                            "text": stat["label"],
                            "fontSize": 24,
                            "fontWeight": 500,
                            "textColor": theme["text"],
                            "style": []
                        }
                    ],
                    "textAlign": "center",
                    "verticalAlign": "top",
                    "zIndex": 10 + i * 2 + 1
                }
            }
        ])

    return {
        "id": generate_slide_id(),
        "title": title,
        "components": [
            {
                "id": generate_component_id(),
                "type": "Background",
                "props": {
                    "backgroundType": "color",
                    "backgroundColor": theme["background"],
                    "opacity": 1
                }
            },
            {
                "id": generate_component_id(),
                "type": "TiptapTextBlock",
                "props": {
                    "position": {"x": 120, "y": 100},
                    "width": 1680,
                    "height": 100,
                    "texts": [
                        {
                            "text": title,
                            "fontSize": 48,
                            "fontWeight": 700,
                            "textColor": theme["primary"],
                            "style": []
                        }
                    ],
                    "textAlign": "center",
                    "verticalAlign": "middle",
                    "zIndex": 5
                }
            },
            *stat_components
        ]
    }


def create_closing_slide(title: str, cta: str, theme: dict) -> dict:
    """Create a closing/CTA slide."""
    return {
        "id": generate_slide_id(),
        "title": "Thank You",
        "components": [
            {
                "id": generate_component_id(),
                "type": "Background",
                "props": {
                    "backgroundType": "gradient",
                    "gradientType": "linear",
                    "gradientAngle": 315,
                    "gradientStops": [
                        {"color": theme["secondary"], "position": 0},
                        {"color": theme["primary"], "position": 100}
                    ],
                    "opacity": 1
                }
            },
            {
                "id": generate_component_id(),
                "type": "TiptapTextBlock",
                "props": {
                    "position": {"x": 120, "y": 400},
                    "width": 1680,
                    "height": 120,
                    "texts": [
                        {
                            "text": title,
                            "fontSize": 64,
                            "fontWeight": 700,
                            "textColor": "#FFFFFF",
                            "style": []
                        }
                    ],
                    "textAlign": "center",
                    "verticalAlign": "middle",
                    "zIndex": 10
                }
            },
            {
                "id": generate_component_id(),
                "type": "TiptapTextBlock",
                "props": {
                    "position": {"x": 120, "y": 540},
                    "width": 1680,
                    "height": 60,
                    "texts": [
                        {
                            "text": cta,
                            "fontSize": 28,
                            "fontWeight": 400,
                            "textColor": "#FFFFFF",
                            "style": []
                        }
                    ],
                    "textAlign": "center",
                    "verticalAlign": "top",
                    "zIndex": 10
                }
            }
        ]
    }


def generate_content_points(category: str) -> list:
    """Generate relevant content points based on category."""
    content_pools = {
        "business": [
            "Identify key performance metrics and KPIs",
            "Analyze market trends and competitive landscape",
            "Develop strategic initiatives for growth",
            "Optimize operational efficiency",
            "Build strong stakeholder relationships",
            "Implement data-driven decision making",
            "Scale operations sustainably",
            "Manage risk and ensure compliance",
            "Foster innovation culture",
            "Drive digital transformation",
        ],
        "education": [
            "Understand fundamental concepts and principles",
            "Apply theoretical knowledge to real scenarios",
            "Develop critical thinking skills",
            "Engage with hands-on exercises",
            "Review and reinforce key learnings",
            "Explore advanced topics and applications",
            "Connect concepts across disciplines",
            "Practice problem-solving techniques",
            "Collaborate with peers for deeper understanding",
            "Assess progress through practical examples",
        ],
        "marketing": [
            "Define target audience and buyer personas",
            "Create compelling value propositions",
            "Build multi-channel marketing strategies",
            "Measure and optimize campaign performance",
            "Leverage data analytics for insights",
            "Develop engaging content experiences",
            "Build brand awareness and loyalty",
            "Optimize conversion funnels",
            "Implement marketing automation",
            "Track ROI across all channels",
        ],
        "creative": [
            "Establish clear design principles",
            "Create consistent visual language",
            "Balance form and function",
            "Iterate based on feedback",
            "Consider accessibility and usability",
            "Maintain brand consistency",
            "Push creative boundaries thoughtfully",
            "Document design decisions",
            "Collaborate across disciplines",
            "Test with real users",
        ],
        "technology": [
            "Design for scalability and performance",
            "Implement security best practices",
            "Write maintainable and clean code",
            "Automate testing and deployment",
            "Monitor and optimize systems",
            "Document architecture decisions",
            "Plan for disaster recovery",
            "Stay current with technology trends",
            "Foster knowledge sharing",
            "Build with future extensibility in mind",
        ],
        "personal": [
            "Set clear and achievable goals",
            "Build consistent daily habits",
            "Track progress and adjust course",
            "Seek feedback and mentorship",
            "Invest in continuous learning",
            "Maintain work-life balance",
            "Build your professional network",
            "Communicate effectively",
            "Embrace challenges as opportunities",
            "Celebrate wins along the way",
        ],
    }
    return random.sample(content_pools.get(category, content_pools["personal"]), 5)


def generate_stats(category: str) -> list:
    """Generate relevant statistics based on category."""
    stat_templates = {
        "business": [
            {"value": f"{random.randint(10, 50)}%", "label": "Revenue Growth"},
            {"value": f"${random.randint(1, 99)}M", "label": "Market Size"},
            {"value": f"{random.randint(100, 999)}K", "label": "Active Users"},
        ],
        "education": [
            {"value": f"{random.randint(80, 99)}%", "label": "Completion Rate"},
            {"value": f"{random.randint(10, 50)}K", "label": "Students Enrolled"},
            {"value": f"{random.randint(1, 10)}hrs", "label": "Learning Time"},
        ],
        "marketing": [
            {"value": f"{random.randint(20, 80)}%", "label": "Engagement Rate"},
            {"value": f"{random.randint(2, 10)}x", "label": "ROI Increase"},
            {"value": f"{random.randint(100, 500)}%", "label": "Traffic Growth"},
        ],
        "creative": [
            {"value": f"{random.randint(50, 200)}+", "label": "Projects Delivered"},
            {"value": f"{random.randint(10, 50)}", "label": "Design Awards"},
            {"value": f"{random.randint(90, 99)}%", "label": "Client Satisfaction"},
        ],
        "technology": [
            {"value": f"{random.randint(950, 999) / 10:.1f}%", "label": "Uptime"},
            {"value": f"{random.randint(100, 999)}ms", "label": "Latency"},
            {"value": f"{random.randint(10, 99)}K", "label": "API Requests/sec"},
        ],
        "personal": [
            {"value": f"{random.randint(2, 10)}x", "label": "Productivity Gain"},
            {"value": f"{random.randint(50, 100)}%", "label": "Goal Achievement"},
            {"value": f"{random.randint(10, 30)}hrs", "label": "Time Saved/Week"},
        ],
    }
    return stat_templates.get(category, stat_templates["personal"])


def generate_presentation(template: dict, category: str, index: int) -> tuple:
    """Generate a complete presentation with slides."""
    theme = COLOR_THEMES[index % len(COLOR_THEMES)]

    title = template["title"]
    description = template["description"]

    # Generate slides
    slides = []

    # Title slide
    slides.append(create_title_slide(title, description, theme))

    # Content slides (2-4)
    content_titles = [
        "Overview",
        "Key Points",
        "Strategy & Approach",
        "Implementation",
        "Best Practices",
        "Framework",
        "Deep Dive",
    ]

    num_content_slides = random.randint(3, 5)
    selected_titles = random.sample(content_titles, min(num_content_slides, len(content_titles)))

    for i, content_title in enumerate(selected_titles):
        content_points = generate_content_points(category)
        slides.append(create_content_slide(content_title, content_points, theme, i + 2))

    # Stats slide
    stats = generate_stats(category)
    slides.append(create_stat_slide("Key Metrics", stats, theme))

    # Closing slide
    ctas = [
        "Let's discuss next steps",
        "Questions?",
        "Ready to get started?",
        "Connect with us to learn more",
        "Thank you for your attention",
    ]
    slides.append(create_closing_slide("Thank You", random.choice(ctas), theme))

    # Create theme data
    theme_data = {
        "colors": theme,
        "fonts": {
            "heading": "Inter",
            "body": "Inter"
        }
    }

    # Select random tags
    available_tags = TAG_POOLS.get(category, [])
    tags = random.sample(available_tags, min(3, len(available_tags)))

    return slides, theme_data, tags


def get_user_id(supabase, email: str) -> str:
    """Get user ID for the given email, or return None if not found."""
    try:
        result = supabase.table("users").select("id").eq("email", email).execute()
        if result.data and len(result.data) > 0:
            return result.data[0]["id"]
        return None
    except Exception as e:
        print(f"Error finding user: {e}")
        return None


def create_deck_entry(supabase, deck_uuid: str, name: str, slides: list, theme: dict, user_id: str) -> bool:
    """Create a deck entry in the decks table."""
    try:
        deck_data = {
            "uuid": deck_uuid,
            "name": name,
            "slides": slides,
            "slide_count": len(slides),
            "first_slide": slides[0] if slides else None,
            "user_id": user_id,
            "status": {"state": "completed", "message": "Community template"},
            "size": {"width": 1920, "height": 1080},
            "data": {"theme": theme},
            "version": str(uuid.uuid4()),
        }

        result = supabase.table("decks").insert(deck_data).execute()
        return bool(result.data)
    except Exception as e:
        print(f"Error creating deck: {e}")
        return False


def create_community_deck_entry(
    supabase,
    deck_uuid: str,
    user_id: str,
    title: str,
    description: str,
    category: str,
    tags: list,
    slides: list,
    theme: dict
) -> bool:
    """Create a community_decks entry."""
    try:
        # Generate approval timestamp (random time in the last 30 days)
        days_ago = random.randint(1, 30)
        approved_at = (datetime.utcnow() - timedelta(days=days_ago)).isoformat()

        community_data = {
            "deck_uuid": deck_uuid,
            "user_id": user_id,
            "title": title,
            "description": description,
            "category": category,
            "tags": tags,
            "status": "approved",
            "slide_count": len(slides),
            "first_slide": slides[0] if slides else None,
            "slides_snapshot": slides,
            "theme_snapshot": theme,
            "author_name": "NextSlide Team",
            "author_email": "admin@nextslide.ai",
            "submitted_at": approved_at,
            "approved_at": approved_at,
            "remix_count": random.randint(0, 50),
            "view_count": random.randint(10, 500),
        }

        result = supabase.table("community_decks").insert(community_data).execute()
        return bool(result.data)
    except Exception as e:
        print(f"Error creating community deck: {e}")
        return False


def main():
    """Main function to seed community decks."""
    print("=" * 60)
    print("Community Decks Seeder")
    print("=" * 60)

    # Get Supabase client
    try:
        supabase = get_supabase_client()
        print("✓ Connected to Supabase")
    except Exception as e:
        print(f"✗ Failed to connect to Supabase: {e}")
        return

    # Get user ID for admin@nextslide.ai (NextSlide team account)
    user_email = "admin@nextslide.ai"
    user_id = get_user_id(supabase, user_email)

    if not user_id:
        print(f"✗ User {user_email} not found in database")
        print("Please ensure this user exists before running the seeder.")
        return

    print(f"✓ Found user {user_email}: {user_id}")

    # Build presentation list targeting ~80 presentations
    presentations_to_create = []

    # Distribute across categories
    for category, templates in PRESENTATION_TEMPLATES.items():
        # Take all templates from each category
        for template in templates:
            presentations_to_create.append({
                "category": category,
                "template": template
            })

    # Shuffle for variety
    random.shuffle(presentations_to_create)

    # Limit to 80
    presentations_to_create = presentations_to_create[:80]

    print(f"\nCreating {len(presentations_to_create)} community presentations...")
    print("-" * 60)

    success_count = 0
    error_count = 0

    for i, pres in enumerate(presentations_to_create):
        category = pres["category"]
        template = pres["template"]

        # Generate presentation content
        slides, theme_data, tags = generate_presentation(template, category, i)

        # Generate unique deck UUID
        deck_uuid = str(uuid.uuid4())

        # Create deck entry first
        deck_created = create_deck_entry(
            supabase,
            deck_uuid,
            template["title"],
            slides,
            theme_data,
            user_id
        )

        if not deck_created:
            print(f"  [{i+1:2d}] ✗ Failed to create deck: {template['title']}")
            error_count += 1
            continue

        # Create community deck entry
        community_created = create_community_deck_entry(
            supabase,
            deck_uuid,
            user_id,
            template["title"],
            template["description"],
            category,
            tags,
            slides,
            theme_data
        )

        if community_created:
            print(f"  [{i+1:2d}] ✓ {template['title']} ({category})")
            success_count += 1
        else:
            print(f"  [{i+1:2d}] ✗ Failed community entry: {template['title']}")
            error_count += 1

    print("-" * 60)
    print(f"\nSummary:")
    print(f"  ✓ Successfully created: {success_count}")
    print(f"  ✗ Errors: {error_count}")
    print("=" * 60)


if __name__ == "__main__":
    main()
