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
