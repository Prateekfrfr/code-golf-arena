"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { socket } from "@/lib/socket";
import { SocketEvents } from "@/shared/events";
import type { ProblemTopic } from "@/types/domain";
import {
  EmptyState,
  PremiumShell,
  StatCard,
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

  const recentProblems = [
    { title: "Run-length squeeze", topic: "strings", difficulty: "medium", chars: 84, par: 120 },
    { title: "Pair sum in one breath", topic: "arrays", difficulty: "easy", chars: 52, par: 72 },
    { title: "Modulo staircase", topic: "math", difficulty: "hard", chars: 119, par: 150 },
  ];

  const topPlayers = [
    { name: "bytefold", rating: "1842", delta: "-18b" },
    { name: "lambda_zero", rating: "1790", delta: "-11b" },
    { name: "tinyfn", rating: "1714", delta: "-9b" },
  ];

  const recentActivity = [
    "bytefold cut 18b from python",
    "tinyfn went 9 under par on arrays",
    "strings / run-length squeeze opened for rooms",
  ];

  return (
    <PremiumShell
      topbar={
        <TopNav
          eyebrow="Developer arena / Dashboard"
          title="Scorecard"
          actions={
            <span className={connected ? "status-pill live" : "status-pill"}>
              <span className="status-dot" />
              {connected ? "socket: live" : "socket: retry"}
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
        <div className="home-main">
          <section className="hero premium-hero">
            <div>
              <div className="eyebrow">PAR 120 BYTES</div>
              <h1>Write less. Pass anyway.</h1>
              <p className="hero-copy">
                Race the byte count, not the clock. Shortest accepted program
                wins the room.
              </p>
              <div className="hero-actions">
                <button
                  className="button button-primary"
                  onClick={startSolo}
                  disabled={isStartingSolo || !connected}
                >
                  {isStartingSolo ? "starting..." : "solo round"}
                </button>
                <button
                  className="button"
                  onClick={createRoom}
                  disabled={isCreating || !connected}
                >
                  {isCreating ? "creating..." : "new room"}
                </button>
              </div>
            </div>

            <SurfaceCard className="byte-cut-card">
              <div className="byte-cut-top">
                <span>score strip</span>
                <strong>-33b</strong>
              </div>
              <div
                className="byte-cut-line"
                aria-label="Code shortened from 120 bytes to 87 bytes"
              >
                <span className="kept">return sum(map(int,</span>
                <span className="cut">input().</span>
                <span className="kept">split()))</span>
              </div>
              <div className="byte-cut-after">
                <span>120b</span>
                <i />
                <strong>87b</strong>
              </div>
            </SurfaceCard>
          </section>

          <section className="scorecard-grid">
            <StatCard label="rooms in play" value="24" detail="live rounds" />
            <StatCard label="avg under par" value="-31%" detail="last 100 accepts" tone="green" />
            <StatCard label="languages on card" value="4" detail="py / js / cpp / java" tone="amber" />
            <StatCard label="replay saved" value="live" detail="frame tape" tone="purple" />
          </section>

          <section className="dashboard-section">
            <div className="section-heading">
              <div>
                <div className="eyebrow">Featured problems</div>
                <h2>Open scorecards</h2>
              </div>
              <span className="badge">par listed</span>
            </div>
            <div className="problem-card-grid">
              {recentProblems.map((item) => (
                <SurfaceCard className="problem-card" key={item.title}>
                  <div className="problem-card-top">
                    <span className="ledger-marker">::{item.topic}</span>
                  </div>
                  <h3>{item.title}</h3>
                  <div className="problem-card-meta">
                    <span>{item.difficulty}</span>
                    <strong>
                      {item.chars}b / par {item.par}
                    </strong>
                  </div>
                </SurfaceCard>
              ))}
            </div>
          </section>

          <section className="dashboard-section">
            <div className="section-heading">
              <div>
                <div className="eyebrow">Recent activity</div>
                <h2>Golf log</h2>
              </div>
            </div>
            <div className="activity-list">
              {recentActivity.map((activity) => (
                <div className="activity-item" key={activity}>
                  <span className="log-prefix">+</span>
                  <span>{activity}</span>
                </div>
              ))}
            </div>
          </section>
        </div>

        <aside className="home-rail">
          <SurfaceCard className="room-panel">
            <div className="stack">
              <div>
                <div className="eyebrow">Start card</div>
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
                  {isJoining ? "joining..." : "join match"}
                </button>
                <button
                  className="button button-green"
                  onClick={startSolo}
                  disabled={isStartingSolo || !connected}
                >
                  {isStartingSolo ? "starting..." : "practice solo"}
                </button>
              </div>
            </div>
          </SurfaceCard>

          <SurfaceCard className="leader-card">
            <div className="section-heading compact-heading">
              <div>
                <div className="eyebrow">Top players</div>
                <h2>Current form</h2>
              </div>
              <span className="section-stamp">rank</span>
            </div>
            <div className="leaderboard">
              {topPlayers.length > 0 ? (
                topPlayers.map((player, index) => (
                  <div className="leaderboard-row premium-row" key={player.name}>
                    <span>#{index + 1}</span>
                    <strong>{player.name}</strong>
                    <small>{player.rating}</small>
                    <em>{player.delta}</em>
                  </div>
                ))
              ) : (
                <EmptyState
                  title="No players yet"
                  description="Accepted scores will write the board."
                />
              )}
            </div>
          </SurfaceCard>
        </aside>
      </section>
    </PremiumShell>
  );
}
