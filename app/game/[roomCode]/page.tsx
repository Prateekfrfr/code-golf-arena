"use client";

import React, { useEffect, useState, useRef } from "react";
import { socket } from "../../../lib/socket";
import Editor from "@monaco-editor/react";

export default function GameRoom({
  params,
}: {
  params: Promise<{ roomCode: string }>;
}) {
  const { roomCode } = React.use(params as Promise<{ roomCode: string }>);

  const [code, setCode] = useState("");
  const [opponentCode, setOpponentCode] = useState("");
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [problem, setProblem] = useState<any>(null);
  const [result, setResult] = useState<any>(null);
  const [language, setLanguage] = useState("python");
  interface LeaderboardEntry {
    score: number;
    language: string;
    submittedAt: number;
  }

  const [leaderboard, setLeaderboard] = useState<
    Record<string, LeaderboardEntry>
  >({});

  const monacoRef = useRef<any>(null);

  const monacoTheme = theme === "light" ? "vs" : "vs-dark";

  useEffect(() => {
    if (monacoRef.current?.editor?.setTheme) {
      monacoRef.current.editor.setTheme(monacoTheme);
    }
  }, [monacoTheme]);

  // Request the problem when page loads
  useEffect(() => {
    socket.emit("get-problem", roomCode);

    const handleProblem = (problemData: any) => {
      console.log("Received problem:", problemData);
      setProblem(problemData);
    };

    socket.on("problem", handleProblem);

    return () => {
      socket.off("problem", handleProblem);
    };
  }, [roomCode]);

  // Listen for opponent code updates
  useEffect(() => {
    const handleCodeUpdate = (code: string) => {
      setOpponentCode(code);
    };

    socket.on("code-update", handleCodeUpdate);

    return () => {
      socket.off("code-update", handleCodeUpdate);
    };
  }, [roomCode]);

  useEffect(() => {
    const handleSubmissionResult = (result: any) => {
      setResult(result);
    };

    socket.on("submission-result", handleSubmissionResult);

    return () => {
      socket.off("submission-result", handleSubmissionResult);
    };
  }, [roomCode]);

  useEffect(() => {
    const handleLeaderboardUpdate = (scores: any) => {
      setLeaderboard(scores);
    };
    socket.on("leaderboard-update", handleLeaderboardUpdate);

    return () => {
      socket.off("leaderboard-update", handleLeaderboardUpdate);
    };
  }, [roomCode]);

  return (
    <div
      style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <header
        style={{
          padding: "12px 16px",
          borderBottom: "1px solid #e6e6e6",
          background: theme === "light" ? "#fff" : "#111",
          color: theme === "light" ? "#000" : "#fff",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 12,
          }}
        >
          <div>
            <strong>Room:</strong> {roomCode}
          </div>
          ```
          <button
            onClick={() =>
              setTheme((prev) => (prev === "light" ? "dark" : "light"))
            }
            style={{
              padding: "6px 10px",
              borderRadius: 8,
              border: "1px solid #cfcfcf",
              background: theme === "light" ? "#f7f7f7" : "#222",
              color: theme === "light" ? "#000" : "#fff",
              cursor: "pointer",
            }}
          >
            {theme === "light" ? "🌙 Dark" : "☀️ Light"}
          </button>
          ```
        </div>

        <div
          style={{
            border: theme === "light" ? "1px solid #ddd" : "1px solid #333",
            borderRadius: 10,
            padding: 12,
            background: theme === "light" ? "#fafafa" : "#181818",
          }}
        >
          <h4
            style={{
              marginTop: 0,
              marginBottom: 10,
            }}
          >
            🏆 Leaderboard
          </h4>
          ```
          {Object.entries(leaderboard)
            .sort((a, b) => {
              if (a[1].score !== b[1].score) {
                return a[1].score - b[1].score;
              }

              return a[1].submittedAt - b[1].submittedAt;
            })
            .map(([socketId, data], index) => (
              <div
                key={socketId}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "8px 0",
                  borderBottom:
                    index !== Object.keys(leaderboard).length - 1
                      ? "1px solid rgba(128,128,128,0.2)"
                      : "none",
                }}
              >
                <span>
                  {index === 0 && "🥇 "}
                  {index === 1 && "🥈 "}
                  {index === 2 && "🥉 "}
                  {socketId.slice(0, 6)}...
                </span>

                <strong>{data.score} chars</strong>
              </div>
            ))}
          {Object.keys(leaderboard).length === 0 && (
            <div
              style={{
                opacity: 0.7,
              }}
            >
              No submissions yet.
            </div>
          )}
          ```
        </div>
      </header>

      {problem && (
        <div
          style={{
            padding: "16px",
            borderBottom: "1px solid #e6e6e6",
            background: theme === "light" ? "#fafafa" : "#1a1a1a",
            color: theme === "light" ? "#000" : "#fff",
          }}
        >
          <h2 style={{ marginBottom: "8px" }}>{problem.title}</h2>

          <p style={{ marginBottom: "8px" }}>{problem.description}</p>

          <p>
            <strong>Difficulty:</strong> {problem.difficulty}
          </p>
        </div>
      )}

      <main
        style={{
          flex: 1,
          display: "flex",
        }}
      >
        {/* Your editor */}
        <div
          style={{
            flex: 1,
            borderRight: "1px solid #e6e6e6",
          }}
        >
          <Editor
            onMount={(editor, monaco) => {
              monacoRef.current = monaco;
            }}
            height="100%"
            language="python"
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

        {/* Opponent editor */}
        <div style={{ flex: 1 }}>
          <Editor
            height="100%"
            language="python"
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
              borderRadius: 8,
              minWidth: 320,
              textAlign: "center",
              boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
            }}
          >
            <strong>{result.success ? "✅ Passed!" : "❌ Failed"}</strong>
            <p style={{ margin: 0 }}>Output: {result.output}</p>
            <p style={{ margin: 0 }}>
              Character Count: {result.characterCount}
            </p>
          </div>
        )}
        <button
          onClick={() => {
            console.log("submitting code:", code);
            socket.emit("submit-code", { roomCode, code, language });
          }}
          style={{
            position: "absolute",
            bottom: 20,
            left: "50%",
            transform: "translateX(-50%)",
            padding: "10px 20px",
            borderRadius: 8,
            border: "1px solid #cfcfcf",
            background: theme === "light" ? "#4CAF50" : "#388E3C",
            color: "#fff",
            cursor: "pointer",
          }}
        >
          Submit Code
        </button>
      </main>
    </div>
  );
}
