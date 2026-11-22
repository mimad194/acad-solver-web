"use client";

import React, { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Download,
  Edit3,
  Eye,
  FileDown,
  FilePlus,
  FileText,
  Save,
  Sparkles,
  AlertCircle,
} from "lucide-react";
import { OrderStatus, SolutionDocument, StudentOrder } from "@/types/order";
import SolutionPreview from "@/components/SolutionPreview";
import BlockEditor from "@/components/BlockEditor";

export default function AdminOrderWorkspacePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [order, setOrder] = useState<StudentOrder | null>(null);
  const [solution, setSolution] = useState<SolutionDocument | null>(null);
  const [status, setStatus] = useState<OrderStatus>("pending");
  const [adminNote, setAdminNote] = useState("");
  const [extraInstruction, setExtraInstruction] = useState("");
  const [selectedModel, setSelectedModel] = useState("gemini-4-hydrogen");
  const [activeTab, setActiveTab] = useState<"preview" | "edit">("preview");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const loadOrder = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/orders/${id}`);
      if (res.status === 401) {
        window.location.href = "/admin";
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "تعذر تحميل الطلب");
      const o = data.order as StudentOrder;
      setOrder(o);
      setSolution(o.solution);
      setStatus(o.status);
      setAdminNote(o.adminNote);
    } catch (err) {
      setMessage({
        type: "err",
        text: err instanceof Error ? err.message : "خطأ أثناء التحميل",
      });
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadOrder();
  }, [loadOrder]);

  const handleSave = async (overrideStatus?: OrderStatus) => {
    if (!order) return;
    setSaving(true);
    setMessage(null);
    const nextStatus = overrideStatus ?? status;
    try {
      const res = await fetch(`/api/orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: nextStatus,
          adminNote,
          solution,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل الحفظ");
      setOrder(data.order);
      setStatus(data.order.status);
      setSolution(data.order.solution);
      setMessage({
        type: "ok",
        text:
          overrideStatus === "completed"
            ? "تم اعتماد الحل وتسليمه للطالب بنجاح! أصبح ملف Word متاحا للتحميل عبر رمز التتبع."
            : "تم حفظ جميع التعديلات بنجاح.",
      });
    } catch (err) {
      setMessage({
        type: "err",
        text: err instanceof Error ? err.message : "حدث خطأ أثناء الحفظ.",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleGenerateAi = async () => {
    if (!order) return;
    setGenerating(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/orders/${order.id}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ extraInstruction, model: selectedModel }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل توليد الحل آليا.");
      setOrder(data.order);
      setSolution(data.order.solution);
      setStatus(data.order.status);
      setActiveTab("preview");
      setMessage({
        type: "ok",
        text: `تم توليد مسودة الحل بنجاح عبر النموذج (${data.usedModel || selectedModel}). راجعها وعدّل ما يلزم ثم اعتمد التسليم.`,
      });
    } catch (err) {
      setMessage({
        type: "err",
        text: err instanceof Error ? err.message : "تعذر التوليد الآلي.",
      });
    } finally {
      setGenerating(false);
    }
  };

  const createManualTemplate = () => {
    if (!order) return;
    const now = new Date().toISOString();
    setSolution({
      title: `حل ${order.assignmentTitle}`,
      includeCoverPage: order.includeCoverPage,
      coverMeta: {
        university: order.university,
        specialty: order.specialty,
        moduleName: order.moduleName,
        studentName: order.studentName,
        academicYear: "2026 / 2027",
      },
      updatedAt: now,
      blocks: [
        { id: "t-1", type: "doc_title", text: `حل ${order.assignmentTitle}` },
        { id: "t-2", type: "exercise_heading", text: "التمرين (01)" },
        { id: "t-3", type: "question_heading", text: "1) السؤال الأول" },
        { id: "t-4", type: "paragraph", text: "أدخل نص التحليل أو الحل هنا مع إمكانية تضمين معادلات مثل $R^2 = 0.99$." },
        { id: "t-5", type: "equation", latex: "\\hat{Y}_i = \\hat{\\beta}_0 + \\hat{\\beta}_1 X_{1i}", callout: true },
      ],
    });
    setActiveTab("edit");
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-16 text-center text-slate-500">
        جاري تحميل بيانات الطلب...
      </div>
    );
  }

  if (!order) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center space-y-3">
        <p className="text-red-600 font-bold">لم يتم العثور على هذا الطلب.</p>
        <Link href="/admin" className="text-navy-600 underline text-sm">
          العودة إلى لوحة الطلبات
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-5">
      {/* Top Action Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-wrap items-center justify-between gap-3 sticky top-16 z-30">
        <div className="flex items-center gap-3">
          <Link
            href="/admin"
            className="p-2 rounded-lg hover:bg-slate-100 text-slate-600"
            title="العودة للطلبات"
          >
            <ArrowRight className="w-5 h-5" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <span dir="ltr" className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-navy-50 text-navy-700">
                {order.trackingCode}
              </span>
              <h1 className="font-extrabold text-base sm:text-lg text-navy-800">
                {order.assignmentTitle}
              </h1>
            </div>
            <p className="text-xs text-slate-500">
              {order.studentName} — {order.moduleName}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => handleSave()}
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs"
          >
            <Save className="w-4 h-4" />
            {saving ? "جاري الحفظ..." : "حفظ المسودة"}
          </button>

          {solution && (
            <a
              href={`/api/orders/${order.id}/export`}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-navy-600 hover:bg-navy-700 text-white font-bold text-xs"
            >
              <Download className="w-4 h-4" />
              تحميل ومعاينة Word (.docx)
            </a>
          )}

          <button
            type="button"
            onClick={() => handleSave("completed")}
            disabled={saving || !solution}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-xs shadow-sm"
          >
            <CheckCircle2 className="w-4 h-4" />
            اعتماد وتسليم للطالب
          </button>
        </div>
      </div>

      {message && (
        <div
          className={`p-3.5 rounded-xl border text-sm font-medium flex items-center gap-2 ${
            message.type === "ok"
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-red-50 border-red-200 text-red-700"
          }`}
        >
          {message.type === "ok" ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Right Column: Order Info, Files, AI Trigger */}
        <aside className="lg:col-span-4 space-y-5">
          {/* Student Details */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3 text-sm">
            <h2 className="font-extrabold text-navy-800 border-b border-slate-100 pb-2">
              بيانات الطلب والطالب
            </h2>
            <div className="space-y-1.5 text-xs text-slate-600">
              <p><strong className="text-slate-800">الطالب:</strong> {order.studentName}</p>
              {order.contact && <p><strong className="text-slate-800">التواصل:</strong> {order.contact}</p>}
              {order.university && <p><strong className="text-slate-800">الجامعة:</strong> {order.university}</p>}
              {order.specialty && <p><strong className="text-slate-800">التخصص:</strong> {order.specialty}</p>}
              <p><strong className="text-slate-800">المقياس:</strong> {order.moduleName}</p>
              <p>
                <strong className="text-slate-800">خيارات التنسيق:</strong>{" "}
                {order.includeCoverPage ? "مع واجهة جامعية" : "بدون واجهة (دخول مباشر)"} •{" "}
                {order.strictReferencesOnly ? "التزام صارم بالمراجع فقط" : "مرن"}
              </p>
            </div>

            {order.notes && (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900">
                <strong className="block mb-1">ملاحظات الطالب:</strong>
                {order.notes}
              </div>
            )}

            {order.exerciseText && (
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 whitespace-pre-wrap max-h-48 overflow-y-auto">
                <strong className="block mb-1 text-navy-800">نص التمرين المرفق:</strong>
                {order.exerciseText}
              </div>
            )}
          </div>

          {/* Uploaded Files */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3">
            <h2 className="font-extrabold text-navy-800 text-sm border-b border-slate-100 pb-2">
              الملفات المرفوعة ({order.files.length})
            </h2>
            {order.files.length === 0 ? (
              <p className="text-xs text-slate-400">لا توجد ملفات مرفقة مع هذا الطلب.</p>
            ) : (
              <ul className="space-y-2">
                {order.files.map((f) => (
                  <li
                    key={f.id}
                    className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs"
                  >
                    <div className="min-w-0">
                      <span
                        className={`inline-block text-[10px] font-bold px-1.5 py-0.5 rounded mb-0.5 ${
                          f.category === "exercise"
                            ? "bg-navy-100 text-navy-800"
                            : "bg-emerald-100 text-emerald-800"
                        }`}
                      >
                        {f.category === "exercise" ? "ملف التمرين" : "مرجع المقياس"}
                      </span>
                      <p className="truncate font-medium text-slate-700">{f.originalName}</p>
                    </div>
                    <a
                      href={`/api/orders/${order.id}/files/${f.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="p-1.5 rounded-lg bg-white border border-slate-200 hover:border-navy-600 text-navy-700 shrink-0"
                      title="فتح / تحميل الملف"
                    >
                      <FileDown className="w-4 h-4" />
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* AI Generation Box */}
          <div className="bg-gradient-to-b from-navy-50 to-white border border-navy-200 rounded-2xl p-5 shadow-sm space-y-3">
            <h2 className="font-extrabold text-navy-800 text-sm flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-navy-600" />
              توليد الحل بالذكاء الاصطناعي (Gemini)
            </h2>
            <p className="text-xs text-slate-600 leading-relaxed">
              يقرأ ملفات التمرين والمراجع المرفوعة، ويولّد مسودة حل كاملة مهيكلة بالجداول والمعادلات لتراجعها وتعتمدها.
            </p>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">
                النموذج المستخدم
              </label>
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-navy-600"
              >
                <option value="gemini-4-hydrogen">
                  Gemini 4 Hydrogen (الافتراضي — أعلى جودة ودقة / 20 يوميا)
                </option>
                <option value="gemini-3.8-flash">
                  Gemini 3.8 Flash (البديل الأول — جودة عالية / 20 يوميا)
                </option>
                <option value="gemini-3.5-flash-lite">
                  Gemini 3.5 Flash Lite (احتياطي للحجم العالي — 500 يوميا)
                </option>
              </select>
            </div>
            <textarea
              rows={2}
              value={extraInstruction}
              onChange={(e) => setExtraInstruction(e.target.value)}
              placeholder="توجيه إضافي للمحرك (اختياري): مثلا ركز على طريقة الانحرافات..."
              className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-navy-600"
            />
            <button
              type="button"
              onClick={handleGenerateAi}
              disabled={generating}
              className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-xl bg-navy-700 hover:bg-navy-600 disabled:opacity-60 text-white font-bold text-xs shadow-sm"
            >
              <Sparkles className="w-4 h-4" />
              {generating ? "جاري تحليل المراجع وإعداد الحل..." : "توليد الحل الآن عبر Gemini"}
            </button>
          </div>

          {/* Status & Admin Note */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3">
            <h2 className="font-extrabold text-navy-800 text-sm">الحالة وملاحظة الطالب</h2>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">حالة الطلب</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as OrderStatus)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm bg-white"
              >
                <option value="pending">قيد الانتظار</option>
                <option value="in_review">قيد المعالجة والمراجعة</option>
                <option value="completed">مكتمل وجاهز للتحميل</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">
                رسالة تظهر للطالب في صفحة التتبع
              </label>
              <textarea
                rows={3}
                value={adminNote}
                onChange={(e) => setAdminNote(e.target.value)}
                placeholder="مثال: تمت مراجعة الحل واعتماد ملف Word، بالتوفيق."
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs"
              />
            </div>
          </div>
        </aside>

        {/* Main Column: Preview & Block Editor */}
        <section className="lg:col-span-8 space-y-4">
          <div className="flex items-center justify-between bg-white border border-slate-200 rounded-xl p-2">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setActiveTab("preview")}
                className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-colors ${
                  activeTab === "preview"
                    ? "bg-navy-700 text-white"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                <Eye className="w-4 h-4" />
                معاينة الوثيقة (A4 RTL)
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("edit")}
                className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-colors ${
                  activeTab === "edit"
                    ? "bg-navy-700 text-white"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                <Edit3 className="w-4 h-4" />
                تحرير الفقرات والمعادلات والجداول
              </button>
            </div>
            {solution && (
              <span className="text-xs text-slate-400 pl-2">
                {solution.blocks.length} عنصر
              </span>
            )}
          </div>

          {!solution ? (
            <div className="bg-white border-2 border-dashed border-slate-300 rounded-2xl p-12 text-center space-y-4">
              <FileText className="w-12 h-12 text-slate-300 mx-auto" />
              <div className="space-y-1">
                <h3 className="font-extrabold text-navy-800">
                  لم يتم إعداد مسودة الحل بعد
                </h3>
                <p className="text-sm text-slate-500 max-w-md mx-auto">
                  استخدم زر التوليد بالذكاء الاصطناعي في القائمة الجانبية لقراءة الملفات والمراجع آليا، أو أنشئ قالبا يدويا للبدء فورا.
                </p>
              </div>
              <button
                type="button"
                onClick={createManualTemplate}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-navy-50 hover:bg-navy-100 text-navy-800 font-bold text-xs"
              >
                <FilePlus className="w-4 h-4" />
                إنشاء قالب حل يدوي فارغ
              </button>
            </div>
          ) : activeTab === "preview" ? (
            <SolutionPreview solution={solution} />
          ) : (
            <BlockEditor solution={solution} onChange={setSolution} />
          )}
        </section>
      </div>
    </div>
  );
}
