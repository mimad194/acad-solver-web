import type {
  AcademicCycle,
  AcademicDiscipline,
  AcademicYearCode,
} from "@/types/order";

export interface UfcSpecialtyOption {
  id: string;
  cycle: AcademicCycle;
  year: AcademicYearCode;
  domain: string;
  label: string;
  language: "ar" | "en";
  defaultDiscipline: Exclude<AcademicDiscipline, "auto">;
}

export interface CycleMeta {
  id: AcademicCycle;
  label: string;
  years: Array<{ code: AcademicYearCode; label: string; depthDirective: string }>;
}

export const UFC_CYCLES: CycleMeta[] = [
  {
    id: "licence",
    label: "الطور الأول — ليسانس (عن بُعد)",
    years: [
      {
        code: "L1",
        label: "السنة الأولى ليسانس (L1 — جذع مشترك)",
        depthDirective:
          "مستوى سنة أولى ليسانس (جذع مشترك): وضّح المفاهيم الأساسية والقواعد التأسيسية بدقة وبأسلوب منهجي واضح ومتدرج يناسب مستوى التكوين القاعدي دون تعقيد غير مبرر.",
      },
      {
        code: "L2",
        label: "السنة الثانية ليسانس (L2)",
        depthDirective:
          "مستوى سنة ثانية ليسانس: اجمع بين التأصيل المفاهيمي والتطبيق المنهجي المنضبط على الجداول والحالات التخصصية وفق مقررات السنة الثانية.",
      },
      {
        code: "L3",
        label: "السنة الثالثة ليسانس (L3 — التخصص)",
        depthDirective:
          "مستوى سنة ثالثة ليسانس (تخرج): قدّم تحليلاً تخصصياً متكاملاً ودقيقاً يظهر تمكن الطالب من أدوات وتقنيات التخصص.",
      },
    ],
  },
  {
    id: "master",
    label: "الطور الثاني — ماستر (عن بُعد)",
    years: [
      {
        code: "M1",
        label: "ماستر 1 (M1)",
        depthDirective:
          "مستوى ماستر 1: قدّم عمقاً أكاديمياً ومنهجياً متقدماً، مع ربط النتائج الحسابية أو القانونية أو التحليلية بالقرار التسييري والمرجعية العلمية للدرس.",
      },
      {
        code: "M2",
        label: "ماستر 2 (M2)",
        depthDirective:
          "مستوى ماستر 2 (مستوى بحثي وتطبيقي عالٍ): اعتمد أعلى درجات الدقة المنهجية والتحليل النقدي والتفسير التسييري/الاقتصادي أو القانوني المعمق بما يليق بمستوى التخرج في الماستر.",
      },
    ],
  },
];

// ============================================================================
// LICENCE (27 year-tracks: 7 in L1 + 9 in L2 + 11 in L3) — Matches Official CSV
// ============================================================================

const LICENCE_L1: UfcSpecialtyOption[] = [
  {
    id: "lic_law_common",
    cycle: "licence",
    year: "L1",
    domain: "حقوق",
    label: "حقوق (جذع مشترك)",
    language: "ar",
    defaultDiscipline: "accounting_legal",
  },
  {
    id: "lic_media_common",
    cycle: "licence",
    year: "L1",
    domain: "إعلام واتصال",
    label: "إعلام واتصال (جذع مشترك)",
    language: "ar",
    defaultDiscipline: "theoretical_essay",
  },
  {
    id: "lic_econ_ar_common",
    cycle: "licence",
    year: "L1",
    domain: "علوم اقتصادية وتجارية وعلوم التسيير",
    label: "علوم اقتصادية وتجارية وعلوم التسيير (جذع مشترك)",
    language: "ar",
    defaultDiscipline: "quantitative",
  },
  {
    id: "lic_econ_en_common",
    cycle: "licence",
    year: "L1",
    domain: "علوم اقتصادية وتجارية وعلوم التسيير باللغة الإنجليزية",
    label: "Economic, Commercial & Management Sciences (Common Core - EN)",
    language: "en",
    defaultDiscipline: "quantitative",
  },
  {
    id: "lic_tech_en",
    cycle: "licence",
    year: "L1",
    domain: "إنجليزية تقنية Technical English",
    label: "إنجليزية تقنية — Technical English",
    language: "en",
    defaultDiscipline: "theoretical_essay",
  },
  {
    id: "lic_tech_en_teachers",
    cycle: "licence",
    year: "L1",
    domain: "إنجليزية تقنية للأساتذة Technical English for Teachers",
    label: "إنجليزية تقنية للأساتذة — Technical English for Teachers",
    language: "en",
    defaultDiscipline: "theoretical_essay",
  },
  {
    id: "lic_med_en",
    cycle: "licence",
    year: "L1",
    domain: "إنجليزية طبية Medical English",
    label: "إنجليزية طبية — Medical English",
    language: "en",
    defaultDiscipline: "theoretical_essay",
  },
];

