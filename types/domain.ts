export type Language = "python" | "javascript" | "cpp" | "java";
export type RoomMode = "multiplayer" | "solo";
export type ProblemTopic =
  | "arrays"
  | "strings"
  | "math"
  | "dp"
  | "stacks"
  | "graphs"
  | "hashing"
  | (string & {});

export interface TestCase {
  input: unknown;
  expectedOutput: unknown;
  description?: string;
}

export interface Problem {
  id?: number | string;
  title: string;
  slug: string;
  topic: ProblemTopic;
  statement: string;
  description: string;
  explanation?: string;
  examples?: Array<{
    input: unknown;
    output: unknown;
    explanation?: string;
  }>;
  constraints?: string[];
  difficulty: "easy" | "medium" | "hard";
  tags?: string[];
  starterCode?: Partial<Record<Language, string>>;
  supportedLanguages?: Language[];
  visibleTests?: TestCase[];
  testCases?: TestCase[];
  edgeCases?: string[];
  timeLimitMs?: number;
  memoryLimitMb?: number;
  version?: string;
}

export interface ScoreBreakdownComponent {
  key: string;
  label: string;
  inputValue: number;
  clampedValue: number;
  range: { min: number; max: number };
  direction: "lower" | "higher";
  weightBps: number;
  weight: string;
  normalizedScore: number;
  weightedContribution: number;
  explanation: string;
}

export interface ScoreBreakdown {
  score: number;
  maxScore: number;
  configVersion: string;
  summary: string;
  components: ScoreBreakdownComponent[];
}

export interface LeaderboardEntry {
  score: number;
  submissionId?: string;
  characterCount: number;
  runtimeMs: number;
  memoryBytes?: number | null;
  language: Language;
  submittedAt: number;
  scoreBreakdown?: ScoreBreakdown;
}

export interface CompressionSuggestion {
  id: string;
  category: string;
  title: string;
  message: string;
  occurrences: number;
  estimatedSavings: number;
}

export interface CompressionAnalysis {
  language: Language;
  sourceLength: number;
  estimatedSavings: number;
  estimatedLength: number;
  suggestions: CompressionSuggestion[];
}

export interface SubmissionResult {
  output: string;
  characterCount: number;
  characterBytes: number;
  runtimeMs?: number;
  memoryBytes?: number | null;
  success: boolean;
  passedTests?: number;
  totalTests?: number;
  timedOut?: boolean;
  outputTruncated?: boolean;
  rateLimited?: boolean;
  cooldownMs?: number;
  invalidated?: boolean;
  submissionId?: string;
  score?: number;
  maxScore?: number;
  scoreBreakdown?: ScoreBreakdown;
  compression?: CompressionAnalysis | null;
  analytics?: SubmissionAnalytics;
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
  type:
    | "focus_lost"
    | "focus_gained"
    | "focus_check"
    | "tab_switch"
    | "paste"
    | "large_paste"
    | "drop_insert"
    | "submission_attempt"
    | "submission_spam";
  stats: AntiCheatStats;
  metadata?: Record<string, unknown>;
  decision?: {
    action: "none" | "warning" | "final_warning" | "invalidate";
    violationsAdded: number;
    violationsTotal: number;
    reasons: string[];
  };
  session?: AntiCheatSessionSummary;
}

export interface AntiCheatSessionSummary {
  status: "active" | "warned" | "final_warning" | "invalidated";
  violationCount: number;
  warningCount?: number;
  invalidatedAt: number | null;
  invalidationReason: string | null;
}

export interface AntiCheatSummary {
  stats: Record<string, AntiCheatStats>;
  events: Array<{
    playerId: string;
    type: AntiCheatWarning["type"];
    metadata?: Record<string, unknown>;
    timestamp: number;
  }>;
  sessions?: Record<string, AntiCheatSessionSummary>;
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

export interface AnalyticsSubmission {
  id: string;
  userId: string;
  problemId: string | null;
  language: string;
  status: "accepted" | "rejected";
  score: number | null;
  characterCount: number | null;
  runtimeMs: number | null;
  memoryBytes: number | null;
  compressionScore: number | null;
  submittedAt: number;
}

export interface SubmissionAnalytics {
  targetSubmission: AnalyticsSubmission | null;
  totals: {
    submissions: number;
    accepted: number;
    rejected: number;
    acceptanceRateBps: number;
  };
  userTotals: {
    submissions: number;
    accepted: number;
    rejected: number;
    acceptanceRateBps: number;
  };
  globalBest: AnalyticsSubmission | null;
  personalBest: AnalyticsSubmission | null;
  languageBest: AnalyticsSubmission | null;
  percentileBps: number | null;
  globalRanking: { rank: number; population: number } | null;
  languageRanking: { rank: number; population: number } | null;
  previousAttempts: AnalyticsSubmission[];
  trends: Record<
    string,
    Array<{ submissionId: string; submittedAt: number; value: number }>
  >;
  timeline: AnalyticsSubmission[];
}
