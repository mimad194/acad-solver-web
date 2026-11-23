"use client";

import React, { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  CreditCard,
  Download,
  Edit3,
  ExternalLink,
  Eye,
  FileDown,
  FilePlus,
  FileText,
  GraduationCap,
  Library,
  MessageCircle,
  Palette,
  RefreshCw,
  Save,
  ShieldCheck,
  Sparkles,
  Wand2,
  AlertCircle,
} from "lucide-react";
import {
  AcademicDiscipline,
  DocxThemeId,
  OrderStatus,
  PaymentStatus,
  RefineMode,
  SolutionDocument,
  StudentOrder,
  StyleProfileId,
} from "@/types/order";
import {
  DOCX_THEMES,
  STYLE_PROFILES,
  pickAutoStyleAndTheme,
} from "@/lib/style-profiles";
import { DISCIPLINE_LIST, DISCIPLINE_PROFILES } from "@/lib/expert-prompts";
import SolutionPreview from "@/components/SolutionPreview";
import BlockEditor from "@/components/BlockEditor";

interface SimilarityMatch {
  id: string;
  trackingCode: string;
  studentName: string;
  similarity: number;
}

interface SimilarityReport {
  maxSimilarity: number;
  comparedCount: number;
  matches: SimilarityMatch[];
  topSharedPhrases?: string[];
  dnaLabel?: string;
}

const THEME_LIST = Object.values(DOCX_THEMES);

async function safeReadJson(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    if (res.status === 504 || text.includes("FUNCTION_INVOCATION_TIMEOUT")) {
      throw new Error(
        "استغرق نموذج الذكاء الاصطناعي وقتا أطول من الحد المسموح به في الخادم (504). أعد المحاولة الآن أو جرّب اختيار Gemini 3.8 Flash / 3.5 Flash Lite مؤقتا."
      );
    }
    throw new Error(
      `استجابة غير متوقعة من الخادم (${res.status}): ${text.slice(0, 140)}`
    );
  }
}

