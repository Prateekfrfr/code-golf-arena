"use client";

import Editor from "@monaco-editor/react";
import { useRouter } from "next/navigation";
import React, { useEffect, useMemo, useState } from "react";
import { socket } from "../../../lib/socket";
import { SocketEvents } from "../../../shared/events";
import type { Language, ReplayEntry, ReplayPayload } from "../../../types/domain";

const codeAtTime = (tape: ReplayEntry[], time: number) => {
  let currentCode = "";

  for (const frame of tape) {
    if (frame.timestamp > time) break;
    currentCode = frame.code;
  }

  return currentCode;
};

const languageAtTime = (tape: ReplayEntry[], time: number): Language => {
  let currentLanguage: Language = "python";

  for (const frame of tape) {
    if (frame.timestamp > time) break;
    currentLanguage = frame.language || currentLanguage;
  }

  return currentLanguage;
};

const formatTime = (milliseconds: number) => {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
};

export default function Replay({
  params,
}: {
  params: Promise<{ roomCode: string }>;
}) {
  const { roomCode } = React.use(params);
  const router = useRouter();

  const [payload, setPayload] = useState<ReplayPayload | null>(null);
  const [replayReady, setReplayReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    const handleReplayData = (replayData: ReplayPayload | null) => {
      setPayload(replayData);
      setReplayReady(true);
    };

    socket.on(SocketEvents.REPLAY_DATA, handleReplayData);
    socket.emit(SocketEvents.GET_REPLAY, roomCode);

    return () => {
      socket.off(SocketEvents.REPLAY_DATA, handleReplayData);
    };
  }, [roomCode]);

  const totalDuration = useMemo(() => {
    if (!payload) return 0;

    return Math.max(
      0,
      ...Object.values(payload.replay)
        .flat()
        .map((frame) => frame.timestamp)
    );
  }, [payload]);

  useEffect(() => {
    if (!isPlaying) return;

    const interval = window.setInterval(() => {
      setCurrentTime((previousTime) => {
        const nextTime = previousTime + 250;

        if (nextTime >= totalDuration) {
          setIsPlaying(false);
          return totalDuration;
        }

        return nextTime;
      });
    }, 250);

    return () => window.clearInterval(interval);
  }, [isPlaying, totalDuration]);

  const players = payload?.players || [];
  const player1 = players[0];
  const player2 = players[1];
  const player1Tape = player1 ? payload?.replay[player1] || [] : [];
  const player2Tape = player2 ? payload?.replay[player2] || [] : [];
  const player1Code = codeAtTime(player1Tape, currentTime);
  const player2Code = codeAtTime(player2Tape, currentTime);
  const player1Language = languageAtTime(player1Tape, currentTime);
  const player2Language = languageAtTime(player2Tape, currentTime);
  const scores = payload?.scores || {};
  const antiCheatStats = payload?.antiCheatStats || {};

  if (!replayReady) {
    return (
      <main className="arena-shell lobby-layout">
        <section className="panel lobby-card stack">
          <div className="skeleton" style={{ width: "45%" }} />
          <div className="skeleton" style={{ width: "85%" }} />
          <div className="skeleton" style={{ width: "72%" }} />
        </section>
      </main>
    );
  }

  if (!payload) {
    return (
      <main className="arena-shell lobby-layout">
        <section className="panel lobby-card">
          <div className="eyebrow">Replay unavailable</div>
          <h1 style={{ margin: "8px 0" }}>Room expired</h1>
          <p className="muted">
            This replay is stored in memory and disappears after room cleanup.
          </p>
          <button className="button button-primary" onClick={() => router.push("/")}>
            Back home
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="arena-shell replay-layout">
      <header className="replay-header">
        <div className="brand">
          <div className="brand-mark">CG</div>
          <div>
            <div>Replay room <span className="room-code">{roomCode}</span></div>
            <div className="muted" style={{ fontSize: 13 }}>
              {payload.problem?.title || "Match replay"}
            </div>
          </div>
        </div>

        <div className="timeline">
          <button
            className="button button-primary"
            onClick={() => {
              if (currentTime >= totalDuration) setCurrentTime(0);
              setIsPlaying((playing) => !playing);
            }}
            disabled={totalDuration === 0}
          >
            {isPlaying ? "Pause" : "Play"}
          </button>

          <input
            className="range"
            type="range"
            min={0}
            max={totalDuration}
            step={100}
            value={currentTime}
            onChange={(event) => {
              setIsPlaying(false);
              setCurrentTime(Number(event.target.value));
            }}
            disabled={totalDuration === 0}
          />

          <span className="badge">
            {formatTime(currentTime)} / {formatTime(totalDuration)}
          </span>
        </div>

        <button className="button" onClick={() => router.push(`/game/${roomCode}`)}>
          Back to game
        </button>
      </header>

      <section className="replay-main">
        <div className="editor-grid panel" style={{ minHeight: "calc(100vh - 112px)" }}>
          <div className="editor-pane">
            <div className="editor-title">
              <strong>Player 1 {player1 ? player1.slice(0, 6) : ""}</strong>
              <span className="badge">
                {scores[player1]?.score ? `${scores[player1].score} chars` : player1Language}
              </span>
            </div>
            <Editor
              height="calc(100% - 38px)"
              language={player1Language}
              theme="vs-dark"
              value={player1Code}
              options={{ readOnly: true, minimap: { enabled: false }, wordWrap: "on" }}
            />
          </div>

          <div className="editor-pane">
            <div className="editor-title">
              <strong>Player 2 {player2 ? player2.slice(0, 6) : ""}</strong>
              <span className="badge">
                {scores[player2]?.score ? `${scores[player2].score} chars` : player2Language}
              </span>
            </div>
            <Editor
              height="calc(100% - 38px)"
              language={player2Language}
              theme="vs-dark"
              value={player2Code}
              options={{ readOnly: true, minimap: { enabled: false }, wordWrap: "on" }}
            />
          </div>
        </div>

        <aside className="panel stats-panel">
          <div className="eyebrow">Match statistics</div>
          <h2 style={{ margin: "8px 0 14px" }}>Integrity report</h2>

          {players.map((playerId, index) => {
            const stats = antiCheatStats[playerId] || {
              tabSwitches: 0,
              suspiciousPastes: 0,
              submissionSpamAttempts: 0,
            };

            return (
              <div className="metric" key={playerId} style={{ marginBottom: 10 }}>
                <strong>Player {index + 1}</strong>
                <span>{playerId.slice(0, 8)}</span>
                <div className="muted" style={{ marginTop: 10 }}>
                  Tabs: {stats.tabSwitches}
                  <br />
                  Large pastes: {stats.suspiciousPastes}
                  <br />
                  Cooldown hits: {stats.submissionSpamAttempts}
                </div>
              </div>
            );
          })}

          {players.length === 0 && (
            <p className="muted">No replay frames were recorded for this match.</p>
          )}
        </aside>
      </section>
    </main>
  );
}
