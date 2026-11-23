import crypto from "crypto";
import { NextResponse } from "next/server";
import { createOrder, listOrders, saveUploadedFile } from "@/lib/store";
import { isAdminAuthenticated } from "@/lib/auth";
import {
  getPublicAppConfigAsync,
  resolvePackagePriceAsync,
} from "@/lib/pricing-config";
import { sendTelegramAlert } from "@/lib/notify";
import { findCourseLibraryEntry } from "@/lib/course-library";
import { findCatalogSpecialty, formatSpecialtyDisplay } from "@/lib/ufc-catalog";
import {
  consumePromoCodeAtomic,
  generateUniqueReferralCode,
  normalizeCode,
  rollbackPromoUsage,
  validatePromoOrReferralCode,
} from "@/lib/promo-referral";
import {
  consumeOneCredit,
  issueCreditPassForOrder,
  refundOneCredit,
} from "@/lib/credit-passes";
import {
  AcademicCycle,
  AcademicYearCode,
  PackageId,
  UploadedFileMeta,
} from "@/types/order";

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
  cycle?: AcademicCycle;
  year?: AcademicYearCode;
  specialtyId?: string;
  specialty?: string;
  moduleName?: string;
  assignmentTitle?: string;
  exerciseText?: string;
  notes?: string;
  includeCoverPage?: boolean;
  strictReferencesOnly?: boolean;
  packageId?: PackageId;
  promoCode?: string;
  referredByCode?: string;
  uploadedFiles?: UploadedFileMeta[];
}

