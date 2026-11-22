import { NextResponse } from "next/server";
import { getOrderByTrackingCode } from "@/lib/store";

export const dynamic = "force-dynamic";

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

  // Expose solution only after admin approves and marks completed
  const isReady = order.status === "completed" && order.solution !== null;
  return NextResponse.json({
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
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      filesCount: order.files.length,
      solution: isReady ? order.solution : null,
    },
  });
}