const LICENCE_L2: UfcSpecialtyOption[] = [
  {
    id: "lic_law_common",
    cycle: "licence",
    year: "L2",
    domain: "حقوق",
    label: "حقوق (جذع مشترك)",
    language: "ar",
    defaultDiscipline: "accounting_legal",
  },
  {
    id: "lic_media_common",
    cycle: "licence",
    year: "L2",
    domain: "إعلام واتصال",
    label: "إعلام واتصال (جذع مشترك)",
    language: "ar",
    defaultDiscipline: "theoretical_essay",
  },
  {
    id: "lic_mgmt_ar",
    cycle: "licence",
    year: "L2",
    domain: "علوم اقتصادية وتجارية وعلوم التسيير",
    label: "علوم التسيير",
    language: "ar",
    defaultDiscipline: "case_study",
  },
  {
    id: "lic_fin_acc_ar",
    cycle: "licence",
    year: "L2",
    domain: "علوم اقتصادية وتجارية وعلوم التسيير",
    label: "مالية ومحاسبة",
    language: "ar",
    defaultDiscipline: "accounting_legal",
  },
  {
    id: "lic_mgmt_en",
    cycle: "licence",
    year: "L2",
    domain: "علوم اقتصادية وتجارية وعلوم التسيير باللغة الإنجليزية",
    label: "Management Sciences (EN)",
    language: "en",
    defaultDiscipline: "case_study",
  },
  {
    id: "lic_fin_acc_en",
    cycle: "licence",
    year: "L2",
    domain: "علوم اقتصادية وتجارية وعلوم التسيير باللغة الإنجليزية",
    label: "Finance & Accounting (EN)",
    language: "en",
    defaultDiscipline: "accounting_legal",
  },
  {
    id: "lic_tech_en",
    cycle: "licence",
    year: "L2",
    domain: "إنجليزية تقنية Technical English",
    label: "إنجليزية تقنية — Technical English",
    language: "en",
    defaultDiscipline: "theoretical_essay",
  },
  {
    id: "lic_tech_en_teachers",
    cycle: "licence",
    year: "L2",
    domain: "إنجليزية تقنية للأساتذة Technical English for Teachers",
    label: "إنجليزية تقنية للأساتذة — Technical English for Teachers",
    language: "en",
    defaultDiscipline: "theoretical_essay",
  },
  {
    id: "lic_med_en",
    cycle: "licence",
    year: "L2",
    domain: "إنجليزية طبية Medical English",
    label: "إنجليزية طبية — Medical English",
    language: "en",
    defaultDiscipline: "theoretical_essay",
  },
];

