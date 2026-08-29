---
name: Wanpan-e (완판e) Design System
colors:
  surface: '#fcf8ff'
  surface-dim: '#dcd8e2'
  surface-bright: '#fcf8ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f6f2fc'
  surface-container: '#f0ecf6'
  surface-container-high: '#ebe6f0'
  surface-container-highest: '#e5e1eb'
  on-surface: '#1c1b22'
  on-surface-variant: '#474553'
  inverse-surface: '#312f37'
  inverse-on-surface: '#f3eff9'
  outline: '#787584'
  outline-variant: '#c8c4d5'
  surface-tint: '#584fbc'
  primary: '#3b309e'
  on-primary: '#ffffff'
  primary-container: '#534ab7'
  on-primary-container: '#d1ccff'
  inverse-primary: '#c5c0ff'
  secondary: '#5d5d6b'
  on-secondary: '#ffffff'
  secondary-container: '#e2e1f2'
  on-secondary-container: '#636371'
  tertiary: '#683500'
  on-tertiary: '#ffffff'
  tertiary-container: '#8a4900'
  on-tertiary-container: '#ffc69a'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e3dfff'
  primary-fixed-dim: '#c5c0ff'
  on-primary-fixed: '#140067'
  on-primary-fixed-variant: '#3f35a3'
  secondary-fixed: '#e2e1f2'
  secondary-fixed-dim: '#c5c5d5'
  on-secondary-fixed: '#191b26'
  on-secondary-fixed-variant: '#454653'
  tertiary-fixed: '#ffdcc3'
  tertiary-fixed-dim: '#ffb77d'
  on-tertiary-fixed: '#2f1500'
  on-tertiary-fixed-variant: '#6e3900'
  background: '#fcf8ff'
  on-background: '#1c1b22'
  surface-variant: '#e5e1eb'
typography:
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 32px
    fontWeight: '700'
    lineHeight: '1.3'
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 26px
    fontWeight: '700'
    lineHeight: '1.3'
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 22px
    fontWeight: '700'
    lineHeight: '1.4'
  body-lg:
    fontFamily: Be Vietnam Pro
    fontSize: 18px
    fontWeight: '500'
    lineHeight: '1.6'
  body-md:
    fontFamily: Be Vietnam Pro
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.6'
  label-md:
    fontFamily: Be Vietnam Pro
    fontSize: 14px
    fontWeight: '600'
    lineHeight: '1.4'
  label-sm:
    fontFamily: Be Vietnam Pro
    fontSize: 12px
    fontWeight: '600'
    lineHeight: '1.2'
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 4px
  container-padding: 20px
  gutter: 16px
  stack-sm: 8px
  stack-md: 16px
  stack-lg: 24px
---

## Brand & Style
The design system for this AI-based real estate subscription platform is built to resonate with the Gen Z and Millennial (2030s) demographic. The brand personality is **friendly, witty, and simple**, mirroring the approachable nature of modern Korean fintech leaders. 

The aesthetic follows a **Modern-Flat** movement with **Bento-grid** influences. It prioritizes high legibility and a "clutter-free" interface to reduce the cognitive load often associated with complex real estate data. A friendly tiger mascot is integrated into the user journey—specifically during onboarding, empty states, and success milestones—to provide emotional reassurance and a touch of wit.

**Emotional Goals:**
- **Trustworthy:** Through clean layouts and structured data.
- **Approachable:** Through soft colors and a conversational tone (Haeyo-che).
- **Efficient:** Through bold, scannable typography and high-contrast elements.

## Colors
The palette uses a crisp white base to ensure a clean, editorial feel. 

- **Primary Purple (#534AB7):** Reserved for high-impact CTAs, active states, and key brand moments.
- **Secondary Lavender (#EEEDFE):** Used for large surface areas, section backgrounds, and subtle grouping to keep the UI soft and welcoming.
- **Functional Status Colors:**
  - **Pink:** '접수 중' (Application Open) - High energy and visibility.
  - **Green:** '자격 충족' (Qualified/OK) - Clarity and success.
  - **Coral/Orange:** '마감 임박/금액' (Deadline/Price) - Urgency and financial highlights.
- **Text:** Dark Gray (#2D2D2D) is used instead of pure black to maintain high contrast while remaining easy on the eyes for long reading sessions.

## Typography
The typography system uses a maximum of two font weights (Regular/Medium and Bold) to maintain simplicity. The tone of voice is **'Haeyo-che' (해요체)**, ensuring all copy feels like a helpful conversation rather than a legal document.

**Key Rules:**
- **Language:** Strictly Korean for all functional labels (홈, 검색, 추천, 상담, 마이).
- **Hierarchy:** Large, bold headlines for section titles to allow quick scanning of real estate listings.
- **Clarity:** Body text uses generous line-heights to ensure complex subscription terms are easily readable.

## Layout & Spacing
This design system utilizes a **Bento-grid** philosophy, particularly on the '추천' (Recommendation) and '홈' (Home) screens. Content is grouped into logical "tiles" of varying sizes that snap to a fluid 12-column grid on desktop and a single-column stack on mobile.

- **Margins:** A consistent 20px side margin on mobile devices to prevent content from touching the screen edges.
- **Gaps:** 16px gutters between grid items to maintain a sense of openness and airiness.
- **Rhythm:** Vertical spacing follows an 8px scale, prioritizing clear separation between distinct property features.

## Elevation & Depth
In line with the Modern-Flat style, depth is created through **Tonal Layers** rather than heavy shadows. 

- **Surface Levels:** The main background is White (#FFFFFF). Content cards sit on this surface with a very subtle, soft-lavender border or a minimal, high-diffusion shadow (Opacity 5-8%) to suggest interactability.
- **Bento Tiles:** Use Lavender (#EEEDFE) backgrounds for secondary information to create a visual "nesting" effect without adding physical height.
- **Interaction:** Hover or press states on cards slightly deepen the shadow or add a 1px primary-colored stroke.

## Shapes
The shape language is consistently rounded to evoke a "friendly and soft" emotional response.

- **Cards:** Use a radius of 12px to 16px to create a modern, app-centric look.
- **Buttons:** Specifically set to 10px to balance the softness of cards with a slightly more structured, actionable feel.
- **Chips/Badges:** Always pill-shaped (fully rounded) to differentiate them from larger interactive cards and buttons.

## Components
- **Buttons:**
  - **Primary:** Purple background, white text, 10px radius. Used for '청약 신청하기' (Apply).
  - **Secondary:** Lavender background, Purple text. Used for '상세 보기' (View Details).
- **Chips/Badges (Pill):**
  - Used for status indicators like '접수 중' or '오늘 마감'. Use white text on status colors or colored text on a 10% opacity background of the same hue.
- **Cards (Bento Style):**
  - High-contrast cards for property listings. Property price should always be highlighted in Coral/Orange. Headlines within cards should use `headline-md`.
- **Input Fields:**
  - Soft gray borders (1px) that change to Primary Purple on focus. Labels should be in `label-md` using Korean text only.
- **Navigation (Bottom Bar):**
  - 5-item layout: 홈 (Home), 검색 (Search), 추천 (Recommendation), 상담 (Counseling), 마이 (My). Icons should be thick-stroke (2px) and friendly.
- **Mascot Integration:**
  - Place the tiger mascot in a 'Speech Bubble' style to explain technical terms or congratulate users on completing an application.