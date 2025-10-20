# Educational Content Support - Math & Diagram Components

## Overview
Added comprehensive support for educational presentations with mathematical equations, chemical formulas, diagrams, and visual processes. Perfect for creating presentations about mathematics, science, chemistry, physics, biology, computer science, and other technical topics.

## 🎓 What's New

### 1. **Math Component** (KaTeX)
Beautiful rendering of mathematical equations and chemical formulas using KaTeX library.

**Capabilities:**
- ✅ Mathematical equations (algebra, calculus, geometry, statistics)
- ✅ Chemical equations and formulas
- ✅ Physics formulas and scientific notation
- ✅ Greek letters, fractions, square roots, integrals, summations
- ✅ Matrices and complex mathematical notation
- ✅ Display mode (large, centered) or inline mode
- ✅ Customizable colors, sizing, backgrounds

**Example Usage:**
```json
{
  "type": "Math",
  "props": {
    "position": { "x": 260, "y": 280 },
    "width": 1400,
    "height": 200,
    "latex": "x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}",
    "displayMode": true,
    "fontSize": 64,
    "color": "#2563eb",
    "backgroundColor": "#dbeafe",
    "padding": 40,
    "borderRadius": 16
  }
}
```

**LaTeX Quick Reference:**
- Fractions: `\frac{numerator}{denominator}`
- Square root: `\sqrt{x}` or `\sqrt[n]{x}`
- Exponents: `x^2` or `x^{2n+1}`
- Subscripts: `x_1` or `x_{i,j}`
- Greek: `\alpha`, `\beta`, `\gamma`, `\pi`, `\theta`
- Chemistry: `\ce{H2O}`, `\ce{2H2 + O2 -> 2H2O}`
- Summation: `\sum_{i=1}^{n}`
- Integral: `\int_{a}^{b}`

### 2. **Diagram Component** (Mermaid.js)
Render flowcharts, sequence diagrams, class diagrams, and more using Mermaid syntax.

**Capabilities:**
- ✅ Flowcharts (algorithms, decision trees, processes)
- ✅ Sequence diagrams (interactions, protocols)
- ✅ Class diagrams (OOP concepts, inheritance)
- ✅ State diagrams (state machines, transitions)
- ✅ Multiple themes (default, neutral, dark, forest, base)
- ✅ Perfect for teaching computer science, biology, processes

**Example Usage:**
```json
{
  "type": "Diagram",
  "props": {
    "position": { "x": 360, "y": 220 },
    "width": 1200,
    "height": 700,
    "mermaid": "graph TD\n    A[Start] --> B{Is x > 0?}\n    B -->|Yes| C[Return Positive]\n    B -->|No| D{Is x < 0?}\n    D -->|Yes| E[Return Negative]\n    D -->|No| F[Return Zero]",
    "theme": "default",
    "padding": 40,
    "borderRadius": 16
  }
}
```

**Mermaid Quick Reference:**
- **Flowchart:** `graph TD` (top-down) or `graph LR` (left-right)
  - Nodes: `A[Rectangle]`, `B(Rounded)`, `C{Diamond}`, `D((Circle))`
  - Arrows: `-->` (solid), `-.->` (dotted), `==>` (thick)
- **Sequence:** `sequenceDiagram`
  - Messages: `A->>B: Message`, `B-->>A: Response`
- **Class:** `classDiagram`
  - Inheritance: `Animal <|-- Dog`
- **State:** `stateDiagram-v2`
  - Transitions: `State1 --> State2 : event`

## 📦 Technical Implementation

### Frontend Changes

1. **New Packages Installed:**
   - `katex` - Fast math rendering
   - `@types/katex` - TypeScript definitions
   - `mermaid` - Diagram rendering

2. **New Renderer Components:**
   - `apps/frontend/src/renderers/components/MathRenderer.tsx`
   - `apps/frontend/src/renderers/components/DiagramRenderer.tsx`
   
3. **Renderer Registration:**
   - Both components registered in `apps/frontend/src/renderers/index.ts`
   - Exported via `apps/frontend/src/renderers/components/index.ts`

### Backend Changes

1. **Schema Updates:**
   - Added `Math` component schema to `apps/backend/schemas/typebox_schemas_latest.json`
   - Added `Diagram` component schema to `apps/backend/schemas/typebox_schemas_latest.json`
   - Both categorized as "educational" components

