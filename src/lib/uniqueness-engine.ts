import type {
  DepthBandId,
  DocxHeadingVariant,
  DocxTableVariant,
  DocxVisualDNA,
  SolutionDNA,
  SolutionDocument,
  StudentOrder,
} from "@/types/order";
import { extractProseText } from "./style-profiles";

// ============================================================================
// 1. COMBINATORIAL PROSE & STRUCTURAL DNA (6 x 6 x 4 x 5 x 6 x 4 = 17,280+)
// ============================================================================

export interface DnaAxisOption {
  id: string;
  label: string;
  directive: string;
}

export const STRUCTURE_AXES: DnaAxisOption[] = [
  {
    id: "classic_linear",
    label: "تسلسل كلاسيكي",
    directive: "رتّب كل فرع بالتتابع: تقديم المعطيات ← الصيغة الرمزية ← التعويض والجدول ← النتيجة ← التفسير.",
  },
  {
    id: "conclusion_first",
    label: "استنتاج أولاً",
    directive: "ابدأ تعليق كل سؤال بالحكم أو القيمة الأساسية المستخلصة أولاً في جملة حاسمة، ثم اعرض الخطوات الحسابية والبرهان المؤيد لها.",
  },
  {
    id: "dual_synthesis",
    label: "حساب ثم قراءة جامعة",
    directive: "أنجز العمليات والجداول بتركيز عالٍ داخل كل فرع، ثم خصّص فقرة تحليلية جامعة في نهاية كل تمرين تربط كل النتائج ببعضها.",
  },
  {
    id: "tabular_backbone",
    label: "محورية الجداول",
    directive: "اجعل الجدول الحسابي أو المقارن محور الإجابة في كل سؤال، يسبقه سطر تعريفي موجز ويتبعه تعليق تحليلي يقرأ أبرز ما في الجدول.",
  },
  {
    id: "pedagogical_stepwise",
    label: "تدرّج تعليمي مفصّل",
    directive: "فصّل الحل بمراحل مرقّمة هادئة: عرّف الرموز، اكتب القانون، احسب البسط والمقام منفصلين، ثم اعرض الناتج والتحقق والتفسير.",
  },
  {
    id: "executive_briefing",
    label: "تقرير تسييري تطبيقي",
    directive: "اعرض كل سؤال بصيغة مذكرة تحليلية موجّهة لصانع القرار: تشخيص رقمي دقيق يليه مباشرة الأثر العملي على تسيير المؤسسة.",
  },
];

export const VOICE_AXES: DnaAxisOption[] = [
  {
    id: "formal_classic",
    label: "أكاديمية رصينة",
    directive: "استعمل لغة عربية جامعية رصينة وهادئة ومتوازنة دون مبالغة إنشائية.",
  },
  {
    id: "analytical_dense",
    label: "مكثفة ومباشرة",
    directive: "اكتب بأسلوب علمي مكثف ومقتصد في الألفاظ؛ كل جملة تحمل قيمة رقمية أو دلالة دقيقة بلا مقدمات زائدة.",
  },
  {
    id: "applied_managerial",
    label: "منظور إداري عملي",
    directive: "اربط الشروحات بواقع المؤسسة الاقتصادية (الكفاءة، المردودية، ترشيد القرار، حدود التقدير) بلغة باحث في التسيير.",
  },
  {
    id: "reflective_critical",
    label: "تحليلية نقدية",
    directive: "أضف لمسة نقدية متزنة تشير إلى دلالة المؤشرات وحدودها أو شروط صلاحيتها ضمن معطيات العينة.",
  },
  {
    id: "clear_didactic",
    label: "توضيحية سلسة",
    directive: "اكتب بلغة سلسة ميسّرة تبرز الرابط المنطقي بين كل خطوة رياضية والنتيجة التي تليها.",
  },
  {
    id: "comparative_evaluative",
    label: "تقييمية مقارنة",
    directive: "ركّز في تعليقاتك على المقارنة النسبية بين المتغيرات والقيم الحدية والمستويات المرجعية المذكورة في الدرس.",
  },
];

