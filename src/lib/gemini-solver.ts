import crypto from "crypto";
import type {
  AcademicDiscipline,
  DocumentBlock,
  DocxThemeId,
  QualityAuditMeta,
  RefineMode,
  SolutionDocument,
  StudentOrder,
  StudyGuideMeta,
  StyleProfileId,
} from "@/types/order";
import { listOrders, readUploadedFileBuffer } from "./store";
import { findCourseLibraryEntry } from "./course-library";
import { extractProseText, pickAutoStyleAndTheme } from "./style-profiles";
import {
  buildStage1SystemPrompt,
  buildStage2AuditPrompt,
  buildStage2HumanizePrompt,
  buildSurgicalDivergencePrompt,
  detectAcademicDiscipline,
} from "./expert-prompts";
import {
  allocateUniqueDNA,
  analyzeCohortCorpus,
  buildDnaPromptBlock,
  evaluateAgainstCohort,
  summarizeDnaLabel,
} from "./uniqueness-engine";

const AUTO_DIVERGE_THRESHOLD = 18; // Safety buffer below 20% ceiling

const SUPPORTED_INLINE_MIMES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "text/plain",
  "text/csv",
]);

export const DEFAULT_MODEL_PRIORITY = [
  "gemini-4-hydrogen",
  "gemini-3.8-flash",
  "gemini-3.7-flash",
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite-preview",
  "gemini-3.1-flash-lite",
];

const MODEL_DISPLAY_PATTERNS: Record<string, string[]> = {
  "gemini-4-hydrogen": ["gemini 4 hydrogen", "gemini-4-hydrogen"],
  "gemini-3.8-flash": ["gemini 3.8 flash", "gemini-3.8-flash"],
  "gemini-3.7-flash": ["gemini 3.7 flash", "gemini-3.7-flash"],
  "gemini-3.6-flash": ["gemini 3.6 flash", "gemini-3.6-flash"],
  "gemini-3.5-flash": ["gemini 3.5 flash", "gemini-3.5-flash"],
  "gemini-3.5-flash-lite": ["gemini 3.5 flash lite", "gemini-3.5-flash-lite"],
  "gemini-3.1-flash-lite-preview": ["gemini 3.1 flash lite preview", "gemini-3.1-flash-lite-preview"],
  "gemini-3.1-flash-lite": ["gemini 3.1 flash lite", "gemini-3.1-flash-lite"],
};

const EXCLUDED_MODEL_RE =
  /embedding|imagen|-image|image-generation|veo|tts|audio|live|robotics|computer-use|aqa|learnlm|vision-only|nano/i;

function scoreDiscoveredGeminiModel(id: string): number {
  const low = id.toLowerCase();
  let score = 0;
  const verMatch = low.match(/gemini-(\d+)(?:\.(\d+))?/);
  if (verMatch) {
    score += Number(verMatch[1]) * 1000 + Number(verMatch[2] ?? 0) * 100;
  }
  if (low.includes("pro") || low.includes("hydrogen") || low.includes("argon") || low.includes("carbon") || low.includes("neon")) {
    score += 40;
  } else if (low.includes("flash") && !low.includes("lite")) {
    score += 25;
  } else if (low.includes("lite")) {
    score += 10;
  }
  if (low.includes("exp")) score -= 15;
  if (low.includes("preview")) score -= 5;
  return score;
}

async function discoverExactModelIds(
  apiKey: string,
  preferredList: string[],
  fetchImpl: typeof fetch = fetch
): Promise<string[]> {
  try {
    const res = await fetchImpl(
      `https://generativelanguage.googleapis.com/v1beta/models?pageSize=200&key=${encodeURIComponent(
        apiKey
      )}`,
      { signal: AbortSignal.timeout(12_000) }
    );
    if (!res.ok) return [];
    const data = (await res.json()) as {
      models?: Array<{
        name?: string;
        displayName?: string;
        supportedGenerationMethods?: string[];
      }>;
    };
    const usable = (data.models ?? []).filter((m) => {
      const id = (m.name ?? "").replace(/^models\//, "");
      if (!id || !id.toLowerCase().startsWith("gemini-")) return false;
      if (EXCLUDED_MODEL_RE.test(id)) return false;
      return Boolean(m.supportedGenerationMethods?.includes("generateContent"));
    });

    const matched: string[] = [];
    for (const pref of preferredList) {
      const patterns = MODEL_DISPLAY_PATTERNS[pref] ?? [
        pref.toLowerCase(),
        pref.toLowerCase().replace(/-/g, " "),
      ];
      for (const m of usable) {
        const id = (m.name ?? "").replace(/^models\//, "");
        const disp = (m.displayName ?? "").toLowerCase();
        const idLow = id.toLowerCase();
        if (
          patterns.some(
            (p) =>
              disp === p || idLow === p || disp.includes(p) || idLow.includes(p)
          )
        ) {
          if (id && !matched.includes(id)) {
            matched.push(id);
          }
        }
      }
    }

    // Append all other live Gemini generateContent models ranked by capability
    // so a 503 spike on primary models still falls back to healthy live models!
    const remaining = usable
      .map((m) => (m.name ?? "").replace(/^models\//, ""))
      .filter((id) => id && !matched.includes(id))
      .sort((a, b) => scoreDiscoveredGeminiModel(b) - scoreDiscoveredGeminiModel(a));

    return [...matched, ...remaining];
  } catch {
    return [];
  }
}

async function uploadToGeminiFilesApi(
  apiKey: string,
  buf: Buffer,
  mimeType: string,
  displayName: string
): Promise<string | null> {
  try {
    const initRes = await fetch(
      `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${encodeURIComponent(
        apiKey
      )}`,
      {
        method: "POST",
        headers: {
          "X-Goog-Upload-Protocol": "resumable",
          "X-Goog-Upload-Command": "start",
          "X-Goog-Upload-Header-Content-Length": String(buf.length),
          "X-Goog-Upload-Header-Content-Type": mimeType,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ file: { display_name: displayName } }),
      }
    );
    const uploadUrl = initRes.headers.get("x-goog-upload-url");
    if (!initRes.ok || !uploadUrl) return null;

    const upRes = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        "Content-Length": String(buf.length),
        "X-Goog-Upload-Offset": "0",
        "X-Goog-Upload-Command": "upload, finalize",
      },
      body: new Uint8Array(buf),
    });
    if (!upRes.ok) return null;
    const info = (await upRes.json()) as { file?: { uri?: string } };
    return info.file?.uri ?? null;
  } catch {
    return null;
  }
}

