function json(data, status = 200) {
	return new Response(JSON.stringify(data), {
		status,
		headers: {
			"content-type": "application/json; charset=utf-8",
			"access-control-allow-origin": "*"
		}
	});
}

function extractJson(text) {
	const s = String(text).trim();
	const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
	if (fence) return fence[1].trim();
	const start = s.indexOf("{");
	const end = s.lastIndexOf("}");
	if (start !== -1 && end > start) return s.slice(start, end + 1);
	return s;
}

/** @param {unknown} raw @param {string} fallbackName */
function normalizePlayer(raw, fallbackName) {
	if (raw == null) return { ok: false, code: "missing" };
	if (typeof raw === "string") {
		const name = raw.trim();
		if (!name) return { ok: false, code: "empty" };
		return { ok: true, name, coin: undefined, kills: undefined };
	}
	if (typeof raw === "object" && !Array.isArray(raw)) {
		const o = /** @type {{ name?: unknown; coin?: unknown; kills?: unknown }} */ (raw);
		const namePart = o.name != null ? String(o.name).trim() : "";
		let coin;
		let kills;
		if (o.coin != null) {
			const n = Number(o.coin);
			if (Number.isFinite(n)) coin = n;
		}
		if (o.kills != null) {
			const n = Number(o.kills);
			if (Number.isFinite(n)) kills = n;
		}
		if (!namePart && coin === undefined && kills === undefined) {
			return { ok: false, code: "need_name_or_stat" };
		}
		return {
			ok: true,
			name: namePart || fallbackName,
			coin,
			kills
		};
	}
	return { ok: false, code: "invalid" };
}

/** @param {{ name: string; coin?: number; kills?: number }} p */
function profileLine(p) {
	const parts = [p.name];
	if (p.kills != null) parts.push(`career kills: ${p.kills}`);
	if (p.coin != null) parts.push(`coins: ${p.coin}`);
	return parts.join(" — ");
}

/** Lines returned per /generate call; 5 post-match lines per player. */
const LINES_PER_BATCH = 5;

/** After this many pairs are consumed from the current buffer, fetch the next batch (client-side policy). */
const REFILL_AFTER_PAIRS_CONSUMED = 2;

/** @param {unknown} raw */
function parseVolleyHistory(raw) {
	if (raw == null || raw === undefined) {
		return { ok: true, p1: [], p2: [] };
	}
	if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
		return { ok: false, code: "invalid" };
	}
	const h = /** @type {{ player1?: unknown; player2?: unknown }} */ (raw);
	if (!Array.isArray(h.player1) || !Array.isArray(h.player2)) {
		return { ok: false, code: "shape" };
	}
	if (h.player1.length !== h.player2.length) {
		return { ok: false, code: "length" };
	}
	const p1 = h.player1.map((x) => String(x));
	const p2 = h.player2.map((x) => String(x));
	return { ok: true, p1, p2 };
}

/**
 * @param {string[]} p1
 * @param {string[]} p2
 * @param {string} n1
 * @param {string} n2
 */
function formatVolleyTranscript(p1, p2, n1, n2) {
	const lines = [];
	for (let i = 0; i < p1.length; i++) {
		lines.push(`${n1}: ${p1[i]}`, `${n2}: ${p2[i]}`);
	}
	return lines.join("\n");
}

/**
 * @param {any} env
 * @param {string} sessionId
 * @param {number} batchIndex
 * @param {string[]} player1
 * @param {string[]} player2
 */
async function saveGenerateBatch(env, sessionId, batchIndex, player1, player2) {
	if (!env.DB || !sessionId) return;
	await env.DB.prepare(
		`INSERT INTO generate_batches (session_id, batch_index, player1_json, player2_json) VALUES (?, ?, ?, ?)`
	)
		.bind(sessionId, batchIndex, JSON.stringify(player1), JSON.stringify(player2))
		.run();
}

/**
 * @param {any} env
 * @param {string} sessionId
 * @param {{ speaker: string; text: string; seq: number }[]} lines
 */
