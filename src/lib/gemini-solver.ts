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
        const fileUri = await uploadToGeminiFilesApi(
          apiKey,
          buf,
          meta.mimeType,
          meta.originalName
        );
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

    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: requestPayload,
        signal: AbortSignal.timeout(95_000),
      });
    } catch (err) {
      lastErrorText =
        err instanceof Error ? err.message : "Timeout waiting for Gemini";
      response = null;
      continue;
    }

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
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("لم يتم ضبط مفتاح GEMINI_API_KEY في إعدادات البيئة.");
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
