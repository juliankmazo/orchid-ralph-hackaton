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
      <nav className="flex flex-col gap-0.5 p-2 flex-1">
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
