export type OrderStatus =
  | "pending"      // قيد الانتظار
  | "in_review"    // قيد المعالجة والمراجعة
  | "completed";   // مكتمل وجاهز للتحميل

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
  | "enrich_study_guide";  // توليد/تحديث دليل الفهم والمناقشة للطالب

export interface StudyGuideMeta {
  summary: string;
  keyPoints: string[];
  defenseQuestions: string[];
}

export interface QualityAuditMeta {
  discipline: Exclude<AcademicDiscipline, "auto">;
  auditPassApplied: boolean;
  humanizedPassApplied?: boolean;
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

export interface StudentOrder {
  id: string;
  trackingCode: string;
  studentName: string;
  contact: string;
  university: string;
  specialty: string;
  moduleName: string;
  assignmentTitle: string;
  exerciseText: string;
  notes: string;
  includeCoverPage: boolean;
  strictReferencesOnly: boolean;
  status: OrderStatus;
  adminNote: string;
  files: UploadedFileMeta[];
  solution: SolutionDocument | null;
  createdAt: string;
  updatedAt: string;
}
