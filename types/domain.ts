export type Language = "python" | "javascript" | "cpp" | "java";
export type RoomMode = "multiplayer" | "solo";
export type ProblemTopic =
  | "arrays"
  | "strings"
  | "math"
  | "dp"
  | "stacks"
  | "graphs"
  | "hashing";

export interface TestCase {
  input: string;
  expectedOutput: string;
}

export interface Problem {
  id: number;
  title: string;
  topic: ProblemTopic;
  description: string;
  difficulty: "easy" | "medium" | "hard" | string;
  testCases?: TestCase[];
}

export interface LeaderboardEntry {
  score: number;
  language: Language;
  submittedAt: number;
}

export interface SubmissionResult {
  output: string;
  characterCount: number;
  success: boolean;
  rateLimited?: boolean;
  cooldownMs?: number;
}

export interface ReplayEntry {
  code: string;
  timestamp: number;
  language: Language;
}

export interface AntiCheatStats {
  tabSwitches: number;
  suspiciousPastes: number;
  submissionSpamAttempts: number;
}

export interface AntiCheatWarning {
  playerId: string;
  type: "tab_switch" | "large_paste" | "submission_spam";
  stats: AntiCheatStats;
  metadata?: Record<string, unknown>;
}

export interface AntiCheatSummary {
  stats: Record<string, AntiCheatStats>;
  events: Array<{
    playerId: string;
    type: AntiCheatWarning["type"];
    metadata?: Record<string, unknown>;
    timestamp: number;
  }>;
}

export interface ReplayPayload {
  replay: Record<string, ReplayEntry[]>;
  players: string[];
  problem: Problem | null;
  scores: Record<string, LeaderboardEntry>;
  antiCheatStats: Record<string, AntiCheatStats>;
  startTime: number | null;
  mode?: RoomMode;
  topic?: ProblemTopic | "random";
}
