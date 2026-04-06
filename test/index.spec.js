import {
	env,
	createExecutionContext,
	waitOnExecutionContext,
} from "cloudflare:test";
import { describe, it, expect } from "vitest";
import worker from "../src/index.js";

describe("trash-talk-worker", () => {
	it("GET / returns health JSON with meta", async () => {
		const request = new Request("http://example.com/");
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(200);
		const data = /** @type {{ success: boolean; meta?: { linesPerBatch: number } }} */ (
			await response.json()
		);
		expect(data.success).toBe(true);
		expect(data.meta?.linesPerBatch).toBe(10);
	});

	it("POST /generate rejects missing players", async () => {
		const request = new Request("http://example.com/generate", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({})
		});
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(400);
		const data = /** @type {{ success: boolean }} */ (await response.json());
		expect(data.success).toBe(false);
	});

	it("POST /generate rejects mismatched history lengths", async () => {
		const request = new Request("http://example.com/generate", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				player1: "A",
				player2: "B",
				history: { player1: ["a"], player2: [] }
			})
		});
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(400);
	});

	it("unknown path returns 404", async () => {
		const request = new Request("http://example.com/nope");
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(404);
	});
});
