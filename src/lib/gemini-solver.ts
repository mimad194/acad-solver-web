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
import { extractProseText, pickAutoStyleAndTheme } from "./style-profiles";
import {
  buildStage1SystemPrompt,
  buildStage2AuditPrompt,
  buildStage2HumanizePrompt,
  detectAcademicDiscipline,
} from "./expert-prompts";

const SUPPORTED_INLINE_MIMES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "text/plain",
  "text/csv",
]);

const DEFAULT_MODEL_PRIORITY = [
  "gemini-4-hydrogen",
  "gemini-3.8-flash",
  "gemini-3.5-flash-lite",
];

const MODEL_DISPLAY_PATTERNS: Record<string, string[]> = {
  "gemini-4-hydrogen": ["gemini 4 hydrogen", "gemini-4-hydrogen"],
  "gemini-3.8-flash": ["gemini 3.8 flash", "gemini-3.8-flash"],
  "gemini-3.5-flash-lite": ["gemini 3.5 flash lite", "gemini-3.5-flash-lite"],
};

async function discoverExactModelIds(
  apiKey: string,
  preferredList: string[]
): Promise<string[]> {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?pageSize=200&key=${encodeURIComponent(
        apiKey
      )}`
    );
    if (!res.ok) return [];
    const data = (await res.json()) as {
      models?: Array<{
        name?: string;
        displayName?: string;
        supportedGenerationMethods?: string[];
      }>;
    };
    const usable = (data.models ?? []).filter((m) =>
      m.supportedGenerationMethods?.includes("generateContent")
    );

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
    return matched;
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
    `التخصص والمستوى: ${order.specialty || "غير محدد"}`,
    `المقياس: ${order.moduleName}`,
    `عنوان النشاط: ${order.assignmentTitle}`,
    order.notes ? `ملاحظات الطالب: ${order.notes}` : "",
    order.exerciseText ? `\nنص التمرين المرفق:\n${order.exerciseText}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  parts.push({ text: contextLines });

  for (const meta of order.files) {
    const buf = await readUploadedFileBuffer(meta.storedName, meta.blobUrl);
    if (!buf) continue;
    const label =
      meta.category === "exercise"
        ? `ملف أسئلة التمرين المرفق (${meta.originalName}):`
        : `ملف مرجع/درس المقياس المرفق (${meta.originalName}):`;

    if (meta.mimeType === "text/plain" || meta.mimeType === "text/csv") {
      parts.push({ text: `${label}\n${buf.toString("utf-8").slice(0, 60000)}` });
    } else if (SUPPORTED_INLINE_MIMES.has(meta.mimeType)) {
      parts.push({ text: label });
      if (buf.length > 2 * 1024 * 1024) {
        const fileUri = await uploadToGeminiFilesApi(
          apiKey,
          buf,
          meta.mimeType,
          meta.originalName
        );
        if (fileUri) {
          parts.push({
            fileData: {
              mimeType: meta.mimeType,
              fileUri,
            },
          });
        } else if (buf.length <= 15 * 1024 * 1024) {
          parts.push({
            inlineData: {
              mimeType: meta.mimeType,
              data: buf.toString("base64"),
            },
          });
        }
      } else {
        parts.push({
          inlineData: {
            mimeType: meta.mimeType,
            data: buf.toString("base64"),
          },
        });
      }
    }
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

async function callGeminiJsonWithFallback(params: {
  apiKey: string;
  systemText: string;
  userParts: Array<Record<string, unknown>>;
  preferredModel?: string;
  temperature?: number;
}): Promise<{ parsed: RawGeminiJson; usedModel: string }> {
  const { apiKey, systemText, userParts, preferredModel, temperature = 0.4 } = params;

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
  let discoveredOnce = false;
  let response: Response | null = null;
  let lastErrorText = "";
  let usedModel = firstChoice;

  for (let i = 0; i < candidateModels.length; i++) {
    const modelName = candidateModels[i];
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      modelName
    )}:generateContent?key=${encodeURIComponent(apiKey)}`;

    response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: requestPayload,
    });

    if (response.ok) {
      usedModel = modelName;
      break;
    }

    lastErrorText = await response.text();

    if (response.status === 404 && !discoveredOnce) {
      discoveredOnce = true;
      const discovered = await discoverExactModelIds(apiKey, [
        firstChoice,
        ...DEFAULT_MODEL_PRIORITY,
      ]);
      for (let dIdx = discovered.length - 1; dIdx >= 0; dIdx--) {
        const exactId = discovered[dIdx];
        if (!candidateModels.includes(exactId)) {
          candidateModels.splice(i + 1, 0, exactId);
        }
      }
    }

    if (
      response.status === 404 ||
      response.status === 429 ||
      response.status === 500 ||
      response.status === 502 ||
      response.status === 503 ||
      response.status === 504
    ) {
      continue;
    }
    break;
  }

  if (!response || !response.ok) {
    throw new Error(
      `فشل الاتصال بـ Gemini API (${response?.status ?? 500}): ${lastErrorText.slice(0, 350)}`
    );
  }

  const payload = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };

  const rawText = payload.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) {
    throw new Error("لم يُرجع نموذج الذكاء الاصطناعي أي محتوى نصي.");
  }

  const parsed = safeParseGeminiJson(rawText);
  return { parsed, usedModel };
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
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "لم يتم ضبط مفتاح GEMINI_API_KEY في إعدادات البيئة. يرجى إضافته لتفعيل التوليد الآلي بالذكاء الاصطناعي."
    );
  }

  const auto = pickAutoStyleAndTheme(`${order.id}-${order.trackingCode}`);
  const chosenStyle: StyleProfileId = options.styleProfile ?? auto.styleProfile;
  const chosenTheme: DocxThemeId = options.docxTheme ?? auto.docxTheme;
  const resolvedDiscipline = detectAcademicDiscipline(order, options.discipline);

  const [siblingSnippets, parts] = await Promise.all([
    collectSiblingSnippets(order),
    buildOrderAttachmentParts(apiKey, order),
  ]);

  parts.push({
    text: "قم الآن بحل التمرين كاملا بكل تفاصيله وجداوله الوسيطة وتحليلاته العميقة وفق بروتوكول التخصص والأسلوب المطلوبين، مع توليد studyGuide للطالب، وأعد JSON المهيكَل فقط.",
  });

  const systemText = buildStage1SystemPrompt({
    order,
    styleId: chosenStyle,
    discipline: resolvedDiscipline,
    siblingSnippets,
    extraInstruction: options.extraInstruction,
  });

  const { parsed, usedModel } = await callGeminiJsonWithFallback({
    apiKey,
    systemText,
    userParts: parts,
    preferredModel: options.preferredModel,
    temperature: 0.42,
  });

  const blocks = normalizeBlocks(parsed.blocks);
  const qualityMeta: QualityAuditMeta = {
    discipline: resolvedDiscipline,
    auditPassApplied: false,
    humanizedPassApplied: false,
    verifiedQuestionsCount:
      typeof parsed.verifiedQuestionsCount === "number"
        ? parsed.verifiedQuestionsCount
        : undefined,
    auditNotes: [],
    studyGuide: normalizeStudyGuide(parsed.studyGuide),
  };

  const solution: SolutionDocument = {
    title: parsed.title || `حل ${order.assignmentTitle}`,
    includeCoverPage: order.includeCoverPage,
    styleProfile: chosenStyle,
    docxTheme: chosenTheme,
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
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("لم يتم ضبط مفتاح GEMINI_API_KEY في إعدادات البيئة.");
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

  const currentDraftJson = JSON.stringify({
    title: current.title,
    blocks: stripBlockIds(current.blocks),
    studyGuide: current.qualityMeta?.studyGuide,
  });

  let systemText = "";
  let userParts: Array<Record<string, unknown>> = [];
  let temperature = 0.35;

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
  } else if (options.mode === "humanize_academic") {
    const siblingSnippets = await collectSiblingSnippets(order);
    systemText = buildStage2HumanizePrompt({
      styleId: chosenStyle,
      siblingSnippets,
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
    ...current,
    title: parsed.title || current.title,
    styleProfile: chosenStyle,
    qualityMeta: mergedMeta,
    blocks: updatedBlocks,
    updatedAt: new Date().toISOString(),
  };

  return { solution, usedModel, auditNotes: mergedMeta.auditNotes ?? [] };
}
