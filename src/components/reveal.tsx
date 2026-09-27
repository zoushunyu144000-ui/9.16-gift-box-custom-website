"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/** Adds `.is-in` to [data-reveal] elements as they enter the viewport. */
export function RevealObserver() {
  const pathname = usePathname();
  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]:not(.is-in)"));
    if (!("IntersectionObserver" in window)) {
      els.forEach((el) => el.classList.add("is-in"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add("is-in");
            io.unobserve(e.target);
          }
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
    );
    els.forEach((el) => io.observe(el));
    // Safety net: never leave content hidden
    const t = setTimeout(() => document.querySelectorAll("[data-reveal]:not(.is-in)").forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.top < window.innerHeight) el.classList.add("is-in");
    }), 1500);
    return () => {
      io.disconnect();
      clearTimeout(t);
    };
  }, [pathname]);
  return null;
}
