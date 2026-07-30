"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { canAuthorProblems, useAuth } from "@/components/auth/AuthProvider";
import { PageState, PremiumShell, SurfaceCard, TopNav } from "@/components/ui/PremiumShell";
import { apiRequest } from "@/lib/api";
import type { Problem } from "@/types/domain";

type VersionEntry = {
  version: number;
  fingerprint: string;
  importedAt: string;
  problem: Problem;
};

type EditorProblem = Problem & {
  visibleTests: NonNullable<Problem["visibleTests"]>;
  testCases: NonNullable<Problem["testCases"]>;
};

const emptyProblem = (): EditorProblem => ({
  title: "",
  slug: "",
  statement: "",
  description: "",
  inputFormat: "",
  outputFormat: "",
  explanation: "",
  notes: "",
  hints: [],
  examples: [],
  constraints: [],
  difficulty: "easy",
  topic: "arrays",
  tags: ["arrays"],
  supportedLanguages: ["python", "javascript", "cpp", "java"],
  visibleTests: [],
  testCases: [],
  timeLimitMs: 2_000,
  memoryLimitMb: 128,
  maxSourceSizeBytes: 65_536,
  estimatedSolveTimeMinutes: 15,
  visibility: "private",
  status: "draft",
  version: "1",
});

const slugify = (value: string) =>
  value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 160)
    .replace(/-+$/g, "");

const jsonText = (value: unknown) => JSON.stringify(value, null, 2);

