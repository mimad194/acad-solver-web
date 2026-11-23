import { NextResponse } from "next/server";
import { getOrderById, listOrders } from "@/lib/store";
import { isAdminAuthenticated } from "@/lib/auth";
import {
  evaluateAgainstCohort,
  summarizeDnaLabel,
} from "@/lib/uniqueness-engine";

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
  if (!order || !order.solution) {
    return NextResponse.json({
      maxSimilarity: 0,
      comparedCount: 0,
      matches: [],
      topSharedPhrases: [],
      dnaLabel: "",
    });
  }

  const all = await listOrders();
  const normMod = order.moduleName.trim().toLowerCase();
  const peers = all.filter(
    (o) =>
      o.id !== order.id &&
      o.solution !== null &&
      o.moduleName.trim().toLowerCase() === normMod
  );

  const report = evaluateAgainstCohort(order.solution, peers);
  return NextResponse.json({
    ...report,
    dnaLabel: order.solution.qualityMeta?.dnaLabel || summarizeDnaLabel(order.solution.dna),
  });
}
