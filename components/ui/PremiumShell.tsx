"use client";

import Link from "next/link";
import type { ReactNode } from "react";

type NavItem = {
  label: string;
  href?: string;
  active?: boolean;
  marker?: string;
};

const defaultNavItems: NavItem[] = [
  { label: "Home", href: "/", active: true, marker: "cd" },
];

export function PremiumShell({
  children,
  navItems = defaultNavItems,
  topbar,
  compact = false,
  status,
}: {
  children: ReactNode;
  navItems?: NavItem[];
  topbar?: ReactNode;
  compact?: boolean;
  status?: ReactNode;
}) {
  return (
    <main className={compact ? "premium-shell premium-shell-compact" : "premium-shell"}>
      <aside className="sidebar">
        <Link className="brand brand-premium" href="/">
          <span className="brand-mark">CG</span>
          <span>
            <strong>Code Golf</strong>
            <small>Arena</small>
          </span>
        </Link>

        <nav className="sidebar-nav" aria-label="Primary navigation">
          {navItems.map((item) => {
            const content = (
              <>
                <span className="nav-marker">{item.marker || "//"}</span>
                <span>{item.label}</span>
              </>
            );

            if (item.href) {
              return (
                <Link
                  key={item.label}
                  className={item.active ? "sidebar-link active" : "sidebar-link"}
                  href={item.href}
                >
                  {content}
                </Link>
              );
            }

            return (
              <span
                key={item.label}
                className={item.active ? "sidebar-link active" : "sidebar-link"}
              >
                {content}
              </span>
            );
          })}
        </nav>

        <div className="sidebar-status">
          {status}
        </div>
      </aside>

      <section className="workspace">
        {topbar}
        <div className="workspace-body">{children}</div>
      </section>
    </main>
  );
}

export function TopNav({
  title,
  eyebrow,
  actions,
}: {
  title: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="topnav">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <div className="topnav-title">{title}</div>
      </div>
      {actions && <div className="topnav-actions">{actions}</div>}
    </header>
  );
}

export function SurfaceCard({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={`surface-card ${className}`}>{children}</section>;
}

export function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="empty-state">
      <span className="empty-marker">∅</span>
      <strong>{title}</strong>
      <span>{description}</span>
    </div>
  );
}