export async function POST(req: Request) {
  try {
    const contentType = req.headers.get("content-type") ?? "";
    let studentName = "";
    let contact = "";
    let university = "";
    let cycle: AcademicCycle | undefined;
    let year: AcademicYearCode | undefined;
    let specialtyId = "";
    let specialty = "";
    let moduleName = "";
    let assignmentTitle = "";
    let exerciseText = "";
    let notes = "";
    let includeCoverPage = false;
    let strictReferencesOnly = true;
    let requestedPackageId: PackageId | undefined;
    let promoCodeInput = "";
    let referredByInput = "";
    const savedFiles: UploadedFileMeta[] = [];

    if (contentType.includes("application/json")) {
      const body = (await req.json()) as JsonOrderPayload;
      studentName = String(body.studentName ?? "").trim();
      contact = String(body.contact ?? "").trim();
      university = String(body.university ?? "").trim();
      if (body.cycle === "licence" || body.cycle === "master") cycle = body.cycle;
      if (
        body.year === "L1" ||
        body.year === "L2" ||
        body.year === "L3" ||
        body.year === "M1" ||
        body.year === "M2"
      ) {
        year = body.year;
      }
      specialtyId = String(body.specialtyId ?? "").trim();
      specialty = String(body.specialty ?? "").trim();
      moduleName = String(body.moduleName ?? "").trim();
      assignmentTitle = String(body.assignmentTitle ?? "").trim();
      exerciseText = String(body.exerciseText ?? "").trim();
      notes = String(body.notes ?? "").trim();
      includeCoverPage = Boolean(body.includeCoverPage);
      strictReferencesOnly = body.strictReferencesOnly !== false;
      requestedPackageId = body.packageId;
      promoCodeInput = String(body.promoCode ?? "").trim();
      referredByInput = String(body.referredByCode ?? "").trim();
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
      const rawCycle = String(formData.get("cycle") ?? "").trim();
      if (rawCycle === "licence" || rawCycle === "master") cycle = rawCycle;
      const rawYear = String(formData.get("year") ?? "").trim();
      if (
        rawYear === "L1" ||
        rawYear === "L2" ||
        rawYear === "L3" ||
        rawYear === "M1" ||
        rawYear === "M2"
      ) {
        year = rawYear;
      }
      specialtyId = String(formData.get("specialtyId") ?? "").trim();
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
      promoCodeInput = String(formData.get("promoCode") ?? "").trim();
      referredByInput = String(formData.get("referredByCode") ?? "").trim();

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

    const catalogSpec = findCatalogSpecialty(cycle, year, specialtyId);
    const resolvedSpecialtyText = formatSpecialtyDisplay(
      cycle,
      year,
      specialtyId,
      specialty
    );
    const libraryEntry = await findCourseLibraryEntry({
      cycle,
      year,
      specialtyId: specialtyId || undefined,
      moduleName,
    });
    const libraryRefCount = libraryEntry?.referenceFiles.length ?? 0;

    if (savedFiles.length === 0 && !exerciseText && libraryRefCount === 0) {
      return NextResponse.json(
        { error: "يرجى رفع ملف التمرين أو كتابة نص الأسئلة في الخانة المخصصة." },
        { status: 400 }
      );
    }

    const pkg = await resolvePackagePriceAsync(requestedPackageId);
    const cfg = await getPublicAppConfigAsync();

    // Server-side promo / referral / credit pass resolution (never trust client-side price)
    const orderId = crypto.randomUUID();
    let originalPriceDzd = pkg.priceDzd;
    let finalPriceDzd = originalPriceDzd;
    let discountPercent = 0;
    let discountAmountDzd = 0;
    let promoCodeUsed: string | undefined;
    let creditPassUsed: string | undefined;
    let remainingPassCredits: number | undefined;
    let resolvedReferredBy: string | undefined;
    let effectivePackageId = pkg.packageId;

    if (promoCodeInput) {
      const check = await validatePromoOrReferralCode(
        promoCodeInput,
        originalPriceDzd,
        pkg.packageId
      );
      if (!check.valid) {
        return NextResponse.json({ error: check.message }, { status: 400 });
      }
      if (check.kind === "credit_pass") {
        const consumedPass = await consumeOneCredit(check.code, orderId);
        if (!consumedPass) {
          return NextResponse.json(
            {
              error:
                "تعذر استهلاك الرصيد: ربما تم استنفاد آخر نشاط في رمزك أو انتهت صلاحيته.",
            },
            { status: 409 }
          );
        }
        const standardPkg = await resolvePackagePriceAsync("standard");
        creditPassUsed = consumedPass.passCode;
        effectivePackageId = "standard"; // Consuming 1 activity credit
        originalPriceDzd = standardPkg.priceDzd;
        discountPercent = 100;
        discountAmountDzd = standardPkg.priceDzd;
        finalPriceDzd = 0;
        remainingPassCredits = Math.max(
          0,
          consumedPass.totalCredits - consumedPass.usedCredits
        );
      } else if (check.kind === "promo") {
        const consumed = await consumePromoCodeAtomic(check.code, pkg.packageId);
        if (!consumed.ok) {
          return NextResponse.json({ error: consumed.message }, { status: 409 });
        }
        promoCodeUsed = consumed.promo.code;
        discountPercent = Math.min(
          100,
          Math.max(0, Math.round(consumed.promo.discountPercent))
        );
        discountAmountDzd =
          discountPercent === 100
            ? originalPriceDzd
            : Math.round((originalPriceDzd * discountPercent) / 100);
        finalPriceDzd = Math.max(0, originalPriceDzd - discountAmountDzd);
      } else if (check.kind === "referral") {
        resolvedReferredBy = check.code;
        discountPercent = check.discountPercent;
        discountAmountDzd = check.discountAmountDzd;
        finalPriceDzd = check.finalPriceDzd;
      }
    } else if (referredByInput) {
      // Passive ?ref= link attribution: apply if valid, don't block order if link is stale
      const refCheck = await validatePromoOrReferralCode(
        referredByInput,
        originalPriceDzd,
        pkg.packageId
      );
      if (refCheck.valid && refCheck.kind === "referral") {
        resolvedReferredBy = refCheck.code;
        discountPercent = refCheck.discountPercent;
        discountAmountDzd = refCheck.discountAmountDzd;
        finalPriceDzd = refCheck.finalPriceDzd;
      }
    }

    // If student came via ?ref=... link AND typed a separate promo code, preserve referral attribution
    if (!resolvedReferredBy && referredByInput) {
      const refCheck = await validatePromoOrReferralCode(
        referredByInput,
        originalPriceDzd,
        pkg.packageId
      );
      if (refCheck.valid && refCheck.kind === "referral") {
        resolvedReferredBy = refCheck.code;
      }
    }

    const myReferralCode = await generateUniqueReferralCode();
    const initialPaymentStatus = finalPriceDzd === 0 ? "waived" : "unpaid";

    let order;
    try {
      order = await createOrder({
        id: orderId,
        studentName,
        contact,
        university,
        cycle,
        year,
        domain: catalogSpec?.domain,
        specialtyId: specialtyId || undefined,
        specialty: resolvedSpecialtyText,
        moduleName,
        assignmentTitle,
        exerciseText,
        notes,
        includeCoverPage,
        strictReferencesOnly,
        usedLibraryRefCount: libraryRefCount,
        packageId: effectivePackageId,
        originalPriceDzd,
        discountPercent,
        discountAmountDzd,
        promoCodeUsed,
        creditPassUsed,
        referralCode: myReferralCode,
        referredByCode: resolvedReferredBy ? normalizeCode(resolvedReferredBy) : undefined,
        rewardPromoCodes: [],
        priceDzd: finalPriceDzd,
        paymentStatus: initialPaymentStatus,
        paymentReceipt: null,
        paidAt: finalPriceDzd === 0 ? new Date().toISOString() : null,
        files: savedFiles,
      });
    } catch (createErr) {
      // Rollback consumed promo usage or credit pass so nothing is leaked on failure
      if (promoCodeUsed) {
        await rollbackPromoUsage(promoCodeUsed).catch((e) =>
          console.error("Failed to rollback promo usage:", e)
        );
      }
      if (creditPassUsed) {
        await refundOneCredit(creditPassUsed, orderId).catch((e) =>
          console.error("Failed to refund credit pass:", e)
        );
      }
      throw createErr;
    }

    let issuedPassCode: string | undefined;
    if (!creditPassUsed && initialPaymentStatus === "waived") {
      const pass = await issueCreditPassForOrder(order);
      if (pass) issuedPassCode = pass.passCode;
    }

    const origin = new URL(req.url).origin;
    void sendTelegramAlert(
      `📥 طلب جديد في المنصة\n` +
        `الرمز: ${order.trackingCode}\n` +
        `الطالب: ${order.studentName}${order.contact ? ` (${order.contact})` : ""}\n` +
        `المسار: ${resolvedSpecialtyText || "غير محدد"}\n` +
        `المقياس: ${order.moduleName} — ${order.assignmentTitle}\n` +
        (creditPassUsed
          ? `🎟️ مسحوب من رصيد السداسي (${creditPassUsed} — متبقي ${remainingPassCredits ?? "?"})`
          : `الباقة: ${pkg.packageName} — الصافي: ${finalPriceDzd} ${cfg.currency}` +
            (discountPercent > 0
              ? ` (خصم ${discountPercent}% ${promoCodeUsed ? `بكود ${promoCodeUsed}` : resolvedReferredBy ? `بإحالة ${resolvedReferredBy}` : ""})`
              : "")) +
        `\nالمرفقات: ${savedFiles.length} ملف` +
        (libraryRefCount > 0 ? ` (+ ${libraryRefCount} مرجع تلقائي من المكتبة)` : "") +
        `\nالإدارة: ${origin}/admin/orders/${order.id}`
    );

    return NextResponse.json(
      {
        id: order.id,
        trackingCode: order.trackingCode,
        referralCode: order.referralCode,
        issuedPassCode,
        creditPassUsed,
        remainingPassCredits,
        status: order.status,
        packageId: order.packageId,
        originalPriceDzd: order.originalPriceDzd,
        discountPercent: order.discountPercent,
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
