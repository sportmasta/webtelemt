const TOKEN_KEY = "webtelemt_token";
const CUSTOMER_TOKEN_KEY = "customer_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export function getCustomerToken(): string | null {
  return localStorage.getItem(CUSTOMER_TOKEN_KEY);
}

export function setCustomerToken(token: string): void {
  localStorage.setItem(CUSTOMER_TOKEN_KEY, token);
}

export function clearCustomerToken(): void {
  localStorage.removeItem(CUSTOMER_TOKEN_KEY);
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

async function customerRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getCustomerToken();
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

async function billingOrderRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const customerToken = getCustomerToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (customerToken) {
    headers.Authorization = `Bearer ${customerToken}`;
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

export interface UserLinks {
  classic?: string[];
  secure?: string[];
  tls?: string[];
  tls_domains?: { domain: string; link: string }[];
}

export interface TelemtUser {
  username: string;
  enabled?: boolean;
  status?: string;
  current_connections?: number;
  active_unique_ips?: number;
  active_unique_ips_list?: string[];
  bytes_up?: number;
  bytes_down?: number;
  total_bytes?: number;
  total_octets?: number;
  max_unique_ips?: number;
  links?: UserLinks;
}

function parseServerFromProxyLink(link: string): string | null {
  const match = link.match(/[?&]server=([^&]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

function isConcreteServer(server: string | null): boolean {
  return Boolean(server && server !== "::" && server !== "UNKNOWN");
}

/** Предпочитает TLS-ссылку с реальным IP; иначе первую доступную из tls/classic/secure. */
export function getConnectionLinks(user: TelemtUser): string[] {
  const links = user.links;
  if (!links) return [];

  const collected: string[] = [];
  const pushUnique = (items?: string[]) => {
    for (const item of items ?? []) {
      if (item && !collected.includes(item)) collected.push(item);
    }
  };

  if (links.tls?.length) {
    const preferred = links.tls.filter((link) =>
      isConcreteServer(parseServerFromProxyLink(link))
    );
    pushUnique(preferred.length > 0 ? preferred : links.tls);
  }

  pushUnique(links.secure);
  pushUnique(links.classic);

  for (const entry of links.tls_domains ?? []) {
    if (entry.link && !collected.includes(entry.link)) collected.push(entry.link);
  }

  return collected;
}

export function getPrimaryConnectionLink(user: TelemtUser): string | null {
  return getConnectionLinks(user)[0] ?? null;
}

function userStatusLabel(user: TelemtUser): string {
  if (user.status) return user.status;
  if (user.enabled === false) return "отключён";
  if (user.enabled === true) return "активен";
  return "";
}

/** Фильтр по имени, IP и статусу (без учёта регистра). */
export function filterUsers(users: TelemtUser[], query: string): TelemtUser[] {
  const q = query.trim().toLowerCase();
  if (!q) return users;

  return users.filter((user) => {
    if (user.username.toLowerCase().includes(q)) return true;
    const status = userStatusLabel(user).toLowerCase();
    if (status && status.includes(q)) return true;
    if ((user.active_unique_ips_list ?? []).some((ip) => ip.toLowerCase().includes(q))) {
      return true;
    }
    return false;
  });
}

export interface StatsSummary {
  uptime_seconds?: number;
  connections_total?: number;
  configured_users?: number;
  [key: string]: unknown;
}

export interface LiveUserStats {
  tcpSessions: number;
  uniqueIps: number;
  activeUsers: number;
}

export function aggregateLiveStats(users: TelemtUser[]): LiveUserStats {
  const uniqueIpSet = new Set<string>();
  let tcpSessions = 0;
  let activeUsers = 0;

  for (const user of users) {
    tcpSessions += user.current_connections ?? 0;
    if ((user.current_connections ?? 0) > 0) activeUsers += 1;
    for (const ip of user.active_unique_ips_list ?? []) {
      uniqueIpSet.add(ip);
    }
  }

  return {
    tcpSessions,
    uniqueIps: uniqueIpSet.size,
    activeUsers,
  };
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

  billingPlan() {
    return request<BillingPlan>("/api/billing/plan");
  },

  createBillingOrder(body: { username?: string; email?: string }) {
    return billingOrderRequest<CreateOrderResponse>("/api/billing/orders", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },

  getBillingOrder(orderId: string) {
    return request<BillingOrderPublic>(`/api/billing/orders/${encodeURIComponent(orderId)}`);
  },

  getBillingCredentials(orderId: string) {
    return request<BillingCredentials>(
      `/api/billing/orders/${encodeURIComponent(orderId)}/credentials`
    );
  },

  billingOrders() {
    return request<BillingOrderAdmin[]>("/api/billing/orders");
  },
};

export const customerApi = {
  register(email: string, password: string, password_confirm: string) {
    return customerRequest<CustomerTokenResponse>("/api/account/register", {
      method: "POST",
      body: JSON.stringify({ email, password, password_confirm }),
    });
  },

  login(email: string, password: string) {
    return customerRequest<CustomerTokenResponse>("/api/account/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
  },

  me() {
    return customerRequest<CustomerMe>("/api/account/me");
  },

  orders() {
    return customerRequest<CustomerOrder[]>("/api/account/orders");
  },

  profiles() {
    return customerRequest<CustomerProfile[]>("/api/account/profiles");
  },
};

export interface CustomerTokenResponse {
  token: string;
  email: string;
}

export interface CustomerMe {
  id: string;
  email: string;
}

export interface CustomerOrder {
  id: string;
  status: string;
  amount_kopecks: number;
  currency: string;
  username_issued: string | null;
  created_at: string;
  paid_at: string | null;
  completed_at: string | null;
}

export interface CustomerProfile {
  order_id: string;
  username: string;
  order_status: string;
  completed_at: string | null;
  credentials_viewed: boolean;
  telemt: TelemtUser | null;
}

export interface BillingPlan {
  name: string;
  price_rub: number;
  period_days: number;
}

export interface CreateOrderResponse {
  order_id: string;
  confirmation_url: string;
}

export interface BillingOrderPublic {
  id: string;
  status: string;
  amount_kopecks: number;
  currency: string;
  username_issued: string | null;
  customer_email: string | null;
  credentials_available: boolean;
  created_at: string;
  paid_at: string | null;
  completed_at: string | null;
}

export interface BillingCredentials {
  username: string;
  secret: string;
}

export interface BillingOrderAdmin {
  id: string;
  status: string;
  amount_kopecks: number;
  currency: string;
  username_requested: string | null;
  username_issued: string | null;
  customer_email: string | null;
  credentials_viewed: boolean;
  created_at: string;
  paid_at: string | null;
  completed_at: string | null;
  error_message: string | null;
}
