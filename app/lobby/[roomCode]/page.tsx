"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { socket } from "../../../lib/socket";
import { SocketEvents } from "../../../shared/events";

export default function LobbyRoom({
  params,
}: {
  params: Promise<{ roomCode: string }>;
}) {
  const router = useRouter();
  const { roomCode } = React.use(params);
  const [toast, setToast] = useState("");
  const [copied, setCopied] = useState(false);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const handleRoomReady = () => {
      router.push(`/game/${roomCode}`);
    };

    const handleError = (message: string) => {
      setToast(message);
    };

    const handleConnect = () => setConnected(true);
    const handleDisconnect = () => setConnected(false);

    queueMicrotask(() => {
      setConnected(socket.connected);
    });

    socket.on(SocketEvents.ROOM_READY, handleRoomReady);
    socket.on(SocketEvents.ROOM_ERROR, handleError);
    socket.on("error", handleError);
    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);

    return () => {
      socket.off(SocketEvents.ROOM_READY, handleRoomReady);
      socket.off(SocketEvents.ROOM_ERROR, handleError);
      socket.off("error", handleError);
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
    };
  }, [roomCode, router]);

  useEffect(() => {
    if (!toast) return;

    const timeout = window.setTimeout(() => setToast(""), 3600);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const copyRoomCode = async () => {
    await navigator.clipboard.writeText(roomCode);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <main className="arena-shell lobby-layout">
      {toast && (
        <div className="toast-stack">
          <div className="toast toast-error">{toast}</div>
        </div>
      )}

      <section className="panel lobby-card">
        <div className="brand">
          <div className="brand-mark">CG</div>
          <span>Code Golf Arena</span>
        </div>

        <div style={{ marginTop: 28 }}>
          <div className="eyebrow">Lobby</div>
          <h1 style={{ margin: "8px 0", fontSize: 46 }}>Room ready</h1>
          <p className="muted" style={{ marginTop: 0 }}>
            Share this code with your opponent. The match starts automatically
            as soon as the second player joins.
          </p>
        </div>

        <div
          className="panel"
          style={{
            padding: 18,
            marginTop: 22,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 16,
          }}
        >
          <div>
            <div className="form-label">Room code</div>
            <div
              className="room-code"
              style={{ fontSize: 36, fontWeight: 900, marginTop: 4 }}
            >
              {roomCode}
            </div>
          </div>
          <button className="button button-primary" onClick={copyRoomCode}>
            {copied ? "Copied" : "Copy code"}
          </button>
        </div>

        <div className="metric-grid">
          <div className="metric">
            <strong>1/2</strong>
            <span>Players joined</span>
          </div>
          <div className="metric">
            <strong>{connected ? "Live" : "Retry"}</strong>
            <span>Socket status</span>
          </div>
          <div className="metric">
            <strong>Auto</strong>
            <span>Match start</span>
          </div>
        </div>

        <div style={{ marginTop: 24 }} className="pulse-line" />

        <div style={{ marginTop: 22, display: "flex", gap: 10 }}>
          <button className="button" onClick={() => router.push("/")}>
            Back home
          </button>
        </div>
      </section>
    </main>
  );
}