async function insertChatLines(env, sessionId, lines) {
	if (!env.DB) throw new Error("Database not configured");
	const stmts = lines.map((l) =>
		env.DB.prepare(
			`INSERT INTO chat_lines (session_id, speaker, content, seq) VALUES (?, ?, ?, ?)`
		).bind(sessionId, l.speaker, l.text, l.seq)
	);
	await env.DB.batch(stmts);
}

export default {
	async fetch(request, env) {
		if (request.method === "OPTIONS") {
			return new Response(null, {
				headers: {
					"access-control-allow-origin": "*",
					"access-control-allow-methods": "GET, POST, OPTIONS",
					"access-control-allow-headers": "Content-Type"
				}
			});
		}

		const url = new URL(request.url);

		if (request.method === "GET" && url.pathname === "/") {
			return json({
				success: true,
				message: "WarzoneWarrior Trash Talk AI is running",
				meta: {
					linesPerBatch: LINES_PER_BATCH,
					refillAfterPairsConsumed: REFILL_AFTER_PAIRS_CONSUMED
				}
			});
		}

		if (request.method === "GET" && url.pathname === "/chat") {
			const sessionId = (url.searchParams.get("sessionId") || "").trim();
			if (!sessionId) {
				return json({ success: false, error: "sessionId query parameter required" }, 400);
			}
			if (!env.DB) {
				return json({ success: false, error: "Database not configured" }, 503);
			}
			try {
				const { results } = await env.DB.prepare(
					`SELECT speaker, content, seq, created_at FROM chat_lines WHERE session_id = ? ORDER BY seq ASC`
				)
					.bind(sessionId)
					.all();
				return json({ success: true, sessionId, lines: results ?? [] });
			} catch (e) {
				return json(
					{ success: false, error: e instanceof Error ? e.message : "Query failed" },
					500
				);
			}
		}

		if (request.method === "POST" && url.pathname === "/chat/log") {
			try {
				const body = await request.json();
				const sessionId = (body.sessionId != null ? String(body.sessionId) : "").trim();
				if (!sessionId) {
					return json({ success: false, error: "sessionId is required" }, 400);
				}
				if (!env.DB) {
					return json({ success: false, error: "Database not configured" }, 503);
				}

				let entries = [];
				if (Array.isArray(body.lines)) {
					entries = body.lines;
				} else if (body.speaker != null && body.text != null && body.seq != null) {
					entries = [body];
				} else {
					return json(
						{
							success: false,
							error: 'Send { lines: [{ speaker, text, seq }, ...] } or single { sessionId, speaker, text, seq }'
						},
						400
					);
				}

				const normalized = [];
				for (const row of entries) {
					const speaker = row.speaker != null ? String(row.speaker).trim() : "";
					const text = row.text != null ? String(row.text) : "";
					const seq = Number(row.seq);
					if (speaker !== "player1" && speaker !== "player2") {
						return json(
							{ success: false, error: "each line.speaker must be player1 or player2" },
							400
						);
					}
					if (!text.trim()) {
						return json({ success: false, error: "each line.text must be non-empty" }, 400);
					}
					if (!Number.isFinite(seq)) {
						return json({ success: false, error: "each line.seq must be a number" }, 400);
					}
					normalized.push({ speaker, text, seq });
				}

				if (normalized.length === 0) {
					return json({ success: false, error: "no lines to insert" }, 400);
				}

				await insertChatLines(env, sessionId, normalized);
				return json({ success: true, inserted: normalized.length });
			} catch (e) {
				return json(
					{ success: false, error: e instanceof Error ? e.message : "Unknown error" },
					500
				);
			}
		}

		if (request.method === "POST" && url.pathname === "/generate") {
			try {
				if (!env.AI) {
					return json(
						{ success: false, error: "Workers AI binding missing (configure ai in wrangler)" },
						503
					);
				}
				const body = await request.json();
				const context = (body.context != null ? String(body.context) : "").trim();
				const sessionId = (body.sessionId != null ? String(body.sessionId) : "").trim();
				const batchIndex = Number.isFinite(Number(body.batchIndex))
					? Math.floor(Number(body.batchIndex))
					: 0;

				const hist = parseVolleyHistory(body.history);
				if (!hist.ok) {
					const err =
						hist.code === "length"
							? "history.player1 and history.player2 must have the same length (one pair per volley index)"
							: "history must be { player1: string[], player2: string[] } or omitted";
					return json({ success: false, error: err }, 400);
				}

				const p1 = normalizePlayer(body.player1, "Player 1");
				const p2 = normalizePlayer(body.player2, "Player 2");
				if (!p1.ok) {
					const msg =
						p1.code === "need_name_or_stat"
							? "player1 must be a non-empty string or an object with optional name, coin, kills — provide at least one of name, coin, or kills"
							: "player1 is required (string name or object with optional name, coin, kills)";
					return json({ success: false, error: msg }, 400);
				}
				if (!p2.ok) {
					const msg =
						p2.code === "need_name_or_stat"
							? "player2 must be a non-empty string or an object with optional name, coin, kills — provide at least one of name, coin, or kills"
							: "player2 is required (string name or object with optional name, coin, kills)";
					return json({ success: false, error: msg }, 400);
				}

				const profile1 = profileLine(p1);
				const profile2 = profileLine(p2);

				const priorBlock =
					hist.p1.length > 0
						? `
The following lines were already spoken earlier in this match (same volley order: ${p1.name}, then ${p2.name}, per round). Continue naturally — do not repeat them; pick up the thread and escalate.

--- transcript so far ---
${formatVolleyTranscript(hist.p1, hist.p2, p1.name, p2.name)}
--- end transcript ---
`
						: "";

				const winner = p1;
				const loser = p2;
				const winnerProfile = profile1;
				const loserProfile = profile2;

				const prompt = `
You write post-match trash talk for a WarzoneWarrior match that just ended.

Match result:
- WINNER: ${winner.name} ${winnerProfile !== winner.name ? `(${winnerProfile})` : ""}
- LOSER: ${loser.name} ${loserProfile !== loser.name ? `(${loserProfile})` : ""}

${context ? `Match context: ${context}` : ""}
${priorBlock}
Generate exactly ${LINES_PER_BATCH} lines for the winner and ${LINES_PER_BATCH} lines for the loser.

WINNER lines — voice of someone who dominated and knows it:
- Confident, self-assured, a little cocky but never desperate or over-the-top
- Analytical about the win — speaks like someone who understood the match at a deeper level than the opponent
- 2-4 sentences per line. Each line should feel like something worth screenshotting and sharing.
- Reference the match result (K/D, positioning, rotations, reads) when stats are available
- Examples of the exact tone and length to match:

  "Every move I made tonight had a reason behind it. They were reacting, I was deciding — and that's a gap you can't close in one match. Come back when the fundamentals catch up."
  "I don't celebrate after wins anymore. I just close the tab, make a note, and move on. There's nothing to celebrate when you performed exactly the way you prepared to."
  "It was never close in my head. The scoreboard caught up with how I felt from the first rotation. That's what preparation does — it turns a contest into a confirmation."
  "The gap between us isn't skill right now — it's decision speed. I decided before they aimed. I moved before they thought. That's a mental game, and you can't grind your way out of it overnight."
  "Confidence isn't about not making mistakes. It's about knowing you'll fix them before they cost you anything. Tonight I made one or two. They made the same ones, just a few seconds later."

LOSER lines — voice of someone who lost but isn't broken:
- Resilient, introspective, already focused on the comeback — not salty, not making excuses
- Honest about the loss in a way that shows self-awareness, not weakness
- 2-4 sentences per line. Each line should feel like something worth screenshotting and sharing.
- Examples of the exact tone and length to match:

  "They were better tonight and I mean that with no bitterness at all. I'm sitting here thinking about three moments that decided the whole thing — and none of them are mistakes I'll ever make again."
  "A loss only hurts if you learn nothing from it. I already know what broke and when and why. That kind of honesty is rare, and right now it's the only thing I'm taking out of this match."
  "I didn't lose because I was outworked. I lost because I was a step behind — and I felt it in real time and couldn't fix it fast enough. That feeling is a gift. Watch what I do with it."
  "They played a great match. Clean, smart, and confident from start to finish. I respect every second of it. But respect and revenge aren't opposites — and I'll be bringing both next time."
  "Not tonight. But I've been here before — down, studying, and quietly working — and every single time, the next chapter looked nothing like the last one. Tonight just wrote the setup."

Style rules (both):
- Plain everyday English — no rare words, no SAT vocab
- FPS game language is fine when natural (K/D, rotation, peek, trade, angle, etc.)
- No ".exe" jokes, no fake-tech meme lines, no hacker-movie phrases
- Never insult WarzoneWarrior the game, studio, servers, or product — only speak to the players and their in-game decisions
- No slurs, hate speech, sexual content, or real-world threats
- Do NOT prefix lines with labels — only the spoken line text in each string
- Each line must be fresh — no two lines should feel like the same thought rephrased

Output — only valid JSON, no markdown, no trailing commentary.
Keys must be exactly "player1" (winner lines) and "player2" (loser lines). Each value must be a JSON array of exactly ${LINES_PER_BATCH} strings.
`;

				const aiResponse = await env.AI.run("@cf/meta/llama-3.1-70b-instruct", {
					max_tokens: 2048,
					messages: [
						{
							role: "system",
							content: `You write post-match trash talk for WarzoneWarrior. player1 = winner (confident, analytical, self-assured), player2 = loser (resilient, introspective, comeback-focused). Each line is 2-4 sentences — the kind of thing someone would screenshot and share. Plain language, no meme-tech phrases, no ".exe" jokes. Never insult the game, studio, or product. Output only valid JSON: player1 and player2, each an array of exactly ${LINES_PER_BATCH} strings. No markdown.`
						},
						{
							role: "user",
							content: prompt
						}
					]
				});

				const rawText =
					aiResponse?.response ||
					aiResponse?.result?.response ||
					aiResponse?.output_text ||
					"";

				let parsed;
				try {
					parsed = JSON.parse(extractJson(rawText));
				} catch {
					return json(
						{
							success: false,
							error: "Model returned invalid JSON"
						},
						500
					);
				}

				if (!parsed || !Array.isArray(parsed.player1) || !Array.isArray(parsed.player2)) {
					return json(
						{
							success: false,
							error: "Unexpected response shape"
						},
						500
					);
				}

				if (
					parsed.player1.length !== LINES_PER_BATCH ||
					parsed.player2.length !== LINES_PER_BATCH
				) {
					return json(
						{
							success: false,
							error: `Expected ${LINES_PER_BATCH} lines per player`,
							got: {
								player1: parsed.player1.length,
								player2: parsed.player2.length
							}
						},
						502
					);
				}

				const playersOut = {
					player1: {
						name: p1.name,
						...(p1.kills != null ? { kills: p1.kills } : {}),
						...(p1.coin != null ? { coin: p1.coin } : {})
					},
					player2: {
						name: p2.name,
						...(p2.kills != null ? { kills: p2.kills } : {}),
						...(p2.coin != null ? { coin: p2.coin } : {})
					}
				};

				if (env.DB && sessionId) {
					try {
						await saveGenerateBatch(
							env,
							sessionId,
							batchIndex,
							parsed.player1,
							parsed.player2
						);
					} catch {
						// best-effort; generation still succeeds
					}
				}

				return json({
					success: true,
					meta: {
						linesPerBatch: LINES_PER_BATCH,
						refillAfterPairsConsumed: REFILL_AFTER_PAIRS_CONSUMED,
						batchIndex,
						sessionId: sessionId || undefined
					},
					players: playersOut,
					player1: parsed.player1,
					player2: parsed.player2
				});
			} catch (error) {
				return json(
					{
						success: false,
						error: error instanceof Error ? error.message : "Unknown error"
					},
					500
				);
			}
		}

		return json({ success: false, error: "Not found" }, 404);
	}
};