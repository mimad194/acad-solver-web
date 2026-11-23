import { NextResponse } from "next/server";
import { getOrderByTrackingCode } from "@/lib/store";
import { getPublicAppConfig, isOrderPaymentUnlocked } from "@/lib/pricing-config";
import type { SolutionDocument } from "@/types/order";

export const dynamic = "force-dynamic";

const FREE_PREVIEW_BLOCK_LIMIT = 4;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code")?.trim();
  if (!code) {
    return NextResponse.json({ error: "يرجى إدخال رمز تتبع الطلب." }, { status: 400 });
  }

  const order = await getOrderByTrackingCode(code);
  if (!order) {
    return NextResponse.json({ error: "لم يتم العثور على طلب بهذا الرمز." }, { status: 404 });
  }

  const config = getPublicAppConfig();
  const isCompleted = order.status === "completed" && order.solution !== null;
  const isPaymentUnlocked = isOrderPaymentUnlocked(order);

  let exposedSolution: SolutionDocument | null = null;
  const totalBlocksCount = order.solution?.blocks.length ?? 0;
  let hasStudyGuide = Boolean(order.solution?.qualityMeta?.studyGuide?.summary);

  if (isCompleted && order.solution) {
    if (isPaymentUnlocked) {
      exposedSolution = order.solution;
    } else {
      // Partial free preview lock: expose ONLY first few blocks server-side until payment is confirmed
      exposedSolution = {
        ...order.solution,
        blocks: order.solution.blocks.slice(0, FREE_PREVIEW_BLOCK_LIMIT),
        qualityMeta: order.solution.qualityMeta
          ? {
              discipline: order.solution.qualityMeta.discipline,
              auditPassApplied: order.solution.qualityMeta.auditPassApplied,
              humanizedPassApplied: order.solution.qualityMeta.humanizedPassApplied,
              verifiedQuestionsCount: order.solution.qualityMeta.verifiedQuestionsCount,
            }
          : undefined,
      };
    }
  } else {
    hasStudyGuide = false;
  }

  return NextResponse.json({
    config,
    order: {
      id: order.id,
      trackingCode: order.trackingCode,
      studentName: order.studentName,
      university: order.university,
      specialty: order.specialty,
      moduleName: order.moduleName,
      assignmentTitle: order.assignmentTitle,
      status: order.status,
      adminNote: order.adminNote,
      includeCoverPage: order.includeCoverPage,
      packageId: order.packageId ?? "premium",
      priceDzd: order.priceDzd ?? null,
      paymentStatus: order.paymentStatus ?? "paid",
      paymentReceipt: order.paymentReceipt
        ? {
            originalName: order.paymentReceipt.originalName,
            uploadedAt: order.paymentReceipt.uploadedAt,
            referenceNote: order.paymentReceipt.referenceNote,
          }
        : null,
      isPaymentUnlocked,
      totalBlocksCount,
      hasStudyGuide,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      filesCount: order.files.length,
      solution: exposedSolution,
    },
  });
}
