-- Per-line log (e.g. mirror what each client shows from the socket)
CREATE TABLE IF NOT EXISTS chat_lines (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	session_id TEXT NOT NULL,
	speaker TEXT NOT NULL,
	content TEXT NOT NULL,
	seq INTEGER NOT NULL,
	created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_chat_lines_session_seq ON chat_lines(session_id, seq);

-- One row per /generate response (optional audit / replay of AI batches)
CREATE TABLE IF NOT EXISTS generate_batches (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	session_id TEXT NOT NULL,
	batch_index INTEGER NOT NULL,
	player1_json TEXT NOT NULL,
	player2_json TEXT NOT NULL,
	created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_generate_batches_session ON generate_batches(session_id, batch_index);
