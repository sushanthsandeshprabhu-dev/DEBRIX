CREATE TABLE IF NOT EXISTS debrix_schema_migrations (
  version integer PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS debrix_bookings (
  id text PRIMARY KEY,
  status text NOT NULL CHECK (status IN ('requested','assigned','picked_up','in_transit','received','processing','recovered','closed','rejected')),
  created_at timestamptz NOT NULL,
  quantity_tonnes numeric NOT NULL CHECK (quantity_tonnes>0),
  access_token_hash text,
  demo boolean NOT NULL DEFAULT false,
  payload jsonb NOT NULL,
  CHECK (payload->>'id'=id)
);
CREATE INDEX IF NOT EXISTS debrix_bookings_status_created_idx ON debrix_bookings(status,created_at DESC);

CREATE TABLE IF NOT EXISTS debrix_events (
  id text PRIMARY KEY,
  booking_id text NOT NULL REFERENCES debrix_bookings(id) ON DELETE CASCADE,
  occurred_at timestamptz NOT NULL,
  event_type text NOT NULL,
  demo boolean NOT NULL DEFAULT false,
  payload jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS debrix_events_booking_time_idx ON debrix_events(booking_id,occurred_at,id);

CREATE TABLE IF NOT EXISTS debrix_products (
  id text PRIMARY KEY,
  inventory_tonnes numeric NOT NULL CHECK (inventory_tonnes>=0),
  available boolean NOT NULL DEFAULT true,
  demo boolean NOT NULL DEFAULT false,
  payload jsonb NOT NULL,
  CHECK (payload->>'id'=id)
);

CREATE TABLE IF NOT EXISTS debrix_orders (
  id text PRIMARY KEY,
  product_id text REFERENCES debrix_products(id) ON DELETE SET NULL,
  status text NOT NULL,
  created_a¶»§q«^