import { NextResponse } from "next/server";
import crypto from "crypto";
import { isAdminAuthenticated } from "@/lib/auth";
import {
  deletePromoCode,
  getPromoCode,
  listPromoCodes,
  normalizeCode,
  sanitizeAllowedPackageIds,
  upsertPromoCode,
} from "@/lib/promo-referral";
import type { PackageId } from "@/types/order";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "غير مصرح بالوصول" }, { status: 401 });
  }
  const promos = await listPromoCodes();
  return NextResponse.json({ promos });
}

export async function POST(req: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "غير مصرح بالوصول" }, { status: 401 });
  }
  try {
    const body = (await req.json()) as {
      code?: string;
      discountPercent?: number;
      maxUses?: number;
      batchCount?: number;
      allowedPackageIds?: PackageId[];
      note?: string;
      active?: boolean;
    };

    const rawBatch = body.batchCount !== undefined ? Number(body.batchCount) : 1;
    if (!Number.isFinite(rawBatch) || rawBatch < 1 || rawBatch > 50) {
      return NextResponse.json(
        { error: "عدد الأكواد المولّدة يجب أن يكون بين 1 و 50." },
        { status: 400 }
      );
    }
    const batchCount = Math.round(rawBatch);
    const baseCode = normalizeCode(String(body.code ?? ""));
    const allowedPackageIds = sanitizeAllowedPackageIds(body.allowedPackageIds);

    // Batch generation of N unique single-use individual codes (e.g., VIP-A4K9 ...)
    if (batchCount > 1) {
      if (!baseCode || baseCode.length < 2 || !/^[A-Z0-9_-]+$/.test(baseCode)) {
        return NextResponse.json(
          { error: "يرجى كتابة بادئة إنجليزية صالحة لتوليد الدفعة (مثل VIP أو UFC)." },
          { status: 400 }
        );
      }
      if (
        baseCode === "PASS" ||
        baseCode === "REF" ||
        baseCode.startsWith("PASS-") ||
        baseCode.startsWith("REF-")
      ) {
        return NextResponse.json(
          {
            error:
              "البادئات PASS و REF محجوزة لرموز الرصيد وأكواد الإحالة التلقائية. اختر بادئة أخرى مثل VIP أو UFC.",
          },
          { status: 400 }
        );
      }
      const existingSet = new Set((await listPromoCodes()).map((p) => p.code));
      const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      const created = [];
      for (let i = 0; i < batchCount; i++) {
        let uniqueCode = "";
        for (let attempt = 0; attempt < 30; attempt++) {
          let suffix = "";
          for (let k = 0; k < 4; k++) {
            suffix += chars[crypto.randomInt(0, chars.length)];
          }
          const candidate = `${baseCode}-${suffix}`;
          if (!existingSet.has(candidate)) {
            uniqueCode = candidate;
            existingSet.add(candidate);
            break;
          }
        }
        if (!uniqueCode) {
          uniqueCode = `${baseCode}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
          existingSet.add(uniqueCode);
        }

        const promo = await upsertPromoCode({
          code: uniqueCode,
          discountPercent:
            body.discountPercent !== undefined ? Number(body.discountPercent) : 100,
          maxUses: 1, // Strictly 1 use per individual VIP code!
          ...(allowedPackageIds && allowedPackageIds.length > 0
            ? { allowedPackageIds }
            : {}),
          note: body.note?.trim()
            ? `${body.note.trim()} (#${i + 1})`
            : `كود فردي استخدام واحد (#${i + 1})`,
          active: body.active ?? true,
          source: "admin",
          createOnly: true,
        });
        created.push(promo);
      }
      return NextResponse.json({ promos: created, promo: created[0] }, { status: 201 });
    }

    const existing = await getPromoCode(baseCode);
    if (existing) {
      return NextResponse.json(
        { error: `الكود (${baseCode}) موجود مسبقا. يمكنك تفعيله/تعطيله أو حذفه أولا.` },
        { status: 409 }
      );
    }

    const promo = await upsertPromoCode({
      code: baseCode,
      discountPercent:
        body.discountPercent !== undefined ? Number(body.discountPercent) : 20,
      maxUses: body.maxUses !== undefined ? Number(body.maxUses) : 0,
      ...(allowedPackageIds && allowedPackageIds.length > 0
        ? { allowedPackageIds }
        : {}),
      note: body.note,
      active: body.active ?? true,
      source: "admin",
      createOnly: true,
    });
    return NextResponse.json({ promo }, { status: 201 });
  } catch (err) {
    console.error("POST /api/admin/promos error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "تعذر إنشاء كود البرومو." },
      { status: 400 }
    );
  }
}

export async function PATCH(req: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "غير مصرح بالوصول" }, { status: 401 });
  }
  try {
    const body = (await req.json()) as {
      code?: string;
      active?: boolean;
      discountPercent?: number;
      maxUses?: number;
      allowedPackageIds?: PackageId[];
      note?: string;
    };
    const existing = await getPromoCode(String(body.code ?? ""));
    if (!existing) {
      return NextResponse.json({ error: "الكود غير موجود." }, { status: 404 });
    }
    const promo = await upsertPromoCode({
      code: existing.code,
      discountPercent:
        body.discountPercent !== undefined
          ? Number(body.discountPercent)
          : existing.discountPercent,
      maxUses: body.maxUses !== undefined ? Number(body.maxUses) : existing.maxUses,
      active: body.active !== undefined ? Boolean(body.active) : !existing.active,
      ...(body.allowedPackageIds !== undefined
        ? { allowedPackageIds: sanitizeAllowedPackageIds(body.allowedPackageIds) ?? [] }
        : {}),
      ...(body.note !== undefined ? { note: body.note } : {}),
    });
    return NextResponse.json({ promo });
  } catch (err) {
    console.error("PATCH /api/admin/promos error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "تعذر تحديث الكود." },
      { status: 400 }
    );
  }
}

export async function DELETE(req: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "غير مصرح بالوصول" }, { status: 401 });
  }
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code") ?? "";
  const ok = await deletePromoCode(code);
  if (!ok) {
    return NextResponse.json({ error: "الكود غير موجود." }, { status: 404 });
  }
  return NextResponse.json({ deleted: true });
}
