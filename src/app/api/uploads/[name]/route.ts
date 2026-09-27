import { promises as fs } from "node:fs";
import path from "node:path";
import { UPLOAD_DIR } from "@/lib/store/demo";

/** Serves images uploaded while running without Supabase (demo mode only). */
export async function GET(_req: Request, ctx: RouteContext<"/api/uploads/[name]">) {
  const { name } = await ctx.params;
  const safe = path.basename(decodeURIComponent(name));
  if (!/^[a-z0-9-]+\.webp$/.test(safe)) return new Response("Not found", { status: 404 });
  try {
    const data = await fs.readFile(path.join(UPLOAD_DIR, safe));
    return new Response(new Uint8Array(data), { headers: { "content-type": "image/webp", "cache-control": "public, max-age=31536000, immutable" } });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
