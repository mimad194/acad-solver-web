import { NextResponse } from "next/server";
import { deleteOrder, getOrderById, updateOrder } from "@/lib/store";
import { isAdminAuthenticated } from "@/lib/auth";
import {
  OrderStatus,
  PackageId,
  PaymentStatus,
  SolutionDocument,
} from "@/types/order";

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
  return NextResponse.json({ order });
}

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "غير مصرح بالوصول" }, { status: 401 });
  }
  const { id } = await context.params;
  const body = (await req.json()) as {
    status?: OrderStatus;
    adminNote?: string;
    solution?: SolutionDocument | null;
    includeCoverPage?: boolean;
    packageId?: PackageId;
    priceDzd?: number;
    paymentStatus?: PaymentStatus;
  };

  const updated = await updateOrder(id, (cur) => {
    const nextPaymentStatus = body.paymentStatus ?? cur.paymentStatus;
    const paidAt =
      nextPaymentStatus === "paid"
        ? cur.paidAt || new Date().toISOString()
        : nextPaymentStatus === "unpaid"
        ? null
        : cur.paidAt ?? null;

    return {
      ...cur,
      status: body.status ?? cur.status,
      adminNote: body.adminNote !== undefined ? body.adminNote : cur.adminNote,
      includeCoverPage:
        body.includeCoverPage !== undefined ? body.includeCoverPage : cur.includeCoverPage,
      packageId: body.packageId ?? cur.packageId,
      priceDzd:
        typeof body.priceDzd === "number" && Number.isFinite(body.priceDzd) && body.priceDzd >= 0
          ? Math.round(body.priceDzd)
          : cur.priceDzd,
      paymentStatus: nextPaymentStatus,
      paidAt,
      solution:
        body.solution !== undefined
          ? body.solution
            ? { ...body.solution, updatedAt: new Date().toISOString() }
            : null
          : cur.solution,
    };
  });

  if (!updated) {
    return NextResponse.json({ error: "الطلب غير موجود" }, { status: 404 });
  }
  return NextResponse.json({ order: updated });
}

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "غير مصرح بالوصول" }, { status: 401 });
  }
  const { id } = await context.params;
  const ok = await deleteOrder(id);
  if (!ok) {
    return NextResponse.json({ error: "الطلب غير موجود" }, { status: 404 });
  }
  return NextResponse.json({ deleted: true });
}
