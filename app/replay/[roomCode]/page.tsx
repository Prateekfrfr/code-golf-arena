"use client";

import Editor from "@monaco-editor/react";
import { useRouter } from "next/navigation";
import React, { useEffect, useMemo, useState } from "react";
import { socket } from "../../../lib/socket";

interface ReplayEntry {
  code: string;
  timestamp: number;
}

interface Problem {
  id: number;
  title: string;
  description: string;
  difficulty: string;
}

interface ReplayPayload {
  replay: Record<string, ReplayEntry[]>;
  players: string[];
  problem: Problem | null;
  scores?: Record<string, { score: number; language: string; submittedAt: number }>;
}

const codeAtTime = (tape: ReplayEntry[], time: number) => {
  let currentCode = "";

  for (const frame of tape) {
    if (frame.timestamp > time) break;
    currentCode = frame.code;
  }

  return currentCode;
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
  const { roomCode } = React.use(params);
  const router = useRouter();

  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [replay, setReplay] = useState<Record<string, ReplayEntry[]>>({});
  const [players, setPlayers] = useState<string[]>([]);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [scores, setScores] = useState<ReplayPayload["scores"]>({});
  const [replayReady, setReplayReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);

  const monacoTheme = theme === "light" ? "vs" : "vs-dark";
  const pageBg = theme === "light" ? "#ffffff" : "#111111";
  const pageText = theme === "light" ? "#000000" : "#ffffff";
  const panelBg = theme === "light" ? "#fafafa" : "#181818";
  const border = theme === "light" ? "#e6e6e6" : "#333333";

  const totalDuration = useMemo(() => {
    return Math.max(
      0,
      ...Object.values(replay)
        .flat()
        .map((frame) => frame.timestamp)
    );
  }, [replay]);

  useEffect(() => {
    const handleReplayData = (replayData: ReplayPayload | null) => {
      if (!replayData) {
        setReplayReady(true);
        return;
      }

      setReplay(replayData.replay || {});
      setPlayers(replayData.players || []);
      setProblem(replayData.problem);
      setScores(replayData.scores || {});
      setReplayReady(true);
    };

    socket.on("replay-data", handleReplayData);
    socket.emit("get-replay", roomCode);

    return () => {
      socket.off("replay-data", handleReplayData);
    };
  }, [roomCode]);

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

    return () => {
      window.clearInterval(interval);
    };
  }, [isPlaying, totalDuration]);

  const player1 = players[0];
  const player2 = players[1];
  const player1Tape = player1 ? replay[player1] || [] : [];
  const player2Tape = player2 ? replay[player2] || [] : [];
  const player1Code = codeAtTime(player1Tape, currentTime);
  const player2Code = codeAtTime(player2Tape, currentTime);
  const player1Language = player1 ? scores?.[player1]?.language || "python" : "python";
  const player2Language = player2 ? scores?.[player2]?.language || "python" : "python";

  if (!replayReady) {
    return <div style={{ padding: 32 }}>Loading replay...</div>;
  }

  if (!problem && players.length === 0) {
    return (
      <main style={{ padding: 32 }}>
        <h1>Replay not found</h1>
        <p>This room may have expired from the in-memory server.</p>
        <button onClick={() => router.push("/")}>Back home</button>
      </main>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        background: pageBg,
        color: pageText,
      }}
    >
      <header
        style={{
          padding: "16px",
          borderBottom: `1px solid ${border}`,
          background: pageBg,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            marginBottom: 12,
          }}
        >
          <div>
            <h1 style={{ margin: 0, fontSize: 24 }}>Replay: {roomCode}</h1>
            <div style={{ opacity: 0.7 }}>{problem?.title}</div>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => router.push(`/game/${roomCode}`)}
              style={{
                padding: "8px 12px",
                borderRadius: 8,
                border: "1px solid #cfcfcf",
                cursor: "pointer",
              }}
            >
              Back to game
            </button>
            <button
              onClick={() =>
                setTheme((prev) => (prev === "light" ? "dark" : "light"))
              }
              style={{
                padding: "8px 12px",
                borderRadius: 8,
                border: "1px solid #cfcfcf",
                background: theme === "light" ? "#f7f7f7" : "#222222",
                color: pageText,
                cursor: "pointer",
              }}
            >
              {theme === "light" ? "Dark" : "Light"}
            </button>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "auto 1fr auto",
            alignItems: "center",
            gap: 12,
            padding: 12,
            border: `1px solid ${border}`,
            borderRadius: 8,
            background: panelBg,
          }}
        >
          <button
            onClick={() => {
              if (currentTime >= totalDuration) {
                setCurrentTime(0);
              }

              setIsPlaying((playing) => !playing);
            }}
            disabled={totalDuration === 0}
            style={{
              padding: "8px 14px",
              borderRadius: 8,
              border: "1px solid #cfcfcf",
              background: "#2563eb",
              color: "#ffffff",
              cursor: totalDuration === 0 ? "not-allowed" : "pointer",
              opacity: totalDuration === 0 ? 0.5 : 1,
            }}
          >
            {isPlaying ? "Pause" : "Play"}
          </button>

          <input
            type="range"
            min={0}
            max={totalDuration}
            step={100}
            value={currentTime}
            onChange={(event) => {
              setIsPlaying(false);
              setCurrentTime(Number(event.target.value));
            }}
            disabled={totalDuration === 0}
          />

          <div style={{ minWidth: 90, textAlign: "right" }}>
            {formatTime(currentTime)} / {formatTime(totalDuration)}
          </div>
        </div>
      </header>

      <main
        style={{
          flex: 1,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 16,
          minHeight: 0,
          padding: 16,
        }}
      >
        <section style={{ minWidth: 0 }}>
          <h2 style={{ marginTop: 0, fontSize: 18 }}>
            Player 1 {player1 ? `- ${player1.slice(0, 6)}` : ""}
          </h2>
          <Editor
            height="70vh"
            language={player1Language}
            theme={monacoTheme}
            value={player1Code}
            options={{ readOnly: true }}
          />
        </section>

        <section style={{ minWidth: 0 }}>
          <h2 style={{ marginTop: 0, fontSize: 18 }}>
            Player 2 {player2 ? `- ${player2.slice(0, 6)}` : ""}
          </h2>
          <Editor
            height="70vh"
            language={player2Language}
            theme={monacoTheme}
            value={player2Code}
            options={{ readOnly: true }}
          />
        </section>
      </main>
    </div>
  );
}
