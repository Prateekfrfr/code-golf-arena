"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ConnectionStatus,
  EmptyState,
  PremiumShell,
  SurfaceCard,
  TopNav,
} from "@/components/ui/PremiumShell";
import { useSocketConnection } from "@/hooks/useSocketConnection";
import type { Language, Problem } from "@/types/domain";

const PAGE_SIZE = 12;
const apiBase =
  process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:3001";

type ProblemResponse = {
  items: Problem[];
  nextCursor: string | null;
  total: number;
};

const languageLabels: Record<Language, string> = {
  python: "Python",
  javascript: "JavaScript",
  cpp: "C++",
  java: "Java",
};

const topics = [
  "arrays",
  "strings",
  "math",
  "dp",
  "stacks",
  "graphs",
  "hashing",
] as const;

const isProblemResponse = (value: unknown): value is ProblemResponse => {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ProblemResponse>;
  return (
    Array.isArray(candidate.items) &&
    candidate.items.every(
      (item) =>
        Boolean(item) &&
        typeof item === "object" &&
        typeof item.slug === "string" &&
        typeof item.title === "string" &&
        typeof item.topic === "string" &&
        typeof item.difficulty === "string" &&
        typeof (item.statement || item.description) === "string",
    ) &&
    typeof candidate.total === "number" &&
    Number.isSafeInteger(candidate.total) &&
    candidate.total >= 0 &&
    (candidate.nextCursor === null ||
      typeof candidate.nextCursor === "string")
  );
};

