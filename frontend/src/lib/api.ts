const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000/api";
const AUTH_STORAGE_KEY = "codearena_auth";

type StoredAuth = {
  accessToken?: string;
  // may also contain `user` when written by AuthProvider
  [k: string]: any;
};

let inFlightRefresh: Promise<string> | null = null;

async function refreshAccessToken(): Promise<string> {
  if (inFlightRefresh) {
    console.log("Refresh already in progress, waiting for existing refresh...");
    return inFlightRefresh;
  }
  console.log("Starting access token refresh...");
  inFlightRefresh = (async () => {
    const resp = await fetch(`${API_BASE_URL}/auth/refresh-token`, {
      method: 'POST',
      credentials: 'include',
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || !data.accessToken) {
      // clear stored access token when refresh fails
      console.error(" Token refresh failed:", data);
      try { window.localStorage.removeItem(AUTH_STORAGE_KEY); } catch {}
      throw new Error(typeof data.message === 'string' ? data.message : 'Refresh failed');
    }
    console.log("New access token received");
    // merge into existing stored auth object (preserve user if present)
    try {
      const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
      const obj = raw ? (JSON.parse(raw) as StoredAuth) : {};
      obj.accessToken = data.accessToken;
      window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(obj));
    } catch {
      // ignore storage errors
    }
    console.log("Access token updated in localStorage");
    return data.accessToken as string;
  })();

  try {
    const token = await inFlightRefresh;
    console.log("Access token refresh completed");
    return token;
  } finally {
    inFlightRefresh = null;
  }
}
export type ApiVerdict =
  | "Accepted"
  | "Wrong Answer"
  | "TLE"
  | "MLE"
  | "Runtime Error"
  | "Compilation Error"
  | "Pending";

export type ApiSubmission = {
  _id?: string;
  submissionId: string;
  problemTitle: string;
  user?: Pick<ApiUser, "_id" | "username" | "avatar">;
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

export type ApiSolvedStats = {
  easy: number;
  medium: number;
  hard: number;
  total: number;
};

export type ApiUser = {
  _id: string;
  id?: string;
  name?: string;
  username: string;
  email?: string;
  role?: "user" | "admin";
  avatar?: string;
  country?: string;
  rating?: number;
  rank?: number;
  solved?: ApiSolvedStats;
  streak?: number;
  badges?: string[];
  joinedAt?: string;
  preferences?: {
    defaultLanguage?: string;
    editorFontSize?: number;
    theme?: "dark" | "light" | "system";
  };
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

export type ApiActivity = {
  _id?: string;
  date: string;
  count: number;
};

export type ApiRatingHistory = {
  _id: string;
  contest?: { _id: string; contestId: number; name: string };
  contestName: string;
  rating: number;
  change: number;
  rank?: number;
  createdAt: string;
};

export type ApiContestStatus = "upcoming" | "live" | "ended";

export type ApiContest = {
  _id: string;
  contestId: number;
  name: string;
  startsAt: string;
  duration: number;
  status: ApiContestStatus;
  difficulty: string;
  registeredCount: number;
  problems: Array<{
    problem: Pick<ApiProblem, "_id" | "problemId" | "slug" | "title" | "difficulty">;
    label: string;
    points: number;
    order: number;
  }>;
};

export type ApiContestRegistration = {
  _id: string;
  contest: string;
  user: ApiUser;
  registeredAt: string;
  score: number;
  penalty: number;
  rank?: number;
};

export type ApiDiscussion = {
  _id: string;
  title: string;
  body?: string;
  author?: Pick<ApiUser, "_id" | "username" | "avatar">;
  authorUsername?: string;
  tags: string[];
  problem?: Pick<ApiProblem, "_id" | "problemId" | "slug" | "title">;
  contest?: Pick<ApiContest, "_id" | "contestId" | "name">;
  upvotes: number;
  downvotes: number;
  comments: Array<{
    _id: string;
    author?: Pick<ApiUser, "_id" | "username" | "avatar">;
    body: string;
    upvotes: number;
    createdAt: string;
    updatedAt?: string;
  }>;
  isPinned: boolean;
  isLocked: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ApiNotification = {
  _id: string;
  title: string;
  body: string;
  type: "contest" | "submission" | "discussion" | "rating" | "system";
  unread: boolean;
  link?: string;
  createdAt: string;
};

export type ApiJudgeWorker = {
  _id: string;
  workerId: string;
  region: string;
  load: number;
  status: "online" | "degraded" | "offline";
  supportedLanguages: string[];
  activeJobs: number;
  lastHeartbeatAt?: string;
};

export type ApiJudgeJob = {
  _id: string;
  submission?: ApiSubmission;
  worker?: Pick<ApiJudgeWorker, "_id" | "workerId" | "region" | "status">;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  priority: number;
  attempts: number;
  queuedAt: string;
  startedAt?: string;
  finishedAt?: string;
  error?: string;
};

export type ApiPagination = {
  page: number;
  limit: number;
  total: number;
  pages: number;
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
  // helper to attempt the request with an optional token
  const attempt = async (token?: string) => {
    const headers = new Headers(options.headers);
    if (token) headers.set('Authorization', `Bearer ${token}`);
    if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      credentials: 'include',
      headers,
    });
    const data = await response.json().catch(() => ({}));
    return { response, data } as { response: Response; data: any };
  };

  const storedToken = readAccessToken();
  let { response, data } = await attempt(storedToken);

  if (response.status === 401) {
    try {
      const newToken = await refreshAccessToken();
      ({ response, data } = await attempt(newToken));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Session expired';
      throw new Error(message);
    }
  }

  if (!response.ok) {
    const message = typeof data.message === 'string' ? data.message : 'API request failed';
    throw new Error(message);
  }

  return data as T;
}
