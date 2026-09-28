# Grand Prosperity Hamper Gallery Implementation Plan

> **For Claude:** Use `${SUPERPOWERS_SKILLS_ROOT}/skills/collaboration/executing-plans/SKILL.md` to implement this plan task-by-task.

**Goal:** Replace the Grand Prosperity Hamper's unrelated festive scene and red-envelope photograph with a coherent three-image premium hamper gallery while preserving all product-page UI and commerce behavior.

**Architecture:** Keep the product record in `src/data/seed.ts` as the single source used by the demo storefront and metadata. Add three project-local optimized WebP assets and point only this product's `images` array at them; retain the existing contents list, including “Red envelope set”.

**Tech Stack:** Next.js 16, TypeScript seed data, Node assertion scripts, WebP assets, built-in image generation.

---

### Task 1: Add a product-gallery regression test

**Files:**
- Create: `scripts/test-grand-prosperity-gallery.mjs`
- Modify: `package.json`

1. Assert the product has exactly three local gallery images.
2. Assert no image source or alt contains “red envelope”.
3. Assert “Red envelope set” remains in the product contents.
4. Assert every referenced local asset exists and is non-empty.
5. Run the test and confirm it fails against the current two Unsplash images.

### Task 2: Create the coherent gallery assets

**Files:**
- Create: `public/images/grand-prosperity-hamper-hero-v1.webp`
- Create: `public/images/grand-prosperity-hamper-open-v1.webp`
- Create: `public/images/grand-prosperity-hamper-detail-v1.webp`

1. Generate three complementary premium commercial photographs in one warm neutral CNY photography system.
2. Inspect each output for product prominence, restrained red accents, no logos, no text, and no standalone red envelope.
3. Optimize selected images to WebP in the project.

### Task 3: Update only the product image data

**Files:**
- Modify: `src/data/seed.ts`
- Modify: `IMAGE-CREDITS.md`

1. Replace only `grand-prosperity-hamper.images` with the three local assets and accurate alt text.
2. Preserve the full contents list, price, title, description, variants, and purchase behavior.
3. Remove obsolete Unsplash credit rows that are no longer referenced.
4. Run the focused regression test and confirm it passes.

### Task 4: Verify and deploy

1. Run the focused test and all existing regression scripts.
2. Run lint and production build.
3. Inspect desktop and 390px mobile gallery behavior, image loading, zoom, metadata, and Add to Bag.
4. Commit and push `website-v1`.
5. Deploy production to Vercel and repeat critical checks on the public URL.
