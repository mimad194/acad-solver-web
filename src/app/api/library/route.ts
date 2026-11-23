import { NextResponse } from "next/server";
import { listCourseLibrary } from "@/lib/course-library";
import type { AcademicCycle, AcademicYearCode } from "@/types/order";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const rawCycle = searchParams.get("cycle")?.trim();
  const rawYear = searchParams.get("year")?.trim();
  const specialtyId = searchParams.get("specialtyId")?.trim() || undefined;

  const cycle: AcademicCycle | undefined =
    rawCycle === "licence" || rawCycle === "master" ? rawCycle : undefined;
  const year: AcademicYearCode | undefined =
    rawYear === "L1" ||
    rawYear === "L2" ||
    rawYear === "L3" ||
    rawYear === "M1" ||
    rawYear === "M2"
      ? rawYear
      : undefined;

  const entries = await listCourseLibrary({ cycle, year, specialtyId });

  // Return safe public summary (module names + file names/counts, not raw storage keys)
  return NextResponse.json({
    modules: entries.map((e) => ({
      id: e.id,
      cycle: e.cycle,
      year: e.year,
      specialtyId: e.specialtyId,
      moduleName: e.moduleName,
      refCount: e.referenceFiles.length,
      refNames: e.referenceFiles.map((f) => f.originalName),
      updatedAt: e.updatedAt,
    })),
  });
}