export const CADENCE_AXES: DnaAxisOption[] = [
  {
    id: "narrative_paragraphs",
    label: "فقرات سردية متصلة",
    directive: "اكتب التعليقات في فقرات سردية متصلة متفاوتة الطول وتجنب التعداد النقطي إلا عند الضرورة القصوى.",
  },
  {
    id: "mixed_structured",
    label: "مزيج فقرات ونقاط",
    directive: "امزج بين فقرة مدخلية قصيرة تليها نقطتان أو ثلاث نقاط تحليلية غير متساوية الطول.",
  },
  {
    id: "compact_micro",
    label: "فقرات قصيرة مركزة",
    directive: "قسّم الشرح إلى فقرات قصيرة جدا (سطران إلى ثلاثة أسطر للفقرة)، تعالج كل فقرة فكرة واحدة محددة.",
  },
  {
    id: "flowing_analytical",
    label: "إيقاع متباين",
    directive: "راوح بين جملة افتتاحية قصيرة حاسمة تليها جملة تفسيرية أطول تربط المتغيرات بالأرقام.",
  },
];

export const NUMBERING_AXES: DnaAxisOption[] = [
  {
    id: "numeric_parens",
    label: "التمرين (01) / 1)",
    directive: "استعمل العناوين بنمط: «التمرين (01)» و«1) ...» وعناوين فرعية «أ- ...».",
  },
  {
    id: "arabic_ordinal",
    label: "التمرين الأول / أولاً:",
    directive: "استعمل العناوين بنمط: «التمرين الأول» و«أولاً: ...»، «ثانياً: ...» وعناوين فرعية «1.1 ...».",
  },
  {
    id: "section_dash",
    label: "المحور الأول — المطلب 1:",
    directive: "استعمل العناوين بنمط: «التمرين الأول — ...» و«المطلب الأول: ...» أو «السؤال 01: ...».",
  },
  {
    id: "bracketed_clean",
    label: "التمرين [1] / السؤال (1)",
    directive: "استعمل العناوين بنمط: «التمرين [1]» و«السؤال (1): ...» مع عناوين فرعية «(أ) ...».",
  },
  {
    id: "decimal_academic",
    label: "ترقيم عشري 1.1 / 1.2",
    directive: "استعمل الترقيم الأكاديمي العشري: «1. التمرين الأول» ثم «1.1 ...»، «1.2 ...».",
  },
];

export const LEXICON_BANKS: DnaAxisOption[] = [
  {
    id: "lex_a",
    label: "معجم روابط أ",
    directive: "استعمل للربط والتفسير مفردات طبيعية مثل: (يُظهر، يعكس، يؤول إلى، استناداً إلى، يُسجَّل، وتبعاً لذلك) وتجنب تكرار «يدل على» و«يشير إلى».",
  },
  {
    id: "lex_b",
    label: "معجم روابط ب",
    directive: "استعمل للربط والتفسير مفردات طبيعية مثل: (يكشف، يبرز، يفضي إلى، بالرجوع إلى، يُلاحظ، ومن ثمّ) وتجنب تكرار «يُظهر» و«يعكس».",
  },
  {
    id: "lex_c",
    label: "معجم روابط ج",
    directive: "استعمل للربط والتفسير مفردات طبيعية مثل: (يبيّن، يترتب عنه، وفقاً لـ، تبرز القيم، وهو ما يفسر) وتجنب تكرار «يكشف» و«يشير إلى».",
  },
  {
    id: "lex_d",
    label: "معجم روابط د",
    directive: "استعمل للربط والتفسير مفردات طبيعية مثل: (يشير، يؤكد، ينجم عن ذلك، قياساً على، تأتي النتائج، مما يبرّر) وتجنب تكرار «يبيّن» و«يُظهر».",
  },
  {
    id: "lex_e",
    label: "معجم روابط هـ",
    directive: "استعمل للربط والتفسير مفردات طبيعية مثل: (يبرهن، يوضح، يقود ذلك إلى، انطلاقاً من، تسجل الحسابات، وعليه) وتجنب تكرار «يعكس» و«يفضي إلى».",
  },
  {
    id: "lex_f",
    label: "معجم روابط و",
    directive: "استعمل للربط والتفسير مفردات طبيعية مثل: (يثبت، يفيد، يخلص التحليل إلى، بالاعتماد على، تعطي القراءة، ولذلك) وتجنب تكرار «يؤكد» و«يبرز».",
  },
];

