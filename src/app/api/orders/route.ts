import { NextResponse } from "next/server";
import { createOrder, listOrders, saveUploadedFile } from "@/lib/store";
import { isAdminAuthenticated } from "@/lib/auth";
import { UploadedFileMeta } from "@/types/order";

export async function GET() {
  const ok = await isAdminAuthenticated();
  if (!ok) {
    return NextResponse.json({ error: "غير مصرح بالوصول" }, { status: 401 });
  }
  const orders = await listOrders();
  return NextResponse.json({ orders });
}

interface JsonOrderPayload {
  studentName?: string;
  contact?: string;
  university?: string;
  specialty?: string;
  moduleName?: string;
  assignmentTitle?: string;
  exerciseText?: string;
  notes?: string;
  includeCoverPage?: boolean;
  strictReferencesOnly?: boolean;
  uploadedFiles?: UploadedFileMeta[];
}

export async function POST(req: Request) {
  try {
    const contentType = req.headers.get("content-type") ?? "";
    let studentName = "";
    let contact = "";
    let university = "";
    let specialty = "";
    let moduleName = "";
    let assignmentTitle = "";
    let exerciseText = "";
    let notes = "";
    let includeCoverPage = false;
    let strictReferencesOnly = true;
    const savedFiles: UploadedFileMeta[] = [];

    if (contentType.includes("application/json")) {
      const body = (await req.json()) as JsonOrderPayload;
      studentName = String(body.studentName ?? "").trim();
      contact = String(body.contact ?? "").trim();
      university = String(body.university ?? "").trim();
      specialty = String(body.specialty ?? "").trim();
      moduleName = String(body.moduleName ?? "").trim();
      assignmentTitle = String(body.assignmentTitle ?? "").trim();
      exerciseText = String(body.exerciseText ?? "").trim();
      notes = String(body.notes ?? "").trim();
      includeCoverPage = Boolean(body.includeCoverPage);
      strictReferencesOnly = body.strictReferencesOnly !== false;
      if (Array.isArray(body.uploadedFiles)) {
        for (const f of body.uploadedFiles) {
          if (f && f.blobUrl && f.originalName) {
            savedFiles.push({
              id: String(f.id || crypto.randomUUID()),
              originalName: String(f.originalName),
              storedName: String(f.storedName || f.originalName),
              blobUrl: String(f.blobUrl),
              mimeType: String(f.mimeType || "application/octet-stream"),
              size: Number(f.size || 0),
              category: f.category === "reference" ? "reference" : "exercise",
              uploadedAt: f.uploadedAt || new Date().toISOString(),
            });
          }
        }
      }
    } else {
      const formData = await req.formData();
      studentName = String(formData.get("studentName") ?? "").trim();
      contact = String(formData.get("contact") ?? "").trim();
      university = String(formData.get("university") ?? "").trim();
      specialty = String(formData.get("specialty") ?? "").trim();
      moduleName = String(formData.get("moduleName") ?? "").trim();
      assignmentTitle = String(formData.get("assignmentTitle") ?? "").trim();
      exerciseText = String(formData.get("exerciseText") ?? "").trim();
      notes = String(formData.get("notes") ?? "").trim();
      includeCoverPage = String(formData.get("includeCoverPage") ?? "false") === "true";
      strictReferencesOnly = String(formData.get("strictReferencesOnly") ?? "true") !== "false";

      const exerciseFiles = formData
        .getAll("exerciseFiles")
        .filter((f): f is File => f instanceof File && f.size > 0);
      const referenceFiles = formData
        .getAll("referenceFiles")
        .filter((f): f is File => f instanceof File && f.size > 0);

      for (const f of exerciseFiles) {
        savedFiles.push(await saveUploadedFile(f, "exercise"));
      }
      for (const f of referenceFiles) {
        savedFiles.push(await saveUploadedFile(f, "reference"));
      }
    }

    if (!studentName || !moduleName || !assignmentTitle) {
      return NextResponse.json(
        { error: "يرجى ملء الحقول الأساسية: اسم الطالب، اسم المقياس، وعنوان النشاط." },
        { status: 400 }
      );
    }

    if (savedFiles.length === 0 && !exerciseText) {
      return NextResponse.json(
        { error: "يرجى رفع ملف التمرين أو كتابة نص الأسئلة في الخانة المخصصة." },
        { status: 400 }
      );
    }

    const order = await createOrder({
      studentName,
      contact,
      university,
      specialty,
      moduleName,
      assignmentTitle,
      exerciseText,
      notes,
      includeCoverPage,
      strictReferencesOnly,
      files: savedFiles,
    });

    return NextResponse.json(
      {
        id: order.id,
        trackingCode: order.trackingCode,
        status: order.status,
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("POST /api/orders error:", err);
    return NextResponse.json({ error: "حدث خطأ أثناء تسجيل الطلب." }, { status: 500 });
  }
}
