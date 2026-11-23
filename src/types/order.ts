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
