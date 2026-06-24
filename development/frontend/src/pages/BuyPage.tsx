import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError, api, BillingPlan, customerApi, getCustomerToken } from "../api";

export default function BuyPage() {
  const [plan, setPlan] = useState<BillingPlan | null>(null);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [loggedIn, setLoggedIn] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [planLoading, setPlanLoading] = useState(true);

  useEffect(() => {
    api
      .billingPlan()
      .then(setPlan)
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : "Тариф недоступен");
      })
      .finally(() => setPlanLoading(false));
  }, []);

  useEffect(() => {
    if (!getCustomerToken()) return;
    customerApi
      .me()
      .then((me) => {
        setEmail(me.email);
        setLoggedIn(true);
      })
      .catch(() => {
        setLoggedIn(false);
      });
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!plan) return;
    if (!loggedIn && !email.trim()) {
      setError("Укажите email для привязки заказа к кабинету");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const body: { username?: string; email?: string } = {};
      const trimmed = username.trim();
      if (trimmed) body.username = trimmed;
      if (!loggedIn) {
        body.email = email.trim();
      }
      const res = await api.createBillingOrder(body);
      window.location.href = res.confirmation_url;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось создать заказ");
      setLoading(false);
    }
  }

  return (
    <div className="page page--center">
      <div className="card card--buy">
        <h1 className="title">Купить профиль</h1>
        <p className="subtitle">Разовая оплата — доступ к прокси-профилю Telemt</p>

        {planLoading ? (
          <p className="hint">Загрузка тарифа…</p>
        ) : plan ? (
          <div className="plan-box">
            <div className="plan-name">{plan.name}</div>
            <div className="plan-price">
              {plan.price_rub} <span className="plan-currency">₽</span>
            </div>
            <p className="hint">Срок: {plan.period_days} дней (информационно)</p>
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="form">
          <label className="field">
            <span>Имя пользователя (необязательно)</span>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              pattern="[A-Za-z0-9_.-]+"
              title="Буквы, цифры, _, ., -"
              placeholder="user_myname"
            />
          </label>
          <label className="field">
            <span>Email{loggedIn ? "" : " (обязательно)"}</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              readOnly={loggedIn}
              required={!loggedIn}
            />
          </label>
          {error && <p className="error">{error}</p>}
          <button
            type="submit"
            className="btn btn--primary btn--wide"
            disabled={loading || !plan}
          >
            {loading ? "Переход к оплате…" : "Оплатить"}
          </button>
        </form>

        <p className="hint hint--center">
          {loggedIn ? (
            <Link to="/account" className="link-muted">
              Личный кабинет
            </Link>
          ) : (
            <>
              <Link to="/account/login" className="link-muted">
                Личный кабинет
              </Link>
              {" · "}
              <Link to="/account/register" className="link-muted">
                Регистрация
              </Link>
            </>
          )}
        </p>
        <p className="hint hint--center">
          <Link to="/" className="link-muted">
            Вход для администратора
          </Link>
        </p>
      </div>
    </div>
  );
}
