const TOKEN_KEY = "webtelemt_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

function formatErrorDetail(detail: unknown): string {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((item) =>
        typeof item === "object" && item && "msg" in item
          ? String((item as { msg: unknown }).msg)
          : JSON.stringify(item)
      )
      .join("; ");
  }
  return JSON.stringify(detail);
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(path, { ...options, headers });

  if (!response.ok) {
    let detail: unknown = response.statusText;
    try {
      const body = await response.json();
      detail = body.detail ?? detail;
    } catch {
      /* ignore */
    }
    throw new ApiError(formatErrorDetail(detail), response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return response.json() as Promise<T>;
}

export interface LoginResponse {
  token: string;
  username: string;
}

export interface MeResponse {
  username: string;
}

export interface TelemtUser {
  username: string;
  enabled?: boolean;
  status?: string;
  current_connections?: number;
  active_unique_ips_list?: string[];
  bytes_up?: number;
  bytes_down?: number;
  total_bytes?: number;
}

export interface StatsSummary {
  total_users?: number;
  enabled_users?: number;
  total_connections?: number;
  total_unique_ips?: number;
  bytes_up?: number;
  bytes_down?: number;
  uptime_seconds?: number;
  [key: string]: unknown;
}

export const api = {
  login(username: string, password: string) {
    return request<LoginResponse>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
  },

  me() {
    return request<MeResponse>("/api/auth/me");
  },

  users() {
    return request<TelemtUser[]>("/api/users");
  },

  statsSummary() {
    return request<StatsSummary>("/api/stats/summary");
  },

  createUser(username: string) {
    return request<{ username: string; secret: string }>("/api/users", {
      method: "POST",
      body: JSON.stringify({ username }),
    });
  },

  deleteUser(username: string) {
    return request<void>(`/api/users/${encodeURIComponent(username)}`, {
      method: "DELETE",
    });
  },
};
