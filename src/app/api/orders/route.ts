import { NextResponse } from "next/server";
import { createOrder, listOrders, saveUploadedFile } from "@/lib/store";
import { isAdminAuthenticated } from "@/lib/auth";
import { getPublicAppConfig, resolvePackagePrice } from "@/lib/pricing-config";
import { sendTelegramAlert } from "@/lib/notify";
import { PackageId, UploadedFileMeta } from "@/types/order";

export const dynamic = "force-dynamic";

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
  packageId?: PackageId;
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
    let requestedPackageId: PackageId | undefined;
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
      requestedPackageId = body.packageId;
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
      const rawPkg = String(formData.get("packageId") ?? "").trim();
      if (rawPkg === "standard" || rawPkg === "premium" || rawPkg === "semester") {
        requestedPackageId = rawPkg;
      }

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

    const pkg = resolvePackagePrice(requestedPackageId);
    const cfg = getPublicAppConfig();

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
      packageId: pkg.packageId,
      priceDzd: pkg.priceDzd,
      paymentStatus: "unpaid",
      paymentReceipt: null,
      paidAt: null,
      files: savedFiles,
    });

    const origin = new URL(req.url).origin;
    void sendTelegramAlert(
      `📥 طلب جديد في المنصة\n` +
        `الرمز: ${order.trackingCode}\n` +
        `الطالب: ${order.studentName}${order.contact ? ` (${order.contact})` : ""}\n` +
        `المقياس: ${order.moduleName} — ${order.assignmentTitle}\n` +
        `الباقة: ${pkg.packageName} (${pkg.priceDzd} ${cfg.currency})\n` +
        `المرفقات: ${savedFiles.length} ملف\n` +
        `الإدارة: ${origin}/admin/orders/${order.id}`
    );

    return NextResponse.json(
      {
        id: order.id,
        trackingCode: order.trackingCode,
        status: order.status,
        packageId: order.packageId,
        priceDzd: order.priceDzd,
        paymentStatus: order.paymentStatus,
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("POST /api/orders error:", err);
    return NextResponse.json({ error: "حدث خطأ أثناء تسجيل الطلب." }, { status: 500 });
  }
}
