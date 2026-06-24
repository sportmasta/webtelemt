import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ApiError,
  CustomerOrder,
  CustomerProfile,
  TelemtUser,
  clearCustomerToken,
  customerApi,
  getCustomerToken,
} from "../api";
import { ProfileConnectionLinks } from "../components/ConnectionLinks";

function formatBytes(bytes: number | undefined): string {
  if (bytes === undefined || bytes === null) return "—";
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** i;
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
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

function userStatus(user: TelemtUser): string {
  if (user.status) return user.status;
  if (user.enabled === false) return "отключён";
  if (user.enabled === true) return "активен";
  return "—";
}

function telemtFromProfile(profile: CustomerProfile): TelemtUser | null {
  if (!profile.telemt) return null;
  const data = profile.telemt as TelemtUser;
  return { ...data, username: data.username || profile.username };
}

export default function AccountPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [profiles, setProfiles] = useState<CustomerProfile[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [expandedProfile, setExpandedProfile] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!getCustomerToken()) {
      navigate("/account/login");
      return;
    }
    try {
      const [me, ordersData, profilesData] = await Promise.all([
        customerApi.me(),
        customerApi.orders(),
        customerApi.profiles(),
      ]);
      setEmail(me.email);
      setOrders(ordersData);
      setProfiles(profilesData);
      setError("");
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        clearCustomerToken();
        navigate("/account/login");
        return;
      }
      setError(err instanceof ApiError ? err.message : "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 10000);
    return () => clearInterval(id);
  }, [refresh]);

  function handleLogout() {
    clearCustomerToken();
    navigate("/account/login");
  }

  if (loading) {
    return (
      <div className="page page--center">
        <p className="subtitle">Загрузка…</p>
      </div>
    );
  }

  return (
    <div className="page">
      <header className="header">
        <div>
          <h1 className="title title--sm">Личный кабинет</h1>
          <p className="subtitle">{email}</p>
        </div>
        <div className="header-actions">
          <Link to="/buy" className="btn btn--sm">
            Купить ещё
          </Link>
          <button type="button" className="btn" onClick={handleLogout}>
            Выйти
          </button>
        </div>
      </header>

      {error && <p className="banner banner--error">{error}</p>}

      <section className="section">
        <div className="section-header">
          <h2>Мои профили</h2>
        </div>
        {profiles.length === 0 ? (
          <p className="hint">Пока нет выданных профилей. После оплаты они появятся здесь.</p>
        ) : (
          <div className="account-profiles">
            {profiles.map((profile) => {
              const telemt = telemtFromProfile(profile);
              const isExpanded = expandedProfile === profile.username;
              return (
                <div key={profile.order_id} className="account-profile-card">
                  <button
                    type="button"
                    className={`account-profile-header${isExpanded ? " account-profile-header--open" : ""}`}
                    onClick={() =>
                      setExpandedProfile((c) => (c === profile.username ? null : profile.username))
                    }
                  >
                    <span className="mono">{profile.username}</span>
                    <span className={`badge badge--order badge--${profile.order_status}`}>
                      {orderStatusLabel(profile.order_status)}
                    </span>
                    <span className="hint">выдан {formatDate(profile.completed_at)}</span>
                    {profile.credentials_viewed && (
                      <span className="badge badge--off">секрет просмотрен</span>
                    )}
                  </button>
                  {isExpanded && (
                    <div className="account-profile-body">
                      {telemt ? (
                        <>
                          <p className="user-details-meta">
                            Статус: <strong>{userStatus(telemt)}</strong> · TCP:{" "}
                            <strong>{telemt.current_connections ?? 0}</strong> · IP:{" "}
                            <strong>
                              {(telemt.active_unique_ips_list ?? []).join(", ") || "—"}
                            </strong>{" "}
                            · Трафик:{" "}
                            <strong>
                              {formatBytes(
                                telemt.total_bytes ??
                                  telemt.total_octets ??
                                  (telemt.bytes_up ?? 0) + (telemt.bytes_down ?? 0)
                              )}
                            </strong>
                          </p>
                          <ProfileConnectionLinks user={telemt} />
                        </>
                      ) : (
                        <p className="hint">Данные Telemt временно недоступны.</p>
                      )}
                      {profile.credentials_viewed && (
                        <p className="hint">
                          Секрет был показан один раз при покупке и не может быть выдан повторно.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <p className="hint hint--right">Обновление Telemt-данных каждые 10 с</p>
      </section>

      <section className="section">
        <div className="section-header">
          <h2>История заказов</h2>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Дата</th>
                <th>Сумма</th>
                <th>Статус</th>
                <th>Username</th>
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 ? (
                <tr>
                  <td colSpan={4} className="empty">
                    Нет заказов
                  </td>
                </tr>
              ) : (
                orders.map((order) => (
                  <tr key={order.id}>
                    <td>{formatDate(order.created_at)}</td>
                    <td className="mono">{formatRub(order.amount_kopecks)}</td>
                    <td>
                      <span className={`badge badge--order badge--${order.status}`}>
                        {orderStatusLabel(order.status)}
                      </span>
                    </td>
                    <td className="mono">{order.username_issued ?? "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
