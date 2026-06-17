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

  const monacoRef = useRef<MonacoApi | null>(null);
  const monacoTheme = theme === "light" ? "vs" : "vs-dark";
  const pageBg = theme === "light" ? "#ffffff" : "#111111";
  const pageText = theme === "light" ? "#000000" : "#ffffff";
  const panelBg = theme === "light" ? "#fafafa" : "#181818";
  const border = theme === "light" ? "#e6e6e6" : "#333333";

  useEffect(() => {
    if (monacoRef.current?.editor?.setTheme) {
      monacoRef.current.editor.setTheme(monacoTheme);
    }
  }, [monacoTheme]);

  useEffect(() => {
    socket.emit("rejoin-room", roomCode);
    socket.emit("get-problem", roomCode);
  }, [roomCode]);

  useEffect(() => {
    const handleProblem = (problemData: Problem) => {
      setProblem(problemData);
    };

    socket.on("problem", handleProblem);

    return () => {
      socket.off("problem", handleProblem);
    };
  }, []);

  useEffect(() => {
    const handleCodeUpdate = (nextCode: string) => {
      setOpponentCode(nextCode);
    };

    socket.on("code-update", handleCodeUpdate);

    return () => {
      socket.off("code-update", handleCodeUpdate);
    };
  }, []);

  useEffect(() => {
    const handleSubmissionResult = (nextResult: SubmissionResult) => {
      setResult(nextResult);
    };

    socket.on("submission-result", handleSubmissionResult);

    return () => {
      socket.off("submission-result", handleSubmissionResult);
    };
  }, []);

  useEffect(() => {
    const handleLeaderboardUpdate = (
      scores: Record<string, LeaderboardEntry>
    ) => {
      setLeaderboard(scores);
    };

    socket.on("leaderboard-update", handleLeaderboardUpdate);

    return () => {
      socket.off("leaderboard-update", handleLeaderboardUpdate);
    };
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
              onChange={(event) => setLanguage(event.target.value)}
              style={{
                padding: "6px 10px",
                borderRadius: 8,
                border: "1px solid #cfcfcf",
                background: theme === "light" ? "#f7f7f7" : "#222222",
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
            border: `1px solid ${border}`,
            borderRadius: 8,
            padding: 12,
            background: panelBg,
          }}
        >
          <h4 style={{ marginTop: 0, marginBottom: 10 }}>Leaderboard</h4>

          {sortedLeaderboard.map(([socketId, data], index) => (
            <div
              key={socketId}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "8px 0",
                borderBottom:
                  index !== sortedLeaderboard.length - 1
                    ? "1px solid rgba(128,128,128,0.2)"
                    : "none",
              }}
            >
              <span>
                #{index + 1} {socketId.slice(0, 6)}...
              </span>

              <strong>{data.score} chars</strong>
            </div>
          ))}

          {sortedLeaderboard.length === 0 && (
            <div style={{ opacity: 0.7 }}>No submissions yet.</div>
          )}
        </div>
      </header>

      {problem && (
        <section
          style={{
            padding: "16px",
            borderBottom: `1px solid ${border}`,
            background: panelBg,
          }}
        >
          <h2 style={{ marginBottom: "8px" }}>{problem.title}</h2>
          <p style={{ marginBottom: "8px", whiteSpace: "pre-line" }}>
            {problem.description}
          </p>
          <p style={{ margin: 0 }}>
            <strong>Difficulty:</strong> {problem.difficulty}
          </p>
        </section>
      )}

      <main
        style={{
          flex: 1,
          display: "flex",
          position: "relative",
          minHeight: 0,
        }}
      >
        <div style={{ flex: 1, borderRight: `1px solid ${border}` }}>
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
            options={{
              readOnly: true,
            }}
          />
        </div>

        {result && (
          <div
            style={{
              position: "absolute",
              bottom: 80,
              left: "50%",
              transform: "translateX(-50%)",
              padding: "12px 16px",
              background: result.success ? "#e6ffe6" : "#ffe6e6",
              color: "#111111",
              borderRadius: 8,
              minWidth: 320,
              textAlign: "center",
              boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
            }}
          >
            <strong>{result.success ? "Passed" : "Failed"}</strong>
            <p style={{ margin: 0 }}>Output: {result.output}</p>
            <p style={{ margin: 0 }}>
              Character Count: {result.characterCount}
            </p>
          </div>
        )}

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
            onClick={() => {
              socket.emit("submit-code", { roomCode, code, language });
            }}
            style={{
              padding: "10px 20px",
              borderRadius: 8,
              border: "1px solid #cfcfcf",
              background: theme === "light" ? "#4CAF50" : "#388E3C",
              color: "#ffffff",
              cursor: "pointer",
            }}
          >
            Submit Code
          </button>

          <button
            onClick={() => {
              router.push(`/replay/${roomCode}`);
            }}
            style={{
              padding: "10px 20px",
              borderRadius: 8,
              border: "1px solid #cfcfcf",
              background: theme === "light" ? "#2563eb" : "#1d4ed8",
              color: "#ffffff",
              cursor: "pointer",
            }}
          >
            Replay
          </button>
        </div>
      </main>
    </div>
  );
}
