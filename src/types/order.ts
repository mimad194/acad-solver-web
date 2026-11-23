export type OrderStatus =
  | "pending"      // قيد الانتظار
  | "in_review"    // قيد المعالجة والمراجعة
  | "completed";   // مكتمل وجاهز للتحميل

export type PackageId = "standard" | "premium" | "semester";

export type PaymentStatus =
  | "unpaid"            // بانتظار الدفع
  | "receipt_submitted" // تم رفع وصل الدفع (للمراجعة)
  | "paid"              // تم تأكيد الدفع
  | "waived";           // مجاني / معفى

export interface PaymentReceiptMeta {
  originalName: string;
  storedName?: string;
  blobUrl?: string;
  mimeType: string;
  size?: number;
  referenceNote?: string;
  uploadedAt: string;
}

export interface PricingPackage {
  id: PackageId;
  name: string;
  badge?: string;
  priceDzd: number;
  creditsCount?: number; // 1 for single, 3 for wave pack, 17 for semester pack
  subtitle: string;
  features: string[];
  highlighted?: boolean;
}

export interface ReferralConfig {
  enabled: boolean;
  targetCount: number; // e.g. 3 paid referrals = 1 free 100% promo code
  friendDiscountPercent: number; // e.g. 10% welcome discount for referred friend
}

export interface PromoCodeEntry {
  code: string; // uppercase trimmed
  discountPercent: number; // 1..100
  maxUses: number; // 0 = unlimited
  usedCount: number;
  active: boolean;
  allowedPackageIds?: PackageId[]; // e.g. ["standard"] for referral reward codes
  note?: string;
  source?: "admin" | "referral_reward";
  ownerOrderId?: string;
  createdAt: string;
}