2. **Prompt System Updates:**
   - `apps/backend/agents/prompts/generation/html_inspired_system_prompt_v2.py`
     - Added comprehensive Math component documentation with examples
     - Added comprehensive Diagram component documentation with examples
     - Added educational mode guidance for breaking down complex topics
     - Included LaTeX and Mermaid syntax quick references

3. **Outline Generation Updates:**
   - `apps/backend/agents/prompts/generation/outline_prompts.py`
     - Added educational topic breakdown logic
     - **Critical Principle:** One concept per slide
     - Progressive disclosure: simple → complex
     - Specific guidance for math, chemistry, physics, biology, coding topics
     - Slide count recommendations for educational content

## 🎯 Educational Content Guidelines

### Breaking Down Complex Topics

**Bad (Cramming):**
```
Slide 1: "Quadratic Equations" with formula, 3 examples, and applications ❌
```

**Good (Progressive):**
```
Slide 1:  Introduction to Quadratic Equations
Slide 2:  The Standard Form (ax² + bx + c = 0)
Slide 3:  The Quadratic Formula (large display)
Slide 4:  Breaking Down the Formula
Slide 5:  Example 1: Simple Case
Slide 6:  Example 1: Step 1 (Substitute)
Slide 7:  Example 1: Step 2 (Calculate)
Slide 8:  Example 1: Step 3 (Solve)
Slide 9:  Common Mistakes
Slide 10: Practice Problems
```

### Slide Count Guidance

- **Simple concept** (e.g., "What is slope?"): 3-5 slides
- **Medium concept** (e.g., "Quadratic formula"): 8-12 slides
- **Complex concept** (e.g., "Calculus derivatives"): 12-20 slides
- **Full topic** (e.g., "Introduction to Algebra"): 20-40 slides

**Don't be afraid to use many slides!** Education requires depth and step-by-step progression.

### Topic-Specific Recommendations

**Mathematics (Algebra, Calculus, Geometry):**
- Theorem statement → Proof outline → Each proof step → Worked example → Practice
- Use Math components for equations
- Use Diagram components for graphs, geometric proofs

**Chemistry:**
- Concept introduction → Chemical equation → Balancing steps → Example reactions
- Use Math components: `\ce{2H2 + O2 -> 2H2O}`
- Use Diagram components for reaction mechanisms

**Physics:**
- Physical law → Formula → Variable definitions → Units → Example → Solution steps
- Use Math components: `F = ma`, `E = mc^2`
- Use Diagram components for force diagrams, circuits

**Biology:**
- Use Diagram components for cell processes, metabolic pathways
- Break down processes: One stage per slide

**Computer Science/Coding:**
- Use Diagram components for flowcharts, algorithms, data structures
- Break down algorithms: Pseudocode → Example → Step-by-step → Complexity

## 🚀 Example: Teaching the Pythagorean Theorem

### Slide 1: Introduction
```json
{
  "type": "TiptapTextBlock",
  "props": {
    "texts": [{"text": "The Pythagorean Theorem", "style": {"bold": true}}],
    "fontSize": 64
  }
}
```

### Slide 2: The Formula
```json
{
  "type": "Math",
  "props": {
    "latex": "a^2 + b^2 = c^2",
    "fontSize": 72,
    "displayMode": true
  }
}
{
  "type": "TiptapTextBlock",
  "props": {
    "texts": [{"text": "The sum of squares of the legs equals the square of the hypotenuse"}],
    "fontSize": 28
  }
}
```

### Slide 3: Visual Representation
```json
{
  "type": "Diagram",
  "props": {
    "mermaid": "graph TD\n    A[Right Triangle]\n    A --> B[a - First Leg]\n    A --> C[b - Second Leg]\n    A --> D[c - Hypotenuse]",
    "theme": "forest"
  }
}
```

### Slide 4: Example Problem
```json
{
  "type": "TiptapTextBlock",
  "props": {
    "texts": [{"text": "Given: a = 3, b = 4"}],
    "fontSize": 32
  }
}
{
  "type": "Math",
  "props": {
    "latex": "3^2 + 4^2 = c^2",
    "fontSize": 48
  }
}
```