export function ProblemEditor({ slug }: { slug?: string }) {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [problem, setProblem] = useState<EditorProblem>(emptyProblem);
  const [examplesText, setExamplesText] = useState("[]");
  const [visibleTestsText, setVisibleTestsText] = useState("[]");
  const [hiddenTestsText, setHiddenTestsText] = useState("[]");
  const [versions, setVersions] = useState<VersionEntry[]>([]);
  const [preview, setPreview] = useState(false);
  const [pending, setPending] = useState(false);
  const [loaded, setLoaded] = useState(!slug);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const autosaveReadyRef = useRef(false);

  useEffect(() => {
    if (!slug || !canAuthorProblems(user)) return;
    apiRequest<{
      problem: EditorProblem;
      versions: VersionEntry[];
      draft?: { problem?: EditorProblem } | null;
    }>(`/api/admin/problems/${encodeURIComponent(slug)}`)
      .then((result) => {
        const selected = result.draft?.problem || result.problem;
        setProblem({ ...emptyProblem(), ...selected });
        setExamplesText(jsonText(selected.examples || []));
        setVisibleTestsText(jsonText(selected.visibleTests || []));
        setHiddenTestsText(jsonText(selected.hiddenTests || []));
        setVersions(result.versions);
        autosaveReadyRef.current = true;
      })
      .catch((requestError) =>
        setError(requestError instanceof Error ? requestError.message : "Problem could not be loaded."),
      )
      .finally(() => setLoaded(true));
  }, [slug, user]);

  const update = <Key extends keyof EditorProblem>(
    key: Key,
    value: EditorProblem[Key],
  ) => {
    setProblem((current) => ({ ...current, [key]: value }));
    setDirty(true);
    setMessage("");
  };

  const parseArray = <T,>(text: string, field: string): T[] => {
    const value: unknown = JSON.parse(text);
    if (!Array.isArray(value)) throw new Error(`${field} must be a JSON array.`);
    return value as T[];
  };

  const buildPayload = () => {
    const examples = parseArray<NonNullable<Problem["examples"]>[number]>(
      examplesText,
      "Examples",
    );
    const visibleTests = parseArray<NonNullable<Problem["visibleTests"]>[number]>(
      visibleTestsText,
      "Public tests",
    );
    const hiddenTests = parseArray<NonNullable<Problem["testCases"]>[number]>(
      hiddenTestsText,
      "Hidden tests",
    );
    return {
      ...problem,
      description: problem.statement,
      examples,
      visibleTests,
      testCases: visibleTests,
      hiddenTests,
    };
  };

  useEffect(() => {
    if (!slug || !dirty || !autosaveReadyRef.current || !canAuthorProblems(user)) return;
    const timeout = window.setTimeout(() => {
      let payload: EditorProblem;
      try {
        payload = buildPayload();
      } catch {
        return;
      }
      apiRequest<{ savedAt: string }>(
        `/api/admin/problems/${encodeURIComponent(slug)}/draft`,
        { method: "PUT", body: JSON.stringify(payload) },
      )
        .then(({ savedAt }) => {
          setMessage(`Draft autosaved at ${new Date(savedAt).toLocaleTimeString()}.`);
          setDirty(false);
        })
        .catch(() => {
          // Explicit saves surface errors; autosave stays quiet and retries after the next edit.
        });
    }, 1_200);
    return () => window.clearTimeout(timeout);
  });

  const save = async (
    event?: FormEvent,
    override?: Partial<EditorProblem>,
  ) => {
    event?.preventDefault();
    setPending(true);
    setError("");
    setMessage("");
    try {
      const payload = { ...buildPayload(), ...override };
      const path = slug
        ? `/api/admin/problems/${encodeURIComponent(slug)}`
        : "/api/admin/problems";
      const result = await apiRequest<{ problem: EditorProblem }>(path, {
        method: slug ? "PUT" : "POST",
        body: JSON.stringify(payload),
      });
      setProblem({ ...emptyProblem(), ...result.problem });
      setDirty(false);
      setMessage(`Version ${result.problem.version} saved.`);
      if (!slug) {
        router.replace(`/admin/problems/${result.problem.slug}`);
      } else {
        const detail = await apiRequest<{ versions: VersionEntry[] }>(
          `/api/admin/problems/${encodeURIComponent(slug)}`,
        );
        setVersions(detail.versions);
      }
      return result.problem;
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Problem could not be saved.");
      return null;
    } finally {
      setPending(false);
    }
  };

  const changeStatus = async (status: "published" | "archived") => {
    const saved = await save(undefined, {
      status,
      visibility: status === "published" ? "public" : problem.visibility,
    });
    if (!saved) return;
    setProblem((current) => ({ ...current, status: saved.status }));
    setMessage(status === "published" ? "Problem published." : "Problem archived.");
  };

  const previewExamples = useMemo(() => {
    try {
      return parseArray<NonNullable<Problem["examples"]>[number]>(
        examplesText,
        "Examples",
      );
    } catch {
      return [];
    }
  }, [examplesText]);

  if (loading || !loaded) {
    return (
      <PremiumShell>
        <PageState loading eyebrow="Authoring" title="Opening problem editor." description="Validating your role and loading version history." />
      </PremiumShell>
    );
  }

  if (!canAuthorProblems(user)) {
    return (
      <PremiumShell>
        <PageState
          eyebrow="Restricted"
          title="Problem setter access is required."
          description="An administrator can assign the problem setter, moderator, or admin role."
        />
      </PremiumShell>
    );
  }

  if (error && slug && !problem.title) {
    return (
      <PremiumShell>
        <PageState eyebrow="Authoring error" title="The problem could not be opened." description={error} />
      </PremiumShell>
    );
  }

  return (
    <PremiumShell
      compact
      topbar={
        <TopNav
          eyebrow={slug ? `editing / ${slug}` : "new problem"}
          title={problem.title || "Untitled problem"}
          actions={
            <>
              <button className="button" type="button" onClick={() => setPreview((value) => !value)}>
                {preview ? "edit fields" : "preview"}
              </button>
              <button className="button button-primary" type="submit" form="problem-editor" disabled={pending}>
                {pending ? "saving…" : "save version"}
              </button>
            </>
          }
        />
      }
    >
      {preview ? (
        <section className="author-preview">
          <SurfaceCard className="problem-document">
            <div className="problem-card-top">
              <span className="ledger-marker">::{problem.topic}</span>
              <span className={`badge difficulty-${problem.difficulty}`}>{problem.difficulty}</span>
            </div>
            <h1>{problem.title || "Untitled problem"}</h1>
            <section><h2>Statement</h2><p>{problem.statement}</p></section>
            <section><h2>Input</h2><p>{problem.inputFormat}</p></section>
            <section><h2>Output</h2><p>{problem.outputFormat}</p></section>
            <section>
              <h2>Examples</h2>
              {previewExamples.map((example, index) => (
                <div className="example-card" key={index}>
                  <strong>Example {index + 1}</strong>
                  <pre>{String(example.input)}</pre>
                  <pre>{String(example.output)}</pre>
                </div>
              ))}
            </section>
          </SurfaceCard>
        </section>
      ) : (
        <form id="problem-editor" className="authoring-layout" onSubmit={save}>
          <section className="authoring-fields">
            <SurfaceCard className="authoring-section">
              <div className="section-heading">
                <div><div className="eyebrow">identity</div><h2>Problem details</h2></div>
                <span className="section-stamp">v{problem.version}</span>
              </div>
              <div className="form-grid">
                <label className="stack field-wide">
                  <span className="form-label">Title</span>
                  <input
                    className="input"
                    value={problem.title}
                    onChange={(event) => {
                      update("title", event.target.value.slice(0, 200));
                      if (!slug) update("slug", slugify(event.target.value));
                    }}
                    required
                  />
                </label>
                <label className="stack">
                  <span className="form-label">Slug</span>
                  <input className="input" value={problem.slug} onChange={(event) => update("slug", slugify(event.target.value))} disabled={Boolean(slug)} required />
                </label>
                <label className="stack">
                  <span className="form-label">Topic</span>
                  <input className="input" value={problem.topic} onChange={(event) => update("topic", slugify(event.target.value))} required />
                </label>
                <label className="stack">
                  <span className="form-label">Difficulty</span>
                  <select className="select" value={problem.difficulty} onChange={(event) => update("difficulty", event.target.value as EditorProblem["difficulty"])}>
                    <option value="easy">Easy</option><option value="medium">Medium</option>
                    <option value="hard">Hard</option><option value="very-hard">Very hard</option>
                  </select>
                </label>
                <label className="stack">
                  <span className="form-label">Visibility</span>
                  <select className="select" value={problem.visibility} onChange={(event) => update("visibility", event.target.value as EditorProblem["visibility"])}>
                    <option value="private">Private</option><option value="unlisted">Unlisted</option><option value="public">Public</option>
                  </select>
                </label>
                <label className="stack field-wide">
                  <span className="form-label">Tags (comma separated)</span>
                  <input className="input" value={(problem.tags || []).join(", ")} onChange={(event) => update("tags", event.target.value.split(",").map((item) => item.trim().toLowerCase()).filter(Boolean).slice(0, 30))} />
                </label>
              </div>
            </SurfaceCard>

            <SurfaceCard className="authoring-section">
              <div className="eyebrow">Codeforces-style statement</div>
              {([
                ["statement", "Statement"],
                ["inputFormat", "Input format"],
                ["outputFormat", "Output format"],
                ["notes", "Notes"],
                ["explanation", "Solution explanation"],
              ] as const).map(([key, label]) => (
                <label className="stack" key={key}>
                  <span className="form-label">{label}</span>
                  <textarea className="textarea" value={problem[key] || ""} onChange={(event) => update(key, event.target.value)} required={key === "statement"} />
                </label>
              ))}
              <label className="stack">
                <span className="form-label">Constraints (one per line)</span>
                <textarea className="textarea textarea-short" value={(problem.constraints || []).join("\n")} onChange={(event) => update("constraints", event.target.value.split("\n").map((item) => item.trim()).filter(Boolean))} />
              </label>
              <label className="stack">
                <span className="form-label">Hints (one per line, revealed in order)</span>
                <textarea className="textarea textarea-short" value={(problem.hints || []).join("\n")} onChange={(event) => update("hints", event.target.value.split("\n").map((item) => item.trim()).filter(Boolean).slice(0, 20))} />
              </label>
            </SurfaceCard>

            <SurfaceCard className="authoring-section">
              <div className="eyebrow">examples and judge data</div>
              <p className="muted">Use JSON arrays. Hidden tests are returned only to authenticated authoring and judge boundaries.</p>
              <label className="stack"><span className="form-label">Examples</span><textarea className="textarea code-textarea" value={examplesText} onChange={(event) => { setExamplesText(event.target.value); setDirty(true); }} /></label>
              <label className="stack"><span className="form-label">Public tests</span><textarea className="textarea code-textarea" value={visibleTestsText} onChange={(event) => { setVisibleTestsText(event.target.value); setDirty(true); }} /></label>
              <label className="stack"><span className="form-label">Hidden tests</span><textarea className="textarea code-textarea" value={hiddenTestsText} onChange={(event) => { setHiddenTestsText(event.target.value); setDirty(true); }} /></label>
            </SurfaceCard>

            <SurfaceCard className="authoring-section">
              <div className="form-grid">
                <label className="stack"><span className="form-label">Time limit (ms)</span><input className="input" type="number" min={100} max={30000} value={problem.timeLimitMs} onChange={(event) => update("timeLimitMs", Number(event.target.value))} /></label>
                <label className="stack"><span className="form-label">Memory (MB)</span><input className="input" type="number" min={16} max={1024} value={problem.memoryLimitMb} onChange={(event) => update("memoryLimitMb", Number(event.target.value))} /></label>
                <label className="stack"><span className="form-label">Maximum source bytes</span><input className="input" type="number" min={1024} max={1048576} value={problem.maxSourceSizeBytes} onChange={(event) => update("maxSourceSizeBytes", Number(event.target.value))} /></label>
                <label className="stack"><span className="form-label">Estimated solve minutes</span><input className="input" type="number" min={1} max={480} value={problem.estimatedSolveTimeMinutes} onChange={(event) => update("estimatedSolveTimeMinutes", Number(event.target.value))} /></label>
              </div>
            </SurfaceCard>
          </section>

          <aside className="authoring-rail">
            <SurfaceCard className="authoring-section">
              <div className="eyebrow">workflow</div>
              <dl className="profile-facts">
                <div><dt>Status</dt><dd>{problem.status}</dd></div>
                <div><dt>Visibility</dt><dd>{problem.visibility}</dd></div>
                <div><dt>Version</dt><dd>{problem.version}</dd></div>
              </dl>
              {message && <div className="form-message" role="status">{message}</div>}
              {error && <div className="form-error" role="alert">{error}</div>}
              <div className="stack">
                <button className="button button-primary" type="submit" disabled={pending}>save immutable version</button>
                {slug && <button className="button button-green" type="button" onClick={() => changeStatus("published")} disabled={pending}>publish</button>}
                {slug && <button className="button" type="button" onClick={() => changeStatus("archived")} disabled={pending}>archive</button>}
                {slug && (
                  <button
                    className="button button-danger"
                    type="button"
                    onClick={async () => {
                      if (!window.confirm("Soft-delete this problem? Version history remains in the database.")) return;
                      await apiRequest(`/api/admin/problems/${encodeURIComponent(slug)}`, { method: "DELETE" });
                      router.replace("/admin/problems");
                    }}
                  >
                    delete problem
                  </button>
                )}
              </div>
            </SurfaceCard>
            <SurfaceCard className="authoring-section">
              <div className="section-heading compact-heading"><div><div className="eyebrow">immutable history</div><h2>Versions</h2></div><span className="section-stamp">{versions.length}</span></div>
              <div className="version-list">
                {versions.map((entry) => (
                  <div key={entry.version}>
                    <strong>v{entry.version}</strong>
                    <span>{new Date(entry.importedAt).toLocaleString()}</span>
                    <code>{entry.fingerprint.slice(0, 10)}</code>
                  </div>
                ))}
                {!versions.length && <span className="muted">Save the first version to begin history.</span>}
              </div>
            </SurfaceCard>
          </aside>
        </form>
      )}
    </PremiumShell>
  );
}