export interface CreditPassEntry {
  passCode: string; // e.g. PASS-7K4M2
  ownerOrderId: string;
  studentName: string;
  contact: string;
  university: string;
  cycle?: AcademicCycle;
  year?: AcademicYearCode;
  specialtyId?: string;
  specialty: string;
  packageId: PackageId;
  totalCredits: number;
  usedCredits: number;
  consumedOrderIds: string[];
  expiresAt: string; // ISO date — valid within current semester before exams
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PublicAppConfig {
  currency: string;
  packages: PricingPackage[];
  cohortMaxSlots: number;
  previewLockEnabled: boolean;
  semesterPassExpiresAt?: string; // YYYY-MM-DD (pre-exam cutoff for semester credits)
  referral: ReferralConfig;
  payment: {
    baridimobRip: string;
    ccpAccount: string;
    accountName: string;
  };
  supportWhatsapp: string;
}

export type StyleProfileId =
  | "analytical_narrative" // تحليلي سردي مترابط
  | "concise_direct"       // منهجي موجز ومباشر
  | "managerial_applied"   // تطبيقي موجه للتسيير
  | "tabular_comparative"  // مجدول ومقارن
  | "stepwise_didactic"    // تدريجي مفصّل خطوة بخطوة
  | "conclusion_first";    // استنتاجي (النتيجة ثم التعليل)

export type DocxThemeId =
  | "classic_navy"         // أزرق أكاديمي (Traditional Arabic)
  | "charcoal_minimal"     // رمادي فحمي حديث (Simplified Arabic)
  | "emerald_academic"     // أخضر زمردي هادئ (Sakkal Majalla)
  | "burgundy_formal"      // عنابي جامعي رسمي (Traditional Arabic)
  | "print_bw";            // أبيض وأسود كلاسيكي للطباعة (Simplified Arabic)

export type AcademicDiscipline =
  | "auto"                 // كشف تلقائي حسب المقياس والملفات
  | "quantitative"         // كمي / إحصاء / تحليل معطيات / قياسي / مالية
  | "case_study"           // دراسة حالة / تسيير / استراتيجية / تسويق
  | "theoretical_essay"    // بحث / مقال أكاديمي / أسئلة نظرية ومقارنة
  | "accounting_legal";    // محاسبة / تدقيق / قانون / جباية

export type RefineMode =
  | "deepen_and_audit"     // تدقيق حسابي ومنهجي وتعميق شامل (المرحلة 2)
  | "humanize_academic"    // أنسنة أكاديمية للنثر مع تثبيت الأرقام والمعادلات
  | "surgical_diverge"     // فك تشابه جراحي يستهدف العبارات المتقاطعة مع الدفعة فقط
  | "enrich_study_guide";  // توليد/تحديث دليل الفهم والمناقشة للطالب

export type DocxTableVariant =
  | "classic_grid"
  | "modern_horizontal"
  | "tinted_minimal"
  | "booktabs";

export type DocxHeadingVariant =
  | "shaded_band"
  | "bottom_rule"
  | "right_accent"
  | "minimal_bold";

export interface DocxVisualDNA {
  fontPairId: string;
  paletteId: string;
  tableVariant: DocxTableVariant;
  headingVariant: DocxHeadingVariant;
  spacingId: "compact" | "standard" | "airy";
}

export type DepthBandId = "concise_solid" | "balanced_thorough" | "exhaustive_honors";

export interface SolutionDNA {
  signature: string;
  structureId: string;
  voiceId: string;
  cadenceId: string;
  numberingId: string;
  lexiconId: string;
  mathStyleId: string;
  depthBand?: DepthBandId;
  visualDna: DocxVisualDNA;
}

export interface StudyGuideMeta {
  summary: string;
  keyPoints: string[];
  defenseQuestions: string[];
}

export interface QualityAuditMeta {
  discipline: Exclude<AcademicDiscipline, "auto">;
  auditPassApplied: boolean;
  humanizedPassApplied?: boolean;
  autoDivergenceApplied?: boolean;
  cohortMaxSimilarity?: number;
  dnaLabel?: string;
  verifiedQuestionsCount?: number;
  auditNotes?: string[];
  studyGuide?: StudyGuideMeta;
}

export interface UploadedFileMeta {
  id: string;
  originalName: string;
  storedName: string;
  blobUrl?: string;
  mimeType: string;
  size: number;
  category: "exercise" | "reference";
  uploadedAt: string;
}

export type DocumentBlock =
  | {
      id: string;
      type: "doc_title";
      text: string;
    }
  | {
      id: string;
      type: "exercise_heading";
      text: string;
    }
  | {
      id: string;
      type: "question_heading";
      text: string;
    }
  | {
      id: string;
      type: "sub_heading";
      text: string;
    }
  | {
      id: string;
      type: "paragraph";
      text: string;
    }
  | {
      id: string;
      type: "bullet";
      text: string;
    }
  | {
      id: string;
      type: "equation";
      latex: string;
      callout?: boolean;
    }
  | {
      id: string;
      type: "table";
      caption?: string;
      headers: string[];
      rows: string[][];
      hasTotalRow?: boolean;
    };

export interface SolutionDocument {
  title: string;
  includeCoverPage: boolean;
  styleProfile?: StyleProfileId;
  docxTheme?: DocxThemeId;
  dna?: SolutionDNA;
  qualityMeta?: QualityAuditMeta;
  coverMeta?: {
    university?: string;
    specialty?: string;
    moduleName?: string;
    studentName?: string;
    academicYear?: string;
  };
  blocks: DocumentBlock[];
  updatedAt: string;
}

export type AcademicCycle = "licence" | "master";

export type AcademicYearCode = "L1" | "L2" | "L3" | "M1" | "M2";

export interface CourseLibraryEntry {
  id: string;
  key: string; // normalized cycle|year|specialtyId|moduleName
  cycle: AcademicCycle;
  year: AcademicYearCode;
  specialtyId: string;
  specialtyLabel: string;
  domain: string;
  moduleName: string;
  referenceFiles: UploadedFileMeta[];
  updatedAt: string;
}

export interface StudentOrder {
  id: string;
  trackingCode: string;
  studentName: string;
  contact: string;
  university: string;
  cycle?: AcademicCycle;
  year?: AcademicYearCode;
  domain?: string;
  specialtyId?: string;
  specialty: string;
  moduleName: string;
  assignmentTitle: string;
  exerciseText: string;
  notes: string;
  includeCoverPage: boolean;
  strictReferencesOnly: boolean;
  usedLibraryRefCount?: number;
  packageId?: PackageId;
  originalPriceDzd?: number;
  discountPercent?: number;
  discountAmountDzd?: number;
  promoCodeUsed?: string;
  creditPassUsed?: string;
  issuedPassCode?: string;
  referralCode?: string;
  referredByCode?: string;
  rewardPromoCodes?: string[];
  priceDzd?: number;
  paymentStatus?: PaymentStatus;
  paymentReceipt?: PaymentReceiptMeta | null;
  paidAt?: string | null;
  status: OrderStatus;
  adminNote: string;
  files: UploadedFileMeta[];
  solution: SolutionDocument | null;
  createdAt: string;
  updatedAt: string;
}