export const MATH_PRESENTATION_AXES: DnaAxisOption[] = [
  {
    id: "math_4dec_inline",
    label: "4 أرقام + تعويض متصل",
    directive: "قرّب النتائج العشرية إلى 4 أرقام بعد الفاصلة (ما لم يفرض التمرين غير ذلك)، واعرض الصيغة والتعويض والناتج في معادلة واحدة متسلسلة، وسمّ صف المجموع «المجموع».",
  },
  {
    id: "math_3dec_split",
    label: "3 أرقام + بسط ومقام منفصلان",
    directive: "قرّب النتائج العشرية إلى 3 أرقام بعد الفاصلة (ما لم يفرض التمرين غير ذلك)، وافصل خطوة القانون عن خطوة التعويض العددي، وسمّ صف المجموع «الإجمالي».",
  },
  {
    id: "math_4dec_verify",
    label: "4 أرقام + تحقق صريح",
    directive: "قرّب إلى 4 أرقام بعد الفاصلة، وأضف سطراً مقتضباً للتحقق الحسابي بعد كل نتيجة رئيسية، وسمّ صف المجموع «المجموع الكلي».",
  },
  {
    id: "math_2dec_concise",
    label: "رقمان/3 + عرض مركز",
    directive: "استعمل تقريب 2 إلى 3 أرقام بعد الفاصلة بانتظام (أو ما يفرضه المرجع)، واعرض القيم النهائية بوضوح داخل إطارات المعادلات، وسمّ صف المجموع «مجموع الأعمدة».",
  },
];

// ============================================================================
// 2. PROCEDURAL WORD VISUAL DNA (6 fonts x 8 palettes x 4 tables x 4 headings x 3 spacing = 2,304 layouts!)
// ============================================================================

export interface FontPairSpec {
  id: string;
  label: string;
  arFont: string;
  laFont: string;
  szBodyAr: number;
  szBodyLa: number;
}

export const FONT_PAIRS: FontPairSpec[] = [
  { id: "trad_times", label: "Traditional Arabic + Times", arFont: "Traditional Arabic", laFont: "Times New Roman", szBodyAr: 28, szBodyLa: 22 },
  { id: "simp_calibri", label: "Simplified Arabic + Calibri", arFont: "Simplified Arabic", laFont: "Calibri", szBodyAr: 24, szBodyLa: 21 },
  { id: "majalla_times", label: "Sakkal Majalla + Times", arFont: "Sakkal Majalla", laFont: "Times New Roman", szBodyAr: 28, szBodyLa: 22 },
  { id: "simp_times", label: "Simplified Arabic + Times", arFont: "Simplified Arabic", laFont: "Times New Roman", szBodyAr: 24, szBodyLa: 22 },
  { id: "arial_clean", label: "Arial Academic Clean", arFont: "Arial", laFont: "Arial", szBodyAr: 22, szBodyLa: 20 },
  { id: "tahoma_calibri", label: "Tahoma + Calibri", arFont: "Tahoma", laFont: "Calibri", szBodyAr: 21, szBodyLa: 20 },
];

