import { NextResponse } from "next/server";
import { getOrderById, updateOrder } from "@/lib/store";
import { isAdminAuthenticated } from "@/lib/auth";
import {
  findVerifiedBlueprint,
  saveVerifiedBlueprintFromOrder,
} from "@/lib/blueprints";
import { generateFromBlueprintWithGemini } from "@/lib/gemini-solver";
import type { DocxThemeId, StyleProfileId } from "@/types/order";

export const maxDuration = 300;
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
  const bp = await findVerifiedBlueprint(order);
  return NextResponse.json({
    hasBlueprint: Boolean(bp),
    updatedAt: bp?.updatedAt ?? null,
    blocksCount: bp?.solution.blocks.length ?? 0,
  });
}

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

  let action: "save" | "spawn" = "save";
  let preferredModel = "";
  let styleProfile: StyleProfileId | undefined;
  let docxTheme: DocxThemeId | undefined;
  let extraInstruction = "";

  try {
    const body = (await req.json()) as {
      action?: "save" | "spawn";
      model?: string;
      styleProfile?: StyleProfileId;
      docxTheme?: DocxThemeId;
      extraInstruction?: string;
    };
    if (body.action === "spawn") action = "spawn";
    preferredModel = body.model?.trim() ?? "";
    styleProfile = body.styleProfile;
    docxTheme = body.docxTheme;
    extraInstruction = body.extraInstruction?.trim() ?? "";
  } catch {
    // default action = save
  }

  try {
    if (action === "save") {
      const saved = await saveVerifiedBlueprintFromOrder(order);
      return NextResponse.json({
        ok: true,
        hasBlueprint: true,
        updatedAt: saved.updatedAt,
        blocksCount: saved.solution.blocks.length,
      });
    }

    // Fast-spawn unique <20% solution from the Verified Wave Blueprint in ~10s!
    const bp = await findVerifiedBlueprint(order);
    if (!bp) {
      return NextResponse.json(
        { error: "لا يوجد حل مرجعي محفوظ لهذا النشاط بعد. احفظ حلاً مرجعياً أولاً." },
        { status: 404 }
      );
    }

    const { solution, usedModel } = await generateFromBlueprintWithGemini(
      order,
      bp.solution,
      {
        preferredModel: preferredModel || undefined,
        styleProfile,
        docxTheme,
        extraInstruction,
      }
    );

    const updated = await updateOrder(id, (cur) => ({
      ...cur,
      status: cur.status === "pending" ? "in_review" : cur.status,
      solution,
    }));

    return NextResponse.json({ order: updated, usedModel });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "تعذر تنفيذ العملية." },
      { status: 400 }
    );
  }
}
