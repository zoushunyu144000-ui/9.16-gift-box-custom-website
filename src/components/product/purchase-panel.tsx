"use client";

import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { formatRM, GIFT_MESSAGE_MAX, isSoldOut, lineContainsAlcohol, PERSONALISATION_PATTERN, tracksStock, unitPrice, whatsappLink } from "@/lib/catalog";
import type { Product } from "@/lib/types";
import { useCart } from "../cart/cart-context";
import { QuantityStepper } from "../quantity-stepper";

export function PurchasePanel({ product, whatsappNumber }: { product: Product; whatsappNumber: string }) {
  const { add } = useCart();
  const soldOut = isSoldOut(product) || product.status !== "active";
  const hasVariants = product.variants.length > 0;
  const pers = product.personalisation?.enabled ? product.personalisation : null;
  const persOptions = pers?.options?.filter(Boolean) ?? [];
  const maxQty = tracksStock(product) ? Math.max(1, Math.min(99, product.stock as number)) : 99;

  const [variantId, setVariantId] = useState<string | undefined>(hasVariants ? product.variants[0].id : undefined);
  const [qty, setQty] = useState(1);
  const [wantsPers, setWantsPers] = useState(false);
  const [persText, setPersText] = useState("");
  const [persOption, setPersOption] = useState<string | undefined>(persOptions.length === 1 ? persOptions[0] : undefined);
  const [wantsMsg, setWantsMsg] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const stickyRef = useRef<HTMLDivElement>(null);
  const [showSticky, setShowSticky] = useState(false);

  const variant = product.variants.find((v) => v.id === variantId);
  const persFee = wantsPers && persText.trim() && pers ? pers.fee : 0;
  const price = unitPrice(product, variantId) + persFee;
  const alcohol = lineContainsAlcohol(product, variantId);

  // Mobile sticky add-to-bag once the main button scrolls away
  useEffect(() => {
    const el = buttonRef.current;
    if (!el || soldOut) return;
    const io = new IntersectionObserver(([e]) => setShowSticky(!e.isIntersecting && e.boundingClientRect.top < 0), { threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, [soldOut]);

  // Tell the floating WhatsApp button how tall the mobile bar is, so it lifts above it instead of covering it.
  useEffect(() => {
    const root = document.documentElement;
    const visible = showSticky && window.matchMedia("(max-width: 1023px)").matches;
    root.style.setProperty("--bottom-bar-h", visible && stickyRef.current ? `${stickyRef.current.offsetHeight}px` : "0px");
    return () => {
      root.style.removeProperty("--bottom-bar-h");
    };
  }, [showSticky]);

  const persInvalid = wantsPers && persText.length > 0 && !PERSONALISATION_PATTERN.test(persText);

  function submit() {
    setError(null);
    if (soldOut) return;
    if (hasVariants && !variant) return setError("Please choose an option.");
    if (wantsPers && pers) {
      if (persOptions.length && !persOption) return setError("Please choose a material for the personalised name.");
      if (!persText.trim()) return setError("Please enter the name to personalise, or choose “No personalisation”.");
      if (persInvalid) return setError("Please use letters, numbers and basic punctuation only.");
    }
    add({
      productId: product.id,
      slug: product.slug,
      variantId,
      quantity: qty,
      personalisation: wantsPers ? persText.trim() || undefined : undefined,
      personalisationOption: wantsPers && persText.trim() ? persOption : undefined,
      giftMessage: wantsMsg ? message.trim() || undefined : undefined,
      snapshot: {
        name: product.name,
        image: product.images[0]?.src,
        variantName: variant?.name,
        unitPrice: price,
        personalisationLabel: pers?.label,
        containsAlcohol: alcohol,
      },
    });
    setAdded(true);
    setTimeout(() => setAdded(false), 2400);
  }

  const waText = `Hello Moire Co., I'd like to ask about "${product.name}".`;

  return (
    <div>
      <p className="text-[1.35rem] tabular-nums tracking-wide" aria-live="polite">
        {formatRM(price)}
        {hasVariants && product.variants.length > 1 && <span className="ml-2 text-[13px] text-ink-3">{variant?.name}</span>}
      </p>

      {soldOut && (
        <div className="mt-8 border-t border-line pt-6">
          <button type="button" disabled aria-disabled="true" className="btn w-full cursor-not-allowed border border-line-strong bg-stone/60 text-ink-2">
            Sold Out
          </button>
          <p className="mt-3 text-[13px] leading-relaxed text-ink-2">
            {product.status === "sold_out" && product.availabilityNote ? `${product.availabilityNote}. ` : ""}
            This gift can’t be ordered right now.{" "}
            <a href={whatsappLink(whatsappNumber, waText)} target="_blank" rel="noopener noreferrer" className="underline decoration-line-strong underline-offset-4 hover:text-ink">
              Ask us on WhatsApp
            </a>{" "}
            to hear when it returns.
          </p>
        </div>
      )}

      {!soldOut && (
        <form
          className="mt-8 space-y-7"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          {hasVariants && (
            <fieldset>
              <legend className="label mb-3">{product.variants.some((v) => v.containsAlcohol) ? "Choose your version" : "Choose an option"}</legend>
              <div className="space-y-2">
                {product.variants.map((v) => {
                  const checked = v.id === variantId;
                  return (
                    <label
                      key={v.id}
                      className={`flex items-start gap-3 border px-4 py-3.5 transition-colors ${checked ? "border-ink bg-ivory" : "border-line-strong hover:border-ink/50"}`}
                    >
                      <input type="radio" name="variant" className="check" checked={checked} onChange={() => setVariantId(v.id)} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[15px]">{v.name}</span>
                        {v.note && <span className="block text-[13px] text-ink-2">{v.note}</span>}
                      </span>
                      <span className="text-[15px] tabular-nums">{formatRM(v.price)}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          )}

          {pers && (
            <fieldset className="border-t border-line pt-6">
              <legend className="sr-only">{pers.label}</legend>
              <div className="flex items-baseline justify-between gap-4">
                <p className="label">{pers.label}</p>
                <p className="text-[12px] text-ink-3">Optional{pers.fee > 0 ? ` · +${formatRM(pers.fee)}` : ""}</p>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2" role="radiogroup" aria-label={pers.label}>
                <OptionButton selected={!wantsPers} onClick={() => setWantsPers(false)}>
                  No personalisation
                </OptionButton>
                <OptionButton selected={wantsPers} onClick={() => setWantsPers(true)}>
                  Add a name
                </OptionButton>
              </div>
              {wantsPers && (
                <div className="mt-5 space-y-5">
                  {persOptions.length > 0 && (
                    <div>
                      <p className="field-label">Material</p>
                      <div className={`grid gap-2 ${persOptions.length === 2 ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-3"}`} role="radiogroup" aria-label="Material">
                        {persOptions.map((o) => (
                          <OptionButton key={o} selected={persOption === o} onClick={() => setPersOption(o)}>
                            {o}
                          </OptionButton>
                        ))}
                      </div>
                    </div>
                  )}
                  <div>
                    <label htmlFor="pers" className="field-label">
                      Name to personalise
                    </label>
                    <input
                      id="pers"
                      className="field"
                      maxLength={pers.maxLength}
                      value={persText}
                      onChange={(e) => setPersText(e.target.value)}
                      autoComplete="off"
                      autoCapitalize="words"
                      enterKeyHint="done"
                      aria-invalid={persInvalid}
                      aria-describedby="pers-help"
                      placeholder="e.g. Sarah Tan"
                    />
                    <div id="pers-help" className="mt-2 flex justify-between gap-4 text-[12px] text-ink-3">
                      <span>{pers.helper || "Letters, numbers and basic punctuation only."}</span>
                      <span className="flex-none tabular-nums">
                        {persText.length}/{pers.maxLength}
                      </span>
                    </div>
                    {persInvalid && <p className="field-error">Please use letters, numbers and basic punctuation only.</p>}
                  </div>
                  {persText.trim() && !persInvalid && (
                    <div className="border border-line bg-cream px-4 py-5 text-center">
                      <p className="label !text-[10px] !text-ink-3">Preview{persOption ? ` · ${persOption}` : ""}</p>
                      <p className="display mt-2 break-words text-[1.5rem] tracking-[0.04em]">{persText}</p>
                    </div>
                  )}
                </div>
              )}
            </fieldset>
          )}

          <div className={pers ? "" : "border-t border-line pt-6"}>
            <label className="flex items-start gap-3">
              <input type="checkbox" className="check" checked={wantsMsg} onChange={(e) => setWantsMsg(e.target.checked)} />
              <span>
                <span className="block text-[15px]">Add a gift message</span>
                <span className="block text-[13px] text-ink-2">Printed on the greeting card inside · optional</span>
              </span>
            </label>
            {wantsMsg && (
              <div className="mt-4 pl-7">
                <label htmlFor="gift-message" className="sr-only">
                  Gift message
                </label>
                <textarea
                  id="gift-message"
                  className="field"
                  rows={4}
                  maxLength={GIFT_MESSAGE_MAX}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={"Dear Mr & Mrs Lim,\nWishing you a prosperous new year.\n— The Tan family"}
                />
                <p className="mt-2 text-right text-[12px] tabular-nums text-ink-3">
                  {message.length}/{GIFT_MESSAGE_MAX}
                </p>
              </div>
            )}
          </div>

          <div className="flex gap-3 border-t border-line pt-6">
            <QuantityStepper value={qty} onChange={setQty} max={maxQty} label="Quantity" />
            <button ref={buttonRef} type="submit" className="btn btn-primary min-w-0 flex-1 !px-4 !whitespace-normal text-center leading-tight">
              {added ? (
                <>
                  <Check className="h-4 w-4" strokeWidth={1.5} /> Added to bag
                </>
              ) : (
                <>Add to bag · {formatRM(price * qty)}</>
              )}
            </button>
          </div>
          {error && (
            <p className="field-error !mt-3" role="alert">
              {error}
            </p>
          )}
          {alcohol && <p className="!mt-3 text-[12px] text-ink-3">Contains alcohol. For customers aged 21 and above; you’ll confirm your age at checkout.</p>}
        </form>
      )}

      {/* Mobile sticky bar */}
      {!soldOut && (
        <div
          ref={stickyRef}
          className={`fixed inset-x-0 bottom-0 z-30 border-t border-line bg-ivory/95 px-5 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-md transition-transform duration-300 lg:hidden ${
            showSticky ? "translate-y-0" : "translate-y-full"
          }`}
          aria-hidden={!showSticky}
        >
          <div className="flex items-center gap-4">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px]">{product.name}</p>
              <p className="text-[13px] tabular-nums text-ink-2">{formatRM(price)}</p>
            </div>
            <button type="button" onClick={submit} className="btn btn-primary !min-h-11 !px-5" tabIndex={showSticky ? 0 : -1}>
              {added ? "Added" : "Add to bag"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** A choice set as a quiet bordered tile, matching the option rows above (no rounded "form" controls). */
function OptionButton({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={`min-h-12 border px-3 py-3 text-center text-[14px] transition-colors ${
        selected ? "border-ink bg-ivory text-ink" : "border-line-strong text-ink-2 hover:border-ink/50 hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}
