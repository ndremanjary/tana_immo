import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createLead } from "../src/crm/crmClient.js";
import { CrmError, type Lead } from "../src/crm/types.js";
import { BASE_DELAY_MS, MAX_ATTEMPTS } from "../src/crm/constants.js";

const TOKEN = "secret-token-value";

const lead: Lead = {
  listingId: "aty-01",
  name: "Aina",
  phone: "+261340000000",
  email: "aina@example.com",
  message: "Je veux visiter.",
};

function jsonResponse(status: number, body: unknown, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers });
}

function header(init: RequestInit | undefined, name: string): string | null {
  return new Headers(init?.headers).get(name);
}

function installFetch(steps: Array<Response | Error>): {
  fetch: typeof fetch;
  calls: RequestInit[];
} {
  const calls: RequestInit[] = [];
  const fetchImpl: typeof fetch = async (_input, init) => {
    calls.push(init ?? {});
    const next = steps.shift();
    if (!next) {
      throw new Error("plus de réponses prévues");
    }
    if (next instanceof Error) {
      throw next;
    }
    return next;
  };
  return { fetch: fetchImpl, calls };
}

function clientOptions(fetchImpl: typeof fetch, sleeps: number[]) {
  return {
    token: TOKEN,
    fetch: fetchImpl,
    sleep: async (ms: number) => {
      sleeps.push(ms);
    },
  };
}

describe("createLead", () => {
  it("attend Retry-After après un 429, puis accepte le 201", async () => {
    const sleeps: number[] = [];
    const { fetch: fetchImpl, calls } = installFetch([
      jsonResponse(429, { error: "quota" }, { "retry-after": "2" }),
      jsonResponse(201, { id: "lead-1", createdAt: "2026-09-24T07:00:00.000Z" }),
    ]);

    const created = await createLead(lead, clientOptions(fetchImpl, sleeps));

    assert.deepEqual(created, { id: "lead-1", createdAt: "2026-09-24T07:00:00.000Z" });
    assert.deepEqual(sleeps, [2_000]);
    assert.equal(calls.length, 2);
    assert.equal(calls[0]?.signal instanceof AbortSignal, true);
    assert.equal(header(calls[0], "authorization"), `Bearer ${TOKEN}`);
    assert.equal(header(calls[0], "idempotency-key"), header(calls[1], "idempotency-key"));
  });

  it("abandonne après trois réponses 500, sans recopier le jeton", async () => {
    const sleeps: number[] = [];
    const { fetch: fetchImpl, calls } = installFetch([
      jsonResponse(500, { error: TOKEN }),
      jsonResponse(500, { error: TOKEN }),
      jsonResponse(500, { error: TOKEN }),
    ]);

    await assert.rejects(
      () => createLead(lead, clientOptions(fetchImpl, sleeps)),
      (error: unknown) => {
        assert.ok(error instanceof CrmError);
        assert.equal(error.status, 500);
        assert.equal(error.message.includes(TOKEN), false);
        return true;
      },
    );

    assert.equal(calls.length, MAX_ATTEMPTS);
    assert.deepEqual(sleeps, [BASE_DELAY_MS, BASE_DELAY_MS * 2]);
    assert.equal(header(calls[0], "idempotency-key"), header(calls[2], "idempotency-key"));
  });

  it("ne réessaie pas un 400", async () => {
    const sleeps: number[] = [];
    const { fetch: fetchImpl, calls } = installFetch([
      jsonResponse(400, { error: "email invalide" }),
      jsonResponse(201, { id: "lead-2", createdAt: "2026-09-24T07:00:00.000Z" }),
    ]);

    await assert.rejects(
      () => createLead(lead, clientOptions(fetchImpl, sleeps)),
      (error: unknown) => {
        assert.ok(error instanceof CrmError);
        assert.equal(error.status, 400);
        return true;
      },
    );

    assert.equal(calls.length, 1);
    assert.deepEqual(sleeps, []);
  });

  it("rejoue un timeout puis accepte le 201", async () => {
    const sleeps: number[] = [];
    const timeout = new Error("The operation was aborted due to timeout");
    timeout.name = "TimeoutError";
    const { fetch: fetchImpl, calls } = installFetch([
      timeout,
      jsonResponse(201, { id: "lead-3", createdAt: "2026-09-24T07:00:00.000Z" }),
    ]);

    const created = await createLead(lead, clientOptions(fetchImpl, sleeps));

    assert.equal(created.id, "lead-3");
    assert.equal(calls.length, 2);
    assert.deepEqual(sleeps, [BASE_DELAY_MS]);
  });
});
