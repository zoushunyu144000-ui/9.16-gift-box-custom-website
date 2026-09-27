"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

/** Horizontal, scroll-snapping product row. Native scrolling on touch; arrow buttons on desktop. */
export function ProductRail({ children, label }: { children: React.ReactNode; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: false });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () =>
      setEdges({ start: el.scrollLeft <= 4, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4 });
    update();
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  const scroll = (dir: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    const card = el.querySelector<HTMLElement>("[data-rail-item]");
    const step = card ? card.offsetWidth + 24 : el.clientWidth * 0.8;
    el.scrollBy({ left: dir * step, behavior: "smooth" });
  };

  const scrollable = !(edges.start && edges.end);

  return (
    <div className="relative">
      <div
        ref={ref}
        className="no-scrollbar -mx-5 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-px-5 px-5 md:-mx-8 md:gap-6 md:scroll-px-8 md:px-8 xl:-mx-12 xl:scroll-px-12 xl:px-12"
        role="list"
        aria-label={label}
      >
        {children}
      </div>
      {scrollable && (
        <div className="mt-6 hidden items-center justify-end gap-2 md:flex">
          <button
            type="button"
            onClick={() => scroll(-1)}
            disabled={edges.start}
            className="grid h-10 w-10 place-items-center border border-line-strong transition-colors hover:border-ink disabled:opacity-30"
            aria-label="Previous products"
          >
            <ChevronLeft className="h-4 w-4" strokeWidth={1.25} />
          </button>
          <button
            type="button"
            onClick={() => scroll(1)}
            disabled={edges.end}
            className="grid h-10 w-10 place-items-center border border-line-strong transition-colors hover:border-ink disabled:opacity-30"
            aria-label="Next products"
          >
            <ChevronRight className="h-4 w-4" strokeWidth={1.25} />
          </button>
        </div>
      )}
    </div>
  );
}

export function RailItem({ children }: { children: React.ReactNode }) {
  return (
    <div
      data-rail-item
      role="listitem"
      className="w-[68%] flex-none snap-start xs:w-[58%] sm:w-[40%] md:w-[calc((100%-3*1.5rem)/3.35)] lg:w-[calc((100%-3*1.5rem)/4)]"
    >
      {children}
    </div>
  );
}