async function collectSiblingSnippets(order: StudentOrder): Promise<string[]> {
  try {
    const all = await listOrders();
    const normMod = order.moduleName.trim().toLowerCase();
    const siblings = all
      .filter(
        (o) =>
          o.id !== order.id &&
          o.solution &&
          o.moduleName.trim().toLowerCase() === normMod
      )
      .slice(0, 2);

    return siblings
      .map((s) => extractProseText(s.solution!).slice(0, 900).trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

async function buildOrderAttachmentParts(
  apiKey: string,
  order: StudentOrder
): Promise<Array<Record<string, unknown>>> {
  const parts: Array<Record<string, unknown>> = [];

  const contextLines = [
    `الجامعة: ${order.university || "غير محددة"}`,
    order.cycle ? `الطور: ${order.cycle === "master" ? "ماستر" : "ليسانس"}` : "",
    order.year ? `السنة/المستوى: ${order.year}` : "",
    order.domain ? `الميدان: ${order.domain}` : "",
    `التخصص والمستوى: ${order.specialty || "غير محدد"}`,
    `المقياس: ${order.moduleName}`,
    `عنوان النشاط: ${order.assignmentTitle}`,
    order.notes ? `ملاحظات الطالب: ${order.notes}` : "",
    order.exerciseText ? `\nنص التمرين المرفق:\n${order.exerciseText}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  parts.push({ text: contextLines });

  // Merge student's uploaded files with any archived Official Course Library references (zero duplication!)
  const libraryEntry = await findCourseLibraryEntry({
    cycle: order.cycle,
    year: order.year,
    specialtyId: order.specialtyId,
    moduleName: order.moduleName,
  });

  const combinedFiles: Array<{
    meta: (typeof order.files)[number];
    source: "student" | "library";
  }> = [];
  const seenKeys = new Set<string>();

  for (const f of order.files) {
    const k = f.blobUrl || `${f.category}:${f.originalName.toLowerCase()}`;
    if (!seenKeys.has(k)) {
      seenKeys.add(k);
      combinedFiles.push({ meta: f, source: "student" });
    }
  }
  for (const lf of libraryEntry?.referenceFiles ?? []) {
    const k = lf.blobUrl || `reference:${lf.originalName.toLowerCase()}`;
    if (!seenKeys.has(k)) {
      seenKeys.add(k);
      combinedFiles.push({ meta: lf, source: "library" });
    }
  }

  // Fetch & upload attachments in parallel to minimize serverless latency
  const filePartGroups = await Promise.all(
    combinedFiles.map(async ({ meta, source }): Promise<Array<Record<string, unknown>>> => {
      const buf = await readUploadedFileBuffer(meta.storedName, meta.blobUrl);
      if (!buf) return [];
      const label =
        meta.category === "exercise"
          ? `ملف أسئلة التمرين المرفق (${meta.originalName}):`
          : source === "library"
          ? `مرجع/مطبوعة رسمية من مكتبة المقياس الموحّدة (${meta.originalName}):`
          : `ملف مرجع/ملاحظات شخصية مرفق من الطالب (${meta.originalName}):`;

      if (meta.mimeType === "text/plain" || meta.mimeType === "text/csv") {
        return [{ text: `${label}\n${buf.toString("utf-8").slice(0, 60000)}` }];
      }
      if (!SUPPORTED_INLINE_MIMES.has(meta.mimeType)) return [];

      if (buf.length > 2 * 1024 * 1024) {
        const fileUri = apiKey.trim()
          ? await uploadToGeminiFilesApi(apiKey, buf, meta.mimeType, meta.originalName)
          : null;
        if (fileUri) {
          return [
            { text: label },
            { fileData: { mimeType: meta.mimeType, fileUri } },
          ];
        }
        if (buf.length <= 15 * 1024 * 1024) {
          return [
            { text: label },
            { inlineData: { mimeType: meta.mimeType, data: buf.toString("base64") } },
          ];
        }
        return [];
      }

      return [
        { text: label },
        { inlineData: { mimeType: meta.mimeType, data: buf.toString("base64") } },
      ];
    })
  );

  for (const group of filePartGroups) {
    parts.push(...group);
  }

  return parts;
}

interface RawGeminiJson {
  title?: string;
  verifiedQuestionsCount?: number;
  auditNotes?: unknown[];
  blocks?: Array<Record<string, unknown>>;
  studyGuide?: {
    summary?: string;
    keyPoints?: unknown[];
    defenseQuestions?: unknown[];
  };
}

const TRANSIENT_RETRYABLE_STATUSES = new Set([500, 502, 503, 504]);
const FALLBACK_CONTINUE_STATUSES = new Set([404, 429, 500, 502, 503, 504]);

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hasAnyConfiguredAiProvider(): boolean {
  return Boolean(
    process.env.GEMINI_API_KEY?.trim() ||
      process.env.GROQ_API_KEY?.trim() ||
      process.env.OPENROUTER_API_KEY?.trim() ||
      process.env.BACKUP_LLM_API_KEY?.trim()
  );
}

interface BackupProviderConfig {
  name: string;
  endpoint: string;
  apiKey: string;
  models: string[];
  extraHeaders?: Record<string, string>;
}

function getConfiguredBackupProviders(hasImages: boolean): BackupProviderConfig[] {
  const providers: BackupProviderConfig[] = [];

  const groqKey = process.env.GROQ_API_KEY?.trim();
  if (groqKey) {
    providers.push({
      name: "groq",
      endpoint: "https://api.groq.com/openai/v1/chat/completions",
      apiKey: groqKey,
      models: hasImages
        ? [
            "meta-llama/llama-4-scout-17b-16e-instruct",
            "llama-3.3-70b-versatile",
            "qwen/qwen3-32b",
          ]
        : [
            "llama-3.3-70b-versatile",
            "meta-llama/llama-4-scout-17b-16e-instruct",
            "qwen/qwen3-32b",
          ],
    });
  }

  const openRouterKey = process.env.OPENROUTER_API_KEY?.trim();
  if (openRouterKey) {
    providers.push({
      name: "openrouter",
      endpoint: "https://openrouter.ai/api/v1/chat/completions",
      apiKey: openRouterKey,
      models: [
        "openrouter/free",
        "meta-llama/llama-3.3-70b-instruct:free",
        "google/gemma-3-27b-it:free",
        "deepseek/deepseek-r1-0528:free",
      ],
      extraHeaders: {
        "HTTP-Referer": "https://acad-solver-web.vercel.app",
        "X-Title": "Acad-Solver UFC",
      },
    });
  }

  const customKey = process.env.BACKUP_LLM_API_KEY?.trim();
  const customBase = process.env.BACKUP_LLM_BASE_URL?.trim();
  const customModel = process.env.BACKUP_LLM_MODEL?.trim();
  if (customKey && customBase && customModel) {
    const cleanBase = customBase.replace(/\/+$/, "");
    providers.push({
      name: "backup",
      endpoint: cleanBase.endsWith("/chat/completions")
        ? cleanBase
        : `${cleanBase}/chat/completions`,
      apiKey: customKey,
      models: customModel
        .split(",")
        .map((m) => m.trim())
        .filter(Boolean),
    });
  }

  return providers;
}

function convertPartsForOpenAiCompatible(
  userParts: Array<Record<string, unknown>>,
  includeImages: boolean
): { content: string | Array<Record<string, unknown>>; hasImages: boolean } {
  const textChunks: string[] = [];
  const imageDataUrls: string[] = [];
  let pdfCount = 0;

  for (const part of userParts) {
    if (typeof part.text === "string" && part.text.trim()) {
      textChunks.push(part.text);
      continue;
    }
    const inline = part.inlineData as { mimeType?: string; data?: string } | undefined;
    if (inline?.mimeType && inline?.data) {
      if (inline.mimeType.startsWith("image/")) {
        imageDataUrls.push(`data:${inline.mimeType};base64,${inline.data}`);
      } else if (inline.mimeType === "application/pdf") {
        pdfCount++;
      }
      continue;
    }
    if (part.fileData) {
      pdfCount++;
    }
  }

  if (pdfCount > 0) {
    textChunks.push(
      `[ملاحظة للنظام الاحتياطي: يوجد ${pdfCount} ملف PDF مرفق، اعتمد على النص والبيانات المتاحة أعلاه بأقصى دقة أكاديمية.]`
    );
  }

  const combinedText = textChunks.join("\n\n").slice(0, 90_000);
  if (includeImages && imageDataUrls.length > 0) {
    return {
      hasImages: true,
      content: [
        { type: "text", text: combinedText },
        ...imageDataUrls.slice(0, 4).map((url) => ({
          type: "image_url",
          image_url: { url },
        })),
      ],
    };
  }

  return { hasImages: imageDataUrls.length > 0, content: combinedText };
}

async function callBackupProvidersJson(params: {
  systemText: string;
  userParts: Array<Record<string, unknown>>;
  temperature: number;
  deadline: number;
  perAttemptTimeoutMs: number;
  attempts: string[];
  fetchImpl: typeof fetch;
}): Promise<{ parsed: RawGeminiJson; usedModel: string } | null> {
  const {
    systemText,
    userParts,
    temperature,
    deadline,
    perAttemptTimeoutMs,
    attempts,
    fetchImpl,
  } = params;

  const probe = convertPartsForOpenAiCompatible(userParts, false);
  const providers = getConfiguredBackupProviders(probe.hasImages);
  if (providers.length === 0) return null;

  const strictJsonSystem = `${systemText}\n\nIMPORTANT: Return ONLY a single valid JSON object matching the exact schema requested. Do not wrap in markdown or add prose outside the JSON.`;

  for (const provider of providers) {
    for (const model of provider.models) {
      const remainingMs = deadline - Date.now();
      if (remainingMs <= 5_000) return null;

      const supportsVision =
        provider.name === "openrouter" ||
        /vision|scout|maverick|gemma-3|gpt-4o|claude|gemini/i.test(model);

      // Try once with images (if vision-capable) + json_object; if 400, retry text-only without response_format
      const modes: Array<{ withImages: boolean; withJsonFormat: boolean }> =
        supportsVision && probe.hasImages
          ? [
              { withImages: true, withJsonFormat: true },
              { withImages: false, withJsonFormat: false },
            ]
          : [
              { withImages: false, withJsonFormat: true },
              { withImages: false, withJsonFormat: false },
            ];

      for (const mode of modes) {
        const rem = deadline - Date.now();
        if (rem <= 4_000) return null;

        const converted = convertPartsForOpenAiCompatible(userParts, mode.withImages);
        const body: Record<string, unknown> = {
          model,
          temperature,
          max_tokens: 8192,
          messages: [
            { role: "system", content: strictJsonSystem },
            { role: "user", content: converted.content },
          ],
        };
        if (mode.withJsonFormat) {
          body.response_format = { type: "json_object" };
        }

        let res: Response;
        try {
          res = await fetchImpl(provider.endpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${provider.apiKey}`,
              ...(provider.extraHeaders ?? {}),
            },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(Math.min(perAttemptTimeoutMs, Math.max(5_000, rem - 1_500))),
          });
        } catch {
          attempts.push(`${provider.name}/${model}:timeout`);
          break;
        }

        if (!res.ok) {
          attempts.push(`${provider.name}/${model}:${res.status}`);
          // Only retry the simplified payload on 400 (unsupported json_object/vision param)
          if (res.status === 400 && (mode.withJsonFormat || mode.withImages)) {
            continue;
          }
          break;
        }

        try {
          const data = (await res.json()) as {
            choices?: Array<{ message?: { content?: string } }>;
          };
          const rawText = data.choices?.[0]?.message?.content;
          if (!rawText) {
            attempts.push(`${provider.name}/${model}:empty`);
            break;
          }
          const parsed = safeParseGeminiJson(rawText);
          attempts.push(`${provider.name}/${model}:200`);
          return { parsed, usedModel: `${provider.name}/${model}` };
        } catch {
          attempts.push(`${provider.name}/${model}:bad_json`);
          break;
        }
      }
    }
  }

  return null;
}

