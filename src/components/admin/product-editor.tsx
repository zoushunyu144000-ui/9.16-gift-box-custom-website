"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2, Upload } from "lucide-react";
import { deleteProductAction, saveProductAction, type ProductInputType } from "@/lib/admin/actions";
import { CATEGORIES, OCCASIONS, slugify } from "@/lib/catalog";
import type { Product } from "@/lib/types";
import { ProductImage } from "../product-image";

type Form = ProductInputType & { contentsText: string; specsText: string; priceText: string };

function toForm(p: Product | null): Form {
  return {
    id: p?.id,
    name: p?.name ?? "",
    slug: p?.slug ?? "",
    category: p?.category ?? "fixed-gifts",
    occasion: p?.occasion ?? null,
    status: p?.status ?? "hidden",
    availabilityNote: p?.availabilityNote ?? "",
    price: p?.price ?? 0,
    priceText: p ? String(p.price) : "",
    summary: p?.summary ?? "",
    description: p?.description ?? "",
    contents: p?.contents ?? [],
    contentsText: (p?.contents ?? []).join("\n"),
    specs: p?.specs ?? [],
    specsText: (p?.specs ?? []).map((s) => `${s.label}: ${s.value}`).join("\n"),
    allergens: p?.allergens ?? "",
    storage: p?.storage ?? "",
    images: p?.images ?? [],
    variants: p?.variants ?? [],
    personalisation: p?.personalisation ?? null,
    containsAlcohol: p?.containsAlcohol ?? false,
    featured: p?.featured ?? false,
    sort: p?.sort ?? 100,
  };
}

/** Downscale large photos in the browser so uploads stay small and fast (server re-encodes to WebP). */
async function downscale(file: File, max = 2400): Promise<Blob> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.size < 3.5 * 1024 * 1024) return file;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((res) => canvas.toBlob((b) => res(b ?? file), "image/jpeg", 0.9));
  } catch {
    return file;
  }
}

