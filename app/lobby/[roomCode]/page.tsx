"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { socket } from "../../../lib/socket";
import { SocketEvents } from "../../../shared/events";
import {
  ConnectionStatus,
  PremiumShell,
  SurfaceCard,
  ToastRegion,
  TopNav,
} from "@/components/ui/PremiumShell";
import { useSocketConnection } from "@/hooks/useSocketConnection";
import { useTransientMessage } from "@/hooks/useTransientMessage";

export default function LobbyRoom({
  params,
}: {
  params: Promise<{ roomCode: string }>;
}) {
  const router = useRouter();
  const { roomCode: rawRoomCode } = React.use(params);
  const roomCode = rawRoomCode.trim().toUpperCase();
  const [copied, setCopied] = useState(false);
  const copyTimeoutRef = useRef<number | null>(null);
  const { connected, connectionEpoch } = useSocketConnection();
  const { message, setMessage } = useTransientMessage();

  useEffect(() => {
    const handleRoomReady = () => {
      router.push(`/game/${roomCode}`);
    };
    const handleError = (errorMessage: string) => {
      setMessage(errorMessage);
    };

    socket.on(SocketEvents.ROOM_READY, handleRoomReady);
    socket.on(SocketEvents.ROOM_ERROR, handleError);

    return () => {
      socket.off(SocketEvents.ROOM_READY, handleRoomReady);
      socket.off(SocketEvents.ROOM_ERROR, handleError);
    };
  }, [roomCode, router, setMessage]);

  useEffect(() => {
    if (!connected || connectionEpoch === 0) return;
    socket.emit(SocketEvents.REJOIN_ROOM, roomCode);
  }, [connected, connectionEpoch, roomCode]);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current !== null) {
        window.clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

  const copyRoomCode = async () => {
    try {
      await navigator.clipboard.writeText(roomCode);
      setCopied(true);
      if (copyTimeoutRef.current !== null) {
        window.clearTimeout(copyTimeoutRef.current);
      }
      copyTimeoutRef.current = window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setMessage("Clipboard access was blocked. Select and copy the room code.");
    }
  };

  const retryRoom = () => {
    if (!connected) {
      setMessage("The realtime server is still reconnecting.");
      return;
    }
    socket.emit(SocketEvents.REJOIN_ROOM, roomCode);
    setMessage("Room recovery requested.");
  };

  return (
    <PremiumShell
      navItems={[
        { label: "Home", href: "/", marker: "cd" },
        { label: "Problems", href: "/problems", marker: "{}" },
        { label: "Lobby", active: true, marker: ".." },
      ]}
      status={
        <>
          <div className="status-orbit">
            <span className={connected ? "" : "offline"} />
          </div>
          <div>
            <strong>Room {roomCode}</strong>
            <span>{connected ? "waiting for opponent" : "reconnecting"}</span>
          </div>
        </>
      }
      topbar={
        <TopNav
          eyebrow={`private room / ${roomCode}`}
          title="Waiting room"
          actions={<ConnectionStatus connected={connected} />}
        />
      }
    >
      <ToastRegion message={message} tone={message.includes("requested") ? "info" : "error"} />

      <section className="lobby-stage" aria-labelledby="lobby-title">
        <SurfaceCard className="lobby-card">
          <div className="lobby-copy">
            <div className="eyebrow">Room ready</div>
            <h1 id="lobby-title">Invite one challenger.</h1>
            <p className="muted">
              Share the room code. The round opens automatically when the second
              player joins.
            </p>
          </div>

          <div className="room-code-panel">
            <div>
              <div className="form-label">Room code</div>
              <output className="room-code" aria-label={`Room code ${roomCode}`}>
                {roomCode}
              </output>
            </div>
            <button
              className="button button-primary"
              type="button"
              onClick={copyRoomCode}
            >
              {copied ? "code copied" : "copy code"}
            </button>
          </div>

          <div className="lobby-status-grid" aria-live="polite">
            <div className="metric">
              <strong>{connected ? "Connected" : "Reconnecting"}</strong>
              <span>Realtime status</span>
            </div>
            <div className="metric">
              <strong>Private</strong>
              <span>Room access</span>
            </div>
            <div className="metric">
              <strong>Automatic</strong>
              <span>Round start</span>
            </div>
          </div>

          <div className="waiting-signal" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>

          <div className="lobby-actions">
            <button className="button" type="button" onClick={() => router.push("/")}>
              leave room
            </button>
            <button className="button" type="button" onClick={retryRoom}>
              retry connection
            </button>
            <span className="copy-status" role="status">
              {copied ? "Room code copied to clipboard." : ""}
            </span>
          </div>
        </SurfaceCard>
      </section>
    </PremiumShell>
  );
}
