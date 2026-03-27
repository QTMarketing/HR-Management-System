Visual Design Language: Multi-Location Retail HR Dashboard

Document Version: 1.5  
Date: March 26, 2026  
Author: Manus AI (60-30-10: white / orange gradient / matte black; status colors only for alerts)

1. Introduction

This document defines the visual design language for the new multi-location retail HR dashboard. It synthesizes insights from a curated selection of modern dashboard inspirations on Dribbble, aiming to create a "beautiful," intuitive, and professional user interface. The goal is to establish a consistent aesthetic that enhances usability and reflects the dashboard's efficiency and data-driven nature.

**Scope:** Product requirements and feature behavior are defined in `Project-PRD.md` and are **not** changed here. This document only governs **presentation**: a **fluid layout shell** (responsive, sticky where helpful—not rigid fixed chrome) and **fluid use of color** (anchors below, soft gradients and layers on top—see §3.3).

2. Core Design Principles

The visual design will adhere to the following principles:

•
Clarity & Readability: Prioritizing legibility and clear information hierarchy.

•
Modern Minimalism: A clean, uncluttered interface that focuses on essential content.

•
Intuitive Interaction: Design elements that guide users naturally through workflows.

•
Subtle Sophistication: Use of soft shadows, subtle gradients, and thoughtful spacing to create a polished feel without being overly ornate.

•
Brand Consistency: A cohesive visual experience across all dashboard components.

3. Color Palette

The UI follows **60-30-10** using **only three brand hues**: **white** (~60%), **orange gradient** (~30%), **matte black** (~10%). **Do not** introduce **teal** or other brand accents—teal was removed to avoid clashing with orange.

**Exceptions (not part of the trio):** **Emerald**, **amber**, and **red** are reserved for **status** (approved, late, error) and **alerts** only—small dots, pills, and banners.

Implementation tokens: `app/globals.css` — `--structure-*` (orange anchors), `--accent` / `--accent-hover` (matte black). Chart bars use **inline `linear-gradient`** with `--structure-*`.

3.0 The 60-30-10 roles

• **60% — Base (white):** Page shell, most cards, tables, reading areas — `bg-white`. Body text on **slate** neutrals for readability (`text-slate-700` / `text-slate-800`) — gray is **not** an accent color.

• **30% — Orange (structure):** Logo gradient, **operations snapshot** card, **attendance chart** bars, **active sidebar** (`bg-orange-100`, `border-orange-500`), **avatar** ring (`from-orange-400 to-orange-600`), **soft panels** (`bg-orange-50`, `border-orange-200`), **focus rings** on inputs (`ring-orange-500/20`–`/25`), **non-semantic** info dots (`orange-400`).

• **10% — Matte black:** **Primary buttons** and destructive/high-intent actions — `bg-accent`, `hover:bg-accent-hover`. Not for full navigation bars.

• **Status & alerts (exceptions):** **Emerald** / **amber** / **red** — badges, table status pills, activity “late/ok”, error text — **never** for large marketing-style surfaces.

3.1 Light Mode Palette

| Usage | Color | Hex / tokens | Notes |
|--------|--------|----------------|--------|
| Base / primary surface | White | `#FFFFFF` | `bg-white`, `bg-background` |
| Structure (orange) | Gradient anchors | `#fb923c` → `#f97316` → `#ea580c` | Logo, snapshot, chart bars (inline gradient) |
| Accent (primary CTA) | Matte black | `#0a0a0a` / `#171717` | `bg-accent` — primary buttons |
| Success / Active | Emerald | `#10B981` | Status only |
| Warning / Late | Amber | `#F59E0B` | Status only |
| Error / Danger | Red | `#EF4444` | Alerts & status only |
| Text (primary) | Slate | `#334155`–`#1E293B` | `text-slate-700`, `text-slate-800` |
| Text (secondary) | Medium gray | `#64748B` | `text-slate-500` |
| Border / divider | Light gray | `#E2E8F0` | `border-slate-200` |




3.2 Dark Mode Palette (Optional / Low Priority)

Light mode is the default product experience; dark mode may be added later without changing brand semantics.

Usage
Color Name
Hex Code
Tailwind CSS Class (Example)
Background
Dark Blue-Gray (Base)
#0F172A
bg-slate-900
Card Background
Darker Blue-Gray
#1E293B
bg-slate-800
Primary Accent
Sky Blue
#38BDF8
text-sky-400, bg-sky-400
Success
Green
#4ADE80
text-green-400, bg-green-400
Warning/Late
Amber Yellow
#FBBF24
text-amber-400, bg-amber-400
Error/Alert
Red
#F87171
text-red-400, bg-red-400
Text (Primary)
Light Gray
#F1F5F9
text-slate-100
Text (Secondary)
Medium Gray
#94A3B8
text-slate-400
Border/Divider
Dark Gray
#334155
border-slate-700