export async function callGeminiJsonWithFallback(params: {
  apiKey: string;
  systemText: string;
  userParts: Array<Record<string, unknown>>;
  preferredModel?: string;
  temperature?: number;
  fetchImpl?: typeof fetch;
  sleepImpl?: (ms: number) => Promise<void>;
  totalBudgetMs?: number;
  perAttemptTimeoutMs?: number;
}): Promise<{ parsed: RawGeminiJson; usedModel: string; attempts: string[] }> {
  const {
    apiKey,
    systemText,
    userParts,
    preferredModel,
    temperature = 0.4,
    fetchImpl = fetch,
    sleepImpl = defaultSleep,
    totalBudgetMs = 240_000,
    perAttemptTimeoutMs = 65_000,
  } = params;

  const firstChoice =
    preferredModel?.trim() ||
    process.env.GEMINI_MODEL?.trim() ||
    "gemini-4-hydrogen";

  const requestPayload = JSON.stringify({
    systemInstruction: {
      parts: [{ text: systemText }],
    },
    contents: [{ role: "user", parts: userParts }],
    generationConfig: {
      temperature,
      maxOutputTokens: 16384,
      responseMimeType: "application/json",
    },
  });

  const candidateModels = Array.from(
    new Set([firstChoice, ...DEFAULT_MODEL_PRIORITY])
  );
  const deadline = Date.now() + totalBudgetMs;
  const attempts: string[] = [];
  const transientCandidates: string[] = [];
  let discoveredOnce = false;
  let lastStatus = 500;
  let lastErrorText = "";
  let geminiFatal = false;

  const tryModelOnce = async (
    modelName: string
  ): Promise<
    | { ok: true; parsed: RawGeminiJson; usedModel: string }
    | { ok: false; status: number; fatal: boolean; transient: boolean; errorText: string }
  > => {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 3_000) {
      return {
        ok: false,
        status: 504,
        fatal: true,
        transient: false,
        errorText: "تجاوز وقت المعالجة الإجمالي الحد الأقصى للخادم.",
      };
    }

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      modelName
    )}:generateContent?key=${encodeURIComponent(apiKey)}`;

    let response: Response;
    try {
      const timeoutMs = Math.min(perAttemptTimeoutMs, Math.max(5_000, remainingMs - 1_500));
      response = await fetchImpl(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: requestPayload,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Timeout waiting for Gemini";
      attempts.push(`${modelName}:timeout`);
      return { ok: false, status: 504, fatal: false, transient: true, errorText: msg };
    }

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      attempts.push(`${modelName}:${response.status}`);
      const canFallback = FALLBACK_CONTINUE_STATUSES.has(response.status);
      return {
        ok: false,
        status: response.status,
        fatal: !canFallback,
        transient: TRANSIENT_RETRYABLE_STATUSES.has(response.status),
        errorText: errText,
      };
    }

    let payload: {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    try {
      payload = (await response.json()) as typeof payload;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Invalid HTTP JSON body";
      attempts.push(`${modelName}:bad_body`);
      return { ok: false, status: 502, fatal: false, transient: true, errorText: msg };
    }

    const rawText = payload.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) {
      attempts.push(`${modelName}:empty`);
      return {
        ok: false,
        status: 502,
        fatal: false,
        transient: true,
        errorText: "لم يُرجع النموذج محتوى نصياً.",
      };
    }

    try {
      const parsed = safeParseGeminiJson(rawText);
      attempts.push(`${modelName}:200`);
      return { ok: true, parsed, usedModel: modelName };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Malformed JSON response";
      attempts.push(`${modelName}:bad_json`);
      return { ok: false, status: 502, fatal: false, transient: true, errorText: msg };
    }
  };

  if (apiKey.trim()) {
    // Pass 1: Walk quality-first chain + dynamically discover any other live Gemini models on 404/503/429
    for (let i = 0; i < candidateModels.length; i++) {
      const modelName = candidateModels[i];
      const res = await tryModelOnce(modelName);
      if (res.ok) {
        return { parsed: res.parsed, usedModel: res.usedModel, attempts };
      }

      lastStatus = res.status;
      lastErrorText = res.errorText;

      if (res.transient && !transientCandidates.includes(modelName)) {
        transientCandidates.push(modelName);
      }

      if (res.fatal) {
        geminiFatal = true;
        break;
      }

      // Trigger live model discovery from /v1beta/models once whenever a model 404s OR
      // once our first 2 primary candidates fail with 503/429.
      // Prioritize LIVE discovered models immediately next and prune unvisited non-existent aliases!
      if (!discoveredOnce && (res.status === 404 || i >= 1)) {
        discoveredOnce = true;
        const discovered = await discoverExactModelIds(
          apiKey,
          [firstChoice, ...DEFAULT_MODEL_PRIORITY],
          fetchImpl
        );
        if (discovered.length > 0) {
          const triedSet = new Set(candidateModels.slice(0, i + 1));
          const liveNext = discovered.filter((id) => !triedSet.has(id));
          candidateModels.splice(i + 1, candidateModels.length - (i + 1), ...liveNext);
        }
      }
    }

    // Pass 2: Resilience retry wave with backoff for transient 503/5xx spikes
    if (!geminiFatal && transientCandidates.length > 0 && deadline - Date.now() > 15_000) {
      await sleepImpl(2_500);
      for (const modelName of transientCandidates.slice(0, 3)) {
        if (deadline - Date.now() <= 5_000) break;
        const res = await tryModelOnce(modelName);
        if (res.ok) {
          return { parsed: res.parsed, usedModel: res.usedModel, attempts };
        }
        lastStatus = res.status;
        lastErrorText = res.errorText;
        if (res.fatal) break;
        await sleepImpl(1_500);
      }
    }
  }

  // Pass 3: Zero-dollar Multi-Provider Automatic Failover (Groq -> OpenRouter -> Custom Backup)
  // Triggered whenever ALL Gemini models are overloaded (503/429) or GEMINI_API_KEY is not set!
  if (!geminiFatal || !apiKey.trim()) {
    const backup = await callBackupProvidersJson({
      systemText,
      userParts,
      temperature,
      deadline,
      perAttemptTimeoutMs,
      attempts,
      fetchImpl,
    });
    if (backup) {
      return { parsed: backup.parsed, usedModel: backup.usedModel, attempts };
    }
  }

  const summary = attempts.slice(0, 14).join(" ← ");
  const hasBackupConfigured = Boolean(
    process.env.GROQ_API_KEY?.trim() ||
      process.env.OPENROUTER_API_KEY?.trim() ||
      process.env.BACKUP_LLM_API_KEY?.trim()
  );
  const hint =
    lastStatus === 503 && !hasBackupConfigured
      ? " (ملاحظة: جميع نماذج Gemini المجانية تشهد ذروة ضغط مؤقتة من خوادم Google حالياً — أضف مفتاح GROQ_API_KEY أو OPENROUTER_API_KEY المجاني في Vercel للتبديل الفوري دون توقف)."
      : "";
  throw new Error(
    `فشل الاتصال بـ Gemini API (${lastStatus}) بعد تجربة [${summary}]: ${lastErrorText.slice(0, 220)}${hint}`
  );
}

const LATEX_ESCAPE_COLLISION_RE =
  /^(?:beta|bar|binom|big|bigg|bm|bf|boxed|bullet|frac|forall|flat|times|text|textbf|textit|theta|tilde|tau|to|top|triangle|rho|right|rangle|rightarrow|Rightarrow|neq|nu|nabla|not|norm|ni)(?![a-zA-Z])/;

function repairJsonEscapes(input: string): string {
  let out = "";
  let inString = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (!inString) {
      if (ch === '"') inString = true;
      out += ch;
      continue;
    }

    if (ch === '"') {
      inString = false;
      out += ch;
      continue;
    }

    if (ch === "\n") {
      out += "\\n";
      continue;
    }
    if (ch === "\r") {
      out += "\\r";
      continue;
    }
    if (ch === "\t") {
      out += "\\t";
      continue;
    }

    if (ch === "\\") {
      const next = input[i + 1];
      if (next === undefined) {
        out += "\\\\";
        continue;
      }
      if (next === "\\") {
        out += "\\\\";
        i++;
        continue;
      }
      if (next === '"' || next === "/") {
        out += "\\" + next;
        i++;
        continue;
      }
      if (next === "u" && /^[0-9a-fA-F]{4}$/.test(input.slice(i + 2, i + 6))) {
        out += input.slice(i, i + 6);
        i += 5;
        continue;
      }
      if (
        next === "b" ||
        next === "f" ||
        next === "n" ||
        next === "r" ||
        next === "t"
      ) {
        const ahead = input.slice(i + 1, i + 16);
        if (LATEX_ESCAPE_COLLISION_RE.test(ahead)) {
          out += "\\\\" + next;
        } else {
          out += "\\" + next;
        }
        i++;
        continue;
      }
      // Any other \X inside JSON string (e.g. \sum, \hat, \approx, \%, \{, \_) is invalid JSON -> double-escape it
      out += "\\\\" + next;
      i++;
      continue;
    }

    const code = ch.charCodeAt(0);
    if (code < 0x20) {
      out += `\\u${code.toString(16).padStart(4, "0")}`;
      continue;
    }

    out += ch;
  }
  return out;
}

function safeParseGeminiJson(rawText: string): RawGeminiJson {
  let cleaned = rawText
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }

  // Always run LaTeX-aware escape repair so both invalid escapes (\sum, \hat, \%)
  // and silently corrupted LaTeX escapes (\frac, \beta, \times, \bar) are fixed safely.
  const repaired = repairJsonEscapes(cleaned);
  try {
    return JSON.parse(repaired) as RawGeminiJson;
  } catch {
    // Secondary fallback: strip trailing commas before } or ]
    const noTrailingCommas = repaired.replace(/,\s*([}\]])/g, "$1");
    try {
      return JSON.parse(noTrailingCommas) as RawGeminiJson;
    } catch {
      // Last attempt: raw JSON.parse in case original was valid
      return JSON.parse(cleaned) as RawGeminiJson;
    }
  }
}

function normalizeBlocks(rawBlocks?: Array<Record<string, unknown>>): DocumentBlock[] {
  return (rawBlocks ?? []).map((b) => {
    const id = crypto.randomUUID();
    const type = String(b.type ?? "paragraph");
    if (type === "equation") {
      return {
        id,
        type: "equation",
        latex: String(b.latex ?? ""),
        callout: Boolean(b.callout),
      };
    }
    if (type === "table") {
      return {
        id,
        type: "table",
        caption: b.caption ? String(b.caption) : undefined,
        headers: Array.isArray(b.headers) ? b.headers.map(String) : [],
        rows: Array.isArray(b.rows)
          ? b.rows.map((r) => (Array.isArray(r) ? r.map(String) : []))
          : [],
        hasTotalRow: Boolean(b.hasTotalRow),
      };
    }
    if (
      type === "doc_title" ||
      type === "exercise_heading" ||
      type === "question_heading" ||
      type === "sub_heading" ||
      type === "bullet"
    ) {
      return { id, type, text: String(b.text ?? "") };
    }
    return { id, type: "paragraph", text: String(b.text ?? "") };
  });
}

function normalizeStudyGuide(
  raw?: RawGeminiJson["studyGuide"],
  fallback?: StudyGuideMeta
): StudyGuideMeta | undefined {
  if (!raw || (!raw.summary && !raw.keyPoints?.length && !raw.defenseQuestions?.length)) {
    return fallback;
  }
  return {
    summary: String(raw.summary ?? fallback?.summary ?? "").trim(),
    keyPoints: Array.isArray(raw.keyPoints)
      ? raw.keyPoints.map((x) => String(x).trim()).filter(Boolean).slice(0, 6)
      : fallback?.keyPoints ?? [],
    defenseQuestions: Array.isArray(raw.defenseQuestions)
      ? raw.defenseQuestions.map((x) => String(x).trim()).filter(Boolean).slice(0, 5)
      : fallback?.defenseQuestions ?? [],
  };
}

function stripBlockIds(blocks: DocumentBlock[]): Array<Record<string, unknown>> {
  return blocks.map((b) => {
    const copy = { ...b } as Record<string, unknown>;
    delete copy.id;
    return copy;
  });
}

async function listPeersForModule(order: StudentOrder): Promise<StudentOrder[]> {
  try {
    const all = await listOrders();
    const normMod = order.moduleName.trim().toLowerCase();
    return all.filter((o) => {
      if (o.id === order.id || o.solution === null) return false;
      if (o.moduleName.trim().toLowerCase() !== normMod) return false;
      if (order.cycle && o.cycle && order.cycle !== o.cycle) return false;
      if (order.year && o.year && order.year !== o.year) return false;
      if (order.specialtyId && o.specialtyId && order.specialtyId !== o.specialtyId) {
        return false;
      }
      return true;
    });
  } catch {
    return [];
  }
}

export interface GenerateOptions {
  extraInstruction?: string;
  preferredModel?: string;
  styleProfile?: StyleProfileId;
  docxTheme?: DocxThemeId;
  discipline?: AcademicDiscipline;
}

export async function generateSolutionWithGemini(
  order: StudentOrder,
  options: GenerateOptions = {}
): Promise<{ solution: SolutionDocument; usedModel: string }> {
  const apiKey = process.env.GEMINI_API_KEY?.trim() ?? "";
  if (!hasAnyConfiguredAiProvider()) {
    throw new Error(
      "لم يتم ضبط مفتاح GEMINI_API_KEY (أو GROQ_API_KEY / OPENROUTER_API_KEY) في إعدادات البيئة."
    );
  }

  const auto = pickAutoStyleAndTheme(`${order.id}-${order.trackingCode}`);
  const chosenStyle: StyleProfileId = options.styleProfile ?? auto.styleProfile;
  const chosenTheme: DocxThemeId = options.docxTheme ?? auto.docxTheme;
  const resolvedDiscipline = detectAcademicDiscipline(order, options.discipline);

  const [peers, parts] = await Promise.all([
    listPeersForModule(order),
    buildOrderAttachmentParts(apiKey, order),
  ]);

  const corpus = analyzeCohortCorpus(peers);
  const dna = allocateUniqueDNA(
    `${order.id}-${order.trackingCode}-${order.studentName}`,
    corpus.usedProseSignatures,
    corpus.usedVisualSignatures
  );

  parts.push({
    text: "قم الآن بحل التمرين كاملا بكل تفاصيله وجداوله الوسيطة وتحليلاته العميقة وفق بروتوكول التخصص والبصمة المنهجية الخاصة بهذا الطالب، مع توليد studyGuide للطالب، وأعد JSON المهيكَل فقط.",
  });

  const systemText = buildStage1SystemPrompt({
    order,
    styleId: chosenStyle,
    discipline: resolvedDiscipline,
    dna,
    hotCohortPhrases: corpus.hotCohortPhrases,
    siblingSnippets: corpus.recentOpenings,
    extraInstruction: options.extraInstruction,
  });

  const { parsed, usedModel } = await callGeminiJsonWithFallback({
    apiKey,
    systemText,
    userParts: parts,
    preferredModel: options.preferredModel,
    temperature: 0.48,
  });

  const blocks = normalizeBlocks(parsed.blocks);
  const qualityMeta: QualityAuditMeta = {
    discipline: resolvedDiscipline,
    auditPassApplied: false,
    humanizedPassApplied: false,
    autoDivergenceApplied: false,
    dnaLabel: summarizeDnaLabel(dna),
    verifiedQuestionsCount:
      typeof parsed.verifiedQuestionsCount === "number"
        ? parsed.verifiedQuestionsCount
        : undefined,
    auditNotes: [],
    studyGuide: normalizeStudyGuide(parsed.studyGuide),
  };

  let solution: SolutionDocument = {
    title: parsed.title || `حل ${order.assignmentTitle}`,
    includeCoverPage: order.includeCoverPage,
    styleProfile: chosenStyle,
    docxTheme: chosenTheme,
    dna,
    qualityMeta,
    coverMeta: {
      university: order.university,
      specialty: order.specialty,
      moduleName: order.moduleName,
      studentName: order.studentName,
      academicYear: "2026 / 2027",
    },
    blocks,
    updatedAt: new Date().toISOString(),
  };

  // Closed-Loop Auto-Divergence Guard (< 20% ceiling across ALL cohort peers!)
  if (peers.length > 0) {
    const simBefore = evaluateAgainstCohort(solution, peers);
    solution.qualityMeta!.cohortMaxSimilarity = simBefore.maxSimilarity;

    if (
      simBefore.maxSimilarity >= AUTO_DIVERGE_THRESHOLD &&
      simBefore.topSharedPhrases.length > 0
    ) {
      try {
        const divergeSystem = buildSurgicalDivergencePrompt({
          dna,
          sharedPhrases: simBefore.topSharedPhrases,
          hotCohortPhrases: corpus.hotCohortPhrases,
          extraInstruction: options.extraInstruction,
        });
        const draftJson = JSON.stringify({
          title: solution.title,
          blocks: stripBlockIds(solution.blocks),
          studyGuide: solution.qualityMeta?.studyGuide,
        });
        const divRes = await callGeminiJsonWithFallback({
          apiKey,
          systemText: divergeSystem,
          userParts: [
            {
              text: `المقياس: ${order.moduleName} | النشاط: ${order.assignmentTitle}\n\nالوثيقة المطلوب فك تشابهها جراحيا مع إبقاء كافة المعادلات والأرقام والجداول مطابقة 100%:\n${draftJson}`,
            },
          ],
          preferredModel: options.preferredModel,
          temperature: 0.65,
        });
        if (divRes.parsed.blocks && divRes.parsed.blocks.length > 0) {
          const candidate: SolutionDocument = {
            ...solution,
            title: divRes.parsed.title || solution.title,
            blocks: normalizeBlocks(divRes.parsed.blocks),
            updatedAt: new Date().toISOString(),
          };
          const simAfter = evaluateAgainstCohort(candidate, peers);
          if (simAfter.maxSimilarity < simBefore.maxSimilarity) {
            solution = {
              ...candidate,
              qualityMeta: {
                ...solution.qualityMeta!,
                autoDivergenceApplied: true,
                cohortMaxSimilarity: simAfter.maxSimilarity,
                studyGuide: normalizeStudyGuide(
                  divRes.parsed.studyGuide,
                  solution.qualityMeta?.studyGuide
                ),
                auditNotes: [
                  `تم تفعيل فك التشابه الآلي للدفعة: انخفض التشابه من ${simBefore.maxSimilarity}% إلى ${simAfter.maxSimilarity}%.`,
                ],
              },
            };
          }
        }
      } catch {
        // Non-fatal: keep valid Stage-1 solution if divergence pass fails
      }
    }
  }

  return { solution, usedModel };
}

export interface RefineOptions {
  mode: RefineMode;
  extraInstruction?: string;
  preferredModel?: string;
  styleProfile?: StyleProfileId;
  discipline?: AcademicDiscipline;
}

export async function refineSolutionWithGemini(
  order: StudentOrder,
  options: RefineOptions
): Promise<{ solution: SolutionDocument; usedModel: string; auditNotes: string[] }> {
  const apiKey = process.env.GEMINI_API_KEY?.trim() ?? "";
  if (!hasAnyConfiguredAiProvider()) {
    throw new Error("لم يتم ضبط مفتاح الذكاء الاصطناعي في إعدادات البيئة.");
  }
  if (!order.solution) {
    throw new Error("لا توجد مسودة حل حالية لتدقيقها أو تحسينها.");
  }

  const current = order.solution;
  const chosenStyle: StyleProfileId =
    options.styleProfile ??
    current.styleProfile ??
    pickAutoStyleAndTheme(`${order.id}-${order.trackingCode}`).styleProfile;
  const resolvedDiscipline = detectAcademicDiscipline(
    order,
    options.discipline ?? current.qualityMeta?.discipline
  );

  const peers = await listPeersForModule(order);
  const corpus = analyzeCohortCorpus(peers);
  const dna =
    options.mode === "surgical_diverge"
      ? allocateUniqueDNA(
          `${order.id}-${Date.now()}`,
          corpus.usedProseSignatures,
          corpus.usedVisualSignatures
        )
      : current.dna ??
        allocateUniqueDNA(
          `${order.id}-${order.trackingCode}`,
          corpus.usedProseSignatures,
          corpus.usedVisualSignatures
        );

  const currentDraftJson = JSON.stringify({
    title: current.title,
    blocks: stripBlockIds(current.blocks),
    studyGuide: current.qualityMeta?.studyGuide,
  });

  let systemText = "";
  let userParts: Array<Record<string, unknown>> = [];
  let temperature = 0.35;
  let simBeforeVal: number | undefined;

  if (options.mode === "deepen_and_audit") {
    systemText = buildStage2AuditPrompt({
      order,
      styleId: chosenStyle,
      discipline: resolvedDiscipline,
      extraInstruction: options.extraInstruction,
    });
    userParts = await buildOrderAttachmentParts(apiKey, order);
    userParts.push({
      text: `مسودة الحل الحالية (المرحلة الأولى) المطلوب تدقيقها حسابيا ومنهجيا وتعميقها ومقارنتها بملفات التمرين والمراجع أعلاه:\n${currentDraftJson}`,
    });
    temperature = 0.28;
  } else if (options.mode === "surgical_diverge") {
    const simBefore = evaluateAgainstCohort(current, peers);
    simBeforeVal = simBefore.maxSimilarity;
    systemText = buildSurgicalDivergencePrompt({
      dna,
      sharedPhrases:
        simBefore.topSharedPhrases.length > 0
          ? simBefore.topSharedPhrases
          : corpus.hotCohortPhrases,
      hotCohortPhrases: corpus.hotCohortPhrases,
      extraInstruction: options.extraInstruction,
    });
    userParts = [
      {
        text: `المقياس: ${order.moduleName} | النشاط: ${order.assignmentTitle}\n\nوثيقة الحل الحالية (أعد صياغة العبارات المتقاطعة مع الدفعة بأسلوب مستقل مع تثبيت كافة المعادلات والأرقام والجداول 100%):\n${currentDraftJson}`,
      },
    ];
    temperature = 0.68;
  } else if (options.mode === "humanize_academic") {
    const siblingSnippets = await collectSiblingSnippets(order);
    systemText = buildStage2HumanizePrompt({
      styleId: chosenStyle,
      siblingSnippets:
        corpus.recentOpenings.length > 0 ? corpus.recentOpenings : siblingSnippets,
      extraInstruction: options.extraInstruction,
    });
    userParts = [
      {
        text: `المقياس: ${order.moduleName} | النشاط: ${order.assignmentTitle}\n\nوثيقة الحل الحالية (أعد صياغة النثر بأسلوب بشري أكاديمي طبيعي مع تثبيت جميع الأرقام والمعادلات والجداول 100%):\n${currentDraftJson}`,
      },
    ];
    temperature = 0.6;
  } else {
    systemText = `أنت أستاذ مؤطر تعدّ "دليل فهم ومناقشة سريعة" (studyGuide) لطالب ماستر بناء على حل النشاط المعتمد، ليفهم الطالب منهجية الحل والقوانين المستعملة ويستعد لأسئلة الأستاذ الشفوية. أعد JSON فقط بالشكل: { "studyGuide": { "summary": "...", "keyPoints": ["..."], "defenseQuestions": ["..."] } }`;
    userParts = [
      {
        text: `المقياس: ${order.moduleName} | النشاط: ${order.assignmentTitle}\n\nالحل المعتمد:\n${currentDraftJson}`,
      },
    ];
    temperature = 0.4;
  }

  const { parsed, usedModel } = await callGeminiJsonWithFallback({
    apiKey,
    systemText,
    userParts,
    preferredModel: options.preferredModel,
    temperature,
  });

  const newNotes = Array.isArray(parsed.auditNotes)
    ? parsed.auditNotes.map((n) => String(n).trim()).filter(Boolean)
    : [];

  const updatedBlocks =
    options.mode === "enrich_study_guide"
      ? current.blocks
      : parsed.blocks && parsed.blocks.length > 0
      ? normalizeBlocks(parsed.blocks)
      : current.blocks;

  const candidateSolution: SolutionDocument = {
    ...current,
    title: parsed.title || current.title,
    styleProfile: chosenStyle,
    dna,
    blocks: updatedBlocks,
    updatedAt: new Date().toISOString(),
  };

  const simAfter = peers.length > 0 ? evaluateAgainstCohort(candidateSolution, peers) : null;
  if (
    options.mode === "surgical_diverge" &&
    simAfter &&
    typeof simBeforeVal === "number"
  ) {
    newNotes.unshift(
      `فك التشابه الجراحي: تغير أعلى تشابه مع الدفعة من ${simBeforeVal}% إلى ${simAfter.maxSimilarity}% (بصمة جديدة: ${summarizeDnaLabel(dna)}).`
    );
  }

  const prevMeta = current.qualityMeta;
  const mergedMeta: QualityAuditMeta = {
    discipline: resolvedDiscipline,
    auditPassApplied:
      options.mode === "deepen_and_audit"
        ? true
        : Boolean(prevMeta?.auditPassApplied),
    humanizedPassApplied:
      options.mode === "humanize_academic"
        ? true
        : Boolean(prevMeta?.humanizedPassApplied),
    autoDivergenceApplied:
      options.mode === "surgical_diverge"
        ? true
        : Boolean(prevMeta?.autoDivergenceApplied),
    cohortMaxSimilarity: simAfter?.maxSimilarity ?? prevMeta?.cohortMaxSimilarity,
    dnaLabel: summarizeDnaLabel(dna),
    verifiedQuestionsCount:
      typeof parsed.verifiedQuestionsCount === "number"
        ? parsed.verifiedQuestionsCount
        : prevMeta?.verifiedQuestionsCount,
    auditNotes:
      newNotes.length > 0
        ? newNotes.slice(0, 6)
        : prevMeta?.auditNotes ?? [],
    studyGuide: normalizeStudyGuide(parsed.studyGuide, prevMeta?.studyGuide),
  };

  const solution: SolutionDocument = {
    ...candidateSolution,
    qualityMeta: mergedMeta,
  };

  return { solution, usedModel, auditNotes: mergedMeta.auditNotes ?? [] };
}

/**
 * Fast-spawns a brand-new, collision-free, <20% similarity solution for Students #2..#300
 * directly from an admin-approved Verified Wave Blueprint — 5x faster & cheaper (no PDF re-upload!).
 */
export async function generateFromBlueprintWithGemini(
  order: StudentOrder,
  blueprint: SolutionDocument,
  options: GenerateOptions = {}
): Promise<{ solution: SolutionDocument; usedModel: string }> {
  const apiKey = process.env.GEMINI_API_KEY?.trim() ?? "";
  if (!hasAnyConfiguredAiProvider()) {
    throw new Error("لم يتم ضبط مفتاح الذكاء الاصطناعي في إعدادات البيئة.");
  }

  const auto = pickAutoStyleAndTheme(`${order.id}-${order.trackingCode}`);
  const chosenStyle: StyleProfileId = options.styleProfile ?? auto.styleProfile;
  const chosenTheme: DocxThemeId = options.docxTheme ?? auto.docxTheme;
  const resolvedDiscipline = detectAcademicDiscipline(
    order,
    options.discipline ?? blueprint.qualityMeta?.discipline
  );

  const peers = await listPeersForModule(order);
  const corpus = analyzeCohortCorpus(peers);
  const dna = allocateUniqueDNA(
    `${order.id}-${order.trackingCode}-${order.studentName}-${Date.now()}`,
    corpus.usedProseSignatures,
    corpus.usedVisualSignatures
  );

  const blueprintJson = JSON.stringify({
    title: blueprint.title,
    blocks: stripBlockIds(blueprint.blocks),
    studyGuide: blueprint.qualityMeta?.studyGuide,
  });

  const blacklistSection =
    corpus.hotCohortPhrases.length > 0
      ? `\nالقائمة السوداء للعبارات الشائعة عبر الدفعة (يُحظر تماما تكرارها حرفيا):\n[ ${corpus.hotCohortPhrases.slice(0, 45).join(" ، ")} ]\n`
      : "";

  const systemText = `أنت خبير أكاديمي تعيد صياغة وتنظيم حل مرجعي معتمد لطالب جامعي جديد ضمن دفعة كبيرة (300+ طالب) بحيث تخرج نسخة **مستقلة وأصيلة كلياً** بتشابه لفظي ثلاثي أقل من 15% عن الحل المرجعي وعن كافة طلبة الدفعة.

