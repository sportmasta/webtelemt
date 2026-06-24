import { Link } from "react-router-dom";

export default function BuyFailPage() {
  return (
    <div className="page page--center">
      <div className="card card--buy">
        <h1 className="title">Оплата не завершена</h1>
        <p className="subtitle">
          Платёж отменён или произошла ошибка. Средства не списаны — попробуйте снова.
        </p>
        <div className="modal-actions" style={{ justifyContent: "center" }}>
          <Link to="/buy" className="btn btn--primary">
            Вернуться к оплате
          </Link>
        </div>
      </div>
    </div>
  );
}
