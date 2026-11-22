"use client";

import React, { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  CheckCircle2,
  Clock,
  Download,
  FileCheck2,
  Search,
  AlertCircle,
} from "lucide-react";
import { OrderStatus, SolutionDocument } from "@/types/order";
import SolutionPreview from "@/components/SolutionPreview";

interface TrackedOrder {
  id: string;
  trackingCode: string;
  studentName: string;
  university: string;
  specialty: string;
  moduleName: string;
  assignmentTitle: string;
  status: OrderStatus;
  adminNote: string;
  createdAt: string;
  updatedAt: string;
  filesCount: number;
  solution: SolutionDocument | null;
}

const STEPS: Array<{ key: OrderStatus; label: string; desc: string }> = [
  { key: "pending", label: "تم استلام الطلب", desc: "الطلب مسجل وبانتظار مراجعة المشرف" },
  { key: "in_review", label: "قيد الإعداد والمراجعة", desc: "يجري حل النشاط وتدقيق المعادلات والجداول" },
  { key: "completed", label: "مكتمل وجاهز للتحميل", desc: "تم اعتماد الحل وتجهيز ملف Word RTL" },
];

function TrackContent() {
  const searchParams = useSearchParams();
  const initialCode = searchParams.get("code") ?? "";
  const [code, setCode] = useState(initialCode);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [order, setOrder] = useState<TrackedOrder | null>(null);

  const fetchOrder = useCallback(async (targetCode: string) => {
    const clean = targetCode.trim();
    if (!clean) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/orders/track?code=${encodeURIComponent(clean)}`);
      const data = await res.json();
      if (!res.ok) {
        setOrder(null);
        throw new Error(data.error || "الطلب غير موجود.");
      }
      setOrder(data.order);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر البحث عن الطلب.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialCode) {
      fetchOrder(initialCode);
    }
  }, [initialCode, fetchOrder]);

  const activeStepIdx = order
    ? STEPS.findIndex((s) => s.key === order.status)
    : -1;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      {/* Search Bar Card */}
      <section className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
        <div>
          <h1 className="text-2xl font-extrabold text-navy-800">
            متابعة حالة الطلب وتحميل الحل
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            أدخل رمز التتبع الذي حصلت عليه عند إرسال الطلب لمعرفة حالته وتحميل ملف Word (.docx) فور اعتماده.
          </p>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            fetchOrder(code);
          }}
          className="flex flex-col sm:flex-row gap-3"
        >
          <input
            type="text"
            dir="ltr"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="ORD-2026-XXXX"
            className="flex-1 px-4 py-3 rounded-xl border border-slate-300 font-mono text-base text-center sm:text-left focus:outline-none focus:ring-2 focus:ring-navy-600"
          />
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-navy-700 text-white font-bold text-sm hover:bg-navy-600 disabled:opacity-60"
          >
            <Search className="w-4 h-4" />
            {loading ? "جاري البحث..." : "بحث عن الطلب"}
          </button>
        </form>

        <div className="text-xs text-slate-500 flex items-center gap-2">
          <span>لتجربة المعاينة وتحميل ملف Word فورا:</span>
          <button
            type="button"
            onClick={() => {
              setCode("UFC-2026-1001");
              fetchOrder("UFC-2026-1001");
            }}
            className="font-mono font-bold text-navy-600 hover:underline bg-navy-50 px-2 py-0.5 rounded"
          >
            UFC-2026-1001
          </button>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}
      </section>

      {order && (
        <>
          {/* Order Details & Stepper */}
          <section className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
              <div>
                <div className="flex items-center gap-2">
                  <span dir="ltr" className="font-mono text-xs font-bold px-2.5 py-1 rounded bg-navy-50 text-navy-700">
                    {order.trackingCode}
                  </span>
                  <span className="text-xs text-slate-400">
                    {new Date(order.createdAt).toLocaleDateString("ar-DZ")}
                  </span>
                </div>
                <h2 className="text-xl font-extrabold text-navy-800 mt-1.5">
                  {order.assignmentTitle}
                </h2>
                <p className="text-sm text-slate-600">
                  {order.moduleName} — {order.studentName}
                  {order.specialty ? ` (${order.specialty})` : ""}
                </p>
              </div>

              {order.status === "completed" && order.solution && (
                <a
                  href={`/api/orders/${order.id}/export?code=${encodeURIComponent(order.trackingCode)}`}
                  className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-sm transition-colors shrink-0"
                >
                  <Download className="w-4 h-4" />
                  تحميل ملف Word (.docx)
                </a>
              )}
            </div>

            {/* Progress Stepper */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {STEPS.map((step, idx) => {
                const done = idx <= activeStepIdx;
                const current = idx === activeStepIdx;
                return (
                  <div
                    key={step.key}
                    className={`rounded-xl p-4 border transition-colors ${
                      current
                        ? "bg-navy-50 border-navy-600"
                        : done
                        ? "bg-emerald-50/70 border-emerald-200"
                        : "bg-slate-50 border-slate-200 opacity-65"
                    }`}
                  >
                    <div className="flex items-center gap-2 font-bold text-sm mb-1">
                      {done ? (
                        <CheckCircle2
                          className={`w-4 h-4 ${
                            current ? "text-navy-700" : "text-emerald-600"
                          }`}
                        />
                      ) : (
                        <Clock className="w-4 h-4 text-slate-400" />
                      )}
                      <span className={done ? "text-navy-800" : "text-slate-500"}>
                        {step.label}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600">{step.desc}</p>
                  </div>
                );
              })}
            </div>

            {order.adminNote && (
              <div className="p-4 rounded-xl bg-blue-50/70 border border-blue-200 text-sm text-navy-800">
                <span className="font-bold block mb-1">ملاحظة المشرف:</span>
                {order.adminNote}
              </div>
            )}
          </section>

          {/* Approved Solution Preview */}
          {order.status === "completed" && order.solution && (
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-extrabold text-navy-800 flex items-center gap-2">
                  <FileCheck2 className="w-5 h-5 text-emerald-600" />
                  معاينة الحل المعتمد قبل التحميل
                </h3>
                <a
                  href={`/api/orders/${order.id}/export?code=${encodeURIComponent(order.trackingCode)}`}
                  className="text-sm font-bold text-navy-600 hover:underline flex items-center gap-1"
                >
                  <Download className="w-4 h-4" />
                  تنزيل نسخة Word الأصلية
                </a>
              </div>
              <SolutionPreview solution={order.solution} />
            </section>
          )}
        </>
      )}
    </div>
  );
}

export default function TrackPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-5xl mx-auto px-4 py-12 text-center text-slate-500">
          جاري التحميل...
        </div>
      }
    >
      <TrackContent />
    </Suspense>
  );
}