3.3 Color fluidity

Apply the palette in a **soft, continuous** way so the UI feels modern and breathable.

• **Base first:** Prefer **flat white** main content (`app/(dashboard)/layout.tsx` pattern). Avoid washing the whole canvas in orange tint—reserve orange for **named structure** surfaces.

• **Gradients:** **Orange** only on charts, logo, and hero cards (e.g. operations snapshot). Reading areas stay white.

• **Opacity & layering:** `bg-white/90`, `backdrop-blur-sm`, `border-slate-200/80` on floating headers.

• **Semantics:** Emerald / amber / red stay **strict** for status and alerts; bright dots and pills only.

• **Charts:** Series colors **orange** (inline gradient from `--structure-*`); comparison series may use **slate** neutrals or semantics—**not** a second saturated brand hue.

4. Typography

The dashboard will utilize a clean, modern sans-serif typeface to ensure optimal readability and a professional appearance. The font choice will prioritize clarity and legibility across various screen sizes and data densities.

•
Primary Font: Inter (or similar, e.g., Roboto, Montserrat)

•
Weights: Regular (400), Medium (500), Semi-Bold (600), Bold (700)

•
Usage:

•
Headings (H1-H3): Semi-Bold to Bold, larger sizes for hierarchy.

•
Body Text: Regular to Medium, comfortable reading size.

•
Navigation/Labels: Medium to Semi-Bold, slightly smaller sizes.



5. UI Components and Styles

5.1 Layout Structure

•
**Fluid shell (not rigid fixed chrome):** Use a **flex or grid** page structure. On small screens, stack navigation and content; on `lg+`, use a **left column for navigation** and a **main column** that grows. Prefer **`sticky`** top header (and optionally sticky sidebar) so the page scrolls naturally—avoid defaulting to `position: fixed` for the whole sidebar/header unless a specific UX requires it. Details and Tailwind examples: `layout-proposal.md`.

•
**Sidebar:** Slim, left-aligned primary navigation—clean icons and bold, readable text. **Collapsible** to maximize content area. Same **information architecture** as the PRD; only placement/scroll behavior is fluid.

•
**Top Header:** Consistent across pages: global search, location switcher (managers), profile, notifications. May use **backdrop blur** / translucent background (`bg-white/95`, `backdrop-blur-sm`) for a fluid feel when scrolling.

•
**Main Content Area:** **Flexible grid** for dashboard widgets and module content; generous gaps; content scrolls as one flow unless a widget needs its own scroll (`max-h-*` + `overflow-y-auto`).

5.2 Cards and Containers

•
Style: Predominantly card-based layouts with subtle rounded corners (e.g., rounded-lg or rounded-xl in Tailwind CSS).

•
Depth: Use of soft, subtle shadows (e.g., shadow-md or shadow-lg) to create a sense of elevation and separation between elements, avoiding harsh lines.

•
Padding: Consistent internal padding within cards to ensure content breathability.

5.3 Data Visualizations

•
Charts: Clean, modern line, bar, and doughnut charts with a minimalist aesthetic. Colors within charts will align with the defined palette, using primary and success colors for positive metrics and warning/error colors for negative trends or alerts.

•
Indicators: Use of small, clear icons and color-coded text for status indicators (e.g., green for active, red for late).

5.4 Forms and Inputs

•
Input Fields: Bordered inputs; focus uses **orange** at low weight — e.g. `focus:border-orange-300 focus:ring-2 focus:ring-orange-500/25` (see `app-header.tsx`).

•
Buttons: **Primary** — `bg-accent`, `hover:bg-accent-hover`, white text. **Secondary** — outline `border-slate-200` or soft **orange** outline; **Ghost** — `hover:bg-slate-100`.

•
Dropdowns: Consistent styling for dropdown menus, ensuring they are easy to identify and interact with.

5.5 Icons

•
Style: Line-based or filled icons that are consistent in style and weight. A library like Feather Icons or Heroicons would be suitable.

•
Usage: Used sparingly to complement text labels in navigation and key actions, not to replace them entirely.

6. Animations and Transitions

Subtle animations and transitions will be incorporated to enhance the user experience without being distracting. Examples include:

•
Smooth transitions for sidebar expansion/collapse.

•
Subtle hover effects on cards and buttons.

•
Fading or sliding animations for content loading or state changes.

7. Accessibility Considerations

•
Color Contrast: Ensuring sufficient color contrast for all text and interactive elements to meet WCAG guidelines.

•
Keyboard Navigation: All interactive elements will be navigable via keyboard.

•
Semantic HTML: Using appropriate HTML elements to improve screen reader compatibility.

This visual design language provides a comprehensive guide for the aesthetic development of the HR dashboard, ensuring a cohesive, modern, and user-friendly interface. It will be applied consistently across all components to deliver a premium user experience.

