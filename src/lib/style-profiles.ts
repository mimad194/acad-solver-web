import type { DocxThemeId, SolutionDocument, StyleProfileId } from "@/types/order";

export interface StyleProfileConfig {
  id: StyleProfileId;
  label: string;
  shortDesc: string;
  promptDirective: string;
  suggestedDecimals: number;
}

export const STYLE_PROFILES: StyleProfileConfig[] = [
  {
    id: "analytical_narrative",
    label: "تحليلي سردي مترابط",
    shortDesc: "فقرات تحليلية متصلة بطول متنوع وتقليل التعداد النقطي",
    suggestedDecimals: 4,
    promptDirective:
      "اعتمد أسلوبا سرديا تحليليا متماسكا في فقرات طبيعية غير متماثلة الطول (تجنب الإكثار من النقاط التعدادية إلا عند الضرورة). ابدأ كل فقرة بمدخل طبيعي يربط بين النتيجة الحسابية ودلالتها الاقتصادية مباشرة دون عبارات تمهيدية متكررة.",
  },
  {
    id: "concise_direct",
    label: "منهجي موجز ومباشر",
    shortDesc: "جمل دقيقة ومباشرة تدخل في الحساب والاستنتاج فورا دون إطالة",
    suggestedDecimals: 3,
    promptDirective:
      "اعتمد لغة علمية دقيقة ومكثفة؛ ادخل مباشرة في القانون ثم التعويض ثم النتيجة ثم تفسير محدد ومركز في جملتين أو ثلاث جمل قصيرة وواضحة بعيدا عن الإطناب الإنشائي.",
  },
  {
    id: "managerial_applied",
    label: "تطبيقي موجه لاتخاذ القرار",
    shortDesc: "يركز في التعليقات على الأثر التسييري والعملي للمؤسسة",
    suggestedDecimals: 4,
    promptDirective:
      "اكتب بأسلوب طالب ماستر في التسيير وإدارة المنظمات يربط الأرقام بواقع قرارات المؤسسة (كفعالية الإنفاق، تقييم المردودية، وحدود الاعتماد على التقدير في التخطيط)، مع استيفاء كامل الخطوات الرياضية بدقة.",
  },
  {
    id: "tabular_comparative",
    label: "مجدول ومقارن",
    shortDesc: "يعتمد الجداول التلخيصية المقارنة إلى جانب الشرح المركز",
    suggestedDecimals: 3,
    promptDirective:
      "نظّم العرض باستخدام جداول حسابية وتلخيصية واضحة للمقارنة بين المعالم والاختبارات والارتباطات، وأتبع كل جدول بتعليق تفسيري طبيعي يبرز الفوارق الرقمية والعلاقات بين المتغيرات.",
  },
  {
    id: "stepwise_didactic",
    label: "تدريجي مفصّل خطوة بخطوة",
    shortDesc: "يوضح المبدأ ثم يدرج كل خطوة حسابية وسيطة بتسلسل هادئ",
    suggestedDecimals: 4,
    promptDirective:
      "تدرّج في الحل خطوة بعد خطوة بهدوء ووضوح: عرّف الرموز أولا، اكتب الصيغة الجبرية، ثم بيّن ناتج البسط والمقام على حدة قبل القسمة النهائية، واختم كل فرع بحكم علمي صريح.",
  },
  {
    id: "conclusion_first",
    label: "استنتاجي مباشر (النتيجة ثم التعليل)",
    shortDesc: "يبرز الحكم أو القيمة أولا ثم يعرض البرهان الحسابي والتفسير",
    suggestedDecimals: 2,
    promptDirective:
      "في التعليقات والتحليلات، قدّم الاستنتاج الأساسي أولا بجملة واضحة ثم برهِن عليه بالأرقام والقيم المحسوبة والمقارنة مع القيم الجدولية والمرجعية، مع الحفاظ على استكمال كل الحسابات والجداول كاملة.",
  },
];

export interface DocxThemeConfig {
  id: DocxThemeId;
  label: string;
  arFont: string;
  laFont: string;
  szBodyAr: number;
  szBodyLa: number;
  primaryColor: string;
  accentColor: string;
  subHeadingColor: string;
  headerBg: string;
  headerText: string;
  zebraBg: string;
  totalBg: string;
  calloutBg: string;
  borderColor: string;
  exHeadingBg: string;
}

