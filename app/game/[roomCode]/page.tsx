"use client";

import Editor from "@monaco-editor/react";
import { useRouter } from "next/navigation";
import React, { useEffect, useRef, useState } from "react";
import { getGuestId, socket } from "../../../lib/socket";
import {
  ConnectionStatus,
  EmptyState,
  PageState,
  PremiumShell,
  SurfaceCard,
  ToastRegion,
  TopNav,
} from "@/components/ui/PremiumShell";
import { useSocketConnection } from "@/hooks/useSocketConnection";
import { useTransientMessage } from "@/hooks/useTransientMessage";
import { SocketEvents } from "../../../shared/events";
import type {
  AntiCheatStats,
  AntiCheatSummary,
  AntiCheatSessionSummary,
  AntiCheatWarning,
  Language,
  LeaderboardEntry,
  Problem,
  RoomMode,
  SubmissionResult,
} from "@/types/domain";

interface MonacoApi {
  editor?: {
    setTheme?: (theme: string) => void;
  };
}

interface SubmissionHistoryEntry {
  at: number;
  characterCount: number;
  runtimeMs?: number;
  score?: number;
  success: boolean;
}

const emptyAntiCheatStats: AntiCheatStats = {
  tabSwitches: 0,
  suspiciousPastes: 0,
  submissionSpamAttempts: 0,
};

const finiteNumber = (value: number | undefined) =>
  typeof value === "number" && Number.isFinite(value) ? value : 0;

const normalizeAntiCheatStats = (
  stats?: Partial<AntiCheatStats>,
): AntiCheatStats => {
  return {
    tabSwitches: finiteNumber(stats?.tabSwitches),
    suspiciousPastes: finiteNumber(stats?.suspiciousPastes),
    submissionSpamAttempts: finiteNumber(stats?.submissionSpamAttempts),
  };
};

const normalizeAntiCheatSummary = (
  summary: AntiCheatSummary | Record<string, AntiCheatStats>,
) => {
  const stats = "stats" in summary ? summary.stats : summary;

  return Object.fromEntries(
    Object.entries(stats || {}).map(([playerId, playerStats]) => [
      playerId,
      normalizeAntiCheatStats(playerStats),
    ]),
  );
};

const isExpandedAntiCheatSummary = (
  summary: AntiCheatSummary | Record<string, AntiCheatStats>,
): summary is AntiCheatSummary =>
  "stats" in summary &&
  Boolean(summary.stats) &&
  !("tabSwitches" in summary.stats);

const formatScore = (score?: number) =>
  typeof score === "number" && Number.isFinite(score)
    ? Math.round(score).toLocaleString()
    : "N/A";

const formatRuntime = (runtimeMs?: number) =>
  typeof runtimeMs === "number" && Number.isFinite(runtimeMs)
    ? `${runtimeMs.toLocaleString()} ms`
    : "N/A";

const formatMemory = (memoryBytes?: number | null) => {
  if (typeof memoryBytes !== "number" || !Number.isFinite(memoryBytes)) {
    return "N/A";
  }

  return memoryBytes < 1024 * 1024
    ? `${Math.max(1, Math.round(memoryBytes / 1024)).toLocaleString()} KB`
    : `${(memoryBytes / (1024 * 1024)).toFixed(1)} MB`;
};

