/**
 * The moiré — Moire Co.'s own graphic device.
 * "Moiré" is the watered pattern that appears when two sets of fine lines overlap
 * (and the name of watered silk). Two families of concentric rings, slightly offset,
 * produce that interference. Always tone-on-tone and used sparingly.
 */
export function MoireField({
  className = "",
  rings = 42,
  step = 9,
  offset = 14,
  opacity = 0.5,
}: {
  className?: string;
  rings?: number;
  step?: number;
  offset?: number;
  opacity?: number;
}) {
  const size = rings * step * 2 + offset * 2 + 4;
  const c = size / 2;
  const radii = Array.from({ length: rings }, (_, i) => (i + 1) * step);
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className={className} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="0.7" style={{ opacity }}>
      <g>
        {radii.map((r) => (
          <circle key={`a${r}`} cx={c - offset / 2} cy={c} r={r} vectorEffect="non-scaling-stroke" />
        ))}
      </g>
      <g>
        {radii.map((r) => (
          <circle key={`b${r}`} cx={c + offset / 2} cy={c + offset / 3} r={r} vectorEffect="non-scaling-stroke" />
        ))}
      </g>
    </svg>
  );
}

/** Renders *word* as italic display type. Keeps headlines editable as plain text in admin. */
export function Emph({ text }: { text: string }) {
  const parts = text.split(/(\*[^*]+\*)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("*") && p.endsWith("*") ? (
          <em key={i} className="display-italic">
            {p.slice(1, -1)}
          </em>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

export function plain(text: string) {
  return text.replace(/\*/g, "");
}
