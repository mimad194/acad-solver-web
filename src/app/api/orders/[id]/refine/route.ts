import { NextResponse } from "next/server";
import { getOrderById, updateOrder } from "@/lib/store";
import { isAdminAuthenticated } from "@/lib/auth";
import { refineSolutionWithGemini } from "@/lib/gemini-solver";
import type {
  AcademicDiscipline,
  RefineMode,
  StyleProfileId,
} from "@/types/order";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

const ALLOWED_MODES = new Set<RefineMode>([
  "deepen_and_audit",
  "humanize_academic",
  "enrich_study_guide",
]);

export async function POST(
  req: Request,
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
  if (!order.solution) {
    return NextResponse.json(
      { error: "يجب توليد مسودة الحل أولا قبل تشغيل التدقيق أو الأنسنة." },
      { status: 400 }
    );
  }

  let mode: RefineMode = "deepen_and_audit";
  let extraInstruction = "";
  let model = "";
  let styleProfile: StyleProfileId | undefined;
  let discipline: AcademicDiscipline | undefined;

  try {
    const body = (await req.json()) as {
      mode?: RefineMode;
      extraInstruction?: string;
      model?: string;
      styleProfile?: StyleProfileId;
      discipline?: AcademicDiscipline;
    };
    if (body.mode && ALLOWED_MODES.has(body.mode)) {
      mode = body.mode;
    }
    extraInstruction = body.extraInstruction?.trim() ?? "";
    model = body.model?.trim() ?? "";
    styleProfile = body.styleProfile;
    discipline = body.discipline;
  } catch {
    // defaults apply
  }

  try {
    const { solution, usedModel, auditNotes } = await refineSolutionWithGemini(
      order,
      {
        mode,
        extraInstruction,
        preferredModel: model || undefined,
        styleProfile,
        discipline,
      }
    );
    const updated = await updateOrder(id, (cur) => ({
      ...cur,
      solution,
    }));
    return NextResponse.json({ order: updated, usedModel, auditNotes });
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "تعذر تنفيذ مرحلة التدقيق والتحسين.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
