/**
 * Account pages (sign in, register, my account) load behind a quiet outline of the narrow account
 * page, so the shop's product-grid skeleton never flashes on the way in.
 */
export default function AccountLoading() {
  return (
    <div className="shell max-w-[480px] pt-12 md:pt-20" aria-busy="true" aria-label="Loading">
      <div className="skeleton h-3 w-24 opacity-60" />
      <div className="skeleton mt-5 h-10 w-2/3 md:h-12" />
      <div className="skeleton mt-4 h-4 w-5/6 opacity-60" />
      <div className="mt-8 space-y-5">
        {[0, 1].map((i) => (
          <div key={i}>
            <div className="skeleton h-3 w-16 opacity-60" />
            <div className="skeleton mt-2 h-12 w-full opacity-70" />
          </div>
        ))}
        <div className="skeleton h-12 w-32" />
      </div>
    </div>
  );
}
