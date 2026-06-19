"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { socket } from "@/lib/socket";
import { SocketEvents } from "@/shared/events";

export default function HomePage() {
  const router = useRouter();
  const [joinCode, setJoinCode] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [toast, setToast] = useState("");
  const [connected, setConnected] = useState(false);

  const normalizedJoinCode = useMemo(
    () => joinCode.trim().toUpperCase(),
    [joinCode]
  );

  useEffect(() => {
    const handleRoomCreated = (roomCode: string) => {
      setIsCreating(false);
      router.push(`/lobby/${roomCode}`);
    };

    const handleRoomReady = ({ roomCode }: { roomCode: string }) => {
      setIsJoining(false);
      router.push(`/game/${roomCode}`);
    };

    const handleError = (message: string) => {
      setIsCreating(false);
      setIsJoining(false);
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
    socket.emit(SocketEvents.CREATE_ROOM);
  };

  const joinRoom = () => {
    if (normalizedJoinCode.length !== 6) {
      setToast("Enter a valid 6-character room code.");
      return;
    }

    setIsJoining(true);
    socket.emit(SocketEvents.JOIN_ROOM, normalizedJoinCode);
  };

  return (
    <main className="arena-shell">
      {toast && (
        <div className="toast-stack">
          <div className="toast toast-error">{toast}</div>
        </div>
      )}

      <div className="page-wrap">
        <nav className="topbar">
          <div className="brand">
            <div className="brand-mark">CG</div>
            <span>Code Golf Arena</span>
          </div>
          <span className="badge">
            {connected ? "Socket connected" : "Socket reconnecting"}
          </span>
        </nav>

        <section className="hero">
          <div>
            <div className="eyebrow">Real-time multiplayer code golf</div>
            <h1>Win by writing less.</h1>
            <p className="hero-copy">
              Race another developer on the same challenge, watch code evolve
              live, submit the shortest passing solution, then replay the match
              like a competitive programming broadcast.
            </p>

            <div className="metric-grid">
              <div className="metric">
                <strong>2P</strong>
                <span>Head-to-head rooms</span>
              </div>
              <div className="metric">
                <strong>4</strong>
                <span>Language targets</span>
              </div>
              <div className="metric">
                <strong>Live</strong>
                <span>Replay and leaderboard</span>
              </div>
            </div>
          </div>

          <div className="panel room-panel">
            <div className="stack">
              <div>
                <div className="eyebrow">Start a match</div>
                <h2 style={{ margin: "8px 0 6px" }}>Arena room</h2>
                <p className="muted" style={{ margin: 0 }}>
                  Create a private room or join with a six-character code.
                </p>
              </div>

              <button
                className="button button-primary"
                onClick={createRoom}
                disabled={isCreating || !connected}
              >
                {isCreating ? "Creating..." : "Create room"}
              </button>

              <div className="stack">
                <label className="form-label" htmlFor="room-code">
                  Join existing room
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
                  {isJoining ? "Joining..." : "Join match"}
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
