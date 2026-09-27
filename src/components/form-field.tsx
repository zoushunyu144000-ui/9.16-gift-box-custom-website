export function Field({
  id,
  label,
  error,
  hint,
  className = "",
  children,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className} data-field={id}>
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      {children}
      {error ? <p className="field-error">{error}</p> : hint ? <p className="mt-1.5 text-[12px] text-ink-3">{hint}</p> : null}
    </div>
  );
}

export function FormSection({ n, title, children, intro }: { n: number; title: string; intro?: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-line pt-8">
      <h2 className="flex items-baseline gap-3">
        <span className="text-[12px] tabular-nums text-ink-3">0{n}</span>
        <span className="display text-[1.6rem]">{title}</span>
      </h2>
      {intro && <p className="mt-2 text-[14px] text-ink-2">{intro}</p>}
      <div className="mt-6">{children}</div>
    </section>
  );
}

export function focusFirstError(errors: Record<string, string>) {
  const key = Object.keys(errors)[0];
  if (!key) return;
  const el = document.querySelector<HTMLElement>(`[data-field="${key}"]`);
  el?.scrollIntoView({ behavior: "smooth", block: "center" });
  el?.querySelector<HTMLElement>("input,select,textarea")?.focus({ preventScroll: true });
}