function TrendChart({
  label,
  values,
  format = (value) => String(value),
}: {
  label: string;
  values: number[];
  format?: (value: number) => string;
}) {
  if (!values.length) {
    return (
      <div className="trend-empty">
        <strong>{label}</strong>
        <span>No accepted trend data yet.</span>
      </div>
    );
  }

  const visibleValues = values.slice(-20);
  const minimum = Math.min(...visibleValues);
  const maximum = Math.max(...visibleValues);
  const range = Math.max(1, maximum - minimum);
  const points = visibleValues
    .map((value, index) => {
      const x =
        visibleValues.length === 1
          ? 50
          : (index / (visibleValues.length - 1)) * 100;
      const y = 34 - ((value - minimum) / range) * 28;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <figure className="trend-chart">
      <figcaption>
        <strong>{label}</strong>
        <span>{format(visibleValues.at(-1) ?? 0)}</span>
      </figcaption>
      <svg
        viewBox="0 0 100 40"
        role="img"
        aria-label={`${label} across ${visibleValues.length} recent submissions; latest ${format(visibleValues.at(-1) ?? 0)}`}
        preserveAspectRatio="none"
      >
        <path d="M0 36H100" className="trend-baseline" />
        {visibleValues.length === 1 ? (
          <circle cx="50" cy="20" r="2.5" className="trend-dot" />
        ) : (
          <polyline points={points} className="trend-line" />
        )}
      </svg>
    </figure>
  );
}

export default function GameRoom({
  params,
}: {
  params: Promise<{ roomCode: string }>;
}) {
  const { roomCode: rawRoomCode } = React.use(params);
  const roomCode = rawRoomCode.trim().toUpperCase();
  const router = useRouter();

  const [code, setCode] = useState("");
  const [opponentCode, setOpponentCode] = useState("");
  const [opponentLanguage, setOpponentLanguage] =
    useState<Language>("python");
  const [problem, setProblem] = useState<Problem | null>(null);
  const [result, setResult] = useState<SubmissionResult | null>(null);
  const [language, setLanguage] = useState<Language>("python");
  const [roomMode, setRoomMode] = useState<RoomMode>("multiplayer");
  const [leaderboard, setLeaderboard] = useState<
    Record<string, LeaderboardEntry>
  >({});
  const [submissionHistory, setSubmissionHistory] = useState<
    SubmissionHistoryEntry[]
  >([]);
  const [warning, setWarning] = useState(0);
  const [antiCheatStats, setAntiCheatStats] = useState<
    Record<string, AntiCheatStats>
  >({});
  const [activeEditor, setActiveEditor] = useState<"you" | "opponent">("you");
  const [submitPending, setSubmitPending] = useState(false);
  const [cooldownRemainingMs, setCooldownRemainingMs] = useState(0);
  const [roomError, setRoomError] = useState("");
  const [problemDelayed, setProblemDelayed] = useState(false);
  const [integritySession, setIntegritySession] =
    useState<AntiCheatSessionSummary | null>(null);

  const monacoRef = useRef<MonacoApi | null>(null);
  const focusStartedAtRef = useRef<number | null>(null);
  const focusViolationCountRef = useRef(0);
  const focusCheckTimeoutRef = useRef<number | null>(null);
  const syncTimeoutRef = useRef<number | null>(null);
  const { connected, connectionEpoch } = useSocketConnection();
  const { message, setMessage } = useTransientMessage(5600);
  const monacoTheme = "vs-dark";
  const cooldownActive = cooldownRemainingMs > 0;

  useEffect(() => {
    const clearFocusCheck = () => {
      if (focusCheckTimeoutRef.current !== null) {
        window.clearTimeout(focusCheckTimeoutRef.current);
        focusCheckTimeoutRef.current = null;
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        if (focusStartedAtRef.current !== null) return;

        focusStartedAtRef.current = Date.now();
        focusViolationCountRef.current += 1;
        const violationCount = focusViolationCountRef.current;

        socket.emit(SocketEvents.ANTI_CHEAT_EVENT, {
          roomCode,
          type: "focus_lost",
          metadata: {
            durationMs: 0,
            violationCount,
          },
        });

        focusCheckTimeoutRef.current = window.setTimeout(() => {
          if (!document.hidden || focusStartedAtRef.current === null) return;

          socket.emit(SocketEvents.ANTI_CHEAT_EVENT, {
            roomCode,
            type: "focus_check",
            metadata: {
              durationMs: Date.now() - focusStartedAtRef.current,
              violationCount,
              exceededGracePeriod: true,
            },
          });
        }, 5100);
        return;
      }

      if (focusStartedAtRef.current === null) return;

      const durationMs = Math.max(0, Date.now() - focusStartedAtRef.current);
      focusStartedAtRef.current = null;
      clearFocusCheck();
      const violationCount = focusViolationCountRef.current;

      socket.emit(SocketEvents.ANTI_CHEAT_EVENT, {
        roomCode,
        type: "focus_gained",
        metadata: {
          durationMs,
          violationCount,
          exceededGracePeriod: durationMs > 5000,
        },
      });

      const durationSeconds = Math.max(1, Math.ceil(durationMs / 1000));
      setMessage(
        violationCount === 1
          ? `Focus left the round for ${durationSeconds}s. The integrity event was recorded; the next violation is final.`
          : `Final focus warning: ${durationSeconds}s away from the round was recorded.`,
      );
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      clearFocusCheck();
    };
  }, [roomCode, setMessage]);

  useEffect(() => {
    if (monacoRef.current?.editor?.setTheme) {
      monacoRef.current.editor.setTheme(monacoTheme);
    }
  }, [monacoTheme]);

  useEffect(() => {
    const handleProblem = (problemData: Problem) => {
      setProblem(problemData);
      setProblemDelayed(false);
      setRoomError("");
      setLanguage((currentLanguage) => {
        if (
          !problemData.supportedLanguages?.length ||
          problemData.supportedLanguages.includes(currentLanguage)
        ) {
          return currentLanguage;
        }
        return problemData.supportedLanguages[0];
      });
      setCode((currentCode) => {
        if (currentCode) return currentCode;
        const firstLanguage =
          problemData.supportedLanguages?.[0] || "python";
        return (
          problemData.starterCode?.[firstLanguage] ||
          problemData.starterCode?.python ||
          ""
        );
      });
    };

    const handleRoomReady = ({
      problem: roomProblem,
      mode,
    }: {
      problem?: Problem;
      mode?: RoomMode;
    }) => {
      if (roomProblem) setProblem(roomProblem);
      if (mode) setRoomMode(mode);
    };

    const handleRoomError = (errorMessage: string) => {
      setRoomError(errorMessage);
      setSubmitPending(false);
    };

    socket.on(SocketEvents.PROBLEM, handleProblem);
    socket.on(SocketEvents.ROOM_READY, handleRoomReady);
    socket.on(SocketEvents.ROOM_ERROR, handleRoomError);
    return () => {
      socket.off(SocketEvents.PROBLEM, handleProblem);
      socket.off(SocketEvents.ROOM_READY, handleRoomReady);
      socket.off(SocketEvents.ROOM_ERROR, handleRoomError);
    };
  }, []);

  useEffect(() => {
    if (!connected || connectionEpoch === 0) return;

    socket.emit(SocketEvents.REJOIN_ROOM, roomCode);
    socket.emit(SocketEvents.GET_PROBLEM, roomCode);
    socket.emit(SocketEvents.GET_ANTI_CHEAT_SUMMARY, roomCode);
  }, [connected, connectionEpoch, roomCode]);

  useEffect(() => {
    if (!connected || problem || roomError) return;

    const timeout = window.setTimeout(() => setProblemDelayed(true), 10000);
    return () => window.clearTimeout(timeout);
  }, [connected, problem, roomError]);

  useEffect(() => {
    const handleCheatWarning = (event: AntiCheatWarning) => {
      const stats = normalizeAntiCheatStats(event.stats);
      const totalWarnings = event.session?.violationCount ??
        stats.tabSwitches +
          stats.suspiciousPastes +
          stats.submissionSpamAttempts;

      setWarning(totalWarnings);
      if (event.session) {
        setIntegritySession(event.session);
        focusViolationCountRef.current = Math.max(
          focusViolationCountRef.current,
          event.session.violationCount,
        );
      }
      setAntiCheatStats((currentStats) => ({
        ...currentStats,
        [event.playerId]: stats,
      }));

      if (
        event.decision?.action === "invalidate" ||
        event.session?.status === "invalidated"
      ) {
        setSubmitPending(false);
        setMessage(
          event.session?.invalidationReason ||
            event.decision?.reasons?.[0] ||
            "This submission session was invalidated by the integrity policy.",
        );
      } else if (event.decision?.action === "final_warning") {
        setMessage(
          event.decision.reasons?.[0] ||
            "Final integrity warning. Another violation will invalidate the session.",
        );
      } else if (event.decision?.action === "warning") {
        setMessage(
          event.decision.reasons?.[0] ||
            "Integrity warning recorded. Keep this tab active and type code directly.",
        );
      }
    };

    const handleAntiCheatSummary = (
      summary: AntiCheatSummary | Record<string, AntiCheatStats>,
    ) => {
      setAntiCheatStats(normalizeAntiCheatSummary(summary));
      const sessions = isExpandedAntiCheatSummary(summary)
        ? summary.sessions
        : undefined;
      const playerId = getGuestId() || socket.id;
      if (sessions && playerId) {
        const currentSession = sessions[playerId];
        if (currentSession) {
          setIntegritySession(currentSession);
          focusViolationCountRef.current = Math.max(
            focusViolationCountRef.current,
            currentSession.violationCount,
          );
        }
      }
    };

    socket.on(SocketEvents.ANTI_CHEAT_WARNING, handleCheatWarning);
    socket.on(SocketEvents.ANTI_CHEAT_SUMMARY, handleAntiCheatSummary);
    return () => {
      socket.off(SocketEvents.ANTI_CHEAT_WARNING, handleCheatWarning);
      socket.off(SocketEvents.ANTI_CHEAT_SUMMARY, handleAntiCheatSummary);
    };
  }, [setMessage]);

  useEffect(() => {
    const handleCodeUpdate = (
      payload: string | { code?: string; language?: Language },
    ) => {
      setOpponentCode(
        typeof payload === "string" ? payload : payload.code || "",
      );
      if (typeof payload !== "string" && payload.language) {
        setOpponentLanguage(payload.language);
      }
    };

    socket.on(SocketEvents.CODE_UPDATE, handleCodeUpdate);
    return () => {
      socket.off(SocketEvents.CODE_UPDATE, handleCodeUpdate);
    };
  }, []);

  useEffect(() => {
    const handleSubmissionResult = (nextResult: SubmissionResult) => {
      setSubmitPending(false);
      setResult(nextResult);
      if (nextResult.invalidated) {
        setIntegritySession((current) => ({
          status: "invalidated",
          violationCount:
            current?.violationCount ?? focusViolationCountRef.current,
          warningCount: current?.warningCount,
          invalidatedAt: current?.invalidatedAt ?? Date.now(),
          invalidationReason:
            current?.invalidationReason ||
            "The judge rejected this invalidated submission session.",
        }));
      }
      if (nextResult.rateLimited && nextResult.cooldownMs) {
        setCooldownRemainingMs(nextResult.cooldownMs);
      }
      setSubmissionHistory((entries) =>
        [
          {
            at: Date.now(),
            characterCount: nextResult.characterCount,
            runtimeMs: nextResult.runtimeMs,
            score: nextResult.score,
            success: nextResult.success,
          },
          ...entries,
        ].slice(0, 6),
      );
    };

    socket.on(SocketEvents.SUBMISSION_RESULT, handleSubmissionResult);
    return () => {
      socket.off(SocketEvents.SUBMISSION_RESULT, handleSubmissionResult);
    };
  }, []);

  useEffect(() => {
    if (cooldownRemainingMs <= 0) return;

    const timeout = window.setTimeout(() => {
      setCooldownRemainingMs(
        (remaining) => Math.max(0, remaining - 200),
      );
    }, 200);

    return () => window.clearTimeout(timeout);
  }, [cooldownRemainingMs]);

  useEffect(() => {
    if (!submitPending) return;

    const timeout = window.setTimeout(() => {
      setSubmitPending(false);
      setMessage(
        "The judge did not respond in time. Your code is still in the editor; try again.",
      );
    }, 25000);

    return () => window.clearTimeout(timeout);
  }, [setMessage, submitPending]);

  useEffect(() => {
    return () => {
      if (syncTimeoutRef.current !== null) {
        window.clearTimeout(syncTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const handleLeaderboardUpdate = (
      scores: Record<string, LeaderboardEntry>,
    ) => {
      setLeaderboard(scores);
    };

    socket.on(SocketEvents.LEADERBOARD_UPDATE, handleLeaderboardUpdate);
    return () => {
      socket.off(SocketEvents.LEADERBOARD_UPDATE, handleLeaderboardUpdate);
    };
  }, []);

  const sortedLeaderboard = Object.entries(leaderboard).sort((a, b) => {
    if (a[1].score !== b[1].score) {
      return b[1].score - a[1].score;
    }
    if (a[1].characterCount !== b[1].characterCount) {
      return a[1].characterCount - b[1].characterCount;
    }
    if (a[1].runtimeMs !== b[1].runtimeMs) {
      return a[1].runtimeMs - b[1].runtimeMs;
    }
    return a[1].submittedAt - b[1].submittedAt;
  });

  const characterCount = code.length;
  const warningTotals = Object.values(antiCheatStats).reduce(
    (total, stats) =>
      total +
      stats.tabSwitches +
      stats.suspiciousPastes +
      stats.submissionSpamAttempts,
    0,
  );
  const submitDisabled =
    !connected ||
    !problem ||
    submitPending ||
    cooldownActive ||
    integritySession?.status === "invalidated";

  const requestRoomState = () => {
    if (!connected) {
      setMessage("The realtime server is still reconnecting.");
      return;
    }
    setRoomError("");
    setProblemDelayed(false);
    socket.emit(SocketEvents.REJOIN_ROOM, roomCode);
    socket.emit(SocketEvents.GET_PROBLEM, roomCode);
    socket.emit(SocketEvents.GET_ANTI_CHEAT_SUMMARY, roomCode);
  };

  const syncCodeUpdate = (nextCode: string, nextLanguage: Language) => {
    if (syncTimeoutRef.current !== null) {
      window.clearTimeout(syncTimeoutRef.current);
    }
    syncTimeoutRef.current = window.setTimeout(() => {
      socket.emit(SocketEvents.CODE_UPDATE, {
        roomCode,
        code: nextCode,
        language: nextLanguage,
      });
    }, 90);
  };

  const handleLanguageChange = (nextLanguage: Language) => {
    setLanguage(nextLanguage);
    syncCodeUpdate(code, nextLanguage);
  };

  const submitCode = () => {
    if (submitDisabled) return;

    if (syncTimeoutRef.current !== null) {
      window.clearTimeout(syncTimeoutRef.current);
      syncTimeoutRef.current = null;
    }
    socket.emit(SocketEvents.CODE_UPDATE, { roomCode, code, language });
    setSubmitPending(true);
    socket.emit(SocketEvents.SUBMIT_CODE, { roomCode, code, language });
  };

  const reportBlockedInput = (
    source: "paste" | "context_menu" | "drop",
    characterCount = 0,
  ) => {
    socket.emit(SocketEvents.ANTI_CHEAT_EVENT, {
      roomCode,
      type: source === "drop" ? "drop_insert" : "paste",
      metadata: { source, characterCount, blocked: true },
    });
    setMessage(
      source === "drop"
        ? "Drag-and-drop insertion is disabled during a round."
        : "Pasting is disabled during a round. Type your solution in the editor.",
    );
  };

  const blockPaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    reportBlockedInput("paste", event.clipboardData.getData("text").length);
  };

  const blockContextMenu = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    reportBlockedInput("context_menu");
  };

  const blockDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    reportBlockedInput("drop", event.dataTransfer.getData("text").length);
  };

  const blockPasteShortcut = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const isPasteShortcut =
      (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "v";
    const isShiftInsert = event.shiftKey && event.key === "Insert";
    if (!isPasteShortcut && !isShiftInsert) return;

    event.preventDefault();
    event.stopPropagation();
    reportBlockedInput("paste");
  };

  const supportedLanguages =
    problem?.supportedLanguages?.length
      ? problem.supportedLanguages
      : (["python", "javascript", "cpp", "java"] as Language[]);

  return (
    <PremiumShell
      compact
      navItems={[
        { label: "Home", href: "/", marker: "cd" },
        { label: "Problems", href: "/problems", marker: "{}" },
        { label: roomMode === "solo" ? "Practice" : "Live room", active: true, marker: ">>" },
      ]}
      status={
        <>
          <div className="status-orbit">
            <span className={connected ? "" : "offline"} />
          </div>
          <div>
            <strong>Room {roomCode}</strong>
            <span>{connected ? "connected" : "reconnecting"}</span>
          </div>
        </>
      }
      topbar={
        <TopNav
          eyebrow={`room ${roomCode} / ${roomMode}`}
          title={problem?.title || "Problem card"}
          actions={
            <>
              <ConnectionStatus connected={connected} />
              <select
                value={language}
                onChange={(event) =>
                  handleLanguageChange(event.target.value as Language)
                }
                className="select compact-select"
                aria-label="Language"
                disabled={submitPending}
              >
                {supportedLanguages.map((supportedLanguage) => (
                  <option key={supportedLanguage} value={supportedLanguage}>
                    {supportedLanguage === "cpp"
                      ? "C++"
                      : supportedLanguage.charAt(0).toUpperCase() +
                        supportedLanguage.slice(1)}
                  </option>
                ))}
              </select>
            </>
          }
        />
      }
    >
      <ToastRegion message={message} />

      {roomError ? (
        <PageState
          eyebrow="Room unavailable"
          title="We could not restore this round."
          description={roomError}
          action={
            <div className="toolbar">
              <button
                className="button button-primary"
                type="button"
                onClick={requestRoomState}
              >
                retry room
              </button>
              <button
                className="button"
                type="button"
                onClick={() => router.push("/")}
              >
                back home
              </button>
            </div>
          }
        />
      ) : (
        <>
          {(warning > 0 || integritySession?.status === "invalidated") && (
            <div
              className={
                integritySession?.status === "invalidated"
                  ? "warning-banner invalidated"
                  : "warning-banner"
              }
              role="alert"
            >
              <span className="log-prefix" aria-hidden="true">
                !
              </span>
              {integritySession?.status === "invalidated"
                ? "submission session invalidated"
                : `integrity event recorded (${warning})`}
            </div>
          )}

          <section
            className={
              roomMode === "solo"
                ? "problem-workspace solo-workspace"
                : "problem-workspace"
            }
          >
        <aside className="problem-panel">
          <SurfaceCard className="statement-card">
            {problem ? (
              <>
                <div className="problem-card-top">
                  <span className="ledger-marker">::{problem.topic}</span>
                  <span className="badge">{problem.difficulty}</span>
                </div>
                <h2>{problem.title}</h2>
                <p>{problem.statement || problem.description}</p>
                {problem.examples && problem.examples.length > 0 && (
                  <details className="problem-details">
                    <summary>Examples ({problem.examples.length})</summary>
                    <div className="problem-detail-list">
                      {problem.examples.map((example, index) => (
                        <div key={index}>
                          <strong>Example {index + 1}</strong>
                          <code>
                            in: {JSON.stringify(example.input)}
                            {"\n"}out: {JSON.stringify(example.output)}
                          </code>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
                {problem.constraints && problem.constraints.length > 0 && (
                  <details className="problem-details">
                    <summary>Constraints</summary>
                    <ul>
                      {problem.constraints.map((constraint) => (
                        <li key={constraint}>{constraint}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </>
            ) : connected && problemDelayed ? (
              <div className="inline-state" role="status">
                <strong>Problem is taking longer than expected.</strong>
                <span>Retry the room request without leaving your session.</span>
                <button className="button" type="button" onClick={requestRoomState}>
                  retry problem
                </button>
              </div>
            ) : (
              <div className="stack">
                <div className="skeleton skeleton-half" />
                <div className="skeleton skeleton-wide" />
                <div className="skeleton skeleton-medium" />
              </div>
            )}
          </SurfaceCard>

          <SurfaceCard className="test-card">
            <div className="section-heading compact-heading">
              <div>
                <div className="eyebrow">judge result</div>
                <h2>Last submit</h2>
              </div>
              <span className="section-stamp">stdout</span>
            </div>
            {result ? (
              <div
                className={result.success ? "result-box success" : "result-box error"}
                role="status"
                aria-live="polite"
              >
                <strong>
                  {result.invalidated
                    ? "invalidated"
                    : result.success
                      ? "accepted"
                      : "rejected"}
                </strong>
                <span>{result.output || "no output"}</span>
                <dl className="result-metrics">
                  <div>
                    <dt>Score</dt>
                    <dd>
                      {formatScore(result.score)}
                      {result.maxScore ? ` / ${formatScore(result.maxScore)}` : ""}
                    </dd>
                  </div>
                  <div>
                    <dt>Characters</dt>
                    <dd>{result.characterCount}</dd>
                  </div>
                  <div>
                    <dt>Bytes</dt>
                    <dd>{result.characterBytes}</dd>
                  </div>
                  <div>
                    <dt>Runtime</dt>
                    <dd>{formatRuntime(result.runtimeMs)}</dd>
                  </div>
                  <div>
                    <dt>Memory</dt>
                    <dd>{formatMemory(result.memoryBytes)}</dd>
                  </div>
                  <div>
                    <dt>Tests</dt>
                    <dd>
                      {result.passedTests === undefined ||
                      result.totalTests === undefined
                        ? "N/A"
                        : `${result.passedTests}/${result.totalTests}`}
                    </dd>
                  </div>
                </dl>
                {result.scoreBreakdown && (
                  <details className="result-details">
                    <summary>How this score was calculated</summary>
                    <p>{result.scoreBreakdown.summary}</p>
                    {result.scoreBreakdown.components.map((component) => (
                      <div className="breakdown-row" key={component.key}>
                        <span>{component.label}</span>
                        <strong>
                          {formatScore(component.weightedContribution)} pts
                        </strong>
                        <small>{component.weight}</small>
                      </div>
                    ))}
                  </details>
                )}
                {result.compression?.suggestions.length ? (
                  <details className="result-details">
                    <summary>
                      Golfing insights ({result.compression.estimatedSavings} chars)
                    </summary>
                    {result.compression.suggestions.map((suggestion) => (
                      <div className="insight-row" key={suggestion.id}>
                        <strong>{suggestion.title}</strong>
                        <span>{suggestion.message}</span>
                      </div>
                    ))}
                  </details>
                ) : null}
                {result.analytics && (
                  <dl className="analytics-strip" aria-label="Submission analytics">
                    <div>
                      <dt>Percentile</dt>
                      <dd>
                        {result.analytics.percentileBps === null
                          ? "N/A"
                          : `${(result.analytics.percentileBps / 100).toFixed(1)}%`}
                      </dd>
                    </div>
                    <div>
                      <dt>Global rank</dt>
                      <dd>
                        {result.analytics.globalRanking
                          ? `${result.analytics.globalRanking.rank}/${result.analytics.globalRanking.population}`
                          : "N/A"}
                      </dd>
                    </div>
                    <div>
                      <dt>Language rank</dt>
                      <dd>
                        {result.analytics.languageRanking
                          ? `${result.analytics.languageRanking.rank}/${result.analytics.languageRanking.population}`
                          : "N/A"}
                      </dd>
                    </div>
                  </dl>
                )}
              </div>
            ) : (
              <EmptyState
                title="No stroke yet"
                description="Submit once the byte count looks worth testing."
              />
            )}
          </SurfaceCard>
        </aside>

        <section className="editor-command-center" aria-label="Code editor">
          <div className="editor-toolbar">
            <div>
              <div className="eyebrow">Monaco</div>
              <h2>Your card</h2>
            </div>
            <div className="toolbar">
              <span className="badge">{characterCount} chars</span>
              <button
                type="button"
                className="button button-primary"
                onClick={submitCode}
                disabled={submitDisabled}
                aria-describedby="submit-status"
              >
                {submitPending
                  ? "judging…"
                  : cooldownActive
                    ? `retry in ${Math.ceil(cooldownRemainingMs / 1000)}s`
                    : "submit"}
              </button>
              <button
                type="button"
                className="button"
                onClick={() => router.push(`/replay/${roomCode}`)}
              >
                replay
              </button>
            </div>
            <span className="sr-only" id="submit-status" role="status" aria-live="polite">
              {integritySession?.status === "invalidated"
                ? "Submission is disabled because this session was invalidated."
                : submitPending
                  ? "Submission is being judged."
                  : cooldownActive
                    ? `Submission cooldown has ${Math.ceil(cooldownRemainingMs / 1000)} seconds remaining.`
                    : ""}
            </span>
          </div>

          {roomMode === "multiplayer" && (
            <div className="editor-tabs" role="tablist" aria-label="Editor view">
              <button
                className={activeEditor === "you" ? "editor-tab active" : "editor-tab"}
                type="button"
                role="tab"
                aria-selected={activeEditor === "you"}
                aria-controls="player-editor"
                tabIndex={activeEditor === "you" ? 0 : -1}
                onClick={() => setActiveEditor("you")}
              >
                your code
              </button>
              <button
                className={
                  activeEditor === "opponent" ? "editor-tab active" : "editor-tab"
                }
                type="button"
                role="tab"
                aria-selected={activeEditor === "opponent"}
                aria-controls="opponent-editor"
                tabIndex={activeEditor === "opponent" ? 0 : -1}
                onClick={() => setActiveEditor("opponent")}
              >
                opponent
              </button>
            </div>
          )}

          <div className="editor-duo">
            <div
              className={`editor-pane premium-editor-pane ${
                activeEditor === "you" ? "" : "pane-hidden-narrow"
              }`}
              id="player-editor"
              role="tabpanel"
              onPasteCapture={blockPaste}
              onKeyDownCapture={blockPasteShortcut}
              onContextMenuCapture={blockContextMenu}
              onDropCapture={blockDrop}
              onDragOverCapture={(event) => event.preventDefault()}
            >
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
                  accessibilitySupport: "on",
                }}
                onChange={(value) => {
                  const newCode = value || "";
                  setCode(newCode);
                  syncCodeUpdate(newCode, language);
                }}
              />
            </div>

            {roomMode === "multiplayer" && (
              <div
                className={`editor-pane premium-editor-pane opponent-pane ${
                  activeEditor === "opponent" ? "" : "pane-hidden-narrow"
                }`}
                id="opponent-editor"
                role="tabpanel"
              >
                <div className="editor-title">
                  <strong>opponent</strong>
                  <span className="badge">readonly</span>
                </div>
                <Editor
                  height="100%"
                  language={opponentLanguage}
                  value={opponentCode}
                  theme={monacoTheme}
                  options={{
                    readOnly: true,
                    minimap: { enabled: false },
                    fontFamily: "JetBrains Mono, monospace",
                    fontSize: 13,
                    padding: { top: 18, bottom: 18 },
                    wordWrap: "on",
                    accessibilitySupport: "on",
                  }}
                />
              </div>
            )}
          </div>
        </section>

        <aside className="room-panel-stack">
          <SurfaceCard className="round-card">
            <div className="section-heading compact-heading">
              <div>
                <div className="eyebrow">current attempt</div>
                <h2>Attempt</h2>
              </div>
              <span className="section-stamp">{roomMode}</span>
            </div>

            <div className="score-lines">
              <div>
                <span>characters</span>
                <strong>{characterCount}</strong>
              </div>
              <div>
                <span>language</span>
                <strong>{language}</strong>
              </div>
              <div>
                <span>last judge</span>
                <strong className={result?.success ? "score-good" : result ? "score-over" : ""}>
                  {result ? (result.success ? "accepted" : "rejected") : "not submitted"}
                </strong>
              </div>
            </div>

            <div className="submission-list">
              {submissionHistory.length ? (
                submissionHistory.map((entry) => (
                  <div className="submission-row" key={entry.at}>
                    <span>{new Date(entry.at).toLocaleTimeString()}</span>
                    <strong>
                      {entry.score === undefined
                        ? `${entry.characterCount} chars`
                        : `${formatScore(entry.score)} pts`}
                    </strong>
                    <em className={entry.success ? "score-good" : "score-over"}>
                      {entry.success
                        ? `${entry.characterCount}c · ${formatRuntime(entry.runtimeMs)}`
                        : "rejected"}
                    </em>
                  </div>
                ))
              ) : (
                <EmptyState
                  title="No submissions"
                  description="Submit code to record attempts for this room."
                />
              )}
            </div>
          </SurfaceCard>

          <SurfaceCard className="leader-card">
            <div className="section-heading compact-heading">
              <div>
                <div className="eyebrow">Leaderboard</div>
                <h2>Top score</h2>
              </div>
              <span className="section-stamp">rank</span>
            </div>
            <div className="leaderboard">
              {sortedLeaderboard.length ? (
                sortedLeaderboard.map(([socketId, data], index) => (
                  <div className="leaderboard-row premium-row" key={socketId}>
                    <span>#{index + 1}</span>
                    <strong>{socketId.slice(0, 6)}</strong>
                    <small>
                      {data.language} · {data.characterCount}c ·{" "}
                      {formatRuntime(data.runtimeMs)}
                    </small>
                    <em>{formatScore(data.score)} pts</em>
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

          <SurfaceCard className="analytics-card">
            <div className="section-heading compact-heading">
              <div>
                <div className="eyebrow">post-submit</div>
                <h2>Performance trend</h2>
              </div>
              <span className="section-stamp">
                {result?.analytics?.timeline.length ?? 0}
              </span>
            </div>
            {result?.analytics ? (
              <div className="trend-grid">
                <TrendChart
                  label="Score"
                  values={(result.analytics.trends.score || []).map(
                    (point) => point.value,
                  )}
                  format={(value) => `${formatScore(value)} pts`}
                />
                <TrendChart
                  label="Characters"
                  values={(result.analytics.trends.characterCount || []).map(
                    (point) => point.value,
                  )}
                  format={(value) => `${Math.round(value)} chars`}
                />
                <TrendChart
                  label="Runtime"
                  values={(result.analytics.trends.runtimeMs || []).map(
                    (point) => point.value,
                  )}
                  format={(value) => formatRuntime(value)}
                />
              </div>
            ) : (
              <EmptyState
                title="No analytics yet"
                description="The judge returns score and trend data after a submission."
              />
            )}
          </SurfaceCard>

          <SurfaceCard className="integrity-card">
            <div className="section-heading compact-heading">
              <div>
                <div className="eyebrow">anti-cheat</div>
                <h2>Integrity</h2>
              </div>
              <span className="section-stamp">{warningTotals}</span>
            </div>
            {Object.keys(antiCheatStats).length ? (
              Object.entries(antiCheatStats).map(([playerId, stats], index) => (
                <div className="integrity-row" key={playerId}>
                  <strong>player {index + 1}</strong>
                  <span>{playerId.slice(0, 8)}</span>
                  <em>
                    tabs {stats.tabSwitches ?? emptyAntiCheatStats.tabSwitches} /
                    pastes{" "}
                    {stats.suspiciousPastes ??
                      emptyAntiCheatStats.suspiciousPastes}{" "}
                    / cooldown{" "}
                    {stats.submissionSpamAttempts ??
                      emptyAntiCheatStats.submissionSpamAttempts}
                  </em>
                </div>
              ))
            ) : (
              <EmptyState
                title="No events"
                description="Integrity events from this room appear here."
              />
            )}
          </SurfaceCard>
        </aside>
          </section>
        </>
      )}
    </PremiumShell>
  );
}
