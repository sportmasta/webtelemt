import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ApiError, customerApi, setCustomerToken } from "../api";

export default function AccountLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await customerApi.login(email.trim(), password);
      setCustomerToken(res.token);
      navigate("/account");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Ошибка входа");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page page--center">
      <div className="card card--narrow">
        <h1 className="title">Личный кабинет</h1>
        <p className="subtitle">Вход для покупателей</p>
        <form onSubmit={handleSubmit} className="form">
          <label className="field">
            <span>Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
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
        <p className="hint hint--center">
          Нет аккаунта?{" "}
          <Link to="/account/register" className="link-muted">
            Регистрация
          </Link>
        </p>
        <p className="hint hint--center">
          <Link to="/buy" className="link-muted">
            Купить профиль
          </Link>
        </p>
      </div>
    </div>
  );
}
