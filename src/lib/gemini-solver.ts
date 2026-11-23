import crypto from "crypto";
import { DocumentBlock, SolutionDocument, StudentOrder } from "@/types/order";
import { readUploadedFileBuffer } from "./store";

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
          patterns.some((p) => disp === p || idLow === p || disp.includes(p) || idLow.includes(p))
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

function buildSystemInstruction(order: StudentOrder, extraInstruction?: string): string {
  const strictRule = order.strictReferencesOnly
    ? "- اعتمد حصريا وبشكل صارم على المراجع والمطبوعات والدروس المرفقة مع الطلب فقط (القوانين، الرموز، سلالم التفسير، وطريقة الحل)، دون أي توسع أو استيراد مصطلحات أو طرق من خارج المراجع المرفوعة."
    : "- اعتمد أساسا على المراجع المرفقة مع الطلب مع إمكانية التوضيح المنهجي عند الضرورة.";

  return `أنت أستاذ وخبير أكاديمي متخصص في إعداد وتنسيق حلول الأنشطة والأعمال الموجهة للطلبة الجامعيين باللغة العربية الفصحى السليمة.

المطلوب منك حل النشاط التالي بدقة علمية ورياضية كاملة وإخراج الحل في صيغة JSON مهيكلة لتتحول مباشرة إلى ملف Word عربي RTL احترافي.

قواعد أساسية إلزامية:
${strictRule}
- اكتب بأسلوب طالب جامعي متمكن (أسلوب أكاديمي طبيعي ومباشر وواضح، بعيد تماما عن الصياغات النمطية الآلية أو الحشو الإنشائي أو الرموز التزيينية).
- تحقق من جميع العمليات الحسابية والرقمية خطوة بخطوة بدقة عالية قبل كتابة النتيجة.
- اكتب كل المعادلات الرياضية والإحصائية بصيغة LaTeX قياسية ونظيفة:
  * داخل الفقرات والنقاط وخلايا الجداول: ضع الرموز والمعادلات القصيرة بين علامتي دولار مفردتين مثل $\\hat{\\beta}_1 = 16.7302$ أو $R^2 = 99.40\\%$.
  * للمعادلات المستقلة: استخدم كتلة من نوع "equation" وضع فيها نص LaTeX فقط (بدون $$ وبدون أي أحرف عربية داخل نص LaTeX).
  * عند كتابة الجداول: رتب الأعمدة من اليمين إلى اليسار (أول عمود في المصفوفة سيظهر أقصى اليمين في Word RTL).
- أعد الرد بصيغة JSON صالحة فقط تطابق هذا المخطط تماما:
{
  "title": "عنوان الحل",
  "blocks": [
    { "type": "doc_title", "text": "حل النشاط..." },
    { "type": "exercise_heading", "text": "التمرين (01)" },
    { "type": "question_heading", "text": "1) عنوان السؤال..." },
    { "type": "sub_heading", "text": "عنوان فرعي..." },
    { "type": "paragraph", "text": "نص الفقرة مع معادلات مضمنة مثل $R^2 = 0.994$..." },
    { "type": "bullet", "text": "**عنوان نقطي:** شرح واضح ومباشر..." },
    { "type": "equation", "latex": "\\\\hat{Y}_i = 129.0145 + 16.7302 X_{1i}", "callout": true },
    { "type": "table", "caption": "عنوان الجدول اختياري", "headers": ["عمود 1", "$X_1$"], "rows": [["قيمة", "10"]], "hasTotalRow": true }
  ]
}
${extraInstruction ? `\nتوجيه إضافي من المشرف:\n${extraInstruction}` : ""}`;
}

export async function generateSolutionWithGemini(
  order: StudentOrder,
  extraInstruction?: string,
  preferredModel?: string
): Promise<{ solution: SolutionDocument; usedModel: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "لم يتم ضبط مفتاح GEMINI_API_KEY في إعدادات البيئة. يرجى إضافته لتفعيل التوليد الآلي بالذكاء الاصطناعي."
    );
  }

  const firstChoice =
    preferredModel?.trim() ||
    process.env.GEMINI_MODEL?.trim() ||
    "gemini-4-hydrogen";

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

  // Attach uploaded exercise and reference files (PDF / Images / Text)
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

  parts.push({
    text: "قم الآن بحل التمرين كاملا وإرجاع JSON المهيكَل فقط وفق المخطط المطلوب.",
  });

  const requestPayload = JSON.stringify({
    systemInstruction: {
      parts: [{ text: buildSystemInstruction(order, extraInstruction) }],
    },
    contents: [{ role: "user", parts }],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: "application/json",
    },
  });

  const candidateModels = Array.from(new Set([firstChoice, ...DEFAULT_MODEL_PRIORITY]));
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

    // If model slug not found (e.g. requires -preview suffix), discover exact live IDs from Google's models list
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

    // Fallback to next candidate model on 404 (unavailable/retired), 429 (quota), or 500/502/503/504 (high demand / transient error)
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

  const cleaned = rawText
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/, "");

  const parsed = JSON.parse(cleaned) as {
    title?: string;
    blocks?: Array<Record<string, unknown>>;
  };

  const blocks: DocumentBlock[] = (parsed.blocks ?? []).map((b) => {
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

  const solution: SolutionDocument = {
    title: parsed.title || `حل ${order.assignmentTitle}`,
    includeCoverPage: order.includeCoverPage,
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
