"use client";

import React, { useEffect, useState, useRef } from "react";
import { socket } from "../../../lib/socket";
import Editor from "@monaco-editor/react";

export default function GameRoom({
  params,
}: {
  params: Promise<{ roomCode: string }>;
}) {
  const { roomCode } = React.use(params);

  const [code, setCode] = useState("");
  const [opponentCode, setOpponentCode] = useState("");
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [problem, setProblem] = useState<any>(null);

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
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 16px",
          borderBottom: "1px solid #e6e6e6",
          background: theme === "light" ? "#fff" : "#111",
          color: theme === "light" ? "#000" : "#fff",
        }}
      >
        <div style={{ fontSize: 14 }}>
          <strong>Room:</strong> {roomCode}
        </div>

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
          {theme === "light" ? "Switch to dark" : "Switch to light"}
        </button>
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
      </main>
    </div>
  );
}
