const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000/api";
const AUTH_STORAGE_KEY = "codearena_auth";

type StoredAuth = {
  accessToken?: string;
};

export type ApiVerdict =
  | "Accepted"
  | "Wrong Answer"
  | "TLE"
  | "MLE"
  | "Runtime Error"
  | "Compilation Error"
  | "Pending";

export type ApiSubmission = {
  submissionId: string;
  problemTitle: string;
  problem?: {
    _id: string;
    problemId: number;
    slug: string;
    title: string;
    difficulty: ApiDifficulty;
  };
  language: string;
  verdict: ApiVerdict;
  runtime?: number;
  memory?: number;
  testcasesPassed?: number;
  totalTestcases?: number;
  stdout?: string;
  stderr?: string;
  compileOutput?: string;
  failedTestcase?: {
    input?: string;
    expectedOutput?: string;
    actualOutput?: string;
    index?: number;
  };
  submittedAt: string;
  judgedAt?: string;
};

export type ApiDifficulty = "Easy" | "Medium" | "Hard";
export type ApiProblemStatus = "draft" | "published" | "archived";

export type ApiProblem = {
  _id: string;
  problemId: number;
  slug: string;
  title: string;
  difficulty: ApiDifficulty;
  tags: string[];
  acceptance: number;
  premium?: boolean;
  status: ApiProblemStatus;
  description: string;
  constraints: string[];
  examples: Array<{ input: string; output: string; explanation?: string }>;
  hints: string[];
  starterCode?: Record<string, string>;
  testCases?: Array<{ input: string; expectedOutput: string; hidden?: boolean; order?: number }>;
  timeLimitMs: number;
  memoryLimitMb: number;
  totalSubmissions: number;
  acceptedSubmissions: number;
  solved?: boolean;
  progress?: ApiProblemProgress;
};

export type ApiProblemProgress = {
  _id?: string;
  status: "unsolved" | "attempted" | "solved";
  bookmarked: boolean;
  attempts: number;
  solvedAt?: string;
  savedCode?: Array<{ language: string; code: string; updatedAt?: string }>;
};

export type ApiLanguage = {
  _id?: string;
  languageId: string;
  label: string;
  monaco: string;
  version?: string;
  enabled?: boolean;
};

function readAccessToken() {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredAuth).accessToken : undefined;
  } catch {
    return undefined;
  }
}

export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = readAccessToken();
  const headers = new Headers(options.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    credentials: "include",
    headers,
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = typeof data.message === "string" ? data.message : "API request failed";
    throw new Error(message);
  }

  return data as T;
}
