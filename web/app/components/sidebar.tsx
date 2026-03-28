"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

function OrchidLogo() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="10" stroke="var(--orchid-pink)" strokeWidth="1.5" fill="var(--orchid-pink-muted)" />
      <path
        d="M12 6C12 6 8 9 8 13C8 15.2 9.8 17 12 17C14.2 17 16 15.2 16 13C16 9 12 6 12 6Z"
        fill="var(--orchid-pink)"
        opacity="0.7"
      />
      <circle cx="12" cy="12" r="2" fill="var(--bg-primary)" />
    </svg>
  );
}

const navItems = [
  {
    label: "Sessions",
    href: "/",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="2" width="12" height="12" rx="2" />
        <path d="M5 6h6M5 8.5h4" />
      </svg>
    ),
  },
  {
    label: "Search",
    href: "/search",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="7" cy="7" r="4" />
        <path d="M10 10l3 3" />
      </svg>
    ),
  },
  {
    label: "Activity",
    href: "/activity",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="8" cy="5" r="2.5" />
        <circle cx="4" cy="12" r="1.5" />
        <circle cx="12" cy="12" r="1.5" />
        <path d="M6 7.5C4.5 8.5 4 10 4 10.5M10 7.5C11.5 8.5 12 10 12 10.5" />
      </svg>
    ),
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside
      className="flex flex-col w-[220px] shrink-0 border-r h-full"
      style={{
        background: "var(--bg-secondary)",
        borderColor: "var(--border-subtle)",
      }}
    >
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 h-[52px] border-b" style={{ borderColor: "var(--border-subtle)" }}>
        <OrchidLogo />
        <span className="text-sm font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>
          Orchid
        </span>
        <span
          className="text-[10px] font-medium px-1.5 py-0.5 rounded-full ml-auto"
          style={{
            background: "var(--orchid-pink-muted)",
            color: "var(--orchid-pink)",
          }}
        >
          POC
        </span>
      </div>

      {/* Nav */}
      <nav className="flex flex-col gap-0.5 p-2">
        {navItems.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-[13px] font-medium transition-colors"
              style={{
                background: active ? "var(--bg-active)" : "transparent",
                color: active ? "var(--text-primary)" : "var(--text-secondary)",
              }}
            >
              {item.icon}
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Command palette hint */}
      <div className="px-2 mb-1">
        <div
          className="flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[11px] cursor-pointer transition-colors"
          style={{ color: "var(--text-tertiary)" }}
          onClick={() => {
            window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true }));
          }}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="7" cy="7" r="4" />
            <path d="M10 10l3 3" />
          </svg>
          <span>Quick Find</span>
          <kbd className="ml-auto text-[9px] px-1 py-0.5 rounded" style={{ background: "var(--bg-tertiary)" }}>
            {"\u2318"}K
          </kbd>
        </div>
      </div>

      {/* How it works */}
      <div className="px-4 pt-2 pb-3 flex-1">
        <div className="text-[10px] uppercase font-medium tracking-wider mb-2" style={{ color: "var(--text-tertiary)" }}>
          How it works
        </div>
        <div className="space-y-2">
          {[
            { step: "1", text: "Capture", desc: "orchid claude" },
            { step: "2", text: "Store", desc: "Auto-synced" },
            { step: "3", text: "Review", desc: "See the why" },
          ].map(({ step, text, desc }) => (
            <div key={step} className="flex items-center gap-2">
              <span
                className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold shrink-0"
                style={{ background: "var(--orchid-pink-muted)", color: "var(--orchid-pink)" }}
              >
                {step}
              </span>
              <div>
                <span className="text-[11px] font-medium" style={{ color: "var(--text-secondary)" }}>
                  {text}
                </span>
                <span className="text-[10px] ml-1" style={{ color: "var(--text-tertiary)" }}>
                  {desc}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* CLI hint */}
      <div
        className="mx-3 mb-3 p-2.5 rounded-md border"
        style={{
          background: "var(--bg-primary)",
          borderColor: "var(--border-subtle)",
        }}
      >
        <div className="text-[10px] font-medium mb-1" style={{ color: "var(--text-tertiary)" }}>
          Quick start
        </div>
        <code className="text-[11px] font-mono" style={{ color: "var(--orchid-pink)" }}>
          $ orchid claude
        </code>
      </div>

      {/* Footer */}
      <div
        className="px-4 py-3 text-[11px] border-t"
        style={{
          color: "var(--text-tertiary)",
          borderColor: "var(--border-subtle)",
        }}
      >
        Code tells you what. Git tells you when.
        <br />
        <span style={{ color: "var(--orchid-pink)" }}>Orchid tells you why.</span>
      </div>
    </aside>
  );
}