export interface ColorPaletteSpec {
  id: string;
  label: string;
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

export const COLOR_PALETTES: ColorPaletteSpec[] = [
  { id: "navy", label: "أزرق أكاديمي", primaryColor: "1B365D", accentColor: "1F4E79", subHeadingColor: "2B547E", headerBg: "1F4E79", headerText: "FFFFFF", zebraBg: "F7FAFD", totalBg: "E3ECF5", calloutBg: "F4F7FA", borderColor: "C5D1DE", exHeadingBg: "EAF0F7" },
  { id: "charcoal", label: "رمادي فحمي", primaryColor: "1F2937", accentColor: "374151", subHeadingColor: "4B5563", headerBg: "2D3748", headerText: "FFFFFF", zebraBg: "F9FAFB", totalBg: "E5E7EB", calloutBg: "F3F4F6", borderColor: "D1D5DB", exHeadingBg: "F3F4F6" },
  { id: "emerald", label: "أخضر زمردي", primaryColor: "14532D", accentColor: "166534", subHeadingColor: "15803D", headerBg: "166534", headerText: "FFFFFF", zebraBg: "F5FBF7", totalBg: "DCFCE7", calloutBg: "F0FDF4", borderColor: "BBF7D0", exHeadingBg: "ECFDF5" },
  { id: "burgundy", label: "عنابي جامعي", primaryColor: "5C1A2A", accentColor: "7C2D3E", subHeadingColor: "881337", headerBg: "6B1F30", headerText: "FFFFFF", zebraBg: "FDF7F8", totalBg: "F5E1E5", calloutBg: "FAF2F4", borderColor: "E2C4CB", exHeadingBg: "F7EBEE" },
  { id: "teal", label: "أزرق بترولي", primaryColor: "134E4A", accentColor: "115E59", subHeadingColor: "0F766E", headerBg: "115E59", headerText: "FFFFFF", zebraBg: "F4FBFB", totalBg: "CCFBF1", calloutBg: "F0FDFA", borderColor: "99F6E4", exHeadingBg: "ECFEFF" },
  { id: "indigo", label: "نيلي رسمي", primaryColor: "312E81", accentColor: "3730A3", subHeadingColor: "4338CA", headerBg: "3730A3", headerText: "FFFFFF", zebraBg: "F6F7FE", totalBg: "E0E7FF", calloutBg: "EEF2FF", borderColor: "C7D2FE", exHeadingBg: "EEF2FF" },
  { id: "espresso", label: "بني كلاسيكي", primaryColor: "451A03", accentColor: "78350F", subHeadingColor: "92400E", headerBg: "5C2D0C", headerText: "FFFFFF", zebraBg: "FCF9F6", totalBg: "FDE68A", calloutBg: "FFFBEB", borderColor: "E7D3BC", exHeadingBg: "FEF3C7" },
  { id: "print_bw", label: "أبيض وأسود للطباعة", primaryColor: "111111", accentColor: "222222", subHeadingColor: "333333", headerBg: "333333", headerText: "FFFFFF", zebraBg: "F7F7F7", totalBg: "E6E6E6", calloutBg: "F4F4F4", borderColor: "BFBFBF", exHeadingBg: "EFEFEF" },
];

export const TABLE_VARIANTS: DocxTableVariant[] = [
  "classic_grid",
  "modern_horizontal",
  "tinted_minimal",
  "booktabs",
];

export const HEADING_VARIANTS: DocxHeadingVariant[] = [
  "shaded_band",
  "bottom_rule",
  "right_accent",
  "minimal_bold",
];

export const SPACING_PROFILES: Record<
  DocxVisualDNA["spacingId"],
  { marginTwips: number; lineSpacing: number; paraAfter: number }
> = {
  compact: { marginTwips: 1080, lineSpacing: 260, paraAfter: 80 },
  standard: { marginTwips: 1220, lineSpacing: 285, paraAfter: 105 },
  airy: { marginTwips: 1400, lineSpacing: 315, paraAfter: 130 },
};

function fnv1aHash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export const DEPTH_BANDS: Record<
  DepthBandId,
  { label: string; directive: string }
> = {
  concise_solid: {
    label: "موجز ومنضبط",
    directive:
      "مستوى التفصيل التحريري لهذا الطالب (أسلوب جيد ومباشر دون إطالة زائدة): أجب عن كل سؤال بدقة علمية صحيحة، لكن اجعل التعليقات التفسيرية مقتضبة ومباشرة في جملتين إلى ثلاث جمل مركزة دون توسع نظري إضافي أو تشعبات ثانوية.",
  },
  balanced_thorough: {
    label: "متوازن ووافٍ",
    directive:
      "مستوى التفصيل التحريري لهذا الطالب (أسلوب جيد جداً ومتوازن): قدّم الخطوات الحسابية والجداول الوسيطة كاملة مع تفسير واضح ومنظم لكل نتيجة مرتبط بمعطيات الدرس.",
  },
  exhaustive_honors: {
    label: "معمّق وشامل",
    directive:
      "مستوى التفصيل التحريري لهذا الطالب (أسلوب امتياز بحثي شامل): فصّل كل خطوة، أضف تحققات رياضية متقاطعة وقراءة تسييرية/نقدية معمّقة وتوصيات دقيقة مستخلصة من النتائج.",
  },
};

function pickDepthBand(hashVal: number): DepthBandId {
  // Natural cohort distribution: ~30% concise_solid, ~45% balanced_thorough, ~25% exhaustive_honors
  const r = hashVal % 100;
  if (r < 30) return "concise_solid";
  if (r < 75) return "balanced_thorough";
  return "exhaustive_honors";
}

/**
 * Allocates a collision-free SolutionDNA across 17,280 prose combinations x 2,304 Word visual layouts
 * so hundreds or thousands of students in the same cohort never repeat the same fingerprint.
 */
export function allocateUniqueDNA(
  seed: string,
  usedSignatures: Set<string> = new Set(),
  usedVisualSignatures: Set<string> = new Set()
): SolutionDNA {
  for (let salt = 0; salt < 200; salt++) {
    const h1 = fnv1aHash(`${seed}#p#${salt}`);
    const h2 = fnv1aHash(`${seed}#v#${salt}`);
    const h3 = fnv1aHash(`${seed}#l#${salt}`);

    const structureId = STRUCTURE_AXES[h1 % STRUCTURE_AXES.length].id;
    const voiceId = VOICE_AXES[(h1 >>> 4) % VOICE_AXES.length].id;
    const cadenceId = CADENCE_AXES[(h1 >>> 9) % CADENCE_AXES.length].id;
    const numberingId = NUMBERING_AXES[h2 % NUMBERING_AXES.length].id;
    const lexiconId = LEXICON_BANKS[(h2 >>> 5) % LEXICON_BANKS.length].id;
    const mathStyleId = MATH_PRESENTATION_AXES[(h2 >>> 10) % MATH_PRESENTATION_AXES.length].id;
    const depthBand = pickDepthBand(h1 ^ h2);

    const fontPairId = FONT_PAIRS[h3 % FONT_PAIRS.length].id;
    const paletteId = COLOR_PALETTES[(h3 >>> 4) % COLOR_PALETTES.length].id;
    const tableVariant = TABLE_VARIANTS[(h3 >>> 9) % TABLE_VARIANTS.length];
    const headingVariant = HEADING_VARIANTS[(h3 >>> 12) % HEADING_VARIANTS.length];
    const spacingKeys: Array<DocxVisualDNA["spacingId"]> = ["compact", "standard", "airy"];
    const spacingId = spacingKeys[(h3 >>> 15) % spacingKeys.length];

    const proseSig = `${structureId}|${voiceId}|${cadenceId}|${numberingId}|${lexiconId}|${mathStyleId}`;
    const visualSig = `${fontPairId}|${paletteId}|${tableVariant}|${headingVariant}|${spacingId}`;
    const signature = `${proseSig}::${visualSig}`;

    if (!usedSignatures.has(proseSig) && !usedVisualSignatures.has(visualSig)) {
      return {
        signature,
        structureId,
        voiceId,
        cadenceId,
        numberingId,
        lexiconId,
        mathStyleId,
        depthBand,
        visualDna: {
          fontPairId,
          paletteId,
          tableVariant,
          headingVariant,
          spacingId,
        },
      };
    }
  }

  // Fallback after 200 salts (practically unreachable below 2,000+ peers in one module)
  const h = fnv1aHash(`${seed}#fallback#${Date.now()}`);
  const structureId = STRUCTURE_AXES[h % STRUCTURE_AXES.length].id;
  const voiceId = VOICE_AXES[(h >>> 4) % VOICE_AXES.length].id;
  const cadenceId = CADENCE_AXES[(h >>> 8) % CADENCE_AXES.length].id;
  const numberingId = NUMBERING_AXES[(h >>> 12) % NUMBERING_AXES.length].id;
  const lexiconId = LEXICON_BANKS[(h >>> 16) % LEXICON_BANKS.length].id;
  const mathStyleId = MATH_PRESENTATION_AXES[(h >>> 20) % MATH_PRESENTATION_AXES.length].id;
  const visualDna: DocxVisualDNA = {
    fontPairId: FONT_PAIRS[h % FONT_PAIRS.length].id,
    paletteId: COLOR_PALETTES[(h >>> 3) % COLOR_PALETTES.length].id,
    tableVariant: TABLE_VARIANTS[(h >>> 7) % TABLE_VARIANTS.length],
    headingVariant: HEADING_VARIANTS[(h >>> 10) % HEADING_VARIANTS.length],
    spacingId: (["compact", "standard", "airy"] as const)[(h >>> 13) % 3],
  };
  return {
    signature: `${structureId}|${voiceId}|${cadenceId}|${numberingId}|${lexiconId}|${mathStyleId}::${visualDna.fontPairId}|${visualDna.paletteId}|${visualDna.tableVariant}|${visualDna.headingVariant}|${visualDna.spacingId}`,
    structureId,
    voiceId,
    cadenceId,
    numberingId,
    lexiconId,
    mathStyleId,
    visualDna,
  };
}

export function buildDnaPromptBlock(dna: SolutionDNA): string {
  const s = STRUCTURE_AXES.find((x) => x.id === dna.structureId) ?? STRUCTURE_AXES[0];
  const v = VOICE_AXES.find((x) => x.id === dna.voiceId) ?? VOICE_AXES[0];
  const c = CADENCE_AXES.find((x) => x.id === dna.cadenceId) ?? CADENCE_AXES[0];
  const n = NUMBERING_AXES.find((x) => x.id === dna.numberingId) ?? NUMBERING_AXES[0];
  const l = LEXICON_BANKS.find((x) => x.id === dna.lexiconId) ?? LEXICON_BANKS[0];
  const m = MATH_PRESENTATION_AXES.find((x) => x.id === dna.mathStyleId) ?? MATH_PRESENTATION_AXES[0];
  const d = DEPTH_BANDS[dna.depthBand ?? "balanced_thorough"];

  return `البصمة المنهجية والتحريرية الخاصة بهذا الطالب فقط (التزم بها بدقة لتحقيق تباين كامل عن بقية الدفعة):
- البنية التنظيمية (${s.label}): ${s.directive}
- النبرة العلمية (${v.label}): ${v.directive}
- إيقاع الفقرات (${c.label}): ${c.directive}
- نمط العناوين والترقيم (${n.label}): ${n.directive}
- معجم الروابط والمفردات (${l.label}): ${l.directive}
- أسلوب العرض الحسابي (${m.label}): ${m.directive}
- مستوى التوسع والتفصيل: ${d.directive}`;
}

export function summarizeDnaLabel(dna?: SolutionDNA): string {
  if (!dna) return "قياسي";
  const s = STRUCTURE_AXES.find((x) => x.id === dna.structureId)?.label ?? "";
  const v = VOICE_AXES.find((x) => x.id === dna.voiceId)?.label ?? "";
  const fp = FONT_PAIRS.find((x) => x.id === dna.visualDna.fontPairId)?.arFont ?? "";
  const pal = COLOR_PALETTES.find((x) => x.id === dna.visualDna.paletteId)?.label ?? "";
  return [s, v, pal, fp].filter(Boolean).join(" • ");
}

// ============================================================================
// 3. CORPUS-SCALE N-GRAM BLACKLIST & EXACT OVERLAP EXTRACTION (300+ STUDENTS)
// ============================================================================

function normalizeArabicWordList(raw: string): string[] {
  return raw
    .replace(/\$[^$]+\$/g, " ")
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[^\u0621-\u064A\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter((w) => w.length >= 2);
}

export function extractDocNgrams(doc: SolutionDocument, n = 3): Set<string> {
  const words = normalizeArabicWordList(extractProseText(doc));
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

export function computeJaccardPercent(setA: Set<string>, setB: Set<string>): number {
  if (setA.size === 0 || setB.size === 0) return 0;
  let inter = 0;
  for (const g of setA) {
    if (setB.has(g)) inter++;
  }
  const union = setA.size + setB.size - inter;
  return union === 0 ? 0 : Math.round((inter / union) * 100);
}

export interface CohortCorpusAnalysis {
  peerCount: number;
  usedProseSignatures: Set<string>;
  usedVisualSignatures: Set<string>;
  /** Top recurring Arabic 3-grams/4-grams across the ENTIRE cohort (scales to 300-1000+ orders in ~350 tokens!) */
  hotCohortPhrases: string[];
  /** Compact sample openings from the 2 most recent peer orders */
  recentOpenings: string[];
}

export function analyzeCohortCorpus(peers: StudentOrder[]): CohortCorpusAnalysis {
  const usedProseSignatures = new Set<string>();
  const usedVisualSignatures = new Set<string>();
  const gramFreq = new Map<string, number>();
  const recentOpenings: string[] = [];

  // Cap scan to latest 250 peer orders in the same module for sub-second speed
  const scopedPeers = peers.filter((p) => p.solution !== null).slice(0, 250);

  for (let idx = 0; idx < scopedPeers.length; idx++) {
    const peer = scopedPeers[idx];
    const sol = peer.solution!;
    if (sol.dna) {
      const [pSig, vSig] = sol.dna.signature.split("::");
      if (pSig) usedProseSignatures.add(pSig);
      if (vSig) usedVisualSignatures.add(vSig);
    }

    const grams3 = extractDocNgrams(sol, 3);
    for (const g of grams3) {
      gramFreq.set(g, (gramFreq.get(g) ?? 0) + 1);
    }

    if (idx < 2) {
      const openingSentences = sol.blocks
        .filter((b) => b.type === "paragraph" || b.type === "bullet")
        .slice(0, 5)
        .map((b) => ("text" in b ? b.text.slice(0, 130).trim() : ""))
        .filter(Boolean)
        .join(" | ");
      if (openingSentences) recentOpenings.push(openingSentences);
    }
  }

  // Sort by document frequency across the entire cohort:
  // If >= 2 peers exist, prioritize phrases appearing in 2+ docs first, then top phrases from existing doc(s).
  const sortedGrams = Array.from(gramFreq.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([gram]) => gram)
    .slice(0, 45);

  return {
    peerCount: scopedPeers.length,
    usedProseSignatures,
    usedVisualSignatures,
    hotCohortPhrases: sortedGrams,
    recentOpenings,
  };
}

export interface PeerSimilarityMatch {
  id: string;
  trackingCode: string;
  studentName: string;
  similarity: number;
  sharedPhrases: string[];
}

export interface FullSimilarityReport {
  maxSimilarity: number;
  comparedCount: number;
  matches: PeerSimilarityMatch[];
  topSharedPhrases: string[];
}

export function evaluateAgainstCohort(
  doc: SolutionDocument,
  peers: StudentOrder[]
): FullSimilarityReport {
  const scopedPeers = peers.filter((p) => p.solution !== null).slice(0, 250);
  const myGrams = extractDocNgrams(doc, 3);

  const matches: PeerSimilarityMatch[] = scopedPeers
    .map((peer) => {
      const peerGrams = extractDocNgrams(peer.solution!, 3);
      const shared: string[] = [];
      for (const g of myGrams) {
        if (peerGrams.has(g)) shared.push(g);
      }
      const union = myGrams.size + peerGrams.size - shared.length;
      const similarity = union === 0 ? 0 : Math.round((shared.length / union) * 100);
      return {
        id: peer.id,
        trackingCode: peer.trackingCode,
        studentName: peer.studentName,
        similarity,
        sharedPhrases: shared.slice(0, 25),
      };
    })
    .sort((a, b) => b.similarity - a.similarity);

  // Aggregate unique shared phrases from top 3 closest peers for surgical rewriting
  const topSharedSet = new Set<string>();
  for (const m of matches.slice(0, 3)) {
    for (const p of m.sharedPhrases) {
      topSharedSet.add(p);
      if (topSharedSet.size >= 40) break;
    }
    if (topSharedSet.size >= 40) break;
  }

  return {
    maxSimilarity: matches[0]?.similarity ?? 0,
    comparedCount: scopedPeers.length,
    matches: matches.slice(0, 5),
    topSharedPhrases: Array.from(topSharedSet),
  };
}
