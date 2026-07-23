"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { socket } from "@/lib/socket";
import { SocketEvents } from "@/shared/events";
import type { ProblemTopic } from "@/types/domain";
import {
  ConnectionStatus,
  PremiumShell,
  SurfaceCard,
  ToastRegion,
  TopNav,
} from "@/components/ui/PremiumShell";
import { useSocketConnection } from "@/hooks/useSocketConnection";
import { useTransientMessage } from "@/hooks/useTransientMessage";

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
            <strong>Realtime server</strong>
            <span>{connected ? "connected" : "reconnecting"}</span>
          </div>
        </>
      }
      topbar={
        <TopNav
          eyebrow="Code Golf Arena"
          title="Start a round"
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

      <section className="home-grid">
        <section className="home-main">
          <div className="home-intro">
            <div className="eyebrow">Shortest accepted code wins</div>
            <h1>Compete on characters, not dashboards.</h1>
            <p>
              Create a head-to-head room, join with an eight-character code, or
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
                  disabled={Boolean(pendingAction)}
                >
                  {topicOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                className="button button-primary"
                onClick={createRoom}
                disabled={Boolean(pendingAction) || !connected}
              >
                {pendingAction === "create" ? "creating room…" : "create room"}
              </button>

              <form
                className="stack"
                noValidate
                onSubmit={(event) => {
                  event.preventDefault();
                  joinRoom();
                }}
              >
                <label className="form-label" htmlFor="room-code">
                  Room code
                </label>
                <input
                  id="room-code"
                  className="input"
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
                  aria-describedby={joinError ? "room-code-error" : "room-code-help"}
                />
                <span className="field-help" id="room-code-help">
                  Codes use eight letters or numbers.
                </span>
                {joinError && (
                  <span className="field-error" id="room-code-error" role="alert">
                    {joinError}
                  </span>
                )}
                <button
                  type="submit"
                  className="button button-green"
                  disabled={Boolean(pendingAction) || !connected}
                >
                  {pendingAction === "join" ? "joining room…" : "join room"}
                </button>
                <button
                  type="button"
                  className="button"
                  onClick={startSolo}
                  disabled={Boolean(pendingAction) || !connected}
                >
                  {pendingAction === "solo" ? "starting practice…" : "solo practice"}
                </button>
              </form>
            </div>
          </SurfaceCard>
        </aside>
      </section>
    </PremiumShell>
  );
}
