"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/** Adds `.is-in` to [data-reveal] elements as they enter the viewport. */
export function RevealObserver() {
  const pathname = usePathname();
  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]:not(.is-in)"));
    let io: IntersectionObserver | null = null;
    if ("IntersectionObserver" in window) {
      const observer = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            if (e.isIntersecting) {
              e.target.classList.add("is-in");
              observer.unobserve(e.target);
            }
          }
        },
        { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
      );
      io = observer;
    }

    const register = (root: ParentNode) => {
      root.querySelectorAll<HTMLElement>("[data-reveal]:not(.is-in)").forEach((el) => {
        if (io) io.observe(el);
        else el.classList.add("is-in");
      });
    };

    els.forEach((el) => {
      if (io) io.observe(el);
      else el.classList.add("is-in");
    });

    // Query-only navigations can replace cards without changing the pathname.
    const mutations = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node instanceof HTMLElement) {
            if (node.matches("[data-reveal]:not(.is-in)")) {
              if (io) io.observe(node);
              else node.classList.add("is-in");
            }
            register(node);
          }
        }
      }
    });
    mutations.observe(document.body, { childList: true, subtree: true });

    // Safety net: release visible elements even if an observer callback stalls.
    const t = setTimeout(() => document.querySelectorAll("[data-reveal]:not(.is-in)").forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.top < window.innerHeight) el.classList.add("is-in");
    }), 1500);
    return () => {
      mutations.disconnect();
      io?.disconnect();
      clearTimeout(t);
    };
  }, [pathname]);
  return null;
}
