---
name: Hepha
colors:
  surface: '#10131a'
  surface-dim: '#10131a'
  surface-bright: '#363941'
  surface-container-lowest: '#0b0e15'
  surface-container-low: '#191c22'
  surface-container: '#1d2027'
  surface-container-high: '#272a31'
  surface-container-highest: '#32353c'
  on-surface: '#e0e2ec'
  on-surface-variant: '#d8c3ad'
  inverse-surface: '#e0e2ec'
  inverse-on-surface: '#2d3038'
  outline: '#a08e7a'
  outline-variant: '#534434'
  surface-tint: '#ffb95f'
  primary: '#ffc174'
  on-primary: '#472a00'
  primary-container: '#f59e0b'
  on-primary-container: '#613b00'
  inverse-primary: '#855300'
  secondary: '#4cd7f6'
  on-secondary: '#003640'
  secondary-container: '#03b5d3'
  on-secondary-container: '#00424e'
  tertiary: '#8fd5ff'
  on-tertiary: '#00344a'
  tertiary-container: '#1abdff'
  on-tertiary-container: '#004966'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#ffddb8'
  primary-fixed-dim: '#ffb95f'
  on-primary-fixed: '#2a1700'
  on-primary-fixed-variant: '#653e00'
  secondary-fixed: '#acedff'
  secondary-fixed-dim: '#4cd7f6'
  on-secondary-fixed: '#001f26'
  on-secondary-fixed-variant: '#004e5c'
  tertiary-fixed: '#c5e7ff'
  tertiary-fixed-dim: '#7fd0ff'
  on-tertiary-fixed: '#001e2d'
  on-tertiary-fixed-variant: '#004c6a'
  background: '#10131a'
  on-background: '#e0e2ec'
  surface-variant: '#32353c'
typography:
  display:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.02em
  headline:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
  code:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 18px
  label-caps:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '700'
    lineHeight: 16px
    letterSpacing: 0.05em
  status-label:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 14px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  unit: 4px
  container-padding: 1.5rem
  gutter: 1rem
  stack-sm: 0.5rem
  stack-md: 1rem
  section-gap: 2rem
---

## Brand & Style
The design system is engineered for high-performance developer operations. It prioritizes information density, utility, and precision over decorative aesthetics. The brand personality is **industrious and automated**, evoking the atmosphere of a digital forge where complex infrastructure is managed with surgical accuracy.

The visual style is **Professional / Technical**, utilizing a dark, low-fatigue interface designed for long-duration monitoring and configuration tasks. It leans into a "Modern Tooling" aesthetic: monochromatic foundations punctuated by high-signal functional colors. Interaction patterns are direct and predictable, avoiding unnecessary motion or "soft" UI trends in favor of a rigid, grid-aligned structure that suggests reliability and structural integrity.

## Colors
The palette is built on a deep, obsidian base to reduce eye strain in technical environments.

- **Base Layer:** `#0F1115` serves as the primary canvas.
- **Surface Layer:** `#1C1F26` (Graphite) is used for cards, panels, and sidebars to create subtle depth.
- **Stroke/Border:** `#373B43` (Steel Gray) provides the structural definition for all UI boundaries.
- **Accent - Heat (Amber):** `#F59E0B` is used sparingly for primary actions, warnings, and "active forge" states, symbolizing energy and execution.
- **Accent - Flow (Cyan):** `#06B6D4` is reserved for "Live" status, healthy deployments, and active telemetry streams.
- **Semantic Signals:** Use standard red for critical errors and green for success, but ensure they are desaturated to maintain the professional tone.

## Typography
This design system utilizes **Inter** for all UI copy to ensure maximum legibility at small sizes. To enhance the technical feel, **JetBrains Mono** is employed for data values, IDs, and code snippets.

Typography is intentionally compact. Large display sizes are avoided; information hierarchy is instead established through font weight and subtle color shifts (e.g., using "High Emphasis" white for headings and "Medium Emphasis" gray for secondary text). All labels for table headers and metadata should use the `label-caps` style to differentiate them from interactive data.

## Layout & Spacing
The layout follows a **Fixed-Fluid Hybrid Grid**. Sidebars and navigation panels occupy fixed widths (e.g., 240px or 64px collapsed), while the main dashboard area is fluid to maximize real-estate for logs and data visualizations.

Spacing is tight and systematic, based on a **4px base unit**. Dashboards should prioritize "above the fold" information; use `stack-sm` (8px) for related form elements and `stack-md` (16px) for grouping logical sections. Padding within cards and data tables should be kept to a functional minimum to allow for high-density information display.

## Elevation & Depth
In this design system, depth is communicated through **Tonal Layering** and **Subtle Outlines** rather than heavy shadows.

- **Level 0 (Background):** `#0F1115` - The main application shell.
- **Level 1 (Panels):** `#1C1F26` - Cards, sidebars, and header bars. These are defined by a 1px border of `#373B43`.
- **Level 2 (Modals/Popovers):** Slightly lighter surface with a 1px border and a sharp, low-spread black shadow (`0 4px 12px rgba(0,0,0,0.5)`) to provide separation without breaking the flat, technical aesthetic.
- **Interactive States:** Hovering over a card or list item should change the background to a slightly lighter gray or highlight the border with a subtle steel tint.

## Shapes
The shape language is **Rectilinear and Sharp**. A uniform `0.25rem` (4px) radius is applied to all standard components like buttons, inputs, and cards. This small radius maintains a professional, "machined" look while avoiding the harshness of absolute 90-degree corners.

- **Standard Elements:** 4px radius.
- **Inner Elements (inside padded containers):** 2px radius to maintain visual nesting ratios.
- **Status Indicators:** Small circles (0px radius for square status blocks or 100% for circular "Live" pips).

## Components
- **Buttons:** Use a solid Amber (`#F59E0B`) for primary actions with dark text. Secondary buttons should use the Steel Gray border with no fill. All buttons are compact (32px height for standard, 28px for small).
- **Data Tables:** These are the core of the dashboard. Use 1px borders for rows, no vertical borders. Header rows use `label-caps` with a darker background tint.
- **Input Fields:** Darker than the surface (`#0F1115`), with a persistent 1px border. Focus state should be a 1px Amber ring with no glow.
- **Chips/Badges:** Small, rectangular badges with subtle background tints and high-contrast text. Use the Cyan (`#06B6D4`) accent for "Running" or "Active" states.
- **Status Indicators:** Use a pulse animation for the Cyan "Live" activity pip.
- **Terminal/Console:** A dedicated component using JetBrains Mono on a pitch-black background for log output and CLI interactions.
