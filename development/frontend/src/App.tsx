import { FormEvent, Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Route, Routes, useLocation, useNavigate } from "react-router-dom";
import {
  ApiError,
  BillingOrderAdmin,
  StatsSummary,
  TelemtUser,
  aggregateLiveStats,
  api,
  clearToken,
  filterUsers,
  getToken,
  setToken,
} from "./api";
import { ProfileConnectionLinks } from "./components/ConnectionLinks";
import AccountLoginPage from "./pages/AccountLoginPage";
import AccountPage from "./pages/AccountPage";
import AccountRegisterPage from "./pages/AccountRegisterPage";
import BuyFailPage from "./pages/BuyFailPage";
import BuyPage from "./pages/BuyPage";
import BuySuccessPage from "./pages/BuySuccessPage";

type AdminView = "clients" | "orders";

function formatBytes(bytes: number | undefined): string {
  if (bytes === undefined || bytes === null) return "—";
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** i;
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatUptime(seconds: number | undefined): string {
  if (seconds === undefined) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}ч ${m}м`;
  if (m > 0) return `${m}м ${s}с`;
  return `${s}с`;
}

function userStatus(user: TelemtUser): string {
  if (user.status) return user.status;
  if (user.enabled === false) return "отключён";
  if (user.enabled === true) return "активен";
  return "—";
}

function LoginPage({ onSuccess }: { onSuccess: () => void }) {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await api.login(username, password);
      setToken(res.token);
      onSuccess();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Ошибка входа");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page page--center">
      <div className="card card--narrow">
        <h1 className="title">WebTelemt</h1>
        <p className="subtitle">Панель управления Telemt</p>
        <form onSubmit={handleSubmit} className="form">
          <label className="field">
            <span>Логин</span>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
            />
          </label>
          <label className="field">
            <span>Пароль</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
          {error && <p className="error">{error}</p>}
          <button type="submit" className="btn btn--primary" disabled={loading}>
            {loading ? "Вход…" : "Войти"}
          </button>
        </form>
      </div>
    </div>
  );
}

function CreateUserModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [username, setUsername] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await api.createUser(username.trim());
      setSecret(res.secret ?? "—");
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Ошибка создания");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{secret ? "Клиент создан" : "Новый клиент"}</h2>
        {secret ? (
          <>
            <p className="hint">
              Сохраните секрет — он показывается только один раз.
            </p>
            <div className="secret-box">
              <code>{secret}</code>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn--primary" onClick={onClose}>
                Закрыть
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={handleSubmit} className="form">
            <p className="hint">
              Лимит: 1 уникальный IP на профиль ([access.user_max_unique_ips] в telemt.toml).
            </p>
            <label className="field">
              <span>Имя пользователя</span>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                pattern="[A-Za-z0-9_.-]+"
                title="Буквы, цифры, _, ., -"
                required
                autoFocus
              />
            </label>
            {error && <p className="error">{error}</p>}
            <div className="modal-actions">
              <button type="button" className="btn" onClick={onClose}>
                Отмена
              </button>
              <button type="submit" className="btn btn--primary" disabled={loading}>
                {loading ? "Создание…" : "Создать"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function UserRowDetails({ user }: { user: TelemtUser }) {
  return (
    <div className="user-details">
      <p className="user-details-meta">
        Лимит уникальных IP: <strong>{user.max_unique_ips ?? "—"}</strong>
      </p>
      <h3 className="user-details-title">Подключение</h3>
      <ProfileConnectionLinks user={user} />
    </div>
  );
}

function DeleteConfirmModal({
  username,
  onClose,
  onConfirm,
}: {
  username: string;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleDelete() {
    setError("");
    setLoading(true);
    try {
      await api.deleteUser(username);
      onConfirm();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Ошибка удаления");
      setLoading(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal--small" onClick={(e) => e.stopPropagation()}>
        <h2>Удалить клиента?</h2>
        <p>
          Пользователь <strong>{username}</strong> будет удалён безвозвратно.
        </p>
        {error && <p className="error">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose} disabled={loading}>
            Отмена
          </button>
          <button
            type="button"
            className="btn btn--danger"
            onClick={handleDelete}
            disabled={loading}
          >
            {loading ? "Удаление…" : "Удалить"}
          </button>
        </div>
      </div>
    </div>
  );
}

function orderStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    pending: "ожидает оплаты",
    paid: "оплачен",
    completed: "выдан",
    failed: "ошибка",
    expired: "истёк",
  };
  return labels[status] ?? status;
}

function formatRub(kopecks: number): string {
  return `${(kopecks / 100).toFixed(0)} ₽`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ru-RU");
}

function OrdersSection() {
  const [orders, setOrders] = useState<BillingOrderAdmin[]>([]);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      const data = await api.billingOrders();
      setOrders(data);
      setError("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Ошибка загрузки заказов");
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 10000);
    return () => clearInterval(id);
  }, [refresh]);

  return (
    <section className="section">
      <div className="section-header">
        <h2>Заказы</h2>
      </div>
      {error && <p className="banner banner--error">{error}</p>}
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Дата</th>
              <th>Сумма</th>
              <th>Статус</th>
              <th>Username</th>
              <th>Email</th>
              <th>Выдан</th>
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 ? (
              <tr>
                <td colSpan={7} className="empty">
                  Нет заказов
                </td>
              </tr>
            ) : (
              orders.map((order) => (
                <tr key={order.id}>
                  <td className="mono" title={order.id}>
                    {order.id.slice(0, 8)}…
                  </td>
                  <td>{formatDate(order.created_at)}</td>
                  <td className="mono">{formatRub(order.amount_kopecks)}</td>
                  <td>
                    <span className={`badge badge--order badge--${order.status}`}>
                      {orderStatusLabel(order.status)}
                    </span>
                  </td>
                  <td className="mono">{order.username_issued ?? order.username_requested ?? "—"}</td>
                  <td>{order.customer_email ?? "—"}</td>
                  <td>{order.credentials_viewed ? "да" : "нет"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <p className="hint hint--right">Секреты покупателям не отображаются · обновление каждые 10 с</p>
    </section>
  );
}

function Dashboard({
  panelUser,
  onLogout,
}: {
  panelUser: string;
  onLogout: () => void;
}) {
  const [users, setUsers] = useState<TelemtUser[]>([]);
  const [stats, setStats] = useState<StatsSummary | null>(null);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [filterQuery, setFilterQuery] = useState("");
  const [adminView, setAdminView] = useState<AdminView>("clients");

  const toggleUserRow = (username: string) => {
    setExpandedUser((current) => (current === username ? null : username));
  };

  const refresh = useCallback(async () => {
    try {
      const [usersData, statsData] = await Promise.all([
        api.users(),
        api.statsSummary(),
      ]);
      setUsers(Array.isArray(usersData) ? usersData : []);
      setStats(statsData);
      setError("");
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        clearToken();
        onLogout();
        return;
      }
      setError(err instanceof ApiError ? err.message : "Ошибка загрузки данных");
    }
  }, [onLogout]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, [refresh]);

  const liveStats = aggregateLiveStats(users);
  const filteredUsers = useMemo(
    () => filterUsers(users, filterQuery),
    [users, filterQuery]
  );
  const hasFilter = filterQuery.trim().length > 0;

  return (
    <div className="page">
      <header className="header">
        <div>
          <h1 className="title title--sm">WebTelemt</h1>
          <p className="subtitle">Панель управления</p>
        </div>
        <div className="header-actions">
          <a href="/buy" className="btn btn--sm">
            Покупка
          </a>
          <span className="user-badge">{panelUser}</span>
          <button type="button" className="btn" onClick={onLogout}>
            Выйти
          </button>
        </div>
      </header>

      {error && <p className="banner banner--error">{error}</p>}

      {(stats || users.length > 0) && adminView === "clients" && (
        <section className="stats-grid">
          <div className="stat-card">
            <span className="stat-label">Клиентов в конфиге</span>
            <span className="stat-value">{stats?.configured_users ?? users.length}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">TCP-сессии (сейчас)</span>
            <span className="stat-value">{liveStats.tcpSessions}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Уникальных IP</span>
            <span className="stat-value stat-value--emphasis">{liveStats.uniqueIps}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Онлайн (users)</span>
            <span className="stat-value">{liveStats.activeUsers}</span>
          </div>
          {stats?.uptime_seconds !== undefined && (
            <div className="stat-card">
              <span className="stat-label">Аптайм</span>
              <span className="stat-value">{formatUptime(stats.uptime_seconds)}</span>
            </div>
          )}
        </section>
      )}

      <div className="admin-tabs">
        <button
          type="button"
          className={`admin-tab${adminView === "clients" ? " admin-tab--active" : ""}`}
          onClick={() => setAdminView("clients")}
        >
          Клиенты
        </button>
        <button
          type="button"
          className={`admin-tab${adminView === "orders" ? " admin-tab--active" : ""}`}
          onClick={() => setAdminView("orders")}
        >
          Заказы
        </button>
      </div>

      {adminView === "orders" ? (
        <OrdersSection />
      ) : (
      <section className="section">
        <div className="section-header">
          <h2>Клиенты</h2>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => setShowCreate(true)}
          >
            + Добавить
          </button>
        </div>

        <div className="filter-bar">
          <label className="filter-field">
            <span className="filter-label">Фильтр</span>
            <input
              type="search"
              className="filter-input"
              placeholder="Имя, IP или статус…"
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              aria-label="Фильтр клиентов"
            />
          </label>
          {hasFilter && (
            <>
              <span className="filter-meta">
                {filteredUsers.length} из {users.length}
              </span>
              <button
                type="button"
                className="btn btn--sm"
                onClick={() => setFilterQuery("")}
              >
                Сбросить
              </button>
            </>
          )}
        </div>

        <div className="table-wrap">
          <table className="table">
            <colgroup>
              <col className="col-name" />
              <col className="col-status" />
              <col className="col-tcp" />
              <col className="col-ips" />
              <col className="col-traffic" />
              <col className="col-actions" />
            </colgroup>
            <thead>
              <tr>
                <th className="col-name">Имя</th>
                <th className="col-status">Статус</th>
                <th className="col-tcp">TCP</th>
                <th className="col-ips">Активные IP</th>
                <th className="col-traffic">Трафик</th>
                <th className="col-actions" aria-label="Действия" />
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="empty">
                    Нет клиентов
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="empty">
                    Ничего не найдено по фильтру «{filterQuery.trim()}»
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => {
                  const isExpanded = expandedUser === user.username;
                  return (
                    <Fragment key={user.username}>
                      <tr
                        className={`table-row--clickable${isExpanded ? " table-row--expanded" : ""}`}
                        onClick={() => toggleUserRow(user.username)}
                      >
                        <td className="col-name">
                          <span className="user-name-cell mono">
                            <span className="row-chevron" aria-hidden>
                              {isExpanded ? "▾" : "▸"}
                            </span>
                            <span className="user-name-text">{user.username}</span>
                          </span>
                        </td>
                        <td className="col-status">
                          <span
                            className={`badge ${
                              user.enabled !== false ? "badge--ok" : "badge--off"
                            }`}
                          >
                            {userStatus(user)}
                          </span>
                        </td>
                        <td className="col-tcp mono tcp-sessions">
                          {user.current_connections ?? 0}
                        </td>
                        <td className="col-ips ips">
                          {(() => {
                            const ipList = user.active_unique_ips_list ?? [];
                            if (ipList.length === 0) return "—";
                            return (
                              <span className="ips-cell">{ipList.join(", ")}</span>
                            );
                          })()}
                        </td>
                        <td className="col-traffic mono">
                          {formatBytes(
                            user.total_bytes ??
                              user.total_octets ??
                              (user.bytes_up ?? 0) + (user.bytes_down ?? 0)
                          )}
                        </td>
                        <td className="col-actions">
                          <button
                            type="button"
                            className="btn btn--danger btn--sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteTarget(user.username);
                            }}
                          >
                            Удалить
                          </button>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="table-row--details">
                          <td colSpan={6}>
                            <UserRowDetails user={user} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <p className="hint hint--right">
          Обновление каждые 5 с · TCP-сессии ≠ устройства · нажмите на строку для ссылки
        </p>
      </section>
      )}

      {showCreate && (
        <CreateUserModal
          onClose={() => setShowCreate(false)}
          onCreated={refresh}
        />
      )}
      {deleteTarget && (
        <DeleteConfirmModal
          username={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={() => {
            setDeleteTarget(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

export default function App() {
  const location = useLocation();

  if (location.pathname.startsWith("/account")) {
    return (
      <Routes>
        <Route path="/account/login" element={<AccountLoginPage />} />
        <Route path="/account/register" element={<AccountRegisterPage />} />
        <Route path="/account" element={<AccountPage />} />
      </Routes>
    );
  }

  if (location.pathname.startsWith("/buy")) {
    return (
      <Routes>
        <Route path="/buy" element={<BuyPage />} />
        <Route path="/buy/success" element={<BuySuccessPage />} />
        <Route path="/buy/fail" element={<BuyFailPage />} />
      </Routes>
    );
  }

  return <AdminApp />;
}

function AdminApp() {
  const [view, setView] = useState<"loading" | "login" | "dashboard">("loading");
  const [panelUser, setPanelUser] = useState("");
  const navigate = useNavigate();

  const checkAuth = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setView("login");
      return;
    }
    try {
      const me = await api.me();
      setPanelUser(me.username);
      setView("dashboard");
    } catch {
      clearToken();
      setView("login");
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  function handleLogout() {
    clearToken();
    setPanelUser("");
    setView("login");
    navigate("/");
  }

  if (view === "loading") {
    return (
      <div className="page page--center">
        <p className="subtitle">Загрузка…</p>
      </div>
    );
  }

  if (view === "login") {
    return <LoginPage onSuccess={checkAuth} />;
  }

  return <Dashboard panelUser={panelUser} onLogout={handleLogout} />;
}
