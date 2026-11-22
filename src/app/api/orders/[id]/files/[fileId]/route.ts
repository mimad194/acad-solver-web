import { NextResponse } from "next/server";
import { getOrderById, readUploadedFileBuffer } from "@/lib/store";
import { isAdminAuthenticated } from "@/lib/auth";

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string; fileId: string }> }
) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "غير مصرح بالوصول" }, { status: 401 });
  }
  const { id, fileId } = await context.params;
  const order = await getOrderById(id);
  const meta = order?.files.find((f) => f.id === fileId);
  if (!meta) {
    return NextResponse.json({ error: "الملف غير موجود" }, { status: 404 });
  }

  const buf = await readUploadedFileBuffer(meta.storedName, meta.blobUrl);
  if (!buf) {
    return NextResponse.json({ error: "تعذر قراءة الملف" }, { status: 404 });
  }

  const encoded = encodeURIComponent(meta.originalName);
  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": meta.mimeType,
      "Content-Disposition": `inline; filename*=UTF-8''${encoded}`,
    },
  });
}