### Slide 5: Solution
```json
{
  "type": "Math",
  "props": {
    "latex": "9 + 16 = c^2",
    "fontSize": 48
  }
}
{
  "type": "Math",
  "props": {
    "latex": "c = 5",
    "fontSize": 56,
    "color": "#16a34a"
  }
}
```

## 📝 Usage Instructions

### Creating Educational Decks

When generating a presentation, simply describe your educational topic:

**Examples:**
- "Explain the quadratic formula step by step"
- "Teach photosynthesis to high school students"
- "Introduction to object-oriented programming with examples"
- "Chemical reactions and balancing equations"
- "Understanding derivatives in calculus"

The system will automatically:
1. ✅ Recognize it as educational content
2. ✅ Break down the topic into multiple slides
3. ✅ Use Math components for equations/formulas
4. ✅ Use Diagram components for processes/flowcharts
5. ✅ Follow progressive disclosure (simple → complex)
6. ✅ Include examples and practice problems

### Best Practices

1. **One Concept Per Slide**: Don't cram multiple formulas on one slide
2. **Use Visual Hierarchy**: Large Math/Diagram as focal point (60-70% of slide)
3. **Progressive Disclosure**: Build up complexity across slides
4. **Mix Components**: Math + Diagram + Text for comprehensive teaching
5. **Include Examples**: Always show worked examples
6. **Add Practice**: Include problems for students to try

## 🎨 Component Properties Reference

### Math Component
```typescript
{
  type: "Math",
  props: {
    position: { x: number, y: number },
    width?: number,
    height?: number,
    latex: string,                    // Required: LaTeX equation
    displayMode?: boolean,             // true = block, false = inline
    fontSize?: number,                 // 32-72 typical
    color?: string,                    // Equation color
    backgroundColor?: string,          // Background color
    padding?: number,                  // Padding around equation
    borderRadius?: number,             // Corner rounding
    opacity?: number,                  // 0-1
    rotation?: number,                 // 0-360 degrees
    zIndex?: number                    // Stacking order
  }
}
```

### Diagram Component
```typescript
{
  type: "Diagram",
  props: {
    position: { x: number, y: number },
    width?: number,
    height?: number,
    mermaid: string,                   // Required: Mermaid diagram code
    theme?: "default" | "neutral" | "dark" | "forest" | "base",
    backgroundColor?: string,          // Background color
    padding?: number,                  // Padding around diagram
    borderRadius?: number,             // Corner rounding
    opacity?: number,                  // 0-1
    rotation?: number,                 // 0-360 degrees
    zIndex?: number                    // Stacking order
  }
}
```

## 🔧 Testing

To test the new components:

1. **Create a presentation** with an educational topic:
   - "Explain Einstein's E=mc² formula"
   - "Teach the Krebs cycle"
   - "Introduction to sorting algorithms"

2. **Verify the output**:
   - Check that Math components render equations beautifully
   - Verify Diagram components display flowcharts/diagrams correctly
   - Confirm the outline breaks down topics progressively

3. **Try different topics**:
   - Mathematics: algebra, calculus, geometry
   - Science: chemistry, physics, biology
   - Computer Science: algorithms, data structures
   - Engineering: formulas, circuit diagrams

## 📚 Resources

- **KaTeX Documentation**: https://katex.org/docs/supported.html
- **Mermaid Documentation**: https://mermaid.js.org/intro/
- **LaTeX Math Symbols**: https://katex.org/docs/support_table.html
- **Mermaid Live Editor**: https://mermaid.live/

## ✅ Complete Implementation Checklist

- [x] Install KaTeX and Mermaid packages
- [x] Create MathRenderer.tsx component
- [x] Create DiagramRenderer.tsx component
- [x] Register both renderers in the system
- [x] Add Math component schema
- [x] Add Diagram component schema
- [x] Update HTML inspired v2 prompt with component docs
- [x] Add educational content guidance
- [x] Update outline generation for topic breakdown
- [x] Add comprehensive examples and documentation

## 🎉 Success!

Your presentation system now has world-class support for educational content! You can create beautiful, pedagogically-sound presentations for any mathematical, scientific, or technical topic with proper equation rendering and visual diagrams.

**Happy Teaching! 🎓**

