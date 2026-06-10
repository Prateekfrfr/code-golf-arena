"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { socket } from "../../../lib/socket";

export default function LobbyRoom({
  params,
}: {
  params: { roomCode: string };
}) {
  const router = useRouter();
  const { roomCode } = params;

  useEffect(() => {
    function handleRoomReady() {
      router.push(`/game/${roomCode}`);
    }

    socket.on("room-ready", handleRoomReady);
    return () => {
      socket.off("room-ready", handleRoomReady);
    };
  }, [roomCode, router]);

  return (
    <main style={{ padding: 24 }}>
      <h1>Room: {roomCode}</h1>
      <p>Waiting for opponent...</p>
    </main>
  );
}
