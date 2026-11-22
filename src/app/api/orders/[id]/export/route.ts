import { NextResponse } from "next/server";
import { getOrderById } from "@/lib/store";
import { isAdminAuthenticated } from "@/lib/auth";
import { generateRtlDocxBuffer } from "@/lib/docx-generator";

export const maxDuration = 30;

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const order = await getOrderById(id);
  if (!order || !order.solution) {
    return NextResponse.json({ error: "ملف الحل غير متوفر بعد." }, { status: 404 });
  }

  const isAdmin = await isAdminAuthenticated();
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code")?.trim().toUpperCase();
  const isStudentAuthorized =
    Boolean(code && code === order.trackingCode.toUpperCase() && order.status === "completed");

  if (!isAdmin && !isStudentAuthorized) {
    return NextResponse.json({ error: "غير مصرح بتحميل هذا الملف حاليا." }, { status: 403 });
  }

  const buffer = await generateRtlDocxBuffer(order.solution);
  const safeBase = (order.solution.title || order.assignmentTitle || order.trackingCode)
    .replace(/[\\/:*?"<>|]/g, "")
    .trim();
  const encodedFilename = encodeURIComponent(`${safeBase}.docx`);

  return new NextResponse(Buffer.from(buffer), {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="solution-${order.trackingCode}.docx"; filename*=UTF-8''${encodedFilename}`,
      "Cache-Control": "no-store",
    },
  });
}
