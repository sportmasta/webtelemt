import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError, api, BillingPlan } from "../api";

export default function BuyPage() {
  const [plan, setPlan] = useState<BillingPlan | null>(null);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
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

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!plan) return;
    setError("");
    setLoading(true);
    try {
      const body: { username?: string; email?: string } = {};
      const trimmed = username.trim();
      if (trimmed) body.username = trimmed;
      const mail = email.trim();
      if (mail) body.email = mail;
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
            <span>Email (необязательно)</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
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
          <Link to="/" className="link-muted">
            Вход для администратора
          </Link>
        </p>
      </div>
    </div>
  );
}
