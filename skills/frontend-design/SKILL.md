---
name: frontend-design
description: Create distinctive, production-grade frontend interfaces with high design quality. Use this skill when building web components, pages, artifacts, or applications (websites, landing pages, dashboards, React components, HTML/CSS layouts, or when styling/beautifying any web UI). Generates creative, polished code and UI design that avoids generic AI aesthetics.
---

This skill guides creation of distinctive, production-grade frontend interfaces that avoid generic "AI slop" aesthetics. Implement real working code with exceptional attention to aesthetic details and creative choices.

The user provides frontend requirements: a component, page, application, or interface to build. They may include context about the purpose, audience, or technical constraints.

## Design Thinking

Before coding, understand the context and commit to a BOLD aesthetic direction:
- **Purpose**: What problem does this interface solve? Who uses it?
- **Tone**: Pick an extreme: brutally minimal, maximalist chaos, retro-futuristic, organic/natural, luxury/refined, playful/toy-like, editorial/magazine, brutalist/raw, art deco/geometric, soft/pastel, industrial/utilitarian, etc. There are so many flavors to choose from. Use these for inspiration but design one that is true to the aesthetic direction.
- **Constraints**: Technical requirements (framework, performance, accessibility).
- **Differentiation**: What makes this UNFORGETTABLE? What's the one thing someone will remember?

**CRITICAL**: Choose a clear conceptual direction and execute it with precision. Bold maximalism and refined minimalism both work — the key is intentionality, not intensity.

Then implement working code (HTML/CSS/JS, React, Vue, etc.) that is:
- Production-grade and functional
- Visually striking and memorable
- Cohesive with a clear aesthetic point-of-view
- Meticulously refined in every detail

## Frontend Aesthetics Guidelines

Focus on:
- **Typography**: Choose fonts that are beautiful, unique, and interesting. Avoid generic fonts like Arial and Inter; opt instead for distinctive choices that elevate the frontend's aesthetics; unexpected, characterful font choices. Pair a distinctive display font with a refined body font.
- **Color & Theme**: Commit to a cohesive aesthetic. Use CSS variables for consistency. Dominant colors with sharp accents outperform timid, evenly-distributed palettes.
- **Motion**: Use animations for effects and micro-interactions. Prioritize CSS-only solutions for HTML. Use Motion library for React when available. Focus on high-impact moments: one well-orchestrated page load with staggered reveals (animation-delay) creates more delight than scattered micro-interactions. Use scroll-triggering and hover states that surprise.
- **Spatial Composition**: Unexpected layouts. Asymmetry. Overlap. Diagonal flow. Grid-breaking elements. Generous negative space OR controlled density.
- **Backgrounds & Visual Details**: Create atmosphere and depth rather than defaulting to solid colors. Add contextual effects and textures that match the overall aesthetic. Apply creative forms like gradient meshes, noise textures, geometric patterns, layered transparencies, dramatic shadows, decorative borders, custom cursors, and grain overlays.

NEVER use generic AI-generated aesthetics like overused font families (Inter, Roboto, Arial, system fonts), cliched color schemes (particularly purple gradients on white backgrounds), predictable layouts and component patterns, and cookie-cutter design that lacks context-specific character.

Interpret creatively and make unexpected choices that feel genuinely designed for the context. No design should be the same. Vary between light and dark themes, different fonts, different aesthetics. NEVER converge on common choices (Space Grotesk, for example) across generations.

**IMPORTANT**: Match implementation complexity to the aesthetic vision. Maximalist designs need elaborate code with extensive animations and effects. Minimalist or refined designs need restraint, precision, and careful attention to spacing, typography, and subtle details. Elegance comes from executing the vision well.

Remember: Claude is capable of extraordinary creative work. Don't hold back, show what can truly be created when thinking outside the box and committing fully to a distinctive vision.

---

## Dashboard Best Practices

When building **data dashboards**, apply these rules ON TOP of the general aesthetics above.

### Color Palette & Accessibility

- **60-30-10 Rule**: Neutral colors (greys/whites) for 60% of the dashboard, a secondary color for 30%, and a bold accent for the final 10%.
- **Strategic Saturation**: Soft/muted colors for background data. High-saturation only for items needing immediate attention.
- **Color Blind Friendly**: Never use Red+Green together for contrast. Use Blue vs. Orange or different shades of a single hue.
- **Semantic Consistency**: Red = danger/below target, Green = success — consistent across all views.
- **The Squint Test**: Squint at the screen. The most important number must still pop out. If not, increase contrast.

### Trend Lines & Time Series

- **Chart Selection**: Line charts for continuous time data. Never use bar charts for trends with 10+ time periods.
- **Data Smoothing**: If daily data is noisy (jagged), add a moving-average line to show true direction.
- **Baseline Zero**: Bar chart Y-axis must start at zero. Line charts may crop the axis to show volatility, but label it clearly.
- **Trend vs. Target**: Always include a benchmark or goal line (dashed horizontal) for context.
- **Forecast Distinction**: Future projections must use a different style (dotted line, shaded area) to separate actuals from estimates.

### Graph Selection & Layout

- **F-Pattern Layout**: Most critical KPI goes top-left (where the eye starts scanning).
- **Declutter (Data-Ink Ratio)**: Remove unnecessary borders, heavy gridlines, background gradients. Every pixel serves a purpose.
- **No 3D Effects**: Never use 3D bars or pies — they distort data and impair comparison.
- **Logical Sorting**: Sort bar charts largest-to-smallest (descending) unless there is a natural order (months, age groups).
- **Avoid Pie Charts for 4+ categories**: Use a horizontal bar chart instead — much easier for the brain to compare.

### Context & Labeling

- **Action Titles**: Use descriptive titles like "Revenue is down 5% vs last month" instead of generic "Monthly Revenue".
- **Number Scaling**: Round large numbers for readability ($1.2M not $1,245,678.92).
- **Tooltips**: Use hover tooltips for deep-dive details without cluttering the main view.
- **Unit Clarity**: Every axis and KPI must show its unit (%, $, K, M, etc.)
- **Comparison Context**: Show period-over-period change (vs. last month, vs. target) next to every KPI.
