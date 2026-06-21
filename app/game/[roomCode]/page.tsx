"use client";

import Editor from "@monaco-editor/react";
import { useRouter } from "next/navigation";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { socket } from "../../../lib/socket";
import { AntiCheatEventTypes, SocketEvents } from "../../../shared/events";
import type {
  AntiCheatStats,
  AntiCheatWarning,
  Language,
  LeaderboardEntry,
  Problem,
  RoomMode,
  SubmissionResult,
} from "../../../types/domain";

type ToastKind = "success" | "error" | "warning";

interface ToastState {
  message: string;
  kind: ToastKind;
}

interface CodeUpdatePayload {
  code: string;
  language?: Language;
}

interface RoomReadyPayload {
  problem?: Problem;
  mode?: RoomMode;
}

interface MonacoContentChange {
  changes: Array<{
    text: string;
    rangeLength: number;
  }>;
}

interface MonacoEditorInstance {
  onDidChangeModelContent?: (
    listener: (event: MonacoContentChange) => void
  ) => { dispose: () => void };
}

const LARGE_PASTE_THRESHOLD = 80;
const languageOptions: Array<{ value: Language; label: string }> = [
  { value: "python", label: "Python" },
  { value: "javascript", label: "JavaScript" },
  { value: "cpp", label: "C++" },
  { value: "java", label: "Java" },
];

const formatElapsed = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
};