export const DOCX_THEMES: Record<DocxThemeId, DocxThemeConfig> = {
  classic_navy: {
    id: "classic_navy",
    label: "أزرق أكاديمي (Traditional Arabic)",
    arFont: "Traditional Arabic",
    laFont: "Times New Roman",
    szBodyAr: 28,
    szBodyLa: 22,
    primaryColor: "1B365D",
    accentColor: "1F4E79",
    subHeadingColor: "2B547E",
    headerBg: "1F4E79",
    headerText: "FFFFFF",
    zebraBg: "F7FAFD",
    totalBg: "E3ECF5",
    calloutBg: "F4F7FA",
    borderColor: "C5D1DE",
    exHeadingBg: "EAF0F7",
  },
  charcoal_minimal: {
    id: "charcoal_minimal",
    label: "رمادي فحمي حديث (Simplified Arabic)",
    arFont: "Simplified Arabic",
    laFont: "Calibri",
    szBodyAr: 24,
    szBodyLa: 21,
    primaryColor: "1F2937",
    accentColor: "374151",
    subHeadingColor: "4B5563",
    headerBg: "2D3748",
    headerText: "FFFFFF",
    zebraBg: "F9FAFB",
    totalBg: "E5E7EB",
    calloutBg: "F3F4F6",
    borderColor: "D1D5DB",
    exHeadingBg: "F3F4F6",
  },
  emerald_academic: {
    id: "emerald_academic",
    label: "أخضر زمردي هادئ (Sakkal Majalla)",
    arFont: "Sakkal Majalla",
    laFont: "Times New Roman",
    szBodyAr: 28,
    szBodyLa: 22,
    primaryColor: "14532D",
    accentColor: "166534",
    subHeadingColor: "15803D",
    headerBg: "166534",
    headerText: "FFFFFF",
    zebraBg: "F5FBF7",
    totalBg: "DCFCE7",
    calloutBg: "F0FDF4",
    borderColor: "BBF7D0",
    exHeadingBg: "ECFDF5",
  },
  burgundy_formal: {
    id: "burgundy_formal",
    label: "عنابي جامعي رسمي (Traditional Arabic)",
    arFont: "Traditional Arabic",
    laFont: "Times New Roman",
    szBodyAr: 28,
    szBodyLa: 22,
    primaryColor: "5C1A2A",
    accentColor: "7C2D3E",
    subHeadingColor: "881337",
    headerBg: "6B1F30",
    headerText: "FFFFFF",
    zebraBg: "FDF7F8",
    totalBg: "F5E1E5",
    calloutBg: "FAF2F4",
    borderColor: "E2C4CB",
    exHeadingBg: "F7EBEE",
  },
  print_bw: {
    id: "print_bw",
    label: "أبيض وأسود كلاسيكي للطباعة (Simplified Arabic)",
    arFont: "Simplified Arabic",
    laFont: "Times New Roman",
    szBodyAr: 24,
    szBodyLa: 21,
    primaryColor: "111111",
    accentColor: "222222",
    subHeadingColor: "333333",
    headerBg: "333333",
    headerText: "FFFFFF",
    zebraBg: "F7F7F7",
    totalBg: "E6E6E6",
    calloutBg: "F4F4F4",
    borderColor: "BFBFBF",
    exHeadingBg: "EFEFEF",
  },
};

export function getStyleProfile(id?: StyleProfileId): StyleProfileConfig {
  return STYLE_PROFILES.find((s) => s.id === id) ?? STYLE_PROFILES[0];
}

export function getDocxTheme(id?: DocxThemeId): DocxThemeConfig {
  return (id && DOCX_THEMES[id]) || DOCX_THEMES.classic_navy;
}

/**
 * Deterministic hash-based auto-selection so different students get distinct
 * writing styles and Word visual themes automatically.
 */
export function pickAutoStyleAndTheme(seed: string): {
  styleProfile: StyleProfileId;
  docxTheme: DocxThemeId;
} {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  }
  const styleProfile = STYLE_PROFILES[h % STYLE_PROFILES.length].id;
  const themeKeys = Object.keys(DOCX_THEMES) as DocxThemeId[];
  const docxTheme = themeKeys[(h >> 3) % themeKeys.length];
  return { styleProfile, docxTheme };
}

// ---------- Arabic Prose Similarity Checker (3-gram Jaccard on normalized Arabic words) ----------

function normalizeArabicText(raw: string): string {
  return raw
    .replace(/\$[^$]+\$/g, " ") // exclude math formulas from prose similarity
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "") // strip diacritics & tatweel
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[^\u0621-\u064A\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractProseText(doc: SolutionDocument): string {
  return doc.blocks
    .filter((b) => b.type === "paragraph" || b.type === "bullet")
    .map((b) => ("text" in b ? b.text : ""))
    .join(" ");
}

function wordNgrams(text: string, n = 3): Set<string> {
  const words = normalizeArabicText(text).split(" ").filter((w) => w.length >= 2);
  const grams = new Set<string>();
  if (words.length < n) {
    if (words.length > 0) grams.add(words.join(" "));
    return grams;
  }
  for (let i = 0; i <= words.length - n; i++) {
    grams.add(words.slice(i, i + n).join(" "));
  }
  return grams;
}

export function computeProseSimilarityPercent(
  docA: SolutionDocument,
  docB: SolutionDocument
): number {
  const setA = wordNgrams(extractProseText(docA), 3);
  const setB = wordNgrams(extractProseText(docB), 3);
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const g of setA) {
    if (setB.has(g)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : Math.round((intersection / union) * 100);
}
