"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { socket } from "@/lib/socket";
import { SocketEvents } from "@/shared/events";
import type { ProblemTopic } from "@/types/domain";
import {
  ConnectionStatus,
  PremiumShell,
  ToastRegion,
  TopNav,
} from "@/components/ui/PremiumShell";
import { useSocketConnection } from "@/hooks/useSocketConnection";
import { useTransientMessage } from "@/hooks/useTransientMessage";

// Three.js golf ball scene, client-only
const GolfBallScene = dynamic(
  () =>
    import("@/components/landing/GolfBallScene").then(
      (mod) => mod.GolfBallScene,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="gold-scene-fallback" aria-label="Loading 3D golf ball…">
        <div className="golf-ball-flat" />
      </div>
    ),
  },
);

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
  const [joinError, setJoinError] = useState("");
  const [pendingAction, setPendingAction] = useState<
    "create" | "join" | "solo" | null
  >(null);
  const [selectedTopic, setSelectedTopic] = useState<TopicChoice>("random");
  const { connected } = useSocketConnection();
  const { message, setMessage } = useTransientMessage();

  const normalizedJoinCode = useMemo(
    () => joinCode.trim().toUpperCase(),
    [joinCode],
  );

  useEffect(() => {
    const handleRoomCreated = (roomCode: string) => {
      setPendingAction(null);
      router.push(`/lobby/${roomCode}`);
    };

    const handleRoomReady = ({ roomCode }: { roomCode: string }) => {
      setPendingAction(null);
      router.push(`/game/${roomCode}`);
    };

    const handleError = (message: string) => {
      setPendingAction(null);
      setMessage(message);
    };

    socket.on(SocketEvents.ROOM_CREATED, handleRoomCreated);
    socket.on(SocketEvents.ROOM_READY, handleRoomReady);
    socket.on(SocketEvents.ROOM_ERROR, handleError);

    return () => {
      socket.off(SocketEvents.ROOM_CREATED, handleRoomCreated);
      socket.off(SocketEvents.ROOM_READY, handleRoomReady);
      socket.off(SocketEvents.ROOM_ERROR, handleError);
    };
  }, [router, setMessage]);

  useEffect(() => {
    if (!pendingAction) return;

    const timeout = window.setTimeout(() => {
      setPendingAction(null);
      setMessage(
        "The realtime server did not respond. Check the connection and try again.",
      );
    }, 12000);
    return () => window.clearTimeout(timeout);
  }, [pendingAction, setMessage]);

  const createRoom = () => {
    if (!connected || pendingAction) return;
    setPendingAction("create");
    socket.emit(SocketEvents.CREATE_ROOM, { topic: selectedTopic });
  };

  const startSolo = () => {
    if (!connected || pendingAction) return;
    setPendingAction("solo");
    socket.emit(SocketEvents.START_SOLO, { topic: selectedTopic });
  };

  const joinRoom = () => {
    if (!/^[A-Z0-9]{8}$/.test(normalizedJoinCode)) {
      setJoinError("Enter the eight-letter or number room code.");
      return;
    }

    if (!connected || pendingAction) return;
    setJoinError("");
    setPendingAction("join");
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
            <strong>Realtime Engine</strong>
            <span>{connected ? "connected" : "reconnecting"}</span>
          </div>
        </>
      }
      topbar={
        <TopNav
          eyebrow="Multiplayer Competitive Golf"
          title="Matchmaking Arena"
          actions={<ConnectionStatus connected={connected} />}
        />
      }
    >
      <ToastRegion message={message} />
      <span className="sr-only" role="status" aria-live="polite">
        {pendingAction === "create"
          ? "Creating a room."
          : pendingAction === "join"
            ? "Joining the room."
            : pendingAction === "solo"
              ? "Starting solo practice."
              : ""}
      </span>

      <section className="unslop-landing">
        {/* Left: 3D golf ball and headline */}
        <section className="unslop-stage" aria-label="Interactive Arena Display">
          <GolfBallScene />

          <div className="unslop-copy-block">
            <h1 className="unslop-heading">
              Write it <span className="hl">shorter.</span>
            </h1>
            <p className="unslop-tagline">
              Head-to-head code golf. Same problem, same judge,{" "}
              <span className="hl-soft">fewest characters wins.</span>
            </p>
          </div>
        </section>

        {/* Right: round controls */}
        <aside className="unslop-rail" aria-label="Round Controls">
          <section className="unslop-console">
            <header className="unslop-console-header">
              <h2 className="unslop-console-title">Start a round</h2>
              <span
                className={`unslop-console-status ${connected ? "online" : ""}`}
              >
                {connected ? "Online" : "Reconnecting"}
              </span>
            </header>

            {/* Topic selection chips */}
            <div className="unslop-field-group">
              <span className="unslop-label">Topic</span>
              <div className="unslop-topic-chips" role="radiogroup" aria-label="Problem topic">
                {topicOptions.map((option) => {
                  const isSelected = selectedTopic === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      className="unslop-topic-chip"
                      onClick={() => setSelectedTopic(option.value)}
                      disabled={Boolean(pendingAction)}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <button
              type="button"
              className="unslop-btn-gold"
              onClick={createRoom}
              disabled={Boolean(pendingAction) || !connected}
            >
              {pendingAction === "create" ? "Creating room…" : "Create room"}
            </button>

            <form
              className="unslop-join-section"
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                joinRoom();
              }}
            >
              <label className="unslop-label" htmlFor="room-code">
                Or join a friend
              </label>
              <div className="unslop-join-row">
                <input
                  id="room-code"
                  className="unslop-input-code"
                  value={joinCode}
                  onChange={(event) => {
                    setJoinCode(
                      event.target.value
                        .replace(/[^a-z0-9]/gi, "")
                        .toUpperCase()
                        .slice(0, 8),
                    );
                    setJoinError("");
                  }}
                  placeholder="ABCD2345"
                  maxLength={8}
                  minLength={8}
                  pattern="[A-Za-z0-9]{8}"
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  aria-invalid={Boolean(joinError)}
                  aria-describedby={joinError ? "room-code-error" : undefined}
                />
                <button
                  type="submit"
                  className="unslop-btn-outline"
                  disabled={Boolean(pendingAction) || !connected}
                >
                  {pendingAction === "join" ? "Joining…" : "Join"}
                </button>
              </div>
              {joinError && (
                <span className="field-error" id="room-code-error" role="alert">
                  {joinError}
                </span>
              )}
            </form>

            <button
              type="button"
              className="unslop-link-btn"
              onClick={startSolo}
              disabled={Boolean(pendingAction) || !connected}
            >
              {pendingAction === "solo" ? "Starting practice…" : "Practice alone"}
            </button>
          </section>
        </aside>
      </section>
    </PremiumShell>
  );
}