export default function GameRoom({
  params,
}: {
  params: Promise<{ roomCode: string }>;
}) {
  const { roomCode } = React.use(params);
  const router = useRouter();

  const [code, setCode] = useState("");
  const [opponentCode, setOpponentCode] = useState("");
  const [opponentLanguage, setOpponentLanguage] = useState<Language>("python");
  const [problem, setProblem] = useState<Problem | null>(null);
  const [roomMode, setRoomMode] = useState<RoomMode | null>(null);
  const [result, setResult] = useState<SubmissionResult | null>(null);
  const [language, setLanguage] = useState<Language>("python");
  const [leaderboard, setLeaderboard] = useState<
    Record<string, LeaderboardEntry>
  >({});
  const [antiCheatStats, setAntiCheatStats] = useState<
    Record<string, AntiCheatStats>
  >({});
  const [toast, setToast] = useState<ToastState | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const pasteListenerRef = useRef<{ dispose: () => void } | null>(null);
  const lastPasteWarningAtRef = useRef(0);
  const isSolo = roomMode === "solo";

  useEffect(() => {
    return () => {
      pasteListenerRef.current?.dispose();
    };
  }, []);

  useEffect(() => {
    socket.emit(SocketEvents.REJOIN_ROOM, roomCode);
    socket.emit(SocketEvents.GET_PROBLEM, roomCode);
    socket.emit(SocketEvents.GET_ANTI_CHEAT_SUMMARY, roomCode);
  }, [roomCode]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setElapsedSeconds((current) => current + 1);
    }, 1000);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (roomMode !== "multiplayer") return;

    const handleVisibilityChange = () => {
      if (!document.hidden) return;

      socket.emit(SocketEvents.ANTI_CHEAT_EVENT, {
        roomCode,
        type: AntiCheatEventTypes.TAB_SWITCH,
      });
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [roomCode, roomMode]);

  useEffect(() => {
    const handleProblem = (problemData: Problem) => {
      setProblem(problemData);
    };

    const handleRoomReady = (payload: RoomReadyPayload) => {
      if (payload.problem) setProblem(payload.problem);
      setRoomMode(payload.mode || "multiplayer");
    };

    const handleCodeUpdate = (payload: CodeUpdatePayload | string) => {
      if (typeof payload === "string") {
        setOpponentCode(payload);
        return;
      }

      setOpponentCode(payload.code);
      if (payload.language) setOpponentLanguage(payload.language);
    };

    const handleSubmissionResult = (nextResult: SubmissionResult) => {
      setIsSubmitting(false);
      setResult(nextResult);
      setToast({
        kind: nextResult.success ? "success" : "error",
        message: nextResult.success
          ? `Passed in ${nextResult.characterCount} characters.`
          : nextResult.output,
      });
    };

    const handleLeaderboardUpdate = (
      scores: Record<string, LeaderboardEntry>
    ) => {
      setLeaderboard(scores);
    };

    const handleAntiCheatWarning = (warning: AntiCheatWarning) => {
      setAntiCheatStats((current) => ({
        ...current,
        [warning.playerId]: warning.stats,
      }));
      setToast({
        kind: "warning",
        message:
          warning.type === AntiCheatEventTypes.TAB_SWITCH
            ? "Tab switch recorded by the match judge."
            : warning.type === AntiCheatEventTypes.LARGE_PASTE
              ? "Large paste recorded by the match judge."
              : "Submission cooldown triggered.",
      });
    };

    const handleAntiCheatSummary = (summary: {
      stats: Record<string, AntiCheatStats>;
    }) => {
      setAntiCheatStats(summary.stats || {});
    };

    const handleError = (message: string) => {
      setIsSubmitting(false);
      setToast({ kind: "error", message });
    };

    socket.on(SocketEvents.PROBLEM, handleProblem);
    socket.on(SocketEvents.ROOM_READY, handleRoomReady);
    socket.on(SocketEvents.CODE_UPDATE, handleCodeUpdate);
    socket.on(SocketEvents.SUBMISSION_RESULT, handleSubmissionResult);
    socket.on(SocketEvents.LEADERBOARD_UPDATE, handleLeaderboardUpdate);
    socket.on(SocketEvents.ANTI_CHEAT_WARNING, handleAntiCheatWarning);
    socket.on(SocketEvents.ANTI_CHEAT_SUMMARY, handleAntiCheatSummary);
    socket.on(SocketEvents.ROOM_ERROR, handleError);
    socket.on("error", handleError);

    return () => {
      socket.off(SocketEvents.PROBLEM, handleProblem);
      socket.off(SocketEvents.ROOM_READY, handleRoomReady);
      socket.off(SocketEvents.CODE_UPDATE, handleCodeUpdate);
      socket.off(SocketEvents.SUBMISSION_RESULT, handleSubmissionResult);
      socket.off(SocketEvents.LEADERBOARD_UPDATE, handleLeaderboardUpdate);
      socket.off(SocketEvents.ANTI_CHEAT_WARNING, handleAntiCheatWarning);
      socket.off(SocketEvents.ANTI_CHEAT_SUMMARY, handleAntiCheatSummary);
      socket.off(SocketEvents.ROOM_ERROR, handleError);
      socket.off("error", handleError);
    };
  }, []);

  useEffect(() => {
    if (!toast) return;

    const timeout = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const sortedLeaderboard = useMemo(() => {
    return Object.entries(leaderboard).sort((a, b) => {
      if (a[1].score !== b[1].score) return a[1].score - b[1].score;
      return a[1].submittedAt - b[1].submittedAt;
    });
  }, [leaderboard]);

  const personalBest = socket.id ? leaderboard[socket.id] : null;

  const antiCheatEntries = useMemo(() => {
    return Object.entries(antiCheatStats);
  }, [antiCheatStats]);

  const emitCodeUpdate = (nextCode: string) => {
    if (isSolo) return;

    socket.emit(SocketEvents.CODE_UPDATE, {
      roomCode,
      code: nextCode,
      language,
    });
  };

  const emitLargePaste = (charCount: number) => {
    if (isSolo) return;

    const now = Date.now();
    if (now - lastPasteWarningAtRef.current < 1200) return;
    lastPasteWarningAtRef.current = now;

    socket.emit(SocketEvents.ANTI_CHEAT_EVENT, {
      roomCode,
      type: AntiCheatEventTypes.LARGE_PASTE,
      metadata: { charCount },
    });
  };

  const submitCode = () => {
    setIsSubmitting(true);
    socket.emit(SocketEvents.SUBMIT_CODE, { roomCode, code, language });
  };

  return (
    <main className="arena-shell app-frame">
      {toast && (
        <div className="toast-stack">
          <div className={`toast toast-${toast.kind}`}>{toast.message}</div>
        </div>
      )}

      <header className="game-header">
        <div className="brand">
          <div className="brand-mark">CG</div>
          <div>
            <div>Code Golf Arena</div>
            <div className="muted" style={{ fontSize: 13 }}>
              Room <span className="room-code">{roomCode}</span>
            </div>
          </div>
        </div>

        <div className="toolbar">
          <span className="badge">Time {formatElapsed(elapsedSeconds)}</span>
          <span className="badge">
            {isSolo ? "Solo practice" : "Multiplayer"}
          </span>
          <select
            className="select"
            style={{ width: 150 }}
            value={language}
            onChange={(event) => setLanguage(event.target.value as Language)}
          >
            {languageOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <button
            className="button"
            onClick={() => router.push(`/replay/${roomCode}`)}
          >
            Replay
          </button>
        </div>
      </header>

      <section className="problem-strip">
        <div>
          {problem ? (
            <>
              <div className="eyebrow">{problem.difficulty}</div>
              <h1>{problem.title}</h1>
              <p className="muted" style={{ whiteSpace: "pre-line" }}>
                {problem.description}
              </p>
            </>
          ) : (
            <div className="stack">
              <div className="skeleton" style={{ width: "40%" }} />
              <div className="skeleton" style={{ width: "85%" }} />
              <div className="skeleton" style={{ width: "68%" }} />
            </div>
          )}
        </div>

        <aside className="leaderboard">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <strong>{isSolo ? "Your score" : "Leaderboard"}</strong>
            <span className="badge">
              {isSolo ? "Practice" : `${sortedLeaderboard.length} scores`}
            </span>
          </div>

          {isSolo && (
            <div className="leaderboard-row">
              <span>Best passing solution</span>
              <strong>
                {personalBest ? `${personalBest.score} chars` : "No pass yet"}
              </strong>
            </div>
          )}

          {!isSolo && sortedLeaderboard.length === 0 && (
            <div className="muted">No passing submissions yet.</div>
          )}

          {!isSolo && sortedLeaderboard.map(([playerId, entry], index) => (
            <div className="leaderboard-row" key={playerId}>
              <span>
                #{index + 1} {playerId.slice(0, 6)}
              </span>
              <strong>{entry.score} chars</strong>
            </div>
          ))}
        </aside>
      </section>

      <section className={`editor-grid${isSolo ? " editor-grid-solo" : ""}`}>
        <div className="editor-pane">
          <div className="editor-title">
            <strong>Your code</strong>
            <span className="badge">{language}</span>
          </div>
          <Editor
            height="calc(100% - 38px)"
            language={language}
            value={code}
            theme="vs-dark"
            options={{
              minimap: { enabled: false },
              fontSize: 14,
              wordWrap: "on",
            }}
            onMount={(editor: MonacoEditorInstance) => {
              pasteListenerRef.current?.dispose();
              pasteListenerRef.current = editor.onDidChangeModelContent?.(
                (event) => {
                  const insertedChars = event.changes.reduce(
                    (total, change) => total + change.text.length,
                    0
                  );
                  const replacedChars = event.changes.reduce(
                    (total, change) => total + change.rangeLength,
                    0
                  );

                  if (
                    insertedChars - replacedChars >= LARGE_PASTE_THRESHOLD ||
                    event.changes.some(
                      (change) =>
                        change.text.length >= LARGE_PASTE_THRESHOLD ||
                        change.text.includes("\n")
                    )
                  ) {
                    emitLargePaste(insertedChars);
                  }
                }
              ) || null;
            }}
            onChange={(value) => {
              const nextCode = value || "";
              setCode(nextCode);
              emitCodeUpdate(nextCode);
            }}
          />
        </div>

        {isSolo ? (
          <div className="practice-panel">
            <div className="editor-title">
              <strong>Practice Mode</strong>
              <span className="badge">Solo</span>
            </div>
            <div className="practice-content">
              <div>
                <div className="form-label">Goal</div>
                <p className="muted">
                  Find the shortest passing solution. Your best character count
                  is recorded for this room without waiting for an opponent.
                </p>
              </div>

              <div>
                <div className="form-label">Sample tests</div>
                <div className="test-list">
                  {problem?.testCases?.length ? (
                    problem.testCases.map((testCase, index) => (
                      <div className="test-case" key={`${testCase.input}-${index}`}>
                        <span>Input: {testCase.input || "(empty)"}</span>
                        <strong>Output: {testCase.expectedOutput}</strong>
                      </div>
                    ))
                  ) : (
                    <p className="muted">Tests will appear when the problem loads.</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="editor-pane">
            <div className="editor-title">
              <strong>Opponent</strong>
              <span className="badge">{opponentLanguage}</span>
            </div>
            <Editor
              height="calc(100% - 38px)"
              language={opponentLanguage}
              value={opponentCode}
              theme="vs-dark"
              options={{
                readOnly: true,
                minimap: { enabled: false },
                fontSize: 14,
                wordWrap: "on",
              }}
            />
          </div>
        )}
      </section>

      <div className="floating-actions">
        <button
          className="button button-green"
          onClick={submitCode}
          disabled={isSubmitting || !problem}
        >
          {isSubmitting ? "Judging..." : "Submit"}
        </button>
        {result && (
          <span className={`button ${result.success ? "" : "button-danger"}`}>
            {result.success ? "Passed" : "Failed"} | {result.characterCount} chars
          </span>
        )}
      </div>

      {!isSolo && antiCheatEntries.length > 0 && (
        <aside
          className="panel stats-panel"
          style={{ position: "fixed", right: 18, bottom: 18, zIndex: 3 }}
        >
          <strong>Integrity stats</strong>
          {antiCheatEntries.map(([playerId, stats]) => (
            <div key={playerId} className="muted" style={{ marginTop: 8 }}>
              {playerId.slice(0, 6)}: tabs {stats.tabSwitches}, pastes{" "}
              {stats.suspiciousPastes}, spam {stats.submissionSpamAttempts}
            </div>
          ))}
        </aside>
      )}
    </main>
  );
}
