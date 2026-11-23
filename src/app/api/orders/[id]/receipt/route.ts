import { NextResponse } from "next/server";
import { getOrderById, readUploadedFileBuffer } from "@/lib/store";
import { isAdminAuthenticated } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "غير مصرح بالوصول" }, { status: 401 });
  }
  const { id } = await context.params;
  const order = await getOrderById(id);
  const receipt = order?.paymentReceipt;
  if (!receipt) {
    return NextResponse.json({ error: "لا يوجد وصل دفع مرفوع لهذا الطلب." }, { status: 404 });
  }
  if (receipt.blobUrl) {
    return NextResponse.redirect(receipt.blobUrl);
  }
  if (receipt.storedName) {
    const buf = await readUploadedFileBuffer(receipt.storedName);
    if (buf) {
      return new NextResponse(new Uint8Array(buf), {
        status: 200,
        headers: {
          "Content-Type": receipt.mimeType || "application/octet-stream",
          "Content-Disposition": `inline; filename="${encodeURIComponent(receipt.originalName)}"`,
        },
      });
    }
  }
  return NextResponse.json({
    originalName: receipt.originalName,
    referenceNote: receipt.referenceNote,
    uploadedAt: receipt.uploadedAt,
  });
}
