# Homepage Final Direction Implementation Plan

> **For Claude:** Use `Executing Plans` to implement this plan task-by-task.

**Goal:** Refine the approved homepage into a clearer premium-gifting presentation with an integrated hero, stable screen typography, cohesive photography and quieter calls to action.

**Architecture:** Keep the existing homepage information architecture and server-side catalogue queries. Limit production changes to the global display-font import/token, the homepage Hero, and the homepage-only category gateway presentation; preserve all routes, product data and commerce flows.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS 4, Fontsource, source-level Node regression guards, browser QA.

---

### Task 1: Lock the final-direction constraints

**Files:**
- Modify: `scripts/test-homepage-simplification.mjs`

1. Add assertions for an integrated, borderless hero; immediate visibility of hero copy; the approved site photography; a quieter homepage CTA; and the stable serif font.
2. Run `npm run test:homepage-simplification` and confirm the new assertions fail for the current implementation.

### Task 2: Stabilise the display typography

**Files:**
- Modify: `src/app/layout.tsx`
- Modify: `src/app/globals.css`
- Modify: `package.json`
- Modify: `package-lock.json`

1. Replace the Bodoni Moda import with Lora Variable.
2. Point the existing display token to Lora with a robust serif fallback stack.
3. Keep Jost as the body and utility face; do not change the logo assets.

### Task 3: Integrate the homepage hero

**Files:**
- Modify: `src/components/hero.tsx`
- Modify: `src/app/(shop)/page.tsx`

1. Remove the inset border/card treatment and make the hero read as one full-width brand scene.
2. Use the warm closed-gift-box photograph instead of the current tissue-box image.
3. Keep one title, one short supporting line and one CTA.
4. Remove delayed entrance animation from critical hero copy so it is always immediately visible.
5. Keep mobile image and copy proportions compact enough to reveal the CTA early.

### Task 4: Quiet the homepage commercial controls

**Files:**
- Modify: `src/app/(shop)/page.tsx`
- Modify: `src/app/globals.css`

1. Add a homepage-specific CTA treatment with sentence case, restrained tracking and 44px minimum touch height.
2. Preserve the approved Festive product section and the three unified category gateways.
3. Keep the walnut Wine colour beat and current warm neutral palette.

### Task 5: Verify and deploy

**Files:**
- Test: `scripts/test-homepage-simplification.mjs`

1. Run the homepage guard, full test scripts, lint and production build.
2. Check localhost at 1440px and 390px for hero visibility, typography, image loading, overflow and section rhythm.
3. Verify every homepage CTA target.
4. Commit, push `website-v1`, wait for Vercel production deployment, and repeat the production visual/runtime checks.
