"use client";

import Editor from "@monaco-editor/react";
import Link from "next/link";
import React, { useEffect, useState } from "react";
import {
  PageState,
  PremiumShell,
  SurfaceCard,
  TopNav,
} from "@/components/ui/PremiumShell";
import { apiRequest } from "@/lib/api";
import type { Language, Problem } from "@/types/domain";

export default function ProblemDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = React.use(params);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [error, setError] = useState("");
  const [language, setLanguage] = useState<Language>("python");
  const [code, setCode] = useState("");
  const [revealedHints, setRevealedHints] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    apiRequest<Problem>(`/api/problems/${encodeURIComponent(slug)}`, {
      signal: controller.signal,
    })
      .then((value) => {
        setProblem(value);
        const firstLanguage = value.supportedLanguages?.[0] || "python";
        setLanguage(firstLanguage);
        setCode(value.starterCode?.[firstLanguage] || "");
      })
      .catch((requestError) => {
        if (!controller.signal.aborted) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : "Problem could not be loaded.",
          );
        }
      });
    return () => controller.abort();
  }, [slug]);

  if (error) {
    return (
      <PremiumShell>
        <PageState
          eyebrow="Problem unavailable"
          title="This problem could not be opened."
          description={error}
          action={<Link className="button" href="/problems">back to catalog</Link>}
        />
      </PremiumShell>
    );
  }

  if (!problem) {
    return (
      <PremiumShell>
        <PageState loading eyebrow="Problem" title="Opening statement." description="Loading the public problem version." />
      </PremiumShell>
    );
  }

  const supportedLanguages =
    problem.supportedLanguages?.length
      ? problem.supportedLanguages
      : (["python", "javascript", "cpp", "java"] as Language[]);

  return (
    <PremiumShell
      compact
      topbar={
        <TopNav
          eyebrow={`${problem.topic} / v${problem.version || "1"}`}
          title={problem.title}
          actions={
            <select
              className="select compact-select"
              value={language}
              onChange={(event) => {
                const next = event.target.value as Language;
                setLanguage(next);
                setCode(problem.starterCode?.[next] || "");
              }}
              aria-label="Editor language"
            >
              {supportedLanguages.map((item) => (
                <option key={item} value={item}>{item === "cpp" ? "C++" : item}</option>
              ))}
            </select>
          }
        />
      }
    >
      <section className="problem-detail-layout">
        <article className="problem-document">
          <header className="problem-document-header">
            <div className="problem-card-top">
              <span className="ledger-marker">::{problem.topic}</span>
              <span className={`badge difficulty-${problem.difficulty}`}>
                {problem.difficulty}
              </span>
            </div>
            <h1>{problem.title}</h1>
            <dl className="problem-facts">
              <div><dt>Time</dt><dd>{problem.timeLimitMs?.toLocaleString()} ms</dd></div>
              <div><dt>Memory</dt><dd>{problem.memoryLimitMb} MB</dd></div>
              <div><dt>Source</dt><dd>{Math.round((problem.maxSourceSizeBytes || 65536) / 1024)} KB</dd></div>
              <div><dt>Estimate</dt><dd>{problem.estimatedSolveTimeMinutes} min</dd></div>
            </dl>
          </header>

          <section>
            <h2>Statement</h2>
            <p>{problem.statement}</p>
          </section>
          {problem.inputFormat && (
            <section><h2>Input</h2><p>{problem.inputFormat}</p></section>
          )}
          {problem.outputFormat && (
            <section><h2>Output</h2><p>{problem.outputFormat}</p></section>
          )}
          {problem.constraints?.length ? (
            <section>
              <h2>Constraints</h2>
              <ul>{problem.constraints.map((item) => <li key={item}>{item}</li>)}</ul>
            </section>
          ) : null}
          <section>
            <h2>Examples</h2>
            <div className="example-grid">
              {(problem.examples || []).map((example, index) => (
                <SurfaceCard className="example-card" key={index}>
                  <strong>Example {index + 1}</strong>
                  <div><span>Input</span><pre>{String(example.input)}</pre></div>
                  <div><span>Output</span><pre>{String(example.output)}</pre></div>
                  {example.explanation && <p>{example.explanation}</p>}
                </SurfaceCard>
              ))}
            </div>
          </section>
          {problem.notes && <section><h2>Notes</h2><p>{problem.notes}</p></section>}
          {problem.hints?.length ? (
            <section>
              <h2>Hints</h2>
              <div className="hint-list">
                {problem.hints.slice(0, revealedHints).map((hint, index) => (
                  <div className="hint-row" key={hint}>
                    <span>{index + 1}</span>
                    <p>{hint}</p>
                  </div>
                ))}
                {revealedHints < problem.hints.length && (
                  <button
                    className="button"
                    type="button"
                    onClick={() => setRevealedHints((count) => count + 1)}
                  >
                    reveal hint {revealedHints + 1}
                  </button>
                )}
              </div>
            </section>
          ) : null}
        </article>

        <aside className="practice-editor">
          <div className="editor-title">
            <strong>guest editor</strong>
            <span className="badge">{language}</span>
          </div>
          <Editor
            height="520px"
            language={language}
            theme="vs-dark"
            value={code}
            onChange={(value) => setCode(value || "")}
            options={{
              minimap: { enabled: false },
              fontSize: 14,
              wordWrap: "on",
              accessibilitySupport: "on",
            }}
          />
          <div className="practice-editor-footer">
            <p>
              The editor is available in guest mode. Sign in before submitting
              to the isolated judge or joining a contest.
            </p>
            <Link className="button button-primary" href="/">open a practice round</Link>
          </div>
        </aside>
      </section>
    </PremiumShell>
  );
}