القواعد الصارمة:
1. الحفاظ التام على الصحة العلمية والرياضية: أبقِ على جميع القيم الرقمية الصحيحة، المعادلات، وجداول الحساب الأساسية صحيحة ومتسقة رياضياً (لا تختلق أرقاماً خاطئة).
2. التزم التزاماً صارماً بالبصمة المنهجية ومستوى التفصيل المخصّصين لهذا الطالب فقط:
${buildDnaPromptBlock(dna)}
3. أعد كتابة كل العناوين والفقرات والتعليقات التحليلية وstudyGuide من الصفر بتراكيب نحوية مختلفة تماماً وبأسلوب بشري طبيعي خالٍ من كليشيهات الذكاء الاصطناعي.
${blacklistSection}
4. قواعد LaTeX وJSON: ضاعف الشرطات المائلة داخل سلاسل JSON (\\\\frac، \\\\sum، \\\\hat، \\\\%)، ولا تضع أحرفاً عربية داخل كتل equation.
أعد JSON صالحة فقط بنفس المخطط { "title", "blocks", "studyGuide" }.
${options.extraInstruction ? `\nتوجيه إضافي من المشرف:\n${options.extraInstruction}` : ""}`;

  const { parsed, usedModel } = await callGeminiJsonWithFallback({
    apiKey,
    systemText,
    userParts: [
      {
        text: `الطالب: ${order.studentName} | المقياس: ${order.moduleName} | النشاط: ${order.assignmentTitle}\n\nالحل المرجعي المعتمد (أنتج منه نسخة مستقلة ببصمة هذا الطالب ومستوى تفصيله):\n${blueprintJson}`,
      },
    ],
    preferredModel: options.preferredModel,
    temperature: 0.65,
  });

  const blocks =
    parsed.blocks && parsed.blocks.length > 0
      ? normalizeBlocks(parsed.blocks)
      : blueprint.blocks.map((b) => ({ ...b, id: crypto.randomUUID() }));

  let solution: SolutionDocument = {
    title: parsed.title || `حل ${order.assignmentTitle}`,
    includeCoverPage: order.includeCoverPage,
    styleProfile: chosenStyle,
    docxTheme: chosenTheme,
    dna,
    qualityMeta: {
      discipline: resolvedDiscipline,
      auditPassApplied: true,
      humanizedPassApplied: true,
      autoDivergenceApplied: false,
      dnaLabel: summarizeDnaLabel(dna),
      auditNotes: ["تم التوليد السريع من الحل المرجعي المعتمد للموجة ببصمة منهجية وبصرية مستقلة."],
      studyGuide: normalizeStudyGuide(parsed.studyGuide, blueprint.qualityMeta?.studyGuide),
    },
    coverMeta: {
      university: order.university,
      specialty: order.specialty,
      moduleName: order.moduleName,
      studentName: order.studentName,
      academicYear: "2026 / 2027",
    },
    blocks,
    updatedAt: new Date().toISOString(),
  };

  // Closed-loop <20% check against all cohort peers
  if (peers.length > 0) {
    const simBefore = evaluateAgainstCohort(solution, peers);
    solution.qualityMeta!.cohortMaxSimilarity = simBefore.maxSimilarity;
    if (
      simBefore.maxSimilarity >= AUTO_DIVERGE_THRESHOLD &&
      simBefore.topSharedPhrases.length > 0
    ) {
      try {
        const divSystem = buildSurgicalDivergencePrompt({
          dna,
          sharedPhrases: simBefore.topSharedPhrases,
          hotCohortPhrases: corpus.hotCohortPhrases,
          extraInstruction: options.extraInstruction,
        });
        const divRes = await callGeminiJsonWithFallback({
          apiKey,
          systemText: divSystem,
          userParts: [
            {
              text: JSON.stringify({
                title: solution.title,
                blocks: stripBlockIds(solution.blocks),
                studyGuide: solution.qualityMeta?.studyGuide,
              }),
            },
          ],
          preferredModel: options.preferredModel,
          temperature: 0.7,
        });
        if (divRes.parsed.blocks && divRes.parsed.blocks.length > 0) {
          const candidate: SolutionDocument = {
            ...solution,
            blocks: normalizeBlocks(divRes.parsed.blocks),
            updatedAt: new Date().toISOString(),
          };
          const simAfter = evaluateAgainstCohort(candidate, peers);
          if (simAfter.maxSimilarity < simBefore.maxSimilarity) {
            solution = {
              ...candidate,
              qualityMeta: {
                ...solution.qualityMeta!,
                autoDivergenceApplied: true,
                cohortMaxSimilarity: simAfter.maxSimilarity,
                auditNotes: [
                  `تم التوليد السريع من المرجع + فك التشابه الآلي: انخفض التشابه من ${simBefore.maxSimilarity}% إلى ${simAfter.maxSimilarity}%.`,
                ],
              },
            };
          }
        }
      } catch {
        // non-fatal
      }
    }
  }

  return { solution, usedModel };
}
