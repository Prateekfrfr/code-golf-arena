"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

type NavItem = {
  label: string;
  href?: string;
  active?: boolean;
  marker?: string;
};

const defaultNavItems: NavItem[] = [
  { label: "Home", href: "/", marker: "cd" },
  { label: "Problems", href: "/problems", marker: "{}" },
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
  const pathname = usePathname();

  return (
    <div
      className={compact ? "premium-shell premium-shell-compact" : "premium-shell"}
    >
      <aside className="sidebar" aria-label="Application">
        <Link className="brand brand-premium" href="/">
          <span className="brand-mark">CG</span>
          <span>
            <strong>Code Golf</strong>
            <small>Arena</small>
          </span>
        </Link>

        <nav className="sidebar-nav" aria-label="Primary navigation">
          {navItems.map((item) => {
            const isActive =
              item.active ??
              (item.href === "/"
                ? pathname === "/"
                : Boolean(item.href && pathname.startsWith(item.href)));
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
                  className={isActive ? "sidebar-link active" : "sidebar-link"}
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                >
                  {content}
                </Link>
              );
            }

            return (
              <span
                key={item.label}
                className={isActive ? "sidebar-link active" : "sidebar-link"}
              >
                {content}
              </span>
            );
          })}
        </nav>

        {status && (
          <div className="sidebar-status" role="status" aria-live="polite">
            {status}
          </div>
        )}
      </aside>

      <main className="workspace" id="main-content" tabIndex={-1}>
        {topbar}
        <div className="workspace-body">{children}</div>
      </main>
    </div>
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
    <div className="empty-state" role="status">
      <span className="empty-marker" aria-hidden="true">
        ∅
      </span>
      <strong>{title}</strong>
      <span>{description}</span>
    </div>
  );
}

export function ConnectionStatus({ connected }: { connected: boolean }) {
  return (
    <span
      className={connected ? "status-pill live" : "status-pill"}
      role="status"
      aria-live="polite"
    >
      <span className="status-dot" aria-hidden="true" />
      {connected ? "socket connected" : "socket reconnecting"}
    </span>
  );
}

export function ToastRegion({
  message,
  tone = "error",
}: {
  message: string;
  tone?: "error" | "info" | "success";
}) {
  if (!message) return null;

  return (
    <div className="toast-stack" aria-live="assertive" aria-atomic="true">
      <div className={`toast toast-${tone}`} role="alert">
        {message}
      </div>
    </div>
  );
}

export function PageState({
  eyebrow,
  title,
  description,
  action,
  loading = false,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
  loading?: boolean;
}) {
  return (
    <SurfaceCard className="page-state">
      <div className="page-state-mark" aria-hidden="true">
        {loading ? "…" : "//"}
      </div>
      <div role="status" aria-live={loading ? "polite" : "off"}>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p className="muted">{description}</p>
      </div>
      {loading && (
        <div className="stack" aria-hidden="true">
          <div className="skeleton skeleton-short" />
          <div className="skeleton" />
          <div className="skeleton skeleton-medium" />
        </div>
      )}
      {action && <div className="page-state-action">{action}</div>}
    </SurfaceCard>
  );
}