export function ProductEditor({ product }: { product: Product | null }) {
  const router = useRouter();
  const [f, setF] = useState<Form>(() => toForm(product));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  const [uploading, setUploading] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    setF((p) => ({ ...p, [k]: v }));
    setSaved(false);
  };

  async function uploadFiles(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    const list = Array.from(files).slice(0, 10);
    for (let i = 0; i < list.length; i++) {
      setUploading(`Uploading ${i + 1} of ${list.length}…`);
      const blob = await downscale(list[i]);
      const fd = new FormData();
      fd.append("files", new File([blob], list[i].name.replace(/\.\w+$/, "") + ".jpg", { type: blob.type || "image/jpeg" }));
      try {
        const res = await fetch("/api/admin/upload", { method: "POST", body: fd });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        if (data.errors?.length) setError(data.errors.join(" · "));
        setF((p) => ({
          ...p,
          images: [...p.images, ...data.images.map((img: { src: string; width: number; height: number }) => ({ src: img.src, alt: p.name, width: img.width, height: img.height }))],
        }));
        setSaved(false);
      } catch (e) {
        setError(`Upload failed: ${(e as Error).message || "please try again"}`);
      }
    }
    setUploading(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function moveImage(i: number, dir: -1 | 1) {
    const imgs = [...f.images];
    const j = i + dir;
    if (j < 0 || j >= imgs.length) return;
    [imgs[i], imgs[j]] = [imgs[j], imgs[i]];
    set("images", imgs);
  }

  function save() {
    setError(null);
    const price = parseFloat(f.priceText);
    const payload: ProductInputType = {
      ...f,
      price: Number.isFinite(price) ? price : 0,
      contents: f.contentsText.split("\n").map((s) => s.trim()).filter(Boolean),
      specs: f.specsText
        .split("\n")
        .map((line) => {
          const idx = line.indexOf(":");
          return idx > 0 ? { label: line.slice(0, idx).trim(), value: line.slice(idx + 1).trim() } : null;
        })
        .filter((s): s is { label: string; value: string } => Boolean(s?.label && s.value)),
    };
    if (!f.variants.length && !(price >= 0 && f.priceText.trim())) return setError("Please enter a price.");
    start(async () => {
      const res = await saveProductAction(payload);
      if (!res.ok) return setError(res.error);
      setSaved(true);
      if (!product) router.replace(`/admin/products/${res.id}`);
      else router.refresh();
    });
  }

  const pers = f.personalisation;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      className="grid gap-6 xl:grid-cols-3"
    >
      <div className="space-y-6 xl:col-span-2">
        <Box title="Basics">
          <div className="grid gap-4 md:grid-cols-2">
            <L label="Product name" className="md:col-span-2">
              <input className="field" value={f.name} onChange={(e) => set("name", e.target.value)} required />
            </L>
            <L label="URL name" hint={`/products/${slugify(f.slug || f.name) || "…"}`}>
              <input className="field" value={f.slug} placeholder={slugify(f.name)} onChange={(e) => set("slug", e.target.value)} />
            </L>
            <L label={f.variants.length ? "Price (from first option)" : "Price (RM)"}>
              <input className="field" inputMode="decimal" value={f.variants.length ? String(f.variants[0].price) : f.priceText} disabled={f.variants.length > 0} onChange={(e) => set("priceText", e.target.value.replace(/[^0-9.]/g, ""))} />
            </L>
            <L label="Short summary" hint="One line on product cards" className="md:col-span-2">
              <input className="field" maxLength={200} value={f.summary} onChange={(e) => set("summary", e.target.value)} />
            </L>
            <L label="Description" className="md:col-span-2">
              <textarea className="field !min-h-[7rem]" maxLength={3000} value={f.description} onChange={(e) => set("description", e.target.value)} />
            </L>
          </div>
        </Box>

        <Box title={`Images (${f.images.length})`} hint="First image is the main photo. Up to about 10 per product; large photos are resized and converted to WebP automatically.">
          {f.images.length > 0 && (
            <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {f.images.map((img, i) => (
                <li key={img.src + i} className="border border-line bg-white p-2">
                  <div className="relative">
                    <ProductImage src={img.src} alt={img.alt} ratio={1.25} sizes="200px" />
                    {i === 0 && <span className="absolute left-1.5 top-1.5 bg-ink px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-ivory">Main</span>}
                  </div>
                  <input
                    className="field !min-h-8 mt-2 !px-2 !py-1 text-[12px]"
                    value={img.alt}
                    placeholder="Describe the photo"
                    aria-label="Image description"
                    onChange={(e) => set("images", f.images.map((x, j) => (j === i ? { ...x, alt: e.target.value } : x)))}
                  />
                  <div className="mt-1.5 flex justify-between">
                    <span className="flex">
                      <IconBtn label="Move earlier" onClick={() => moveImage(i, -1)} disabled={i === 0}><ArrowUp className="h-3.5 w-3.5 -rotate-90" /></IconBtn>
                      <IconBtn label="Move later" onClick={() => moveImage(i, 1)} disabled={i === f.images.length - 1}><ArrowDown className="h-3.5 w-3.5 -rotate-90" /></IconBtn>
                    </span>
                    <IconBtn label="Remove image" onClick={() => set("images", f.images.filter((_, j) => j !== i))}><Trash2 className="h-3.5 w-3.5" /></IconBtn>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4 flex flex-col gap-3 md:flex-row">
            <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => uploadFiles(e.target.files)} />
            <button type="button" onClick={() => fileRef.current?.click()} disabled={!!uploading} className="btn btn-outline">
              <Upload className="h-4 w-4" strokeWidth={1.25} /> {uploading ?? "Upload photos"}
            </button>
            <div className="flex flex-1 gap-2">
              <input className="field !min-h-12" placeholder="…or paste an image URL" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} />
              <button
                type="button"
                className="btn btn-outline !px-4"
                onClick={() => {
                  if (!/^https?:\/\//.test(imageUrl.trim())) return setError("Image URL must start with https://");
                  set("images", [...f.images, { src: imageUrl.trim(), alt: f.name }]);
                  setImageUrl("");
                }}
              >
                Add
              </button>
            </div>
          </div>
        </Box>

        <Box title="Options & upgrades" hint="Use for versions with different prices, e.g. “With red wine”. Leave empty if the product has one price.">
          {f.variants.length > 0 && (
            <ul className="mb-4 space-y-3">
              {f.variants.map((v, i) => (
                <li key={i} className="grid gap-2 border border-line bg-white p-3 md:grid-cols-[1fr_120px_1.3fr_auto_auto] md:items-center">
                  <input className="field !min-h-10" placeholder="Option name" value={v.name} onChange={(e) => set("variants", f.variants.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                  <input className="field !min-h-10" inputMode="decimal" placeholder="Price" value={v.price} onChange={(e) => set("variants", f.variants.map((x, j) => (j === i ? { ...x, price: parseFloat(e.target.value.replace(/[^0-9.]/g, "")) || 0 } : x)))} />
                  <input className="field !min-h-10" placeholder="Note (optional)" value={v.note ?? ""} onChange={(e) => set("variants", f.variants.map((x, j) => (j === i ? { ...x, note: e.target.value } : x)))} />
                  <label className="flex items-center gap-2 text-[13px]">
                    <input type="checkbox" className="check !mt-0" checked={!!v.containsAlcohol} onChange={(e) => set("variants", f.variants.map((x, j) => (j === i ? { ...x, containsAlcohol: e.target.checked } : x)))} />
                    Alcohol
                  </label>
                  <IconBtn label="Remove option" onClick={() => set("variants", f.variants.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></IconBtn>
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => set("variants", [...f.variants, { id: "", name: f.variants.length ? "" : "Standard", price: parseFloat(f.priceText) || 0 }])}
          >
            <Plus className="h-4 w-4" strokeWidth={1.25} /> Add option
          </button>
        </Box>

        <Box title="What’s inside & details">
          <div className="grid gap-4 md:grid-cols-2">
            <L label="Contents" hint="One item per line">
              <textarea className="field !min-h-[9rem]" value={f.contentsText} onChange={(e) => set("contentsText", e.target.value)} />
            </L>
            <L label="Specifications" hint="One per line, as “Label: value”">
              <textarea className="field !min-h-[9rem]" value={f.specsText} onChange={(e) => set("specsText", e.target.value)} placeholder={"Box size: 30 × 22 × 9 cm\nBest before: 2 months"} />
            </L>
            <L label="Allergens">
              <textarea className="field" value={f.allergens} onChange={(e) => set("allergens", e.target.value)} />
            </L>
            <L label="Storage & care">
              <textarea className="field" value={f.storage} onChange={(e) => set("storage", e.target.value)} />
            </L>
          </div>
        </Box>
      </div>

      <div className="space-y-6">
        <Box title="Status">
          <div className="space-y-4">
            <L label="Availability">
              <select className="field" value={f.status} onChange={(e) => set("status", e.target.value as Form["status"])}>
                <option value="active">On sale</option>
                <option value="sold_out">Shown, not available to buy</option>
                <option value="hidden">Hidden from the website</option>
              </select>
            </L>
            {f.status === "sold_out" && (
              <L label="Label shown" hint="e.g. Sold out, Season ended">
                <input className="field" maxLength={60} value={f.availabilityNote} onChange={(e) => set("availabilityNote", e.target.value)} />
              </L>
            )}
            <label className="flex items-start gap-3 text-[14px]">
              <input type="checkbox" className="check" checked={f.featured} onChange={(e) => set("featured", e.target.checked)} />
              <span>Feature on homepage<span className="block text-[12px] text-ink-2">Shown first in its homepage section</span></span>
            </label>
            <L label="Sort order" hint="Lower numbers appear first">
              <input className="field" type="number" value={f.sort} onChange={(e) => set("sort", parseInt(e.target.value || "0", 10))} />
            </L>
          </div>
        </Box>

        <Box title="Collection">
          <div className="space-y-4">
            <L label="Category">
              <select className="field" value={f.category} onChange={(e) => set("category", e.target.value as Form["category"])}>
                {Object.entries(CATEGORIES).map(([k, c]) => (
                  <option key={k} value={k}>{c.name}</option>
                ))}
              </select>
            </L>
            {f.category === "festive" && (
              <L label="Occasion">
                <select className="field" value={f.occasion ?? ""} onChange={(e) => set("occasion", (e.target.value || null) as Form["occasion"])}>
                  <option value="">Choose occasion</option>
                  {Object.entries(OCCASIONS).map(([k, o]) => (
                    <option key={k} value={k}>{o.name}</option>
                  ))}
                </select>
              </L>
            )}
            <label className="flex items-start gap-3 text-[14px]">
              <input type="checkbox" className="check" checked={f.containsAlcohol} onChange={(e) => set("containsAlcohol", e.target.checked)} />
              <span>Contains alcohol<span className="block text-[12px] text-ink-2">Asks for 21+ confirmation at checkout</span></span>
            </label>
          </div>
        </Box>

        <Box title="Personalisation">
          <label className="flex items-start gap-3 text-[14px]">
            <input
              type="checkbox"
              className="check"
              checked={!!pers?.enabled}
              onChange={(e) =>
                set("personalisation", e.target.checked ? { enabled: true, label: pers?.label || "Engraved name", helper: pers?.helper ?? "", maxLength: pers?.maxLength || 20, fee: pers?.fee ?? 0 } : pers ? { ...pers, enabled: false } : null)
              }
            />
            <span>Allow name engraving / personalisation</span>
          </label>
          {pers?.enabled && (
            <div className="mt-4 space-y-4">
              <L label="Label"><input className="field" value={pers.label} onChange={(e) => set("personalisation", { ...pers, label: e.target.value })} /></L>
              <L label="Help text"><input className="field" value={pers.helper ?? ""} onChange={(e) => set("personalisation", { ...pers, helper: e.target.value })} /></L>
              <div className="grid grid-cols-2 gap-3">
                <L label="Max characters"><input className="field" type="number" min={1} max={60} value={pers.maxLength} onChange={(e) => set("personalisation", { ...pers, maxLength: parseInt(e.target.value || "1", 10) })} /></L>
                <L label="Extra fee (RM)"><input className="field" inputMode="decimal" value={pers.fee} onChange={(e) => set("personalisation", { ...pers, fee: parseFloat(e.target.value.replace(/[^0-9.]/g, "")) || 0 })} /></L>
              </div>
            </div>
          )}
        </Box>

        <div className="sticky bottom-0 z-10 -mx-5 border-t border-line bg-[#f6f3ee]/95 px-5 py-4 backdrop-blur md:static md:mx-0 md:border-0 md:bg-transparent md:p-0">
          {error && <p className="mb-3 text-[13px] text-danger" role="alert">{error}</p>}
          <div className="flex items-center gap-3">
            <button className="btn btn-primary flex-1" disabled={pending || !!uploading}>{pending ? "Saving…" : saved ? "Saved ✓" : "Save product"}</button>
            {product && (
              <button
                type="button"
                className="btn btn-outline !px-4 text-danger"
                onClick={() => {
                  if (confirm(`Delete “${product.name}”? This cannot be undone. To take it off the site temporarily, set it to Hidden instead.`)) start(() => deleteProductAction(product.id));
                }}
                aria-label="Delete product"
              >
                <Trash2 className="h-4 w-4" strokeWidth={1.25} />
              </button>
            )}
          </div>
        </div>
      </div>
    </form>
  );
}

function Box({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="border border-line bg-ivory">
      <div className="border-b border-line px-5 py-3.5">
        <h2 className="text-[12px] font-medium uppercase tracking-[0.14em] text-ink-2">{title}</h2>
        {hint && <p className="mt-1 text-[12px] text-ink-3">{hint}</p>}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function L({ label, hint, className = "", children }: { label: string; hint?: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={`block ${className}`}>
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[12px] text-ink-3">{hint}</span>}
    </label>
  );
}

function IconBtn({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={label} title={label} className="grid h-8 w-8 place-items-center text-ink-2 hover:text-ink disabled:opacity-25">
      {children}
    </button>
  );
}
