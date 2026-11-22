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

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const studentName = String(formData.get("studentName") ?? "").trim();
    const contact = String(formData.get("contact") ?? "").trim();
    const university = String(formData.get("university") ?? "").trim();
    const specialty = String(formData.get("specialty") ?? "").trim();
    const moduleName = String(formData.get("moduleName") ?? "").trim();
    const assignmentTitle = String(formData.get("assignmentTitle") ?? "").trim();
    const exerciseText = String(formData.get("exerciseText") ?? "").trim();
    const notes = String(formData.get("notes") ?? "").trim();
    const includeCoverPage = String(formData.get("includeCoverPage") ?? "false") === "true";
    const strictReferencesOnly = String(formData.get("strictReferencesOnly") ?? "true") !== "false";

    if (!studentName || !moduleName || !assignmentTitle) {
      return NextResponse.json(
        { error: "يرجى ملء الحقول الأساسية: اسم الطالب، اسم المقياس، وعنوان النشاط." },
        { status: 400 }
      );
    }

    const exerciseFiles = formData.getAll("exerciseFiles").filter((f): f is File => f instanceof File && f.size > 0);
    const referenceFiles = formData.getAll("referenceFiles").filter((f): f is File => f instanceof File && f.size > 0);

    if (exerciseFiles.length === 0 && !exerciseText) {
      return NextResponse.json(
        { error: "يرجى رفع ملف التمرين أو كتابة نص الأسئلة في الخانة المخصصة." },
        { status: 400 }
      );
    }

    const savedFiles: UploadedFileMeta[] = [];
    for (const f of exerciseFiles) {
      savedFiles.push(await saveUploadedFile(f, "exercise"));
    }
    for (const f of referenceFiles) {
      savedFiles.push(await saveUploadedFile(f, "reference"));
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
