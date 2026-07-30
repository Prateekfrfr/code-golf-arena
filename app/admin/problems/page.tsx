"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { canAuthorProblems, useAuth } from "@/components/auth/AuthProvider";
import { EmptyState, PageState, PremiumShell, SurfaceCard, TopNav } from "@/components/ui/PremiumShell";
import { apiRequest } from "@/lib/api";
import type { Problem } from "@/types/domain";

type ManagedResponse = {
  items: Problem[];
  total: number;
  nextCursor: string | null;
};

export default function ProblemAdminPage() {
  const { user, loading: authLoading } = useAuth();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(0);
  const [response, setResponse] = useState<ManagedResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!canAuthorProblems(user)) {
      return;
    }
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      const params = new URLSearchParams({ limit: "20", cursor: String(page * 20) });
      if (search.trim()) params.set("search", search.trim());
      if (status) params.set("status", status);
      setLoading(true);
      apiRequest<ManagedResponse>(`/api/admin/problems?${params}`, { signal: controller.signal })
        .then(setResponse)
        .catch((requestError) => {
          if (!controller.signal.aborted) setError(requestError instanceof Error ? requestError.message : "Problems could not be loaded.");
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 250);
    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [page, search, status, user]);

  if (authLoading) {
    return <PremiumShell><PageState loading eyebrow="Authoring" title="Validating access." description="Checking the server-side account role." /></PremiumShell>;
  }
  if (!canAuthorProblems(user)) {
    return <PremiumShell><PageState eyebrow="Restricted" title="Problem setter access is required." description="This route is backed by server-side role checks." /></PremiumShell>;
  }

  return (
    <PremiumShell
      topbar={<TopNav eyebrow="Problem setter" title="Authoring desk" actions={<Link className="button button-primary" href="/admin/problems/new">create problem</Link>} />}
    >
      <section className="admin-catalog">
        <header className="catalog-heading">
          <div><div className="eyebrow">local problem corpus</div><h1>Write, review, and publish.</h1><p>Every save creates an immutable version. Public discovery never receives hidden tests or locked editorials.</p></div>
          <span className="catalog-count">{response?.total || 0} records</span>
        </header>
        <SurfaceCard className="admin-filters">
          <label className="stack"><span className="form-label">Search</span><input className="input" value={search} onChange={(event) => { setSearch(event.target.value.slice(0, 120)); setPage(0); }} placeholder="Title, statement, or tag" /></label>
          <label className="stack"><span className="form-label">Status</span><select className="select" value={status} onChange={(event) => { setStatus(event.target.value); setPage(0); }}><option value="">All statuses</option><option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option></select></label>
        </SurfaceCard>
        {loading || response === null ? (
          <div className="admin-table"><div className="skeleton skeleton-wide" /><div className="skeleton skeleton-medium" /><div className="skeleton skeleton-wide" /></div>
        ) : error ? (
          <SurfaceCard className="catalog-message"><h2>Authoring catalog unavailable.</h2><p>{error}</p></SurfaceCard>
        ) : response?.items.length ? (
          <div className="admin-table">
            {response.items.map((problem) => (
              <article className="admin-row" key={problem.slug}>
                <div><span className="ledger-marker">::{problem.topic}</span><h2>{problem.title}</h2><code>{problem.slug}</code></div>
                <span className={`badge difficulty-${problem.difficulty}`}>{problem.difficulty}</span>
                <span className="badge">{problem.status}</span>
                <span className="badge">v{problem.version}</span>
                <Link className="button" href={`/admin/problems/${problem.slug}`}>edit</Link>
              </article>
            ))}
          </div>
        ) : <EmptyState title="No matching problems" description="Create a problem or broaden the filters." />}
        <nav className="catalog-pagination" aria-label="Authoring pages">
          <button className="button" type="button" disabled={page === 0} onClick={() => setPage((value) => Math.max(0, value - 1))}>previous</button>
          <span>page {page + 1}</span>
          <button className="button" type="button" disabled={!response?.nextCursor} onClick={() => setPage((value) => value + 1)}>next</button>
        </nav>
      </section>
    </PremiumShell>
  );
}
