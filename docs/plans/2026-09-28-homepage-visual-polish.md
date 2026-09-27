# Homepage Visual Polish Implementation Plan

> **For Claude:** Use `Executing Plans` to implement this plan task-by-task.

**Goal:** Finish the approved homepage with one cohesive photography system, quieter category actions and a slightly warmer Wine section without changing structure or functionality.

**Architecture:** Preserve the current homepage component tree, product rail and route targets. Make only homepage-scoped presentation changes: replace the Wine gateway placeholder, add a restrained CTA modifier for category gateways, and tune the existing walnut token by a small amount.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS 4, Fontsource Lora/Jost, source-level Node regression guards, browser QA.

---

### Task 1: Lock the polish boundaries

**Files:**
- Modify: `scripts/test-homepage-simplification.mjs`

1. Assert that the homepage uses a dedicated unbranded Wine image.
2. Assert that category gateways use a quiet CTA modifier while Hero keeps the primary CTA.
3. Assert that the approved warm walnut value remains explicit.
4. Run `npm run test:homepage-simplification` and confirm the new requirements fail before implementation.

### Task 2: Align the Wine photography

**Files:**
- Create: `public/images/moire-home-wine-v1.webp`
- Modify: `src/data/seed.ts`
- Modify: `src/app/(shop)/page.tsx`

1. Generate one unbranded Wine & Spirits homepage photograph in the same warm studio world as the Hero, Fixed and Corporate assets.
2. Save an optimised WebP in the project.
3. Reference it only from the homepage gateway; do not change product data.

### Task 3: Reduce CTA weight and warm the Wine beat

**Files:**
- Modify: `src/app/globals.css`
- Modify: `src/app/(shop)/page.tsx`

1. Add a smaller, lower-tracking CTA modifier for the three category gateways.
2. Keep the Hero CTA unchanged as the single primary action.
3. Shift the existing walnut token slightly warmer without introducing a new palette colour.

### Task 4: Verify and deploy

1. Run all regression guards, lint and production build.
2. Verify 1440px and 390px image loading, font loading, overflow, section rhythm and CTA targets.
3. Commit and push `website-v1`.
4. Deploy the verified commit to Vercel Production and repeat production visual/runtime checks.
