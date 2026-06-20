-- Durable single-use guard for puzzle solve tokens. The Worker inserts a token's
-- jti on first use; a conflicting insert means the token was already spent
-- (replay). Rows are pruned opportunistically once past their expiry.
CREATE TABLE IF NOT EXISTS used_solve_tokens (
  jti TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_used_solve_tokens_expires_at
  ON used_solve_tokens (expires_at);
