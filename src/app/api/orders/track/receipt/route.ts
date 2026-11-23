import { NextResponse } from "next/server";
import { getOrderByTrackingCode, saveUploadedFile, updateOrder } from "@/lib/store";
import { getPublicAppConfigAsync } from "@/lib/pricing-config";
import { sendTelegramAlert } from "@/lib/notify";
import type { PaymentReceiptMeta } from "@/types/order";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const contentType = req.headers.get("content-type") ?? "";
    let trackingCode = "";
    let referenceNote = "";
    let receipt: PaymentReceiptMeta | null = null;

    if (contentType.includes("application/json")) {
      const body = (await req.json()) as {
        trackingCode?: string;
        referenceNote?: string;
        receipt?: PaymentReceiptMeta;
      };
      trackingCode = String(body.trackingCode ?? "").trim();
      referenceNote = String(body.referenceNote ?? "").trim();
      if (body.receipt && body.receipt.originalName) {
        receipt = {
          originalName: String(body.receipt.originalName),
          storedName: body.receipt.storedName ? String(body.receipt.storedName) : undefined,
          blobUrl: body.receipt.blobUrl ? String(body.receipt.blobUrl) : undefined,
          mimeType: String(body.receipt.mimeType || "image/jpeg"),
          size: body.receipt.size ? Number(body.receipt.size) : undefined,
          referenceNote: referenceNote || undefined,
          uploadedAt: new Date().toISOString(),
        };
      }
    } else {
      const fd = await req.formData();
      trackingCode = String(fd.get("trackingCode") ?? "").trim();
      referenceNote = String(fd.get("referenceNote") ?? "").trim();
      const file = fd.get("receiptFile");
      if (file instanceof File && file.size > 0) {
        const saved = await saveUploadedFile(file, "reference");
        receipt = {
          originalName: saved.originalName,
          storedName: saved.storedName,
          blobUrl: saved.blobUrl,
          mimeType: saved.mimeType,
          size: saved.size,
          referenceNote: referenceNote || undefined,
          uploadedAt: saved.uploadedAt,
        };
      }
    }

    if (!trackingCode) {
      return NextResponse.json({ error: "رمز التتبع مطلوب." }, { status: 400 });
    }
    if (!receipt && !referenceNote) {
      return NextResponse.json(
        { error: "يرجى رفع صورة/ملف وصل الدفع أو إدخال رقم مرجع التحويل (BaridiMob)." },
        { status: 400 }
      );
    }

    const order = await getOrderByTrackingCode(trackingCode);
    if (!order) {
      return NextResponse.json({ error: "لم يتم العثور على طلب بهذا الرمز." }, { status: 404 });
    }

    const finalReceipt: PaymentReceiptMeta = receipt ?? {
      originalName: "مرجع تحويل نصي",
      mimeType: "text/plain",
      referenceNote,
      uploadedAt: new Date().toISOString(),
    };

    const updated = await updateOrder(order.id, (cur) => ({
      ...cur,
      paymentReceipt: finalReceipt,
      paymentStatus:
        cur.paymentStatus === "paid" || cur.paymentStatus === "waived"
          ? cur.paymentStatus
          : "receipt_submitted",
    }));

    const cfg = await getPublicAppConfigAsync();
    const origin = new URL(req.url).origin;
    void sendTelegramAlert(
      `💳 تم رفع وصل دفع جديد!\n` +
        `الرمز: ${order.trackingCode}\n` +
        `الطالب: ${order.studentName}\n` +
        `المبلغ: ${order.priceDzd ?? "-"} ${cfg.currency}\n` +
        (referenceNote ? `مرجع التحويل: ${referenceNote}\n` : "") +
        `لمراجعة الوصل وتأكيد الدفع:\n${origin}/admin/orders/${order.id}`
    );

    return NextResponse.json({
      ok: true,
      paymentStatus: updated?.paymentStatus ?? "receipt_submitted",
      paymentReceipt: {
        originalName: finalReceipt.originalName,
        uploadedAt: finalReceipt.uploadedAt,
        referenceNote: finalReceipt.referenceNote,
      },
    });
  } catch (err) {
    console.error("POST /api/orders/track/receipt error:", err);
    return NextResponse.json({ error: "تعذر حفظ وصل الدفع، يرجى المحاولة مجددا." }, { status: 500 });
  }
}
