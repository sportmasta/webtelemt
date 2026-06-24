import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ApiError,
  api,
  BillingCredentials,
  BillingOrderPublic,
  getCustomerToken,
} from "../api";

export default function BuySuccessPage() {
  const [params] = useSearchParams();
  const orderId = params.get("order_id") ?? "";
  const [order, setOrder] = useState<BillingOrderPublic | null>(null);
  const [credentials, setCredentials] = useState<BillingCredentials | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const customerLoggedIn = Boolean(getCustomerToken());

  useEffect(() => {
    if (!orderId) {
      setError("Не указан номер заказа");
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function load() {
      try {
        const orderData = await api.getBillingOrder(orderId);
        if (cancelled) return;
        setOrder(orderData);

        if (orderData.status === "completed" && orderData.credentials_available) {
          const creds = await api.getBillingCredentials(orderId);
          if (!cancelled) setCredentials(creds);
        } else if (orderData.status === "pending" || orderData.status === "paid") {
          setError("Оплата обрабатывается. Обновите страницу через несколько секунд.");
        } else if (orderData.status === "failed") {
          setError("Не удалось выдать профиль. Обратитесь к администратору.");
        } else if (orderData.status === "expired") {
          setError("Время оплаты истекло. Создайте новый заказ.");
        } else if (orderData.status === "completed" && !orderData.credentials_available) {
          setError("Учётные данные уже были показаны и недоступны повторно.");
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : "Ошибка загрузки заказа");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  const showAccountCta =
    !customerLoggedIn && order?.customer_email && order.status === "completed";

  return (
    <div className="page page--center">
      <div className="card card--buy">
        <h1 className="title">Оплата прошла успешно</h1>

        {loading ? (
          <p className="hint">Загрузка…</p>
        ) : credentials ? (
          <>
            <p className="hint">
              Сохраните данные — секрет показывается <strong>только один раз</strong>.
            </p>
            <div className="credentials-box">
              <div className="credential-row">
                <span className="credential-label">Имя</span>
                <code>{credentials.username}</code>
              </div>
              <div className="credential-row">
                <span className="credential-label">Секрет</span>
                <code className="secret-box">{credentials.secret}</code>
              </div>
            </div>
          </>
        ) : (
          <p className="error">{error || "Данные недоступны"}</p>
        )}

        {showAccountCta && (
          <div className="account-cta">
            <p className="hint">
              Создайте кабинет или войдите по email <strong>{order.customer_email}</strong>, чтобы
              видеть профиль и ссылки подключения позже.
            </p>
            <div className="account-cta-actions">
              <Link to="/account/register" className="btn btn--primary btn--sm">
                Создать кабинет
              </Link>
              <Link to="/account/login" className="btn btn--sm">
                Войти
              </Link>
            </div>
          </div>
        )}

        {order && (
          <p className="hint hint--center">
            Заказ <span className="mono">{order.id.slice(0, 8)}…</span> · {order.status}
          </p>
        )}

        <p className="hint hint--center">
          <Link to="/buy" className="link-muted">
            Купить ещё
          </Link>
          {" · "}
          <Link to="/account" className="link-muted">
            Личный кабинет
          </Link>
        </p>
      </div>
    </div>
  );
}
