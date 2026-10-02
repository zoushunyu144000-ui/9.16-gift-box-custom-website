"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Trash2, Upload } from "lucide-react";
import { deleteFestivalAction, saveFestivalAction } from "@/lib/admin/actions";
import { slugify } from "@/lib/catalog";
import type { Festival } from "@/lib/types";
import { ProductImage } from "../product-image";

/**
 * One festival: name, URL, description, cover image, shown/hidden and order.
 * `festival` null = a new festival.
 */
export function FestivalEditor({ festival, productCount = 0, nextSort = 100 }: { festival: Festival | null; productCount?: number; nextSort?: number }) {
  const router = useRouter();
  const [name, setName] = useState(festival?.name ?? "");
  const [slug, setSlug] = useState(festival?.slug ?? "");
  const [description, setDescription] = useState(festival?.description ?? "");
  const [cover, setCover] = useState(festival?.coverImage ?? null);
  const [active, setActive] = useState(festival?.active ?? true);
  const [sort, setSort] = useState(festival?.sort ?? nextSort);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function upload(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setUploading(true);
    setMsg(null);
    try {
      const fd = new FormData();
      fd.append("files", file);
      const res = await fetch("/api/admin/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok || !data.images?.[0]) throw new Error(data.error || data.errors?.[0] || "Upload failed");
      const img = data.images[0] as { src: string; width: number; height: number };
      setCover({ src: img.src, alt: name, width: img.width, height: img.height });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function save() {
    setMsg(null);
    start(async () => {
      const r = await saveFestivalAction({ id: festival?.id, name, slug, description, coverImage: cover ? { ...cover, alt: cover.alt || name } : null, active, sort });
      if (!r.ok) return setMsg({ ok: false, text: r.error });
      setMsg({ ok: true, text: "Saved. The website is updated." });
      if (!festival) {
        setName("");
        setSlug("");
        setDescription("");
        setCover(null);
      }
      router.refresh();
    });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      className="grid gap-5 border border-line bg-ivory p-5 md:grid-cols-[160px_1fr]"
    >
      <div>
        <div className="border border-line bg-white p-1.5">
          {cover ? <ProductImage src={cover.src} alt={cover.alt} ratio={0.8} sizes="160px" /> : <div className="grid aspect-[5/4] place-items-center text-[11px] text-ink-3">No cover</div>}
        </div>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => upload(e.target.files)} />
        <div className="mt-2 flex gap-2">
          <button type="button" className="btn btn-outline !min-h-9 flex-1 !px-2 text-[12px]" onClick={() => fileRef.current?.click()} disabled={uploading}>
            <Upload className="h-3.5 w-3.5" strokeWidth={1.25} /> {uploading ? "Uploading…" : "Cover"}
          </button>
          {cover && (
            <button type="button" className="btn btn-outline !min-h-9 !px-2" aria-label="Remove cover" onClick={() => setCover(null)}>
              <Trash2 className="h-3.5 w-3.5" strokeWidth={1.25} />
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="block">
          <span className="field-label">Festival name</span>
          <input className="field" value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} placeholder="e.g. Mid-Autumn Festival" />
        </label>
        <label className="block">
          <span className="field-label">URL name</span>
          <input className="field" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder={slugify(name)} maxLength={80} />
          <span className="mt-1 block text-[12px] text-ink-3">/festive/{slugify(slug || name) || "…"}</span>
        </label>
        <label className="block md:col-span-2">
          <span className="field-label">Short description (optional)</span>
          <input className="field" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} />
        </label>
        <div className="flex flex-wrap items-end gap-5 md:col-span-2">
          <label className="block w-28">
            <span className="field-label">Order</span>
            <input className="field" type="number" min={0} value={sort} onChange={(e) => setSort(parseInt(e.target.value || "0", 10))} />
          </label>
          <label className="flex items-center gap-3 pb-3 text-[14px]">
            <input type="checkbox" className="check !mt-0" checked={active} onChange={(e) => setActive(e.target.checked)} />
            Shown on the website
          </label>
          {festival && <span className="pb-3 text-[12px] text-ink-3">{productCount} {productCount === 1 ? "product" : "products"}</span>}
        </div>
        <div className="flex flex-wrap items-center gap-3 md:col-span-2">
          <button className="btn btn-primary" disabled={pending || uploading}>
            {pending ? "Saving…" : festival ? "Save festival" : "Add festival"}
          </button>
          {festival && (
            <button
              type="button"
              className="btn btn-outline !px-4 text-danger"
              disabled={pending}
              onClick={() => {
                if (!confirm(`Delete “${festival.name}”? To take it off the website for now, untick “Shown on the website” instead.`)) return;
                start(async () => {
                  const r = await deleteFestivalAction(festival.id);
                  if (!r.ok) return setMsg({ ok: false, text: r.error ?? "Could not delete" });
                  router.refresh();
                });
              }}
              aria-label="Delete festival"
            >
              <Trash2 className="h-4 w-4" strokeWidth={1.25} />
            </button>
          )}
          {msg && (
            <p className={`text-[13px] ${msg.ok ? "text-success" : "text-danger"}`} role="status">
              {msg.text}
            </p>
          )}
        </div>
      </div>
    </form>
  );
}
