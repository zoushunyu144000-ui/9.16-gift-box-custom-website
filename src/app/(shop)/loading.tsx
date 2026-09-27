export default function Loading() {
  return (
    <div className="shell pt-10" aria-busy="true" aria-label="Loading">
      <div className="skeleton h-4 w-40" />
      <div className="skeleton mt-8 h-12 w-2/3 max-w-xl" />
      <div className="mt-12 grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-3 md:gap-x-6 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i}>
            <div className="skeleton aspect-[4/5] w-full" />
            <div className="skeleton mt-4 h-5 w-2/3" />
            <div className="skeleton mt-2 h-4 w-1/3" />
          </div>
        ))}
      </div>
    </div>
  );
}
