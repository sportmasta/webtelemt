CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    amount_kopecks INTEGER NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'RUB',
    username_requested VARCHAR(64),
    username_issued VARCHAR(64),
    yookassa_payment_id VARCHAR(64),
    customer_email VARCHAR(255),
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    paid_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    credentials_viewed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_orders_yookassa_payment_id ON orders (yookassa_payment_id);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders (status);

CREATE TABLE IF NOT EXISTS order_secrets (
    order_id UUID PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
    secret_encrypted BYTEA NOT NULL
);
