"use client";

import Link from "next/link";
import { useState } from "react";
import { formatRM, GIFT_MESSAGE_MAX, personalisationHeading } from "@/lib/catalog";
import type { CartLine } from "@/lib/types";
import { ProductImage } from "../product-image";
import { QuantityStepper } from "../quantity-stepper";
import { snapshotTotal, useCart } from "./cart-context";

export function CartLineRow({
  line,
  compact = false,
  problem,
  onNavigate,
}: {
  line: CartLine;
  compact?: boolean;
  problem?: string;
  onNavigate?: () => void;
}) {
  const { setQuantity, remove, update } = useCart();
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState(line.giftMessage ?? "");
  const s = line.snapshot;

  return (
    <li className={`flex gap-4 border-b border-line py-5 last:border-b-0 md:gap-5 ${compact ? "" : "md:py-7"}`}>
      <Link href={`/products/${line.slug}`} onClick={onNavigate} className={`flex-none ${compact ? "w-[84px]" : "w-[96px] md:w-[128px]"}`}>
        <ProductImage src={s.image} alt={s.name} ratio={1.25} sizes="128px" />
      </Link>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link href={`/products/${line.slug}`} onClick={onNavigate} className="display block text-[1.1rem] leading-snug hover:text-bronze">
              {s.name}
            </Link>
            {s.variantName && <p className="mt-0.5 text-[13px] text-ink-2">{s.variantName}</p>}
          </div>
          <p className="flex-none text-[15px] tabular-nums">{formatRM(snapshotTotal(line), { decimals: true })}</p>
        </div>

        {(line.personalisation || line.giftMessage) && !editing && (
          <dl className="mt-2 space-y-1 text-[13px] text-ink-2">
            {line.personalisation && (
              <div className="flex gap-1.5">
                <dt className="flex-none">{personalisationHeading(s.personalisationLabel, line.personalisationCount)}:</dt>
                <dd className="min-w-0 whitespace-pre-line break-words text-ink">“{line.personalisation}”</dd>
              </div>
            )}
            {line.giftMessage && (
              <div className="flex gap-1.5">
                <dt className="flex-none">Gift message:</dt>
                <dd className="line-clamp-2 min-w-0 break-words italic">“{line.giftMessage}”</dd>
              </div>
            )}
          </dl>
        )}

        {editing && (
          <div className="mt-3">
            <label className="field-label" htmlFor={`msg-${line.key}`}>
              Gift message
            </label>
            <textarea
              id={`msg-${line.key}`}
              className="field !min-h-[5rem] text-sm"
              maxLength={GIFT_MESSAGE_MAX}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Written on the card inside the box"
            />
            <div className="mt-2 flex items-center justify-between text-[12px] text-ink-3">
              <span>
                {message.length}/{GIFT_MESSAGE_MAX}
              </span>
              <span className="flex gap-4">
                <button type="button" className="underline-offset-4 hover:underline" onClick={() => setEditing(false)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="font-medium text-ink underline-offset-4 hover:underline"
                  onClick={() => {
                    update(line.key, { giftMessage: message.trim() || undefined });
                    setEditing(false);
                  }}
                >
                  Save
                </button>
              </span>
            </div>
          </div>
        )}

        {problem && <p className="mt-2 text-[13px] text-danger">{problem}</p>}

        <div className="mt-auto flex items-center justify-between gap-3 pt-4">
          <QuantityStepper value={line.quantity} onChange={(q) => setQuantity(line.key, q)} size="sm" label={`Quantity of ${s.name}`} />
          <div className="flex items-center gap-4 text-[12px] text-ink-2">
            {!editing && (
              <button type="button" className="underline-offset-4 hover:text-ink hover:underline" onClick={() => setEditing(true)}>
                {line.giftMessage ? "Edit message" : "Add message"}
              </button>
            )}
            <button type="button" className="underline-offset-4 hover:text-ink hover:underline" onClick={() => remove(line.key)}>
              Remove
            </button>
          </div>
        </div>
      </div>
    </li>
  );
}
