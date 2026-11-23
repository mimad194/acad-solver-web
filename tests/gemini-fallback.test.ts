import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { callGeminiJsonWithFallback } from "@/lib/gemini-solver";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function geminiSuccessBody(title: string) {
  return {
    candidates: [
      {
        content: {
          parts: [
            {
              text: JSON.stringify({
                title,
                blocks: [{ type: "paragraph", text: "حل تجريبي صحيح" }],
              }),
            },
          ],
        },
      },
    ],
  };
}

function extractModelFromUrl(url: string): string {
  const m = url.match(/\/models\/([^:?]+):generateContent/);
  return m ? decodeURIComponent(m[1]) : "";
}

const instantSleep = async () => {};

describe("Gemini API Resilience & Multi-Model Fallback Engine", () => {
  it("falls back seamlessly to next model when primary returns 503 UNAVAILABLE", async () => {
    const called: string[] = [];
    const mockFetch: typeof fetch = async (input) => {
      const url = String(input);
      const model = extractModelFromUrl(url);
      called.push(model);
      if (model === "gemini-4-hydrogen") {
        return jsonResponse(
          { error: { code: 503, message: "This model is currently experiencing high demand.", status: "UNAVAILABLE" } },
          503
        );
      }
      if (model === "gemini-3.8-flash") {
        return jsonResponse(geminiSuccessBody("نجح البديل الأول"));
      }
      return jsonResponse({ error: { code: 404, message: "not found" } }, 404);
    };

    const res = await callGeminiJsonWithFallback({
      apiKey: "test-key",
      systemText: "sys",
      userParts: [{ text: "prompt" }],
      preferredModel: "gemini-4-hydrogen",
      fetchImpl: mockFetch,
      sleepImpl: instantSleep,
    });

    assert.equal(res.usedModel, "gemini-3.8-flash");
    assert.equal(res.parsed.title, "نجح البديل الأول");
    assert.deepEqual(called, ["gemini-4-hydrogen", "gemini-3.8-flash"]);
  });

  it("discovers live healthy models from /v1beta/models when primary models all return 503", async () => {
    const called: string[] = [];
    let discoveredCalled = false;

    const mockFetch: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes("/v1beta/models?")) {
        discoveredCalled = true;
        return jsonResponse({
          models: [
            { name: "models/gemini-4-hydrogen", displayName: "Gemini 4 Hydrogen", supportedGenerationMethods: ["generateContent"] },
            { name: "models/gemini-3.8-flash", displayName: "Gemini 3.8 Flash", supportedGenerationMethods: ["generateContent"] },
            { name: "models/text-embedding-004", displayName: "Embedding", supportedGenerationMethods: ["embedContent"] },
            { name: "models/gemini-2.5-flash-tts", displayName: "TTS", supportedGenerationMethods: ["generateContent"] },
            { name: "models/gemini-2.5-pro", displayName: "Gemini 2.5 Pro", supportedGenerationMethods: ["generateContent"] },
            { name: "models/gemini-2.5-flash", displayName: "Gemini 2.5 Flash", supportedGenerationMethods: ["generateContent"] },
          ],
        });
      }

      const model = extractModelFromUrl(url);
      called.push(model);
      if (model === "gemini-2.5-pro") {
        return jsonResponse(geminiSuccessBody("نجح عبر الاكتشاف التلقائي"));
      }
      return jsonResponse(
        { error: { code: 503, message: "High demand", status: "UNAVAILABLE" } },
        503
      );
    };

    const res = await callGeminiJsonWithFallback({
      apiKey: "test-key",
      systemText: "sys",
      userParts: [{ text: "prompt" }],
      preferredModel: "gemini-4-hydrogen",
      fetchImpl: mockFetch,
      sleepImpl: instantSleep,
    });

    assert.equal(discoveredCalled, true);
    assert.equal(res.usedModel, "gemini-2.5-pro");
    assert.equal(res.parsed.title, "نجح عبر الاكتشاف التلقائي");
    // Must never attempt embedding or tts models, and pruned non-live aliases!
    assert.equal(called.includes("text-embedding-004"), false);
    assert.equal(called.includes("gemini-2.5-flash-tts"), false);
    assert.deepEqual(called, ["gemini-4-hydrogen", "gemini-3.8-flash", "gemini-2.5-pro"]);
  });

  it("recovers via Pass-2 backoff retry when ALL live models suffer a brief 503 demand spike", async () => {
    const counts = new Map<string, number>();
    let sleptMs = 0;

    const mockFetch: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes("/v1beta/models?")) {
        return jsonResponse({
          models: [
            { name: "models/gemini-4-hydrogen", supportedGenerationMethods: ["generateContent"] },
            { name: "models/gemini-2.5-flash", supportedGenerationMethods: ["generateContent"] },
          ],
        });
      }
      const model = extractModelFromUrl(url);
      const n = (counts.get(model) ?? 0) + 1;
      counts.set(model, n);
      // Fail on Pass 1 for every model, succeed on Pass 2 retry!
      if (n === 1) {
        return jsonResponse({ error: { code: 503, status: "UNAVAILABLE" } }, 503);
      }
      return jsonResponse(geminiSuccessBody("نجح بعد انتهاء ذروة الضغط"));
    };

    const res = await callGeminiJsonWithFallback({
      apiKey: "test-key",
      systemText: "sys",
      userParts: [{ text: "prompt" }],
      preferredModel: "gemini-4-hydrogen",
      fetchImpl: mockFetch,
      sleepImpl: async (ms) => {
        sleptMs += ms;
      },
    });

    assert.equal(res.usedModel, "gemini-4-hydrogen");
    assert.equal(res.parsed.title, "نجح بعد انتهاء ذروة الضغط");
    assert.ok(sleptMs >= 2500);
  });

  it("skips 429 quota-exhausted models without retrying them in Pass 2 and falls back on malformed JSON", async () => {
    const called: string[] = [];
    const mockFetch: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes("/v1beta/models?")) {
        return jsonResponse({
          models: [
            { name: "models/gemini-4-hydrogen", supportedGenerationMethods: ["generateContent"] },
            { name: "models/gemini-3.8-flash", supportedGenerationMethods: ["generateContent"] },
            { name: "models/gemini-2.5-flash", supportedGenerationMethods: ["generateContent"] },
          ],
        });
      }
      const model = extractModelFromUrl(url);
      called.push(model);
      if (model === "gemini-4-hydrogen") {
        return jsonResponse({ error: { code: 429, status: "RESOURCE_EXHAUSTED" } }, 429);
      }
      if (model === "gemini-3.8-flash") {
        return jsonResponse({
          candidates: [{ content: { parts: [{ text: "{ broken truncated json" }] } }],
        });
      }
      if (model === "gemini-2.5-flash") {
        return jsonResponse(geminiSuccessBody("نجح بعد تجاوز 429 و JSON المعطوب"));
      }
      return jsonResponse({ error: { code: 404 } }, 404);
    };

    const res = await callGeminiJsonWithFallback({
      apiKey: "test-key",
      systemText: "sys",
      userParts: [{ text: "prompt" }],
      preferredModel: "gemini-4-hydrogen",
      fetchImpl: mockFetch,
      sleepImpl: instantSleep,
    });

    assert.equal(res.usedModel, "gemini-2.5-flash");
    assert.deepEqual(called, ["gemini-4-hydrogen", "gemini-3.8-flash", "gemini-2.5-flash"]);
  });

  it("fails fast on fatal 403/401 auth errors and includes per-model attempt log when all fail", async () => {
    const called: string[] = [];
    const mockFetch: typeof fetch = async (input) => {
      called.push(extractModelFromUrl(String(input)));
      return jsonResponse({ error: { code: 403, message: "API key invalid" } }, 403);
    };

    await assert.rejects(
      () =>
        callGeminiJsonWithFallback({
          apiKey: "bad-key",
          systemText: "sys",
          userParts: [{ text: "prompt" }],
          preferredModel: "gemini-4-hydrogen",
          fetchImpl: mockFetch,
          sleepImpl: instantSleep,
        }),
      /gemini-4-hydrogen:403/
    );
    // Must stop immediately on 403 without looping through other models
    assert.equal(called.length, 1);
  });
});