export default function ProblemsPage() {
  const { connected } = useSocketConnection();
  const [search, setSearch] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [topic, setTopic] = useState("");
  const [language, setLanguage] = useState("");
  const [page, setPage] = useState(0);
  const [retryKey, setRetryKey] = useState(0);
  const [response, setResponse] = useState<ProblemResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setLoading(true);
      setError("");

      try {
        const endpoint = new URL("/api/problems", apiBase);
        const parameters = new URLSearchParams({
          cursor: String(page * PAGE_SIZE),
          limit: String(PAGE_SIZE),
        });
        if (search.trim()) parameters.set("search", search.trim());
        if (difficulty) parameters.set("difficulty", difficulty);
        if (topic) parameters.set("topic", topic);
        if (language) parameters.set("language", language);
        endpoint.search = parameters.toString();

        const result = await fetch(endpoint, {
          signal: controller.signal,
          headers: { Accept: "application/json" },
        });
        if (!result.ok) {
          throw new Error(`Problem catalog returned ${result.status}.`);
        }

        const payload: unknown = await result.json();
        if (!isProblemResponse(payload)) {
          throw new Error("Problem catalog returned an unexpected response.");
        }
        setResponse(payload);
      } catch (requestError) {
        if (controller.signal.aborted) return;
        setResponse(null);
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Problem catalog could not be loaded.",
        );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 280);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [difficulty, language, page, retryKey, search, topic]);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil((response?.total ?? 0) / PAGE_SIZE)),
    [response?.total],
  );

  return (
    <PremiumShell
      navItems={[
        { label: "Home", href: "/", marker: "cd" },
        { label: "Problems", href: "/problems", marker: "{}" },
      ]}
      status={
        <>
          <div className="status-orbit">
            <span className={connected ? "" : "offline"} />
          </div>
          <div>
            <strong>Problem provider</strong>
            <span>{connected ? "catalog available" : "server reconnecting"}</span>
          </div>
        </>
      }
      topbar={
        <TopNav
          eyebrow="Problem catalog"
          title="Find a challenge"
          actions={<ConnectionStatus connected={connected} />}
        />
      }
    >
      <section className="catalog-layout" aria-labelledby="catalog-title">
        <header className="catalog-heading">
          <div>
            <div className="eyebrow">Provider-backed discovery</div>
            <h1 id="catalog-title">Problems built for short solutions.</h1>
            <p>
              Search the active provider. Filters and pagination are applied by
              the server, so this view scales with the catalog.
            </p>
          </div>
          <span className="catalog-count" aria-live="polite">
            {loading ? "Loading catalog" : `${response?.total ?? 0} problems`}
          </span>
        </header>

        <SurfaceCard className="catalog-filters">
          <div className="catalog-search">
            <label className="form-label" htmlFor="problem-search">
              Search
            </label>
            <input
              className="input"
              id="problem-search"
              type="search"
              value={search}
              onChange={(event) => {
                setPage(0);
                setSearch(event.target.value.slice(0, 120));
              }}
              placeholder="Title, statement, or tag"
              autoComplete="off"
            />
          </div>
          <div>
            <label className="form-label" htmlFor="difficulty-filter">
              Difficulty
            </label>
            <select
              className="select"
              id="difficulty-filter"
              value={difficulty}
              onChange={(event) => {
                setPage(0);
                setDifficulty(event.target.value);
              }}
            >
              <option value="">All difficulties</option>
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </div>
          <div>
            <label className="form-label" htmlFor="topic-filter">
              Topic
            </label>
            <select
              className="select"
              id="topic-filter"
              value={topic}
              onChange={(event) => {
                setPage(0);
                setTopic(event.target.value);
              }}
            >
              <option value="">All topics</option>
              {topics.map((topicOption) => (
                <option key={topicOption} value={topicOption}>
                  {topicOption}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="form-label" htmlFor="language-filter">
              Language
            </label>
            <select
              className="select"
              id="language-filter"
              value={language}
              onChange={(event) => {
                setPage(0);
                setLanguage(event.target.value);
              }}
            >
              <option value="">All languages</option>
              {Object.entries(languageLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </SurfaceCard>

        <div className="catalog-status" role="status" aria-live="polite">
          {loading ? "Updating problem results." : ""}
        </div>

        {loading ? (
          <div className="problem-grid" aria-hidden="true">
            {Array.from({ length: 6 }, (_, index) => (
              <SurfaceCard className="problem-card problem-card-skeleton" key={index}>
                <div className="skeleton skeleton-short" />
                <div className="skeleton skeleton-medium" />
                <div className="skeleton skeleton-wide" />
                <div className="skeleton skeleton-half" />
              </SurfaceCard>
            ))}
          </div>
        ) : error ? (
          <SurfaceCard className="catalog-message">
            <div className="eyebrow">Catalog unavailable</div>
            <h2>Problems could not be loaded.</h2>
            <p>{error}</p>
            <button
              className="button button-primary"
              type="button"
              onClick={() => setRetryKey((key) => key + 1)}
            >
              retry catalog
            </button>
          </SurfaceCard>
        ) : response?.items.length ? (
          <>
            <div className="problem-grid">
              {response.items.map((problem) => (
                <article className="problem-card" key={problem.slug}>
                  <div className="problem-card-top">
                    <span className="ledger-marker">::{problem.topic}</span>
                    <span className={`badge difficulty-${problem.difficulty}`}>
                      {problem.difficulty}
                    </span>
                  </div>
                  <div>
                    <h2>{problem.title}</h2>
                    <p>{problem.statement || problem.description}</p>
                  </div>
                  <div className="problem-tags" aria-label="Problem tags">
                    {(problem.tags || []).slice(0, 4).map((tag) => (
                      <span key={tag}>{tag}</span>
                    ))}
                  </div>
                  <dl className="problem-meta">
                    <div>
                      <dt>Languages</dt>
                      <dd>
                        {(problem.supportedLanguages || [])
                          .map((item) => languageLabels[item])
                          .join(", ") || "Not specified"}
                      </dd>
                    </div>
                    <div>
                      <dt>Time limit</dt>
                      <dd>
                        {problem.timeLimitMs
                          ? `${problem.timeLimitMs.toLocaleString()} ms`
                          : "Provider default"}
                      </dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>

            <nav className="catalog-pagination" aria-label="Problem pages">
              <button
                className="button"
                type="button"
                disabled={page === 0}
                onClick={() => setPage((current) => Math.max(0, current - 1))}
              >
                previous
              </button>
              <span>
                page {page + 1} of {totalPages}
              </span>
              <button
                className="button"
                type="button"
                disabled={page + 1 >= totalPages}
                onClick={() =>
                  setPage((current) => Math.min(totalPages - 1, current + 1))
                }
              >
                next
              </button>
            </nav>
          </>
        ) : (
          <EmptyState
            title="No matching problems"
            description="Change or clear a filter to broaden the provider query."
          />
        )}
      </section>
    </PremiumShell>
  );
}
