import { NextResponse } from "next/server";
import { getOrderById, listOrders } from "@/lib/store";
import { isAdminAuthenticated } from "@/lib/auth";
import { computeProseSimilarityPercent } from "@/lib/style-profiles";

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
    return NextResponse.json({ maxSimilarity: 0, comparedCount: 0, matches: [] });
  }

  const all = await listOrders();
  const normMod = order.moduleName.trim().toLowerCase();
  const peers = all.filter(
    (o) =>
      o.id !== order.id &&
      o.solution !== null &&
      o.moduleName.trim().toLowerCase() === normMod
  );

  const matches = peers
    .map((peer) => ({
      id: peer.id,
      trackingCode: peer.trackingCode,
      studentName: peer.studentName,
      similarity: computeProseSimilarityPercent(order.solution!, peer.solution!),
    }))
    .sort((a, b) => b.similarity - a.similarity);

  const maxSimilarity = matches[0]?.similarity ?? 0;
  return NextResponse.json({
    maxSimilarity,
    comparedCount: peers.length,
    matches: matches.slice(0, 5),
  });
}
