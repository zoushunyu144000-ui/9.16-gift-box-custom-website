"use client";

import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import {
  formatRM,
  GIFT_MESSAGE_MAX,
  isSoldOut,
  lineContainsAlcohol,
  MAX_NAMES,
  PERSONALISATION_PATTERN,
  personalisationFor,
  personalisationLimit,
  tracksStock,
  unitPrice,
} from "@/lib/catalog";
import type { Product } from "@/lib/types";
import { useCart } from "../cart/cart-context";
import { QuantityStepper } from "../quantity-stepper";

const PATTERN_ERROR = "Please use letters A–Z, numbers and basic punctuation only.";

export function PurchasePanel({ product, personalisationLive = false }: { product: Product; personalisationLive?: boolean }) {
  const { add } = useCart();
  const soldOut = isSoldOut(product) || product.status !== "active";
  const hasVariants = product.variants.length > 0;
  // Every product offers a personalised name, charged per name (client, Oct 2026). Admin → Settings
  // can pause the service, which shows it as "Coming soon".
  const pers = personalisationFor(product);
  const maxQty = tracksStock(product) ? Math.max(1, Math.min(99, product.stock as number)) : 99;

  const [variantId, setVariantId] = useState<string | undefined>(hasVariants ? product.variants[0].id : undefined);
  const [qty, setQty] = useState(1);
  const [wantsPers, setWantsPers] = useState(false);
  // Typed text is shown in capitals by CSS and stored in capitals (names are taken in capitals only).
  const [persText, setPersText] = useState("");
  const [names, setNames] = useState(1);
  const [wantsMsg, setWantsMsg] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const stickyRef = useRef<HTMLDivElement>(null);
  const [showSticky, setShowSticky] = useState(false);

  const variant = product.variants.find((v) => v.id === variantId);
  const price = unitPrice(product, variantId);
  // Names are charged once each, not per item: 10 boxes with 3 names = 10 × price + 3 × fee.
  const namesFee = wantsPers ? pers.fee * names : 0;
  const total = price * qty + namesFee;
  const persLimit = personalisationLimit(pers, names);
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

  const persName = persText.trim().toUpperCase();
  const persInvalid = wantsPers && persName.length > 0 && !PERSONALISATION_PATTERN.test(persName);

  function submit() {
    setError(null);
    if (soldOut) return;
    if (hasVariants && !variant) return setError("Please choose an option.");
    if (wantsPers) {
      if (!persName) return setError("Please enter the name to personalise, or choose “No personalisation”.");
      if (persInvalid) return setError(PATTERN_ERROR);
      if (persName.length > persLimit) return setError(`Please keep to ${persLimit} characters for ${names === 1 ? "one name" : `${names} names`}.`);
    }
    add({
      productId: product.id,
      slug: product.slug,
      variantId,
      quantity: qty,
      personalisation: wantsPers ? persName : undefined,
      personalisationCount: wantsPers ? names : undefined,
      giftMessage: wantsMsg ? message.trim() || undefined : undefined,
      snapshot: {
        name: product.name,
        image: product.images[0]?.src,
        variantName: variant?.name,
        unitPrice: price,
        personalisationFee: wantsPers ? pers.fee : undefined,
        personalisationLabel: pers.label,
        containsAlcohol: alcohol,
      },
    });
    setAdded(true);
    setTimeout(() => setAdded(false), 2400);
  }


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
            This gift can’t be ordered right now.
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

          <fieldset className="border-t border-line pt-6">
            <legend className="sr-only">{pers.label}</legend>
            <div className="flex items-baseline justify-between gap-4">
              <p className="label">{pers.label}</p>
              <p className={`text-[12px] ${personalisationLive ? "text-ink-3" : "font-medium uppercase tracking-[0.12em] text-bronze"}`}>
                {personalisationLive ? `Optional${pers.fee > 0 ? ` · ${formatRM(pers.fee)} per name` : ""}` : "Coming soon"}
              </p>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2" role="radiogroup" aria-label={pers.label}>
              <OptionButton selected={!wantsPers} onClick={() => setWantsPers(false)}>
                No personalisation
              </OptionButton>
              <OptionButton selected={wantsPers} onClick={() => setWantsPers(true)} disabled={!personalisationLive}>
                Add a name
              </OptionButton>
            </div>
            {!personalisationLive && <p className="mt-2.5 text-[12px] text-ink-3">Personalised names will be available soon.</p>}
            {personalisationLive && wantsPers && (
              <div className="mt-5 space-y-5">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="field-label !mb-0.5">Number of names</p>
                    {pers.fee > 0 && (
                      <p className="text-[12px] tabular-nums text-ink-3">
                        {names > 1 ? `${names} × ${formatRM(pers.fee)} = ${formatRM(namesFee)}` : `${formatRM(pers.fee)} each`}
                      </p>
                    )}
                  </div>
                  <QuantityStepper value={names} onChange={setNames} max={MAX_NAMES} label="Number of names" />
                </div>
                <div>
                  <label htmlFor="pers" className="field-label">
                    Name to personalise
                  </label>
                  {pers.helper && <p className="-mt-1 mb-2 text-[12px] text-ink-3">{pers.helper}</p>}
                  <textarea
                    id="pers"
                    className={`field uppercase placeholder:normal-case ${names > 1 ? "!min-h-[7.5rem]" : "!min-h-0 resize-none"}`}
                    rows={names > 1 ? 4 : 2}
                    maxLength={persLimit}
                    value={persText}
                    onChange={(e) => setPersText(e.target.value)}
                    autoComplete="off"
                    autoCapitalize="characters"
                    spellCheck={false}
                    aria-invalid={persInvalid}
                    aria-describedby="pers-help"
                    placeholder="Personalisation is only acceptable in uppercase letters. e.g. SARAH"
                  />
                  <div id="pers-help" className="mt-2 flex justify-between gap-4 text-[12px] leading-relaxed text-ink-3">
                    <span>For bulk orders with different names, please list the names in order. e.g. “1. JASON 2. EMILY”</span>
                    <span className={`flex-none tabular-nums ${persText.length > persLimit ? "text-danger" : ""}`}>
                      {persText.length}/{persLimit}
                    </span>
                  </div>
                  {persInvalid && <p className="field-error">{PATTERN_ERROR}</p>}
                </div>
                {names === 1 && persName && !persInvalid && (
                  <div className="border border-line bg-cream px-4 py-5 text-center">
                    <p className="label !text-[10px] !text-ink-3">Preview</p>
                    <p className="display mt-2 whitespace-pre-line break-words text-[1.5rem] tracking-[0.04em]">{persName}</p>
                  </div>
                )}
              </div>
            )}
          </fieldset>

          <div>
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
                <>Add to bag · {formatRM(total)}</>
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
function OptionButton({ selected, onClick, children, disabled = false }: { selected: boolean; onClick: () => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-disabled={disabled || undefined}
      disabled={disabled}
      onClick={onClick}
      className={`min-h-12 border px-3 py-3 text-center text-[14px] transition-colors ${
        disabled
          ? "cursor-not-allowed border-line bg-stone/40 text-ink-3"
          : selected
            ? "border-ink bg-ivory text-ink"
            : "border-line-strong text-ink-2 hover:border-ink/50 hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}
