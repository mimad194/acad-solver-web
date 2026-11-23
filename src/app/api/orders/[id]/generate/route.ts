import { NextResponse } from "next/server";
import { getOrderById, updateOrder } from "@/lib/store";
import { isAdminAuthenticated } from "@/lib/auth";
import { generateSolutionWithGemini } from "@/lib/gemini-solver";
import type { DocxThemeId, StyleProfileId } from "@/types/order";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

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

  let extraInstruction = "";
  let model = "";
  let styleProfile: StyleProfileId | undefined;
  let docxTheme: DocxThemeId | undefined;
  try {
    const body = (await req.json()) as {
      extraInstruction?: string;
      model?: string;
      styleProfile?: StyleProfileId;
      docxTheme?: DocxThemeId;
    };
    extraInstruction = body.extraInstruction?.trim() ?? "";
    model = body.model?.trim() ?? "";
    styleProfile = body.styleProfile;
    docxTheme = body.docxTheme;
  } catch {
    // Optional JSON body
  }

  try {
    const { solution, usedModel } = await generateSolutionWithGemini(order, {
      extraInstruction,
      preferredModel: model || undefined,
      styleProfile,
      docxTheme,
    });
    const updated = await updateOrder(id, (cur) => ({
      ...cur,
      status: cur.status === "pending" ? "in_review" : cur.status,
      solution,
    }));
    return NextResponse.json({ order: updated, usedModel });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "تعذر توليد الحل آليا.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
