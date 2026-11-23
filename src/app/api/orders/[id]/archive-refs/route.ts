import { NextResponse } from "next/server";
import { getOrderById } from "@/lib/store";
import { isAdminAuthenticated } from "@/lib/auth";
import {
  findCourseLibraryEntry,
  upsertCourseLibraryReferences,
} from "@/lib/course-library";

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
  if (!order) {
    return NextResponse.json({ error: "الطلب غير موجود" }, { status: 404 });
  }
  const entry = await findCourseLibraryEntry({
    cycle: order.cycle,
    year: order.year,
    specialtyId: order.specialtyId,
    moduleName: order.moduleName,
  });
  return NextResponse.json({
    archivedCount: entry?.referenceFiles.length ?? 0,
    archivedNames: entry?.referenceFiles.map((f) => f.originalName) ?? [],
  });
}

export async function POST(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "غير مصرح بالوصول" }, { status: 401 });
  }
  const { id } = await context.params;
  const order = await getOrderById(id);
  if (!order) {
    return NextResponse.json({ error: "الطلب غير موجود" }, { status: 404 });
  }
  if (!order.cycle || !order.year || !order.specialtyId) {
    return NextResponse.json(
      {
        error:
          "هذا الطلب لا يحتوي على (الطور + السنة + التخصص) محددا من القائمة الجديدة. الطلبات الجديدة ستدعم الأرشفة تلقائيا.",
      },
      { status: 400 }
    );
  }

  const refFiles = order.files.filter((f) => f.category === "reference");
  if (refFiles.length === 0) {
    return NextResponse.json(
      { error: "لا توجد ملفات مراجع (reference) مرفوعة في هذا الطلب لأرشفتها." },
      { status: 400 }
    );
  }

  const entry = await upsertCourseLibraryReferences({
    cycle: order.cycle,
    year: order.year,
    specialtyId: order.specialtyId,
    moduleName: order.moduleName,
    referenceFiles: refFiles,
  });

  return NextResponse.json({
    ok: true,
    archivedCount: entry.referenceFiles.length,
    archivedNames: entry.referenceFiles.map((f) => f.originalName),
  });
}
