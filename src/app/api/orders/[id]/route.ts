import { NextResponse } from "next/server";
import { deleteOrder, getOrderById, updateOrder } from "@/lib/store";
import { isAdminAuthenticated } from "@/lib/auth";
import { OrderStatus, SolutionDocument } from "@/types/order";

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
  };

  const updated = await updateOrder(id, (cur) => ({
    ...cur,
    status: body.status ?? cur.status,
    adminNote: body.adminNote !== undefined ? body.adminNote : cur.adminNote,
    includeCoverPage:
      body.includeCoverPage !== undefined ? body.includeCoverPage : cur.includeCoverPage,
    solution:
      body.solution !== undefined
        ? body.solution
          ? { ...body.solution, updatedAt: new Date().toISOString() }
          : null
        : cur.solution,
  }));

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
