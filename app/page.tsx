"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { socket } from "@/lib/socket";
import { SocketEvents } from "@/shared/events";
import type { ProblemTopic } from "@/types/domain";
import {
  PremiumShell,
  SurfaceCard,
  TopNav,
} from "@/components/ui/PremiumShell";

type TopicChoice = ProblemTopic | "random";

const topicOptions: Array<{ value: TopicChoice; label: string }> = [
  { value: "random", label: "Random" },
  { value: "arrays", label: "Arrays" },
  { value: "strings", label: "Strings" },
  { value: "math", label: "Math" },
  { value: "dp", label: "DP" },
  { value: "stacks", label: "Stacks" },
  { value: "graphs", label: "Graphs" },
  { value: "hashing", label: "Hashing" },
];

export default function HomePage() {
  const router = useRouter();
  const [joinCode, setJoinCode] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [isStartingSolo, setIsStartingSolo] = useState(false);
  const [toast, setToast] = useState("");
  const [connected, setConnected] = useState(false);
  const [selectedTopic, setSelectedTopic] = useState<TopicChoice>("random");

  const normalizedJoinCode = useMemo(
    () => joinCode.trim().toUpperCase(),
    [joinCode],
  );

  useEffect(() => {
    const handleRoomCreated = (roomCode: string) => {
      setIsCreating(false);
      router.push(`/lobby/${roomCode}`);
    };

    const handleRoomReady = ({ roomCode }: { roomCode: string }) => {
      setIsJoining(false);
      setIsStartingSolo(false);
      router.push(`/game/${roomCode}`);
    };

    const handleError = (message: string) => {
      setIsCreating(false);
      setIsJoining(false);
      setIsStartingSolo(false);
      setToast(message);
    };

    const handleConnect = () => setConnected(true);
    const handleDisconnect = () => setConnected(false);

    queueMicrotask(() => {
      setConnected(socket.connected);
    });

    socket.on(SocketEvents.ROOM_CREATED, handleRoomCreated);
    socket.on("roomCreated", handleRoomCreated);
    socket.on(SocketEvents.ROOM_READY, handleRoomReady);
    socket.on(SocketEvents.ROOM_ERROR, handleError);
    socket.on("error", handleError);
    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);

    return () => {
      socket.off(SocketEvents.ROOM_CREATED, handleRoomCreated);
      socket.off("roomCreated", handleRoomCreated);
      socket.off(SocketEvents.ROOM_READY, handleRoomReady);
      socket.off(SocketEvents.ROOM_ERROR, handleError);
      socket.off("error", handleError);
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
    };
  }, [router]);

  useEffect(() => {
    if (!toast) return;

    const timeout = window.setTimeout(() => setToast(""), 3600);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const createRoom = () => {
    setIsCreating(true);
    socket.emit(SocketEvents.CREATE_ROOM, { topic: selectedTopic });
  };

  const startSolo = () => {
    setIsStartingSolo(true);
    socket.emit(SocketEvents.START_SOLO, { topic: selectedTopic });
  };

  const joinRoom = () => {
    if (normalizedJoinCode.length !== 6) {
      setToast("Room code must be 6 chars.");
      return;
    }

    setIsJoining(true);
    socket.emit(SocketEvents.JOIN_ROOM, normalizedJoinCode);
  };

  return (
    <PremiumShell
      status={
        <>
          <div className="status-orbit">
            <span className={connected ? "" : "offline"} />
          </div>
          <div>
            <strong>Realtime server</strong>
            <span>{connected ? "connected" : "reconnecting"}</span>
          </div>
        </>
      }
      topbar={
        <TopNav
          eyebrow="Code Golf Arena"
          title="Start a round"
          actions={
            <span className={connected ? "status-pill live" : "status-pill"}>
              <span className="status-dot" />
              {connected ? "socket connected" : "socket reconnecting"}
            </span>
          }
        />
      }
    >
      {toast && (
        <div className="toast-stack">
          <div className="toast toast-error">{toast}</div>
        </div>
      )}

      <section className="home-grid">
        <section className="home-main">
          <div className="home-intro">
            <div className="eyebrow">Shortest accepted code wins</div>
            <h1>Compete on bytes, not dashboards.</h1>
            <p>
              Create a head-to-head room, join with a six-character code, or
              start a solo practice session against the same judge.
            </p>
          </div>
        </section>

        <aside className="home-rail" aria-label="Round controls">
          <SurfaceCard className="room-panel command-panel">
            <div className="stack">
              <div>
                <div className="eyebrow">new session</div>
                <h2>New round</h2>
                <p className="muted">
                  Pick a topic. Create a room, join by code, or play alone.
                </p>
              </div>

              <div className="stack">
                <label className="form-label" htmlFor="topic-select">
                  Problem topic
                </label>
                <select
                  id="topic-select"
                  className="select"
                  value={selectedTopic}
                  onChange={(event) =>
                    setSelectedTopic(event.target.value as TopicChoice)
                  }
                >
                  {topicOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <button
                className="button button-primary"
                onClick={createRoom}
                disabled={isCreating || !connected}
              >
                {isCreating ? "creating..." : "create room"}
              </button>

              <div className="stack">
                <label className="form-label" htmlFor="room-code">
                  Room code
                </label>
                <input
                  id="room-code"
                  className="input"
                  value={joinCode}
                  onChange={(event) =>
                    setJoinCode(event.target.value.toUpperCase().slice(0, 6))
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Enter") joinRoom();
                  }}
                  placeholder="ABC123"
                  maxLength={6}
                />
                <button
                  className="button button-green"
                  onClick={joinRoom}
                  disabled={isJoining || !connected}
                >
                  {isJoining ? "joining..." : "join room"}
                </button>
                <button
                  className="button"
                  onClick={startSolo}
                  disabled={isStartingSolo || !connected}
                >
                  {isStartingSolo ? "starting..." : "solo practice"}
                </button>
              </div>
            </div>
          </SurfaceCard>
        </aside>
      </section>
    </PremiumShell>
  );
}
