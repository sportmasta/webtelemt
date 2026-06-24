import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ApiError, customerApi, setCustomerToken } from "../api";

export default function AccountRegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (password !== passwordConfirm) {
      setError("Пароли не совпадают");
      return;
    }
    if (password.length < 8) {
      setError("Пароль не менее 8 символов");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const res = await customerApi.register(email.trim(), password, passwordConfirm);
      setCustomerToken(res.token);
      navigate("/account");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Ошибка регистрации");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page page--center">
      <div className="card card--narrow">
        <h1 className="title">Регистрация</h1>
        <p className="subtitle">Создайте кабинет для доступа к заказам</p>
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
            <span>Пароль (мин. 8 символов)</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
            />
          </label>
          <label className="field">
            <span>Подтверждение пароля</span>
            <input
              type="password"
              value={passwordConfirm}
              onChange={(e) => setPasswordConfirm(e.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
            />
          </label>
          {error && <p className="error">{error}</p>}
          <button type="submit" className="btn btn--primary" disabled={loading}>
            {loading ? "Регистрация…" : "Создать кабинет"}
          </button>
        </form>
        <p className="hint hint--center">
          Уже есть аккаунт?{" "}
          <Link to="/account/login" className="link-muted">
            Войти
          </Link>
        </p>
      </div>
    </div>
  );
}
