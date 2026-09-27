import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import sharp from "sharp";
import { slugify } from "@/lib/catalog";
import { isAdmin } from "@/lib/admin/auth";
import { getStore } from "@/lib/store";

const MAX_BYTES = 15 * 1024 * 1024;

/** Admin image upload: resizes to max 2000px and converts to WebP before storing. */
export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const form = await req.formData().catch(() => null);
  const files = (form?.getAll("files") ?? []).filter((f): f is File => f instanceof File);
  if (!files.length) return NextResponse.json({ error: "No files received" }, { status: 400 });

  const store = await getStore();
  const results: { src: string; width: number; height: number; name: string }[] = [];
  const errors: string[] = [];
  for (const file of files.slice(0, 10)) {
    if (!file.type.startsWith("image/")) {
      errors.push(`${file.name}: not an image`);
      continue;
    }
    if (file.size > MAX_BYTES) {
      errors.push(`${file.name}: larger than 15 MB`);
      continue;
    }
    try {
      const input = Buffer.from(await file.arrayBuffer());
      const { data, info } = await sharp(input)
        .rotate()
        .resize({ width: 2000, height: 2500, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer({ resolveWithObject: true });
      const base = slugify(file.name.replace(/\.[^.]+$/, "")).slice(0, 40) || "image";
      const name = `${base}-${randomBytes(4).toString("hex")}.webp`;
      const src = await store.saveUpload(name, data, "image/webp");
      results.push({ src, width: info.width, height: info.height, name: file.name });
    } catch (err) {
      console.error("[upload]", err);
      errors.push(`${file.name}: could not be processed`);
    }
  }
  return NextResponse.json({ images: results, errors });
}
