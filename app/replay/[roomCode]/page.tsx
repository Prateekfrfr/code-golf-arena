"use client";

import Editor from "@monaco-editor/react";
import { useRouter } from "next/navigation";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { socket } from "../../../lib/socket";
import { SocketEvents } from "../../../shared/events";
import type { Language, ReplayEntry, ReplayPayload } from "../../../types/domain";
import {
  ConnectionStatus,
  PageState,
  PremiumShell,
  SurfaceCard,
  TopNav,
} from "@/components/ui/PremiumShell";
import { useSocketConnection } from "@/hooks/useSocketConnection";

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
  const { roomCode: rawRoomCode } = React.use(params);
  const roomCode = rawRoomCode.trim().toUpperCase();
  const router = useRouter();
  const { connected, connectionEpoch } = useSocketConnection();

  const [payload, setPayload] = useState<ReplayPayload | null>(null);
  const [replayReady, setReplayReady] = useState(false);
  const [requestError, setRequestError] = useState("");
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [activePlayer, setActivePlayer] = useState<"player1" | "player2">(
    "player1",
  );
  const requestTimeoutRef = useRef<number | null>(null);

  const clearRequestTimeout = () => {
    if (requestTimeoutRef.current !== null) {
      window.clearTimeout(requestTimeoutRef.current);
      requestTimeoutRef.current = null;
    }
  };

  useEffect(() => {
    const handleReplayData = (replayData: ReplayPayload | null) => {
      clearRequestTimeout();
      setPayload(replayData);
      setReplayReady(true);
      setRequestError(
        replayData
          ? ""
          : "This replay is no longer available in the active room store.",
      );
    };
    const handleRoomError = (errorMessage: string) => {
      clearRequestTimeout();
      setPayload(null);
      setReplayReady(true);
      setRequestError(errorMessage);
    };

    socket.on(SocketEvents.REPLAY_DATA, handleReplayData);
    socket.on(SocketEvents.ROOM_ERROR, handleRoomError);

    return () => {
      socket.off(SocketEvents.REPLAY_DATA, handleReplayData);
      socket.off(SocketEvents.ROOM_ERROR, handleRoomError);
      clearRequestTimeout();
    };
  }, []);

  const requestReplay = () => {
    if (!connected) {
      setReplayReady(true);
      setRequestError("The realtime server is still reconnecting.");
      return;
    }

    clearRequestTimeout();
    setRequestError("");
    if (!payload) setReplayReady(false);
    socket.emit(SocketEvents.GET_REPLAY, roomCode);
    requestTimeoutRef.current = window.setTimeout(() => {
      setReplayReady(true);
      setRequestError(
        "The replay request timed out. Check the connection and try again.",
      );
    }, 12000);
  };

  useEffect(() => {
    if (!connected || connectionEpoch === 0) return;

    clearRequestTimeout();
    socket.emit(SocketEvents.GET_REPLAY, roomCode);
    requestTimeoutRef.current = window.setTimeout(() => {
      setReplayReady(true);
      setRequestError(
        "The replay request timed out. Check the connection and try again.",
      );
    }, 12000);
  }, [connected, connectionEpoch, roomCode]);

  const totalDuration = useMemo(() => {
    if (!payload) return 0;

    return Math.max(
      0,
      ...Object.values(payload.replay)
        .flat()
        .map((frame) => frame.timestamp),
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

  return (
    <PremiumShell
      compact
      navItems={[
        { label: "Home", href: "/", marker: "cd" },
        { label: "Problems", href: "/problems", marker: "{}" },
        { label: "Replay", active: true, marker: "rp" },
      ]}
      status={
        <>
          <div className="status-orbit">
            <span className={connected ? "" : "offline"} />
          </div>
          <div>
            <strong>Room {roomCode}</strong>
            <span>{connected ? "replay connected" : "reconnecting"}</span>
          </div>
        </>
      }
      topbar={
        <TopNav
          eyebrow={`replay / ${roomCode}`}
          title={payload?.problem?.title || "Match replay"}
          actions={
            <>
              <ConnectionStatus connected={connected} />
              <button
                className="button"
                type="button"
                onClick={() => router.push(`/game/${roomCode}`)}
              >
                back to game
              </button>
            </>
          }
        />
      }
    >
      {!replayReady ? (
        <PageState
          loading
          eyebrow="Loading replay"
          title="Rebuilding the round."
          description="Fetching the recorded editor frames and integrity summary."
        />
      ) : !payload ? (
        <PageState
          eyebrow="Replay unavailable"
          title="This room has no active replay."
          description={
            requestError ||
            "Replay data is stored with the active room and may have expired."
          }
          action={
            <div className="toolbar">
              <button
                className="button button-primary"
                type="button"
                onClick={requestReplay}
              >
                retry replay
              </button>
              <button className="button" type="button" onClick={() => router.push("/")}>
                back home
              </button>
            </div>
          }
        />
      ) : (
        <section className="replay-console" aria-label="Match replay">
          <SurfaceCard className="replay-controls">
            <button
              className="button button-primary"
              type="button"
              onClick={() => {
                if (currentTime >= totalDuration) setCurrentTime(0);
                setIsPlaying((playing) => !playing);
              }}
              disabled={totalDuration === 0}
            >
              {isPlaying ? "pause replay" : "play replay"}
            </button>

            <label className="timeline-control">
              <span className="sr-only">Replay position</span>
              <input
                className="range"
                type="range"
                min={0}
                max={totalDuration}
                step={100}
                value={currentTime}
                aria-valuetext={`${formatTime(currentTime)} of ${formatTime(totalDuration)}`}
                onChange={(event) => {
                  setIsPlaying(false);
                  setCurrentTime(Number(event.target.value));
                }}
                disabled={totalDuration === 0}
              />
            </label>

            <span className="badge" aria-live="off">
              {formatTime(currentTime)} / {formatTime(totalDuration)}
            </span>
          </SurfaceCard>

          {player2 && (
            <div
              className="editor-tabs replay-tabs"
              role="tablist"
              aria-label="Replay player"
            >
              <button
                className={activePlayer === "player1" ? "editor-tab active" : "editor-tab"}
                type="button"
                role="tab"
                aria-selected={activePlayer === "player1"}
                aria-controls="replay-player-one"
                tabIndex={activePlayer === "player1" ? 0 : -1}
                onClick={() => setActivePlayer("player1")}
              >
                player 1
              </button>
              <button
                className={activePlayer === "player2" ? "editor-tab active" : "editor-tab"}
                type="button"
                role="tab"
                aria-selected={activePlayer === "player2"}
                aria-controls="replay-player-two"
                tabIndex={activePlayer === "player2" ? 0 : -1}
                onClick={() => setActivePlayer("player2")}
              >
                player 2
              </button>
            </div>
          )}

          <div className="replay-main">
            <div className="editor-grid panel replay-editors">
              <div
                className={`editor-pane ${
                  activePlayer === "player1" ? "" : "pane-hidden-narrow"
                }`}
                id="replay-player-one"
                role="tabpanel"
              >
                <div className="editor-title">
                  <strong>Player 1 {player1 ? player1.slice(0, 6) : ""}</strong>
                  <span className="badge">
                    {player1 && scores[player1]?.score !== undefined
                      ? `${Math.round(scores[player1].score).toLocaleString()} pts · ${scores[player1].characterCount} chars`
                      : player1Language}
                  </span>
                </div>
                <Editor
                  height="100%"
                  language={player1Language}
                  theme="vs-dark"
                  value={player1Code}
                  options={{
                    readOnly: true,
                    minimap: { enabled: false },
                    wordWrap: "on",
                    accessibilitySupport: "on",
                  }}
                />
              </div>

              <div
                className={`editor-pane ${
                  activePlayer === "player2" ? "" : "pane-hidden-narrow"
                }`}
                id="replay-player-two"
                role="tabpanel"
              >
                <div className="editor-title">
                  <strong>Player 2 {player2 ? player2.slice(0, 6) : ""}</strong>
                  <span className="badge">
                    {player2 && scores[player2]?.score !== undefined
                      ? `${Math.round(scores[player2].score).toLocaleString()} pts · ${scores[player2].characterCount} chars`
                      : player2Language}
                  </span>
                </div>
                <Editor
                  height="100%"
                  language={player2Language}
                  theme="vs-dark"
                  value={player2Code}
                  options={{
                    readOnly: true,
                    minimap: { enabled: false },
                    wordWrap: "on",
                    accessibilitySupport: "on",
                  }}
                />
              </div>
            </div>

            <SurfaceCard className="stats-panel">
              <div className="section-heading compact-heading">
                <div>
                  <div className="eyebrow">Match statistics</div>
                  <h2>Integrity report</h2>
                </div>
                <span className="section-stamp">{players.length}</span>
              </div>

              {players.map((playerId, index) => {
                const stats = antiCheatStats[playerId] || {
                  tabSwitches: 0,
                  suspiciousPastes: 0,
                  submissionSpamAttempts: 0,
                };

                return (
                  <div className="metric replay-metric" key={playerId}>
                    <strong>Player {index + 1}</strong>
                    <span>{playerId.slice(0, 8)}</span>
                    <dl className="integrity-list">
                      <div>
                        <dt>Focus events</dt>
                        <dd>{stats.tabSwitches}</dd>
                      </div>
                      <div>
                        <dt>Blocked pastes</dt>
                        <dd>{stats.suspiciousPastes}</dd>
                      </div>
                      <div>
                        <dt>Cooldown hits</dt>
                        <dd>{stats.submissionSpamAttempts}</dd>
                      </div>
                    </dl>
                  </div>
                );
              })}

              {players.length === 0 && (
                <div className="inline-state" role="status">
                  No replay frames were recorded for this match.
                </div>
              )}
            </SurfaceCard>
          </div>
        </section>
      )}
    </PremiumShell>
  );
}
