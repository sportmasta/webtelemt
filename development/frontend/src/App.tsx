import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  ApiError,
  StatsSummary,
  TelemtUser,
  api,
  clearToken,
  getToken,
  setToken,
} from "./api";

type View = "loading" | "login" | "dashboard";

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

  return (
    <div className="page">
      <header className="header">
        <div>
          <h1 className="title title--sm">WebTelemt</h1>
          <p className="subtitle">Панель управления</p>
        </div>
        <div className="header-actions">
          <span className="user-badge">{panelUser}</span>
          <button type="button" className="btn" onClick={onLogout}>
            Выйти
          </button>
        </div>
      </header>

      {error && <p className="banner banner--error">{error}</p>}

      {stats && (
        <section className="stats-grid">
          <div className="stat-card">
            <span className="stat-label">Клиентов</span>
            <span className="stat-value">{stats.total_users ?? users.length}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Подключений</span>
            <span className="stat-value">{stats.total_connections ?? "—"}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Уникальных IP</span>
            <span className="stat-value">{stats.total_unique_ips ?? "—"}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Трафик ↑</span>
            <span className="stat-value">{formatBytes(stats.bytes_up)}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Трафик ↓</span>
            <span className="stat-value">{formatBytes(stats.bytes_down)}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Аптайм</span>
            <span className="stat-value">{formatUptime(stats.uptime_seconds)}</span>
          </div>
        </section>
      )}

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

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Имя</th>
                <th>Статус</th>
                <th>Подключения</th>
                <th>Активные IP</th>
                <th>Трафик</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="empty">
                    Нет клиентов
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr key={user.username}>
                    <td className="mono">{user.username}</td>
                    <td>
                      <span
                        className={`badge ${
                          user.enabled !== false ? "badge--ok" : "badge--off"
                        }`}
                      >
                        {userStatus(user)}
                      </span>
                    </td>
                    <td>{user.current_connections ?? 0}</td>
                    <td className="ips">
                      {(user.active_unique_ips_list ?? []).length > 0
                        ? user.active_unique_ips_list!.join(", ")
                        : "—"}
                    </td>
                    <td className="mono">
                      {formatBytes(
                        user.total_bytes ??
                          (user.bytes_up ?? 0) + (user.bytes_down ?? 0)
                      )}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn btn--danger btn--sm"
                        onClick={() => setDeleteTarget(user.username)}
                      >
                        Удалить
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <p className="hint hint--right">Обновление каждые 5 секунд</p>
      </section>

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
  const [view, setView] = useState<View>("loading");
  const [panelUser, setPanelUser] = useState("");

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
