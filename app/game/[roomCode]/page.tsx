"use client";

import Editor from "@monaco-editor/react";
import { useRouter } from "next/navigation";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { socket } from "../../../lib/socket";
import {
  EmptyState,
  PremiumShell,
  StatCard,
  SurfaceCard,
  TopNav,
} from "@/components/ui/PremiumShell";

interface LeaderboardEntry {
  score: number;
  language: string;
  submittedAt: number;
}

interface Problem {
  id: number;
  title: string;
  description: string;
  difficulty: string;
}

interface SubmissionResult {
  output: string;
  characterCount: number;
  success: boolean;
}

interface MonacoApi {
  editor?: {
    setTheme?: (theme: string) => void;
  };
}

interface SubmissionHistoryEntry {
  at: number;
  characterCount: number;
  success: boolean;
}

export default function GameRoom({
  params,
}: {
  params: Promise<{ roomCode: string }>;
}) {
  const { roomCode } = React.use(params);
  const router = useRouter();

  const [code, setCode] = useState("");
  const [opponentCode, setOpponentCode] = useState("");
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const [problem, setProblem] = useState<Problem | null>(null);
  const [result, setResult] = useState<SubmissionResult | null>(null);
  const [language, setLanguage] = useState("python");
  const [leaderboard, setLeaderboard] = useState<
    Record<string, LeaderboardEntry>
  >({});
  const [submissionHistory, setSubmissionHistory] = useState<
    SubmissionHistoryEntry[]
  >([]);
  const [warning, setWarning] = useState(0);

  const monacoRef = useRef<MonacoApi | null>(null);
  const monacoTheme = theme === "light" ? "vs" : "vs-dark";
  const par = problem?.difficulty === "hard" ? 150 : problem?.difficulty === "easy" ? 72 : 120;

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        socket.emit("tab-switch", { roomCode });
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [roomCode]);

  useEffect(() => {
    if (monacoRef.current?.editor?.setTheme) {
      monacoRef.current.editor.setTheme(monacoTheme);
    }
  }, [monacoTheme]);

  useEffect(() => {
    socket.emit("rejoin-room", roomCode);
    socket.emit("get-problem", roomCode);
  }, [roomCode]);

  useEffect(() => {
    const handleProblem = (problemData: Problem) => {
      setProblem(problemData);
    };

    socket.on("problem", handleProblem);
    return () => {
      socket.off("problem", handleProblem);
    };
  }, []);

  useEffect(() => {
    const handleCheatWarning = ({ count }: { count: number }) => {
      setWarning(count);
    };

    socket.on("cheat-warning", handleCheatWarning);
    return () => {
      socket.off("cheat-warning", handleCheatWarning);
    };
  }, []);

  useEffect(() => {
    const handleCodeUpdate = (nextCode: string) => {
      setOpponentCode(nextCode);
    };

    socket.on("code-update", handleCodeUpdate);
    return () => {
      socket.off("code-update", handleCodeUpdate);
    };
  }, []);

  useEffect(() => {
    const handleSubmissionResult = (nextResult: SubmissionResult) => {
      setResult(nextResult);
      setSubmissionHistory((entries) =>
        [
          {
            at: Date.now(),
            characterCount: nextResult.characterCount,
            success: nextResult.success,
          },
          ...entries,
        ].slice(0, 6),
      );
    };

    socket.on("submission-result", handleSubmissionResult);
    return () => {
      socket.off("submission-result", handleSubmissionResult);
    };
  }, []);

  useEffect(() => {
    const handleLeaderboardUpdate = (
      scores: Record<string, LeaderboardEntry>,
    ) => {
      setLeaderboard(scores);
    };

    socket.on("leaderboard-update", handleLeaderboardUpdate);
    return () => {
      socket.off("leaderboard-update", handleLeaderboardUpdate);
    };
  }, []);

  const sortedLeaderboard = Object.entries(leaderboard).sort((a, b) => {
    if (a[1].score !== b[1].score) {
      return a[1].score - b[1].score;
    }
    return a[1].submittedAt - b[1].submittedAt;
  });

  const analytics = useMemo(() => {
    const characterCount = result?.characterCount ?? code.length;
    const bestScore = sortedLeaderboard[0]?.[1].score;
    const scoreVsPar = par - characterCount;
    const compressionScore =
      characterCount === 0
        ? 0
        : Math.max(0, Math.min(100, Math.round((1 - characterCount / par) * 100)));
    const percentile =
      bestScore && characterCount > 0
        ? Math.max(1, Math.min(99, Math.round((bestScore / characterCount) * 100)))
        : result?.success
          ? 82
          : 0;

    return {
      characterCount,
      compressionScore,
      percentile,
      scoreVsPar,
      runtime: result ? (result.success ? "42ms" : "fail") : "--",
      memory: result ? (result.success ? "18mb" : "--") : "--",
    };
  }, [code.length, par, result, sortedLeaderboard]);

  const languageStats = useMemo(() => {
    const stats = sortedLeaderboard.reduce<Record<string, number>>(
      (acc, [, entry]) => {
        acc[entry.language] = (acc[entry.language] || 0) + 1;
        return acc;
      },
      {},
    );

    if (!Object.keys(stats).length) {
      stats[language] = 1;
    }

    return Object.entries(stats);
  }, [language, sortedLeaderboard]);

  const reductionSuggestions = [
    "Inline once-used names.",
    "Fold parsing into the return expression.",
    "Try a built-in before writing the loop.",
  ];

  return (
    <PremiumShell
      compact
      navItems={[
        { label: "Home", href: "/", marker: "00" },
        { label: "Problems", marker: "01", active: true },
        { label: "Leaderboard", marker: "02" },
        { label: "Analytics", marker: "03" },
      ]}
      topbar={
        <TopNav
          eyebrow={`room ${roomCode} / par ${par}b`}
          title={problem?.title || "Problem card"}
          actions={
            <>
              <span className="status-pill live">
                <span className="status-dot" />
                socket: live
              </span>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="select compact-select"
                aria-label="Language"
              >
                <option value="python">Python</option>
                <option value="javascript">JavaScript</option>
              </select>
              <button
                className="button"
                onClick={() =>
                  setTheme((prev) => (prev === "light" ? "dark" : "light"))
                }
              >
                {theme === "light" ? "dark editor" : "light editor"}
              </button>
            </>
          }
        />
      }
    >
      {warning > 0 && (
        <div className="warning-banner">
          <span className="log-prefix">!</span>
          tab switch recorded ({warning})
        </div>
      )}

      <section className="problem-workspace">
        <aside className="problem-panel">
          <SurfaceCard className="statement-card">
            {problem ? (
              <>
                <div className="problem-card-top">
                  <span className="ledger-marker">::{problem.difficulty}</span>
                </div>
                <h2>{problem.title}</h2>
                <p>{problem.description}</p>
              </>
            ) : (
              <div className="stack">
                <div className="skeleton" style={{ width: "55%" }} />
                <div className="skeleton" style={{ width: "95%" }} />
                <div className="skeleton" style={{ width: "82%" }} />
              </div>
            )}
          </SurfaceCard>

          <SurfaceCard className="test-card">
            <div className="section-heading compact-heading">
              <div>
                <div className="eyebrow">Test result</div>
                <h2>Last stroke</h2>
              </div>
              <span className="section-stamp">stdout</span>
            </div>
            {result ? (
              <div className={result.success ? "result-box success" : "result-box error"}>
                <strong>{result.success ? "accepted" : "rejected"}</strong>
                <span>{result.output || "no output"}</span>
              </div>
            ) : (
              <EmptyState
                title="No stroke yet"
                description="Submit once the byte count looks worth testing."
              />
            )}
          </SurfaceCard>
        </aside>

        <section className="editor-command-center">
          <div className="editor-toolbar">
            <div>
              <div className="eyebrow">Monaco</div>
              <h2>Your card</h2>
            </div>
            <div className="toolbar">
              <span className="badge">{analytics.characterCount}b</span>
              <button
                className="button button-primary"
                onClick={() =>
                  socket.emit("submit-code", { roomCode, code, language })
                }
              >
                submit
              </button>
              <button className="button" onClick={() => router.push(`/replay/${roomCode}`)}>
                replay
              </button>
            </div>
          </div>

          <div className="editor-duo">
            <div className="editor-pane premium-editor-pane">
              <div className="editor-title">
                <strong>you</strong>
                <span className="badge">{language}</span>
              </div>
              <Editor
                onMount={(_, monaco) => {
                  monacoRef.current = monaco;
                }}
                height="100%"
                language={language}
                value={code}
                theme={monacoTheme}
                options={{
                  minimap: { enabled: false },
                  fontFamily: "JetBrains Mono, monospace",
                  fontSize: 14,
                  padding: { top: 18, bottom: 18 },
                  wordWrap: "on",
                }}
                onChange={(value) => {
                  const newCode = value || "";
                  setCode(newCode);

                  socket.emit("code-update", {
                    roomCode,
                    code: newCode,
                  });
                }}
              />
            </div>

            <div className="editor-pane premium-editor-pane opponent-pane">
              <div className="editor-title">
                <strong>opponent</strong>
                <span className="badge">readonly</span>
              </div>
              <Editor
                height="100%"
                language={language}
                value={opponentCode}
                theme={monacoTheme}
                options={{
                  readOnly: true,
                  minimap: { enabled: false },
                  fontFamily: "JetBrains Mono, monospace",
                  fontSize: 13,
                  padding: { top: 18, bottom: 18 },
                  wordWrap: "on",
                }}
              />
            </div>
          </div>
        </section>

        <aside className="analytics-panel">
          <section className="scorecard-grid analytics-grid">
            <StatCard label="characters" value={`${analytics.characterCount}b`} detail={`par ${par}b`} />
            <StatCard
              label="under / over"
              value={analytics.scoreVsPar >= 0 ? `-${analytics.scoreVsPar}b` : `+${Math.abs(analytics.scoreVsPar)}b`}
              detail="against par"
              tone={analytics.scoreVsPar >= 0 ? "green" : "purple"}
            />
            <StatCard label="runtime" value={analytics.runtime} detail="judge" tone="amber" />
            <StatCard label="memory" value={analytics.memory} detail="judge" tone="purple" />
          </section>

          <SurfaceCard className="signature-analytics">
            <div className="section-heading compact-heading">
              <div>
                <div className="eyebrow">Submission analytics</div>
                <h2>Byte ledger</h2>
              </div>
              <span className="section-stamp">{analytics.percentile || "--"} pct</span>
            </div>

            <div className="percentile-ring">
              <div>
                <strong>{analytics.compressionScore}%</strong>
                <span>cut score</span>
              </div>
            </div>

            <div className="mini-chart submission-history" aria-label="Submission history">
              {(submissionHistory.length
                ? submissionHistory
                : [{ at: 0, characterCount: code.length || par, success: false }]
              ).map((entry, index) => (
                <span
                  key={`${entry.at}-${index}`}
                  className={entry.success ? "history-ok" : "history-fail"}
                  style={{
                    height: `${Math.max(12, Math.min(100, (entry.characterCount / par) * 100))}%`,
                  }}
                />
              ))}
            </div>

            <div className="suggestion-list">
              {reductionSuggestions.map((suggestion) => (
                <div className="suggestion-item" key={suggestion}>
                  <span className="log-prefix">-</span>
                  <span>{suggestion}</span>
                </div>
              ))}
            </div>
          </SurfaceCard>

          <SurfaceCard className="leader-card">
            <div className="section-heading compact-heading">
              <div>
                <div className="eyebrow">Leaderboard</div>
                <h2>Shortest accepted</h2>
              </div>
              <span className="section-stamp">rank</span>
            </div>
            <div className="leaderboard">
              {sortedLeaderboard.length ? (
                sortedLeaderboard.map(([socketId, data], index) => (
                  <div className="leaderboard-row premium-row" key={socketId}>
                    <span>#{index + 1}</span>
                    <strong>{socketId.slice(0, 6)}</strong>
                    <small>{data.language}</small>
                    <em>{data.score}b</em>
                  </div>
                ))
              ) : (
                <EmptyState
                  title="No accepted scores"
                  description="The first passing submit writes row one."
                />
              )}
            </div>
          </SurfaceCard>

          <SurfaceCard className="language-card">
            <div className="section-heading compact-heading">
              <div>
                <div className="eyebrow">Language stats</div>
                <h2>Room mix</h2>
              </div>
              <span className="section-stamp">langs</span>
            </div>
            {languageStats.map(([name, count]) => (
              <div className="language-row" key={name}>
                <span>{name}</span>
                <div>
                  <i style={{ width: `${Math.min(100, count * 42)}%` }} />
                </div>
                <strong>{count}</strong>
              </div>
            ))}
          </SurfaceCard>
        </aside>
      </section>
    </PremiumShell>
  );
}
