"use client";

import Editor from "@monaco-editor/react";
import { useRouter } from "next/navigation";
import React, { useEffect, useRef, useState } from "react";
import { socket } from "../../../lib/socket";

interface LeaderboardEntry {
  score: number;
  language: string;
  submittedAt: number;
}

interface Problem {
  id: number;
  title: string;
  description: string;
  difficulty: string;
}

interface SubmissionResult {
  output: string;
  characterCount: number;
  success: boolean;
}

interface MonacoApi {
  editor?: {
    setTheme?: (theme: string) => void;
  };
}

export default function GameRoom({
  params,
}: {
  params: Promise<{ roomCode: string }>;
}) {
  const { roomCode } = React.use(params);
  const router = useRouter();

  const [code, setCode] = useState("");
  const [opponentCode, setOpponentCode] = useState("");
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [problem, setProblem] = useState<Problem | null>(null);
  const [result, setResult] = useState<SubmissionResult | null>(null);
  const [language, setLanguage] = useState("python");
  const [leaderboard, setLeaderboard] = useState<
    Record<string, LeaderboardEntry>
  >({});

  const [warning, setWarning] = useState(0);

  const monacoRef = useRef<MonacoApi | null>(null);
  const monacoTheme = theme === "light" ? "vs" : "vs-dark";

  const pageBg = theme === "light" ? "#ffffff" : "#111111";
  const pageText = theme === "light" ? "#000000" : "#ffffff";
  const panelBg = theme === "light" ? "#fafafa" : "#181818";
  const border = theme === "light" ? "#e6e6e6" : "#333333";

  // TAB SWITCH DETECTION
  useEffect(() => {
    const handleVisibilityChange = () => {
      console.log("visibility changed", document.hidden);

      if (document.hidden) {
        console.log("emitting tab-switch");
        socket.emit("tab-switch", { roomCode });
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [roomCode]);

  // MONACO THEME SYNC
  useEffect(() => {
    if (monacoRef.current?.editor?.setTheme) {
      monacoRef.current.editor.setTheme(monacoTheme);
    }
  }, [monacoTheme]);

  // ROOM INIT
  useEffect(() => {
    socket.emit("rejoin-room", roomCode);
    socket.emit("get-problem", roomCode);
  }, [roomCode]);

  // PROBLEM
  useEffect(() => {
    const handleProblem = (problemData: Problem) => {
      setProblem(problemData);
    };

    socket.on("problem", handleProblem);
    return () => socket.off("problem", handleProblem);
  }, []);

  // CHEAT WARNING
  useEffect(() => {
    const handleCheatWarning = ({ playerId, count }) => {
      console.log("CHEAT WARNING RECEIVED", playerId, count);
      setWarning(count);
    };

    socket.on("cheat-warning", handleCheatWarning);
    return () => socket.off("cheat-warning", handleCheatWarning);
  }, []);

  // CODE SYNC
  useEffect(() => {
    const handleCodeUpdate = (nextCode: string) => {
      setOpponentCode(nextCode);
    };

    socket.on("code-update", handleCodeUpdate);
    return () => socket.off("code-update", handleCodeUpdate);
  }, []);

  // RESULT
  useEffect(() => {
    const handleSubmissionResult = (nextResult: SubmissionResult) => {
      setResult(nextResult);
    };

    socket.on("submission-result", handleSubmissionResult);
    return () => socket.off("submission-result", handleSubmissionResult);
  }, []);

  // LEADERBOARD
  useEffect(() => {
    const handleLeaderboardUpdate = (
      scores: Record<string, LeaderboardEntry>,
    ) => {
      setLeaderboard(scores);
    };

    socket.on("leaderboard-update", handleLeaderboardUpdate);
    return () => socket.off("leaderboard-update", handleLeaderboardUpdate);
  }, []);

  const sortedLeaderboard = Object.entries(leaderboard).sort((a, b) => {
    if (a[1].score !== b[1].score) {
      return a[1].score - b[1].score;
    }
    return a[1].submittedAt - b[1].submittedAt;
  });

  return (
    <div
      style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        background: pageBg,
        color: pageText,
      }}
    >
      {/* ✅ WARNING BANNER (FIXED POSITION) */}
      {warning > 0 && (
        <div
          style={{
            background: "#ffcc00",
            padding: "10px",
            textAlign: "center",
            fontWeight: "bold",
          }}
        >
          ⚠️ Tab switching detected ({warning} warnings)
        </div>
      )}

      <header
        style={{
          padding: "12px 16px",
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
            <strong>Room:</strong> {roomCode}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              style={{
                padding: "6px 10px",
                borderRadius: 8,
                border: "1px solid #cfcfcf",
                background: theme === "light" ? "#f7f7f7" : "#222",
                color: pageText,
              }}
            >
              <option value="python">Python</option>
              <option value="javascript">JavaScript</option>
            </select>

            <button
              onClick={() =>
                setTheme((prev) => (prev === "light" ? "dark" : "light"))
              }
              style={{
                padding: "6px 10px",
                borderRadius: 8,
                border: "1px solid #cfcfcf",
                background: theme === "light" ? "#f7f7f7" : "#222",
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
            border: `1px solid ${border}`,
            borderRadius: 8,
            padding: 12,
            background: panelBg,
          }}
        >
          <h4>Leaderboard</h4>

          {sortedLeaderboard.map(([socketId, data], index) => (
            <div key={socketId}>
              #{index + 1} {socketId.slice(0, 6)}... — {data.score} chars
            </div>
          ))}
        </div>
      </header>

      {problem && (
        <section style={{ padding: 16, borderBottom: `1px solid ${border}` }}>
          <h2>{problem.title}</h2>
          <p style={{ whiteSpace: "pre-line" }}>{problem.description}</p>
          <p>
            <strong>Difficulty:</strong> {problem.difficulty}
          </p>
        </section>
      )}

      <main style={{ flex: 1, display: "flex", position: "relative" }}>
        <div style={{ flex: 1 }}>
          <Editor
            onMount={(_, monaco) => {
              monacoRef.current = monaco;
            }}
            height="100%"
            language={language}
            value={code}
            theme={monacoTheme}
            onChange={(value) => {
              const newCode = value || "";
              setCode(newCode);

              socket.emit("code-update", {
                roomCode,
                code: newCode,
              });
            }}
          />
        </div>

        <div style={{ flex: 1 }}>
          <Editor
            height="100%"
            language={language}
            value={opponentCode}
            theme={monacoTheme}
            options={{ readOnly: true }}
          />
        </div>

        <div
          style={{
            position: "absolute",
            bottom: 20,
            left: "50%",
            transform: "translateX(-50%)",
            display: "flex",
            gap: 12,
          }}
        >
          <button
            onClick={() =>
              socket.emit("submit-code", { roomCode, code, language })
            }
          >
            Submit Code
          </button>

          <button onClick={() => router.push(`/replay/${roomCode}`)}>
            Replay
          </button>
        </div>
      </main>
    </div>
  );
}
