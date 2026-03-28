export default function SessionLoading() {
  return (
    <div className="animate-fade-in">
      <header
        className="sticky top-0 z-10 flex items-center gap-3 px-6 h-[52px] border-b"
        style={{ background: "var(--bg-primary)", borderColor: "var(--border-subtle)" }}
      >
        <div className="h-3 w-16 rounded" style={{ background: "var(--bg-tertiary)" }} />
        <span style={{ color: "var(--border)" }}>/</span>
        <div className="h-3 w-32 rounded" style={{ background: "var(--bg-tertiary)" }} />
      </header>

      <div
        className="px-6 py-4 border-b grid grid-cols-2 md:grid-cols-4 gap-4"
        style={{ background: "var(--bg-secondary)", borderColor: "var(--border-subtle)" }}
      >
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i}>
            <div className="h-2 w-12 rounded mb-1.5" style={{ background: "var(--bg-tertiary)" }} />
            <div className="h-3 w-24 rounded" style={{ background: "var(--bg-tertiary)" }} />
          </div>
        ))}
      </div>

      <div className="px-6 py-6 max-w-3xl mx-auto space-y-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i}>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-6 h-6 rounded-full" style={{ background: "var(--bg-tertiary)" }} />
              <div className="h-2.5 w-16 rounded" style={{ background: "var(--bg-tertiary)" }} />
            </div>
            <div
              className="rounded-lg px-4 py-3 space-y-2"
              style={{ background: "var(--bg-secondary)", borderLeft: "2px solid var(--border-subtle)" }}
            >
              <div className="h-2.5 w-full rounded" style={{ background: "var(--bg-tertiary)" }} />
              <div className="h-2.5 w-3/4 rounded" style={{ background: "var(--bg-tertiary)" }} />
              <div className="h-2.5 w-5/6 rounded" style={{ background: "var(--bg-tertiary)" }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
