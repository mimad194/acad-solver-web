export type OrderStatus =
  | "pending"      // قيد الانتظار
  | "in_review"    // قيد المعالجة والمراجعة
  | "completed";   // مكتمل وجاهز للتحميل

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
      text: string; // Supports inline LaTeX with $...$ and **bold**
    }
  | {
      id: string;
      type: "bullet";
      text: string; // Supports inline LaTeX with $...$ and **bold**
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
      headers: string[]; // Supports $...$ for math headers
      rows: string[][];  // Supports $...$ for math cells, numeric cells auto-protected
      hasTotalRow?: boolean;
    };

export interface SolutionDocument {
  title: string;
  includeCoverPage: boolean;
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
  trackingCode: string; // e.g., UFC-2026-1042
  studentName: string;
  contact: string; // Email or phone
  university: string;
  specialty: string; // e.g., ماستر 2 إدارة المنظمات
  moduleName: string; // e.g., تحليل المعطيات
  assignmentTitle: string;
  exerciseText: string; // Optional pasted text
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