export default function AdminOrderWorkspacePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [order, setOrder] = useState<StudentOrder | null>(null);
  const [solution, setSolution] = useState<SolutionDocument | null>(null);
  const [status, setStatus] = useState<OrderStatus>("pending");
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>("unpaid");
  const [priceDzd, setPriceDzd] = useState<string>("");
  const [adminNote, setAdminNote] = useState("");
  const [extraInstruction, setExtraInstruction] = useState("");
  const [selectedModel, setSelectedModel] = useState("gemini-4-hydrogen");
  const [discipline, setDiscipline] = useState<AcademicDiscipline>("auto");
  const [styleProfile, setStyleProfile] = useState<StyleProfileId>("analytical_narrative");
  const [docxTheme, setDocxTheme] = useState<DocxThemeId>("classic_navy");
  const [similarity, setSimilarity] = useState<SimilarityReport | null>(null);
  const [checkingSim, setCheckingSim] = useState(false);
  const [archivedRefs, setArchivedRefs] = useState<{
    archivedCount: number;
    archivedNames: string[];
  } | null>(null);
  const [archivingRefs, setArchivingRefs] = useState(false);
  const [hasBlueprint, setHasBlueprint] = useState(false);
  const [blueprintBusy, setBlueprintBusy] = useState<"save" | "spawn" | null>(null);
  const [activeTab, setActiveTab] = useState<"preview" | "edit">("preview");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [refiningMode, setRefiningMode] = useState<RefineMode | null>(null);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const loadSimilarity = useCallback(async (orderId: string) => {
    setCheckingSim(true);
    try {
      const res = await fetch(`/api/orders/${orderId}/similarity`);
      if (res.ok) {
        const data = (await res.json()) as SimilarityReport;
        setSimilarity(data);
      }
    } catch {
      // ignore non-fatal similarity check error
    } finally {
      setCheckingSim(false);
    }
  }, []);

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
      const autoPick = pickAutoStyleAndTheme(`${o.id}-${o.trackingCode}`);
      setOrder(o);
      setSolution(o.solution);
      setStatus(o.status);
      setPaymentStatus(o.paymentStatus ?? "paid");
      setPriceDzd(typeof o.priceDzd === "number" ? String(o.priceDzd) : "");
      setAdminNote(o.adminNote);
      setStyleProfile(o.solution?.styleProfile ?? autoPick.styleProfile);
      setDocxTheme(o.solution?.docxTheme ?? autoPick.docxTheme);
      if (o.solution?.qualityMeta?.discipline) {
        setDiscipline(o.solution.qualityMeta.discipline);
      }
      if (o.solution) {
        void loadSimilarity(o.id);
      } else {
        setSimilarity(null);
      }
      fetch(`/api/orders/${o.id}/archive-refs`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (d && typeof d.archivedCount === "number") {
            setArchivedRefs(d);
          }
        })
        .catch(() => {});
      fetch(`/api/orders/${o.id}/blueprint`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (d && typeof d.hasBlueprint === "boolean") {
            setHasBlueprint(d.hasBlueprint);
          }
        })
        .catch(() => {});
    } catch (err) {
      setMessage({
        type: "err",
        text: err instanceof Error ? err.message : "خطأ أثناء التحميل",
      });
    } finally {
      setLoading(false);
    }
  }, [id, loadSimilarity]);

  useEffect(() => {
    loadOrder();
  }, [loadOrder]);

  const handleSave = async (
    overrideStatus?: OrderStatus,
    overridePaymentStatus?: PaymentStatus
  ) => {
    if (!order) return;
    setSaving(true);
    setMessage(null);
    const nextStatus = overrideStatus ?? status;
    const nextPaymentStatus = overridePaymentStatus ?? paymentStatus;
    const parsedPrice = priceDzd.trim() !== "" ? Number(priceDzd) : undefined;
    const solutionToSave = solution
      ? { ...solution, styleProfile, docxTheme }
      : null;
    try {
      const res = await fetch(`/api/orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: nextStatus,
          paymentStatus: nextPaymentStatus,
          priceDzd:
            typeof parsedPrice === "number" && Number.isFinite(parsedPrice)
              ? parsedPrice
              : undefined,
          adminNote,
          solution: solutionToSave,
        }),
      });
      const data = await safeReadJson(res);
      if (!res.ok) throw new Error(String(data.error || "فشل الحفظ"));
      const savedOrder = data.order as StudentOrder;
      setOrder(savedOrder);
      setStatus(savedOrder.status);
      setPaymentStatus(savedOrder.paymentStatus ?? nextPaymentStatus);
      if (typeof savedOrder.priceDzd === "number") {
        setPriceDzd(String(savedOrder.priceDzd));
      }
      setSolution(savedOrder.solution);
      if (savedOrder.solution) {
        void loadSimilarity(order.id);
      }
      setMessage({
        type: "ok",
        text:
          overridePaymentStatus === "paid"
            ? "تم تأكيد استلام الدفع وفتح تحميل ملف Word الكامل للطالب بنجاح!"
            : overrideStatus === "completed"
            ? "تم اعتماد الحل بنجاح! أصبح جاهزا للمعاينة (أو التحميل الكامل فور تأكيد الدفع) عبر رمز التتبع."
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

  const handleGenerateAi = async (
    overrideStyle?: StyleProfileId,
    overrideTheme?: DocxThemeId
  ) => {
    if (!order) return;
    const targetStyle = overrideStyle ?? styleProfile;
    const targetTheme = overrideTheme ?? docxTheme;
    setGenerating(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/orders/${order.id}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          extraInstruction,
          model: selectedModel,
          styleProfile: targetStyle,
          docxTheme: targetTheme,
          discipline,
        }),
      });
      const data = await safeReadJson(res);
      if (!res.ok) throw new Error(String(data.error || "فشل توليد الحل آليا."));
      const updatedOrder = data.order as StudentOrder;
      const usedModel = String(data.usedModel || selectedModel);
      setOrder(updatedOrder);
      setSolution(updatedOrder.solution);
      setStatus(updatedOrder.status);
      if (updatedOrder.solution?.styleProfile) {
        setStyleProfile(updatedOrder.solution.styleProfile);
      }
      if (updatedOrder.solution?.docxTheme) {
        setDocxTheme(updatedOrder.solution.docxTheme);
      }
      if (updatedOrder.solution?.qualityMeta?.discipline) {
        setDiscipline(updatedOrder.solution.qualityMeta.discipline);
      }
      setActiveTab("preview");
      void loadSimilarity(order.id);
      setMessage({
        type: "ok",
        text: `تم توليد مسودة المرحلة الأولى عبر (${usedModel}). يمكنك الآن تشغيل «التدقيق والتعميق الأكاديمي (المرحلة 2)» لرفع الجودة لأقصى حد.`,
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

  const handleRefine = async (mode: RefineMode) => {
    if (!order || !solution) return;
    setRefiningMode(mode);
    setMessage(null);
    try {
      const res = await fetch(`/api/orders/${order.id}/refine`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          extraInstruction,
          model: selectedModel,
          styleProfile,
          discipline,
        }),
      });
      const data = await safeReadJson(res);
      if (!res.ok) throw new Error(String(data.error || "تعذر تنفيذ مرحلة التحسين."));
      const updatedOrder = data.order as StudentOrder;
      const usedModel = String(data.usedModel || selectedModel);
      setOrder(updatedOrder);
      setSolution(updatedOrder.solution);
      setActiveTab("preview");
      void loadSimilarity(order.id);
      const label =
        mode === "deepen_and_audit"
          ? "تم إتمام التدقيق الحسابي والمنهجي والتعميق الأكاديمي (المرحلة 2)"
          : mode === "surgical_diverge"
          ? "تم تنفيذ فك التشابه الجراحي مع تخصيص بصمة أسلوبية وبصرية جديدة بنجاح"
          : mode === "humanize_academic"
          ? "تمت أنسنة الصياغة الأكاديمية بنجاح مع الحفاظ الكامل على الأرقام والمعادلات"
          : "تم تحديث دليل الفهم والمناقشة للطالب بنجاح";
      setMessage({
        type: "ok",
        text: `${label} عبر النموذج (${usedModel}).`,
      });
    } catch (err) {
      setMessage({
        type: "err",
        text: err instanceof Error ? err.message : "تعذر تنفيذ التحسين.",
      });
    } finally {
      setRefiningMode(null);
    }
  };

  const handleThemeChange = (nextTheme: DocxThemeId) => {
    setDocxTheme(nextTheme);
    if (solution) {
      const paletteMap: Record<DocxThemeId, { paletteId: string; fontPairId: string }> = {
        classic_navy: { paletteId: "navy", fontPairId: "trad_times" },
        charcoal_minimal: { paletteId: "charcoal", fontPairId: "simp_calibri" },
        emerald_academic: { paletteId: "emerald", fontPairId: "majalla_times" },
        burgundy_formal: { paletteId: "burgundy", fontPairId: "trad_times" },
        print_bw: { paletteId: "print_bw", fontPairId: "simp_times" },
      };
      const mapped = paletteMap[nextTheme];
      setSolution({
        ...solution,
        docxTheme: nextTheme,
        dna: solution.dna
          ? {
              ...solution.dna,
              visualDna: {
                ...solution.dna.visualDna,
                paletteId: mapped.paletteId,
                fontPairId: mapped.fontPairId,
              },
            }
          : undefined,
      });
    }
  };

  const handleArchiveRefs = async () => {
    if (!order) return;
    setArchivingRefs(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/orders/${order.id}/archive-refs`, {
        method: "POST",
      });
      const data = await safeReadJson(res);
      if (!res.ok) throw new Error(String(data.error || "تعذر أرشفة المراجع."));
      setArchivedRefs({
        archivedCount: Number(data.archivedCount ?? 0),
        archivedNames: Array.isArray(data.archivedNames)
          ? data.archivedNames.map(String)
          : [],
      });
      setMessage({
        type: "ok",
        text: `تم حفظ المراجع في مكتبة المقياس الرسمية (${Number(data.archivedCount ?? 0)} مطبوعة). ستُحقن تلقائيا لكل طالب قادم في نفس المسار والمقياس دون إعادة رفع!`,
      });
    } catch (err) {
      setMessage({
        type: "err",
        text: err instanceof Error ? err.message : "تعذر حفظ المراجع في المكتبة.",
      });
    } finally {
      setArchivingRefs(false);
    }
  };

  const handleBlueprintAction = async (action: "save" | "spawn") => {
    if (!order) return;
    setBlueprintBusy(action);
    setMessage(null);
    try {
      const res = await fetch(`/api/orders/${order.id}/blueprint`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          model: selectedModel,
          styleProfile,
          docxTheme,
          extraInstruction,
        }),
      });
      const data = await safeReadJson(res);
      if (!res.ok) throw new Error(String(data.error || "تعذر تنفيذ العملية."));
      if (action === "save") {
        setHasBlueprint(true);
        setMessage({
          type: "ok",
          text: "تم حفظ هذا الحل كـ «مرجع معتمد للموجة»! أي طالب لاحق في نفس النشاط يمكنك توليد نسخته الفريدة (< 20%) في 10 ثوانٍ فقط.",
        });
      } else {
        const updatedOrder = data.order as StudentOrder;
        setOrder(updatedOrder);
        setSolution(updatedOrder.solution);
        setStatus(updatedOrder.status);
        setActiveTab("preview");
        void loadSimilarity(order.id);
        setMessage({
          type: "ok",
          text: `تم التوليد السريع من المرجع المعتمد للموجة بنجاح عبر (${String(data.usedModel || selectedModel)}) ببصمة فريدة وتشابه مضمون!`,
        });
      }
    } catch (err) {
      setMessage({
        type: "err",
        text: err instanceof Error ? err.message : "حدث خطأ.",
      });
    } finally {
      setBlueprintBusy(null);
    }
  };

  const handleRegenerateDistinct = () => {
    const curStyleIdx = STYLE_PROFILES.findIndex((s) => s.id === styleProfile);
    const nextStyle = STYLE_PROFILES[(curStyleIdx + 1) % STYLE_PROFILES.length].id;
    const curThemeIdx = THEME_LIST.findIndex((t) => t.id === docxTheme);
    const nextTheme = THEME_LIST[(curThemeIdx + 1) % THEME_LIST.length].id;
    setStyleProfile(nextStyle);
    setDocxTheme(nextTheme);
    void handleGenerateAi(nextStyle, nextTheme);
  };

  const createManualTemplate = () => {
    if (!order) return;
    const now = new Date().toISOString();
    setSolution({
      title: `حل ${order.assignmentTitle}`,
      includeCoverPage: order.includeCoverPage,
      styleProfile,
      docxTheme,
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
              {(order.cycle || order.year) && (
                <p>
                  <strong className="text-slate-800">الطور والمستوى:</strong>{" "}
                  {order.cycle === "master" ? "ماستر" : "ليسانس"} {order.year ? `(${order.year})` : ""}
                </p>
              )}
              {order.domain && <p><strong className="text-slate-800">الميدان:</strong> {order.domain}</p>}
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

            {/* Shared Course Library Archiving Control */}
            <div className="pt-2 border-t border-slate-100 space-y-2">
              {archivedRefs && archivedRefs.archivedCount > 0 ? (
                <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-[11px] text-emerald-900">
                  <strong className="flex items-center gap-1 mb-0.5">
                    <Library className="w-3.5 h-3.5 text-emerald-700" />
                    مكتبة المقياس الرسمية: {archivedRefs.archivedCount} مرجع محفوظ تلقائيا
                  </strong>
                  <p className="text-emerald-800">
                    تُحقن تلقائيا في محرك الحل ولكل طلب قادم لنفس المسار والمقياس.
                  </p>
                </div>
              ) : (
                <p className="text-[11px] text-slate-500">
                  لا توجد مراجع مؤرشفة بعد لهذا المسار والمقياس في المكتبة الموحّدة.
                </p>
              )}

              {order.files.some((f) => f.category === "reference") &&
                order.cycle &&
                order.year &&
                order.specialtyId && (
                  <button
                    type="button"
                    onClick={handleArchiveRefs}
                    disabled={archivingRefs}
                    className="w-full inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-navy-50 hover:bg-navy-100 border border-navy-200 text-navy-800 font-bold text-xs disabled:opacity-60"
                  >
                    <Library className="w-3.5 h-3.5" />
                    {archivingRefs
                      ? "جاري الحفظ في المكتبة..."
                      : "حفظ مراجع هذا الطلب في مكتبة المقياس الرسمية"}
                  </button>
                )}
            </div>
          </div>

          {/* AI Generation Box */}
          <div className="bg-gradient-to-b from-navy-50 to-white border border-navy-200 rounded-2xl p-5 shadow-sm space-y-3">
            <h2 className="font-extrabold text-navy-800 text-sm flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-navy-600" />
              توليد الحل بالذكاء الاصطناعي (Gemini)
            </h2>
            <p className="text-xs text-slate-600 leading-relaxed">
              يقرأ ملفات التمرين والمراجع المرفوعة، ويولّد مسودة حل كاملة مهيكلة بالجداول والمعادلات مع تفادي تكرار الصياغة بين طلبات نفس الدفعة.
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

            <div>
              <label className="flex items-center gap-1 text-xs font-bold text-slate-600 mb-1">
                <GraduationCap className="w-3.5 h-3.5 text-navy-600" />
                بروتوكول التخصص الأكاديمي (البرومبت المتخصص)
              </label>
              <select
                value={discipline}
                onChange={(e) => setDiscipline(e.target.value as AcademicDiscipline)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-navy-600"
              >
                {DISCIPLINE_LIST.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-slate-500 mt-1">
                {DISCIPLINE_LIST.find((d) => d.id === discipline)?.shortDesc}
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">
                أسلوب الصياغة وبنية التحليل (تنويع الدفعة)
              </label>
              <select
                value={styleProfile}
                onChange={(e) => setStyleProfile(e.target.value as StyleProfileId)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-navy-600"
              >
                {STYLE_PROFILES.map((sp) => (
                  <option key={sp.id} value={sp.id}>
                    {sp.label}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-slate-500 mt-1">
                {STYLE_PROFILES.find((s) => s.id === styleProfile)?.shortDesc}
              </p>
            </div>

            <div>
              <label className="flex items-center gap-1 text-xs font-bold text-slate-600 mb-1">
                <Palette className="w-3.5 h-3.5 text-navy-600" />
                قالب وتنسيق ملف Word (.docx)
              </label>
              <select
                value={docxTheme}
                onChange={(e) => handleThemeChange(e.target.value as DocxThemeId)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-navy-600"
              >
                {THEME_LIST.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-slate-500 mt-1">
                تغيير القالب يغيّر الخط والألوان وتصميم الجداول فورا عند الحفظ دون الحاجة لإعادة التوليد.
              </p>
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
              onClick={() => handleGenerateAi()}
              disabled={generating || refiningMode !== null || blueprintBusy !== null}
              className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-xl bg-navy-700 hover:bg-navy-600 disabled:opacity-60 text-white font-bold text-xs shadow-sm"
            >
              <Sparkles className="w-4 h-4" />
              {generating ? "جاري تحليل المراجع وإعداد الحل (المرحلة 1)..." : "توليد الحل الآن (المرحلة 1)"}
            </button>

            {hasBlueprint && (
              <button
                type="button"
                onClick={() => handleBlueprintAction("spawn")}
                disabled={generating || refiningMode !== null || blueprintBusy !== null}
                className="w-full inline-flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-bold text-xs shadow-sm"
              >
                <Sparkles className="w-4 h-4" />
                {blueprintBusy === "spawn"
                  ? "جاري التوليد السريع ببصمة فريدة..."
                  : "⚡ توليد سريع من المرجع المعتمد للموجة (~10 ثوانٍ)"}
              </button>
            )}

            {solution && (
              <button
                type="button"
                onClick={() => handleBlueprintAction("save")}
                disabled={generating || refiningMode !== null || blueprintBusy !== null}
                className="w-full inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-white hover:bg-navy-50 border border-navy-200 text-navy-800 font-bold text-xs disabled:opacity-60"
              >
                <Library className="w-3.5 h-3.5" />
                {blueprintBusy === "save"
                  ? "جاري الحفظ..."
                  : hasBlueprint
                  ? "تحديث الحل المرجعي المحفوظ للموجة ✓"
                  : "حفظ هذا الحل كـ «مرجع معتمد للموجة» (لتسريع 300 طالب)"}
              </button>
            )}
          </div>

          {/* Stage-2 Expert Quality Lab */}
          {solution && (
            <div className="bg-gradient-to-b from-emerald-50/70 to-white border border-emerald-200 rounded-2xl p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between gap-2 border-b border-emerald-100 pb-2">
                <h2 className="font-extrabold text-emerald-900 text-sm flex items-center gap-1.5">
                  <Wand2 className="w-4 h-4 text-emerald-700" />
                  مختبر الجودة الفائقة (المرحلة 2)
                </h2>
                <div className="flex items-center gap-1">
                  {solution.qualityMeta?.auditPassApplied && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                      مدقّق ✓
                    </span>
                  )}
                  {solution.qualityMeta?.humanizedPassApplied && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
                      مؤنسَن ✓
                    </span>
                  )}
                </div>
              </div>

              {solution.qualityMeta?.discipline && (
                <p className="text-[11px] text-slate-600">
                  <strong className="text-slate-800">البروتوكول المطبّق:</strong>{" "}
                  {DISCIPLINE_PROFILES[solution.qualityMeta.discipline]?.label}
                </p>
              )}

              <p className="text-xs text-slate-600 leading-relaxed">
                يراجع الحل كأستاذ مشرف مقابل ملفات المقياس، يكشف أي نقص أو خطأ حسابي، ويعمّق التحليل ليتفوق بوضوح على المخرجات السطحية لأدوات الذكاء الاصطناعي العامة.
              </p>

              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => handleRefine("deepen_and_audit")}
                  disabled={generating || refiningMode !== null}
                  className="w-full inline-flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white font-bold text-xs shadow-sm"
                >
                  <GraduationCap className="w-4 h-4" />
                  {refiningMode === "deepen_and_audit"
                    ? "جاري التدقيق الحسابي والمنهجي والتعميق..."
                    : "تدقيق حسابي وتعميق أكاديمي شامل (المرحلة 2)"}
                </button>

                <button
                  type="button"
                  onClick={() => handleRefine("humanize_academic")}
                  disabled={generating || refiningMode !== null}
                  className="w-full inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-white hover:bg-emerald-50 border border-emerald-300 text-emerald-900 font-bold text-xs disabled:opacity-60"
                >
                  <Wand2 className="w-3.5 h-3.5" />
                  {refiningMode === "humanize_academic"
                    ? "جاري أنسنة الصياغة مع تثبيت المعادلات..."
                    : "أنسنة أكاديمية متقدمة (مع قفل الأرقام والمعادلات)"}
                </button>
              </div>

              {solution.qualityMeta?.auditNotes && solution.qualityMeta.auditNotes.length > 0 && (
                <div className="p-3 rounded-xl bg-white border border-emerald-200 space-y-1.5">
                  <p className="text-[11px] font-extrabold text-emerald-900">
                    تقرير المدقّق الأكاديمي:
                  </p>
                  <ul className="list-disc pr-4 space-y-1 text-[11px] text-slate-700 leading-relaxed">
                    {solution.qualityMeta.auditNotes.map((note, idx) => (
                      <li key={idx}>{note}</li>
                    ))}
                  </ul>
                </div>
              )}

              {solution.qualityMeta?.studyGuide?.summary && (
                <div className="p-2.5 rounded-xl bg-blue-50/70 border border-blue-200 text-[11px] text-navy-800">
                  <strong>دليل فهم الطالب جاهز:</strong> سيظهر تلقائيا للطالب في صفحة التتبع (مع {solution.qualityMeta.studyGuide.defenseQuestions.length} أسئلة مناقشة متوقعة) دون إضافته لملف Word.
                </div>
              )}
            </div>
          )}

          {/* Cohort Uniqueness & Similarity Checker */}
          {solution && (
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2">
                <h2 className="font-extrabold text-navy-800 text-sm flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  فحص التفرد وتشابه الدفعة
                </h2>
                <button
                  type="button"
                  onClick={() => loadSimilarity(order.id)}
                  disabled={checkingSim}
                  className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"
                  title="تحديث فحص التشابه"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${checkingSim ? "animate-spin" : ""}`} />
                </button>
              </div>

              {similarity ? (
                <>
                  <div className="flex items-center justify-between gap-2 p-3 rounded-xl bg-slate-50 border border-slate-200">
                    <div>
                      <p className="text-[11px] text-slate-500">أعلى نسبة تشابه لفظي في نفس المقياس</p>
                      <p className="text-lg font-extrabold text-slate-800">
                        {similarity.maxSimilarity}%
                      </p>
                    </div>
                    <span
                      className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                        similarity.maxSimilarity < 20
                          ? "bg-emerald-100 text-emerald-800"
                          : similarity.maxSimilarity < 35
                          ? "bg-amber-100 text-amber-800"
                          : "bg-red-100 text-red-800"
                      }`}
                    >
                      {similarity.maxSimilarity < 20
                        ? "تفرد ممتاز"
                        : similarity.maxSimilarity < 35
                        ? "تشابه متوسط"
                        : "تشابه مرتفع"}
                    </span>
                  </div>

                  {similarity.comparedCount === 0 ? (
                    <p className="text-xs text-slate-500 leading-relaxed">
                      لا توجد طلبات أخرى مكتملة لنفس المقياس حاليا للمقارنة. عند وصول طلبات إضافية من نفس الدفعة، سيقارنها النظام تلقائيا ويتفادى تكرار صياغتها.
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      <p className="text-[11px] font-bold text-slate-600">
                        تمت المقارنة مع {similarity.comparedCount} طلب(ات) في «{order.moduleName}»:
                      </p>
                      <ul className="space-y-1">
                        {similarity.matches.slice(0, 3).map((m) => (
                          <li
                            key={m.id}
                            className="flex items-center justify-between text-xs px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-100"
                          >
                            <span className="truncate text-slate-700">
                              <span dir="ltr" className="font-mono font-bold text-navy-700 ml-1.5">
                                {m.trackingCode}
                              </span>
                              ({m.studentName})
                            </span>
                            <span className="font-bold text-slate-800 shrink-0">{m.similarity}%</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-xs text-slate-400">جاري فحص التشابه مع طلبات الدفعة...</p>
              )}

              {(similarity?.dnaLabel || solution.qualityMeta?.dnaLabel) && (
                <div className="p-2.5 rounded-xl bg-navy-50/70 border border-navy-100 text-[11px] text-navy-900">
                  <strong className="block mb-0.5">البصمة المنهجية والبصرية المخصصة:</strong>
                  <span>{similarity?.dnaLabel || solution.qualityMeta?.dnaLabel}</span>
                </div>
              )}

              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => handleRefine("surgical_diverge")}
                  disabled={generating || refiningMode !== null}
                  className="w-full inline-flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-navy-700 hover:bg-navy-600 text-white font-bold text-xs disabled:opacity-60 shadow-sm"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  {refiningMode === "surgical_diverge"
                    ? "جاري فك التشابه الجراحي وتوليد بصمة جديدة..."
                    : "فك التشابه الجراحي الآلي (< 20%)"}
                </button>

                <button
                  type="button"
                  onClick={handleRegenerateDistinct}
                  disabled={generating || refiningMode !== null}
                  className="w-full inline-flex items-center justify-center gap-1.5 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-900 font-bold text-xs disabled:opacity-60"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  إعادة التوليد الكامل بأسلوب وقالب جديدين
                </button>
              </div>

              <p className="text-[11px] text-slate-500 leading-relaxed">
                النظام يفحص كامل طلبات المقياس (حتى 300+ طالب)، ويحظر العبارات المتكررة عبر الدفعة ويُشغّل فك التشابه الجراحي تلقائيا عند تجاوز 18%.
              </p>
            </div>
          )}

          {/* Payment, BaridiMob Receipt & WhatsApp Notify */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3">
            <h2 className="font-extrabold text-navy-800 text-sm flex items-center gap-1.5 border-b border-slate-100 pb-2">
              <CreditCard className="w-4 h-4 text-amber-600" />
              الدفع والباقة وإشعار الطالب
            </h2>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  حالة الدفع
                </label>
                <select
                  value={paymentStatus}
                  onChange={(e) => setPaymentStatus(e.target.value as PaymentStatus)}
                  className="w-full px-2.5 py-2 rounded-xl border border-slate-300 text-xs bg-white font-medium"
                >
                  <option value="unpaid">بانتظار الدفع</option>
                  <option value="receipt_submitted">وصل مرفوع للمراجعة</option>
                  <option value="paid">مدفوع ومؤكد ✓</option>
                  <option value="waived">مفتوح مجانا / معفى</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  المبلغ (دج)
                </label>
                <input
                  type="number"
                  min={0}
                  value={priceDzd}
                  onChange={(e) => setPriceDzd(e.target.value)}
                  placeholder="1200"
                  className="w-full px-2.5 py-2 rounded-xl border border-slate-300 text-xs font-mono font-bold bg-white"
                />
              </div>
            </div>

            {(order.issuedPassCode || order.creditPassUsed || order.promoCodeUsed) && (
              <div className="p-2.5 rounded-xl bg-navy-50 border border-navy-200 text-[11px] text-navy-900 space-y-1">
                {order.issuedPassCode && (
                  <p>
                    <strong>🎟️ رمز رصيد السداسي الصادر:</strong>{" "}
                    <span dir="ltr" className="font-mono font-black">{order.issuedPassCode}</span>
                  </p>
                )}
                {order.creditPassUsed && (
                  <p>
                    <strong>🎟️ مخصوم من رمز الرصيد:</strong>{" "}
                    <span dir="ltr" className="font-mono font-black">{order.creditPassUsed}</span>
                  </p>
                )}
                {order.promoCodeUsed && (
                  <p>
                    <strong>كود البرومو المستخدم:</strong>{" "}
                    <span dir="ltr" className="font-mono font-bold">{order.promoCodeUsed}</span>{" "}
                    ({order.discountPercent ?? 0}%)
                  </p>
                )}
              </div>
            )}

            {order.paymentReceipt && (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <strong className="text-amber-900">وصل دفع مرفوع:</strong>
                  <a
                    href={`/api/orders/${order.id}/receipt`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-navy-700 font-bold hover:underline"
                  >
                    عرض الوصل
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                <p className="text-amber-900 truncate">{order.paymentReceipt.originalName}</p>
                {order.paymentReceipt.referenceNote && (
                  <p className="text-[11px] text-amber-800">
                    <strong>مرجع التحويل:</strong> {order.paymentReceipt.referenceNote}
                  </p>
                )}
              </div>
            )}

            {paymentStatus !== "paid" && paymentStatus !== "waived" && (
              <button
                type="button"
                onClick={() => handleSave(undefined, "paid")}
                disabled={saving}
                className="w-full inline-flex items-center justify-center gap-1.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-bold text-xs shadow-sm"
              >
                <CheckCircle2 className="w-4 h-4" />
                تأكيد استلام الدفع وفتح التحميل فورا
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                const trackUrl = `${window.location.origin}/track?code=${encodeURIComponent(
                  order.trackingCode
                )}`;
                const digits = order.contact.replace(/[^\d]/g, "");
                const waPhone =
                  digits.length === 10 && digits.startsWith("0")
                    ? `213${digits.slice(1)}`
                    : digits.length >= 11
                    ? digits
                    : "";
                const msg =
                  `السلام عليكم ${order.studentName}،\n` +
                  `بخصوص طلبك (${order.moduleName} - ${order.assignmentTitle}) برمز التتبع: ${order.trackingCode}\n` +
                  (status === "completed"
                    ? paymentStatus === "paid" || paymentStatus === "waived"
                      ? `✅ تم اعتماد الحل وتأكيد الدفع، يمكنك الآن تحميل ملف Word (.docx) والاطلاع على دليل الفهم السريع مباشرة من الرابط:\n${trackUrl}`
                      : `✅ تم إعداد الحل بنجاح! يمكنك معاينة أول جزء من الحل ورفع وصل الدفع عبر BaridiMob لفتح ملف Word الكامل من الرابط:\n${trackUrl}`
                    : `طلبك قيد المعالجة حاليا، يمكنك متابعته عبر الرابط:\n${trackUrl}`);
                const waUrl = waPhone
                  ? `https://wa.me/${waPhone}?text=${encodeURIComponent(msg)}`
                  : `https://wa.me/?text=${encodeURIComponent(msg)}`;
                window.open(waUrl, "_blank", "noopener,noreferrer");
              }}
              className="w-full inline-flex items-center justify-center gap-1.5 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 font-bold text-xs"
            >
              <MessageCircle className="w-4 h-4" />
              إرسال رابط التتبع للطالب عبر WhatsApp
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
                معاينة الوثيقة (A4)
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
