"use client";

import Editor from "@monaco-editor/react";
import { useRouter } from "next/navigation";
import React, { useEffect, useRef, useState } from "react";
import { socket } from "../../../lib/socket";
import {
  EmptyState,
  PremiumShell,
  SurfaceCard,
  TopNav,
} from "@/components/ui/PremiumShell";
import { SocketEvents } from "../../../shared/events";
import type {
  AntiCheatStats,
  AntiCheatSummary,
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

export default function GameRoom({
  params,
}: {
  params: Promise<{ roomCode: string }>;
}) {
  const { roomCode } = React.use(params);
  const router = useRouter();

  const [code, setCode] = useState("");
  const [opponentCode, setOpponentCode] = useState("");
  const [problem, setProblem] = useState<Problem | null>(null);
  const [result, setResult] = useState<SubmissionResult | null>(null);
  const [language, setLanguage] = useState<Language>("python");
  const [connected, setConnected] = useState(false);
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

  const monacoRef = useRef<MonacoApi | null>(null);
  const monacoTheme = "vs-dark";
  const par =
    problem?.difficulty === "hard"
      ? 150
      : problem?.difficulty === "easy"
        ? 72
        : 120;

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        socket.emit(SocketEvents.ANTI_CHEAT_EVENT, {
          roomCode,
          type: "tab_switch",
        });
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
    socket.emit(SocketEvents.REJOIN_ROOM, roomCode);
    socket.emit(SocketEvents.GET_PROBLEM, roomCode);
    socket.emit(SocketEvents.GET_ANTI_CHEAT_SUMMARY, roomCode);
  }, [roomCode]);

  useEffect(() => {
    const handleProblem = (problemData: Problem) => {
      setProblem(problemData);
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

    const handleConnect = () => setConnected(true);
    const handleDisconnect = () => setConnected(false);

    queueMicrotask(() => {
      setConnected(socket.connected);
    });

    socket.on(SocketEvents.PROBLEM, handleProblem);
    socket.on(SocketEvents.ROOM_READY, handleRoomReady);
    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    return () => {
      socket.off(SocketEvents.PROBLEM, handleProblem);
      socket.off(SocketEvents.ROOM_READY, handleRoomReady);
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
    };
  }, []);

  useEffect(() => {
    const handleCheatWarning = (event: AntiCheatWarning) => {
      const stats = normalizeAntiCheatStats(event.stats);
      const totalWarnings =
        stats.tabSwitches +
        stats.suspiciousPastes +
        stats.submissionSpamAttempts;

      setWarning(totalWarnings);
      setAntiCheatStats((currentStats) => ({
        ...currentStats,
        [event.playerId]: stats,
      }));
    };

    const handleAntiCheatSummary = (
      summary: AntiCheatSummary | Record<string, AntiCheatStats>,
    ) => {
      setAntiCheatStats(normalizeAntiCheatSummary(summary));
    };

    socket.on(SocketEvents.ANTI_CHEAT_WARNING, handleCheatWarning);
    socket.on(SocketEvents.ANTI_CHEAT_SUMMARY, handleAntiCheatSummary);
    return () => {
      socket.off(SocketEvents.ANTI_CHEAT_WARNING, handleCheatWarning);
      socket.off(SocketEvents.ANTI_CHEAT_SUMMARY, handleAntiCheatSummary);
    };
  }, []);

  useEffect(() => {
    const handleCodeUpdate = (
      payload: string | { code?: string; language?: Language },
    ) => {
      setOpponentCode(
        typeof payload === "string" ? payload : payload.code || "",
      );
    };

    socket.on(SocketEvents.CODE_UPDATE, handleCodeUpdate);
    return () => {
      socket.off(SocketEvents.CODE_UPDATE, handleCodeUpdate);
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

    socket.on(SocketEvents.SUBMISSION_RESULT, handleSubmissionResult);
    return () => {
      socket.off(SocketEvents.SUBMISSION_RESULT, handleSubmissionResult);
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
      return a[1].score - b[1].score;
    }
    return a[1].submittedAt - b[1].submittedAt;
  });

  const characterCount = result?.characterCount ?? code.length;
  const scoreVsPar = par - characterCount;
  const warningTotals = Object.values(antiCheatStats).reduce(
    (total, stats) =>
      total +
      stats.tabSwitches +
      stats.suspiciousPastes +
      stats.submissionSpamAttempts,
    0,
  );

  return (
    <PremiumShell
      compact
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
          eyebrow={`room ${roomCode} / par ${par}b`}
          title={problem?.title || "Problem card"}
          actions={
            <>
              <span className={connected ? "status-pill live" : "status-pill"}>
                <span className="status-dot" />
                {connected ? "socket connected" : "socket reconnecting"}
              </span>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value as Language)}
                className="select compact-select"
                aria-label="Language"
              >
                <option value="python">Python</option>
                <option value="javascript">JavaScript</option>
                <option value="cpp">C++</option>
                <option value="java">Java</option>
              </select>
            </>
          }
        />
      }
    >
      {warning > 0 && (
        <div className="warning-banner">
              <span className="log-prefix">!</span>
          integrity event recorded ({warning})
        </div>
      )}

      <section
        className={
          roomMode === "solo" ? "problem-workspace solo-workspace" : "problem-workspace"
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
                <div className="eyebrow">judge result</div>
                <h2>Last submit</h2>
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
              <span className="badge">{characterCount}b</span>
              <button
                className="button button-primary"
                onClick={() =>
                  socket.emit(SocketEvents.SUBMIT_CODE, { roomCode, code, language })
                }
              >
                submit
              </button>
              <button
                className="button"
                onClick={() => router.push(`/replay/${roomCode}`)}
              >
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

                  socket.emit(SocketEvents.CODE_UPDATE, {
                    roomCode,
                    code: newCode,
                    language,
                  });
                }}
              />
            </div>

            {roomMode === "multiplayer" && (
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
            )}
          </div>
        </section>

        <aside className="room-panel-stack">
          <SurfaceCard className="round-card">
            <div className="section-heading compact-heading">
              <div>
                <div className="eyebrow">current attempt</div>
                <h2>Score</h2>
              </div>
              <span className="section-stamp">{roomMode}</span>
            </div>

            <div className="score-lines">
              <div>
                <span>bytes</span>
                <strong>{characterCount}b</strong>
              </div>
              <div>
                <span>par</span>
                <strong>{par}b</strong>
              </div>
              <div>
                <span>delta</span>
                <strong
                  className={scoreVsPar >= 0 ? "score-good" : "score-over"}
                >
                  {scoreVsPar >= 0 ? `-${scoreVsPar}b` : `+${Math.abs(scoreVsPar)}b`}
                </strong>
              </div>
            </div>

            <div className="submission-list">
              {submissionHistory.length ? (
                submissionHistory.map((entry) => (
                  <div className="submission-row" key={entry.at}>
                    <span>{new Date(entry.at).toLocaleTimeString()}</span>
                    <strong>{entry.characterCount}b</strong>
                    <em className={entry.success ? "score-good" : "score-over"}>
                      {entry.success ? "accepted" : "rejected"}
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
    </PremiumShell>
  );
}
