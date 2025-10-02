layout_guidelines = f"""
1. General Layout
•	Maximum 1 concept per slide (1 chart, 1 idea, etc.).
•	Create a clear visual hierarchy (largest = most important).
•	Use the Rule of Thirds or center-aligned layouts.
•	Leave breathing room — don't cram.

[Component guidelines are now in slide_generation_prompts.py]

⸻

1. Title Slide - MAKE IT POP!
	•	HERO IMAGE: Full-bleed 1920×1080 with text overlay
	•	MASSIVE TITLE: 250-300pt font size, MUST overlap image/gradient for drama (ensure contrast)
	•	Bold positioning: Center, off-center, or dramatic angles
	•	Use gradients/overlays for text contrast on images
	•	Subtitle: Still large (80-120pt) but secondary
	•	Alignment: Centered OR left-aligned hero title (choose based on vibe and reading pattern)
	•	Metadata row (subtle): presenter • organization • date — 24-28pt, muted color, increased letter-spacing
	•	Metadata placement: Bottom-left or bottom-right; never compete with the hero title
	•	Logo (optional): Small (80-160px) in a corner with ample clearspace; low visual weight
	•	Spacing: Maintain 80px edge margins; align to grid; consistent vertical rhythm between title, subtitle, and metadata

⸻

2. Agenda Slide
	•	Vertical list: Left-align bullets or numbered steps.
	•	Grid spacing: Use even vertical spacing for readability.
	•	Progress indication (optional): Highlight current section subtly.

⸻

3. Section Divider
	•	Full-bleed background: Use image or solid color.
	•	Centered title: Single, large heading in center or upper third.
	•	No other content.

⸻

4. Content Slide
	•	Top-down structure: Heading at top, supporting content below.
	•	Two-column layout (optional): Text left, image right (or image left, text right) — choose based on visual flow.
	•	Use grid: Align all elements to an 8pt/12pt baseline grid.

⸻

5. Data Slide
	•	Single LARGE chart per slide - takes up HALF the slide horizontally.
	•	Chart should be the HERO - positioned LEFT or RIGHT side.
	•	Supporting text on the opposite half - clean and minimal.
	•	Chart positioning options:
		- Left half: X=80, width=880px, height=600-800px
		- Right half: X=960, width=880px, height=600-800px
		- NO vertical stacking - always side-by-side!
	•	Text gets the other half - properly aligned and spaced.

⸻

6. Quote Slide
	•	Centered or left-aligned quote text.
	•	Wide margins: Ample whitespace to focus attention.
	•	Attribution small: Below or beside the quote.

⸻

7. Comparison Slide
	•	Two-column layout: Equal-width halves with clear labels.
	•	Symmetrical design: Mirror structure for both sides.
	•	Dividing line (optional): Use a visual separator.

⸻

8. Process Slide
	•	Linear or circular layout: Horizontal for timelines, circular for loops.
	•	Consistent spacing: Equal space between steps.
	•	Icons + short labels: Align vertically under each step.

⸻

9. Problem Slide
	•	Full-width headline: Bold statement across top or center.
	•	One image or icon: Place centrally or off to the side.
	•	Minimal layout: Avoid multiple sections or content blocks.

⸻

10. Solution Slide
	•	Headline + visual: Title at top, large visual below.
	•	Centered layout: Balanced design reinforces clarity.
	•	Avoid text blocks: Use callouts or labels if needed.

⸻

11. Case Study Slide
	•	Two-section layout: Top for story, bottom for results.
	•	Left-right flow (optional): Problem on left, solution on right.
	•	Use cards or boxes: For clarity if showing multiple cases.

⸻

12. Call to Action Slide
	•	Centered button/text: Place CTA in middle third.
	•	Use space: Let CTA breathe with generous margins.
	•	Optional footer: Add contact info below in smaller text.

⸻

13. Thank You Slide
	•	Centered layout: "Thank you" or contact info in middle.
	•	Minimal content: One or two elements only.
	•	Footer bar (optional): For social links or branding.

⸻

COMPONENT SIZING REQUIREMENTS (APPLY TO ALL SLIDES):

1. TEXT COMPONENT DIMENSIONS:
	•	Calculate size based on content length:
		- Short phrases (1-3 words): 300-600px width, 80-120px height
		- Medium content (4-15 words): 400-800px width, 100-200px height
		- Long content (16-50 words): 600-1000px width, 200-400px height
		- Very long content (50+ words): 800-1200px width, 400-600px height
	•	Add padding: 20-40px inside all text components
	•	Multi-line text: Add 60-80px height per additional line
	•	Bullet lists: Calculate as (bullet_count × 50px) + 100px base height

2. OVERLAP PREVENTION:
	•	NO components may overlap each other
	•	Minimum spacing: 40px between text blocks, 60px around charts/images
	•	Edge margins: Keep text 80px from slide edges, charts/images 60px from edges
	•	Bounds checking: Verify x+width and y+height don't conflict with other components
	•	Vertical stacking formula: next_Y = previous_Y + previous_height + gap_size

3. RESPONSIVE ADJUSTMENTS:
	•	Longer content requires larger components (both width and height)
	•	Dense content gets wider components rather than smaller fonts
	•	When components don't fit horizontally, stack them vertically
	•	Prioritize readability: increase component size over decreasing font size

"""