const LICENCE_L3: UfcSpecialtyOption[] = [
  {
    id: "lic_private_law",
    cycle: "licence",
    year: "L3",
    domain: "حقوق",
    label: "قانون خاص",
    language: "ar",
    defaultDiscipline: "accounting_legal",
  },
  {
    id: "lic_public_law",
    cycle: "licence",
    year: "L3",
    domain: "حقوق",
    label: "قانون عام",
    language: "ar",
    defaultDiscipline: "accounting_legal",
  },
  {
    id: "lic_comm",
    cycle: "licence",
    year: "L3",
    domain: "إعلام واتصال",
    label: "اتصال",
    language: "ar",
    defaultDiscipline: "theoretical_essay",
  },
  {
    id: "lic_media",
    cycle: "licence",
    year: "L3",
    domain: "إعلام واتصال",
    label: "إعلام",
    language: "ar",
    defaultDiscipline: "theoretical_essay",
  },
  {
    id: "lic_mgmt_ar",
    cycle: "licence",
    year: "L3",
    domain: "علوم اقتصادية وتجارية وعلوم التسيير",
    label: "علوم التسيير",
    language: "ar",
    defaultDiscipline: "case_study",
  },
  {
    id: "lic_fin_acc_ar",
    cycle: "licence",
    year: "L3",
    domain: "علوم اقتصادية وتجارية وعلوم التسيير",
    label: "مالية ومحاسبة",
    language: "ar",
    defaultDiscipline: "accounting_legal",
  },
  {
    id: "lic_mgmt_en",
    cycle: "licence",
    year: "L3",
    domain: "علوم اقتصادية وتجارية وعلوم التسيير باللغة الإنجليزية",
    label: "Management Sciences (EN)",
    language: "en",
    defaultDiscipline: "case_study",
  },
  {
    id: "lic_fin_acc_en",
    cycle: "licence",
    year: "L3",
    domain: "علوم اقتصادية وتجارية وعلوم التسيير باللغة الإنجليزية",
    label: "Finance & Accounting (EN)",
    language: "en",
    defaultDiscipline: "accounting_legal",
  },
  {
    id: "lic_tech_en",
    cycle: "licence",
    year: "L3",
    domain: "إنجليزية تقنية Technical English",
    label: "إنجليزية تقنية — Technical English",
    language: "en",
    defaultDiscipline: "theoretical_essay",
  },
  {
    id: "lic_tech_en_teachers",
    cycle: "licence",
    year: "L3",
    domain: "إنجليزية تقنية للأساتذة Technical English for Teachers",
    label: "إنجليزية تقنية للأساتذة — Technical English for Teachers",
    language: "en",
    defaultDiscipline: "theoretical_essay",
  },
  {
    id: "lic_med_en",
    cycle: "licence",
    year: "L3",
    domain: "إنجليزية طبية Medical English",
    label: "إنجليزية طبية — Medical English",
    language: "en",
    defaultDiscipline: "theoretical_essay",
  },
];

// ============================================================================
// MASTER (17 official specialties across 5 domains, available in M1 and M2)
// ============================================================================

const MASTER_BASE_17: Array<Omit<UfcSpecialtyOption, "cycle" | "year">> = [
  // 1. ميدان العلوم الاقتصادية، التسيير والعلوم التجارية (6)
  {
    id: "m_accounting",
    domain: "ميدان العلوم الاقتصادية، التسيير والعلوم التجارية",
    label: "محاسبة",
    language: "ar",
    defaultDiscipline: "accounting_legal",
  },
  {
    id: "m_org_management",
    domain: "ميدان العلوم الاقتصادية، التسيير والعلوم التجارية",
    label: "إدارة المنظمات",
    language: "ar",
    defaultDiscipline: "case_study",
  },
  {
    id: "m_public_management",
    domain: "ميدان العلوم الاقتصادية، التسيير والعلوم التجارية",
    label: "تسيير عمومي",
    language: "ar",
    defaultDiscipline: "case_study",
  },
  {
    id: "m_e_management",
    domain: "ميدان العلوم الاقتصادية، التسيير والعلوم التجارية",
    label: "إدارة إلكترونية",
    language: "ar",
    defaultDiscipline: "case_study",
  },
  {
    id: "m_digital_marketing",
    domain: "ميدان العلوم الاقتصادية، التسيير والعلوم التجارية",
    label: "تسويق رقمي",
    language: "ar",
    defaultDiscipline: "case_study",
  },
  {
    id: "m_banking_insurance",
    domain: "ميدان العلوم الاقتصادية، التسيير والعلوم التجارية",
    label: "مالية البنوك والتأمينات",
    language: "ar",
    defaultDiscipline: "quantitative",
  },

  // 2. ميدان الحقوق والعلوم السياسية (5)
  {
    id: "m_business_law",
    domain: "ميدان الحقوق والعلوم السياسية",
    label: "قانون الأعمال",
    language: "ar",
    defaultDiscipline: "accounting_legal",
  },
  {
    id: "m_admin_law",
    domain: "ميدان الحقوق والعلوم السياسية",
    label: "قانون إداري",
    language: "ar",
    defaultDiscipline: "accounting_legal",
  },
  {
    id: "m_criminal_law",
    domain: "ميدان الحقوق والعلوم السياسية",
    label: "قانون جنائي والعلوم الجنائية",
    language: "ar",
    defaultDiscipline: "accounting_legal",
  },
  {
    id: "m_labor_law",
    domain: "ميدان الحقوق والعلوم السياسية",
    label: "قانون العمل والضمان الاجتماعي",
    language: "ar",
    defaultDiscipline: "accounting_legal",
  },
  {
    id: "m_anticorruption",
    domain: "ميدان الحقوق والعلوم السياسية",
    label: "الشفافية ومكافحة الفساد",
    language: "ar",
    defaultDiscipline: "accounting_legal",
  },

  // 3. ميدان الآداب واللغات الأجنبية (2)
  {
    id: "m_didactics_fl",
    domain: "ميدان الآداب واللغات الأجنبية",
    label: "التعليمية واللغات الأجنبية",
    language: "en",
    defaultDiscipline: "theoretical_essay",
  },
  {
    id: "m_tech_en_mgmt",
    domain: "ميدان الآداب واللغات الأجنبية",
    label: "الإنجليزية التقنية للمناجمنت (مهني)",
    language: "en",
    defaultDiscipline: "case_study",
  },

  // 4. ميدان العلوم الإنسانية والاجتماعية (3)
  {
    id: "m_school_psych",
    domain: "ميدان العلوم الإنسانية والاجتماعية",
    label: "علم النفس المدرسي",
    language: "ar",
    defaultDiscipline: "theoretical_essay",
  },
  {
    id: "m_print_digital_press",
    domain: "ميدان العلوم الإنسانية والاجتماعية",
    label: "صحافة مطبوعة وإلكترونية",
    language: "ar",
    defaultDiscipline: "theoretical_essay",
  },
  {
    id: "m_comm_pr",
    domain: "ميدان العلوم الإنسانية والاجتماعية",
    label: "اتصال وعلاقات عامة",
    language: "ar",
    defaultDiscipline: "theoretical_essay",
  },

  // 5. ميدان الرياضيات والإعلام الآلي (1)
  {
    id: "m_networks_security",
    domain: "ميدان الرياضيات والإعلام الآلي",
    label: "الشبكات والأمن (مهني)",
    language: "ar",
    defaultDiscipline: "quantitative",
  },
];

