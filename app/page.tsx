"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { socket } from "@/lib/socket";

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    const handleRoomCreated = (roomCode: string) => {
      router.push(`/lobby/${roomCode}`);
    };

    const handleRoomReady = ({ roomCode }: { roomCode: string }) => {
      router.push(`/game/${roomCode}`);
    };

    const handleError = (message: string) => {
      alert(message);
    };

    socket.on("roomCreated", handleRoomCreated);
    socket.on("room-ready", handleRoomReady);
    socket.on("error", handleError);

    return () => {
      socket.off("roomCreated", handleRoomCreated);
      socket.off("room-ready", handleRoomReady);
      socket.off("error", handleError);
    };
  }, [router]);

  const createRoom = () => {
    socket.emit("createRoom");
  };

  const joinRoom = () => {
    const roomCode = prompt("Enter Room Code:");

    if (!roomCode) return;

    socket.emit("join-room", roomCode.trim().toUpperCase());
  };

  return (
    <main className="flex flex-col gap-4 items-center justify-center min-h-screen">
      <button
        className="bg-blue-500 text-white px-4 py-2 rounded"
        onClick={createRoom}
      >
        Create Room
      </button>

      <button
        className="bg-green-500 text-white px-4 py-2 rounded"
        onClick={joinRoom}
      >
        Join Room
      </button>
    </main>
  );
}