const MASTER_M1: UfcSpecialtyOption[] = MASTER_BASE_17.map((s) => ({
  ...s,
  cycle: "master",
  year: "M1",
}));

const MASTER_M2: UfcSpecialtyOption[] = MASTER_BASE_17.map((s) => ({
  ...s,
  cycle: "master",
  year: "M2",
}));

export const ALL_UFC_SPECIALTIES: UfcSpecialtyOption[] = [
  ...LICENCE_L1,
  ...LICENCE_L2,
  ...LICENCE_L3,
  ...MASTER_M1,
  ...MASTER_M2,
];

export function getYearsForCycle(cycle: AcademicCycle) {
  return UFC_CYCLES.find((c) => c.id === cycle)?.years ?? UFC_CYCLES[1].years;
}

export function getSpecialtiesFor(
  cycle: AcademicCycle,
  year: AcademicYearCode
): UfcSpecialtyOption[] {
  return ALL_UFC_SPECIALTIES.filter((s) => s.cycle === cycle && s.year === year);
}

export function findCatalogSpecialty(
  cycle?: AcademicCycle,
  year?: AcademicYearCode,
  specialtyId?: string
): UfcSpecialtyOption | null {
  if (!cycle || !year || !specialtyId) return null;
  return (
    ALL_UFC_SPECIALTIES.find(
      (s) => s.cycle === cycle && s.year === year && s.id === specialtyId
    ) ?? null
  );
}

export function getYearMeta(cycle?: AcademicCycle, year?: AcademicYearCode) {
  if (!cycle || !year) return null;
  return (
    UFC_CYCLES.find((c) => c.id === cycle)?.years.find((y) => y.code === year) ??
    null
  );
}

export function formatSpecialtyDisplay(
  cycle?: AcademicCycle,
  year?: AcademicYearCode,
  specialtyId?: string,
  fallbackText?: string
): string {
  const found = findCatalogSpecialty(cycle, year, specialtyId);
  if (!found) return fallbackText?.trim() || "";
  const yearShort =
    year === "L1"
      ? "ليسانس 1"
      : year === "L2"
      ? "ليسانس 2"
      : year === "L3"
      ? "ليسانس 3"
      : year === "M1"
      ? "ماستر 1"
      : "ماستر 2";
  return `${yearShort} — ${found.label}`;
}

export function normalizeCourseKey(
  cycle: AcademicCycle,
  year: AcademicYearCode,
  specialtyId: string,
  moduleName: string
): string {
  const cleanMod = moduleName
    .trim()
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/\s+/g, " ");
  return `${cycle}|${year}|${specialtyId}|${cleanMod}`;
}
