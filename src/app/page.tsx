"use client";

import React, { useState } from "react";
import Link from "next/link";
import { upload } from "@vercel/blob/client";
import {
  CheckCircle2,
  Copy,
  FileSpreadsheet,
  FileText,
  FileUp,
  Send,
  Sparkles,
  Trash2,
  ArrowLeft,
} from "lucide-react";
import type { UploadedFileMeta } from "@/types/order";

export default function StudentOrderPage() {
  const [studentName, setStudentName] = useState("");
  const [contact, setContact] = useState("");
  const [university, setUniversity] = useState("جامعة التكوين المتواصل (UFC)");
  const [specialty, setSpecialty] = useState("");
  const [moduleName, setModuleName] = useState("");
  const [assignmentTitle, setAssignmentTitle] = useState("");
  const [exerciseText, setExerciseText] = useState("");
  const [notes, setNotes] = useState("");
  const [includeCoverPage, setIncludeCoverPage] = useState(false);
  const [strictReferencesOnly, setStrictReferencesOnly] = useState(true);
  const [exerciseFiles, setExerciseFiles] = useState<File[]>([]);
  const [referenceFiles, setReferenceFiles] = useState<File[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [uploadStatus, setUploadStatus] = useState("");
  const [error, setError] = useState("");
  const [createdOrder, setCreatedOrder] = useState<{
    id: string;
    trackingCode: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  const handleFileAdd = (
    e: React.ChangeEvent<HTMLInputElement>,
    setter: React.Dispatch<React.SetStateAction<File[]>>
  ) => {
    const selected = Array.from(e.target.files ?? []);
    if (selected.length > 0) {
      setter((prev) => [...prev, ...selected]);
    }
    e.target.value = "";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    setUploadStatus("جاري التحضير...");

    try {
      const allFiles: Array<{ file: File; category: "exercise" | "reference" }> = [
        ...exerciseFiles.map((file) => ({ file, category: "exercise" as const })),
        ...referenceFiles.map((file) => ({ file, category: "reference" as const })),
      ];

      // Check whether direct Vercel Blob client upload is enabled (bypasses 4.5 MB Serverless Function limit)
      let blobEnabled = false;
      try {
        const cfgRes = await fetch("/api/upload");
        if (cfgRes.ok) {
          const cfg = (await cfgRes.json()) as { blobEnabled?: boolean };
          blobEnabled = Boolean(cfg.blobEnabled);
        }
      } catch {
        blobEnabled = false;
      }

      let res: Response;

      if (blobEnabled && allFiles.length > 0) {
        const uploadedFiles: UploadedFileMeta[] = [];
        for (let i = 0; i < allFiles.length; i++) {
          const { file, category } = allFiles[i];
          setUploadStatus(`جاري رفع الملف ${i + 1} من ${allFiles.length}: ${file.name}`);
          const extMatch = file.name.match(/\.[a-zA-Z0-9]+$/);
          const safeExt = extMatch ? extMatch[0].toLowerCase() : "";
          const pathname = `acad-solver/uploads/${category}-${Date.now()}-${i}${safeExt}`;
          const blob = await upload(pathname, file, {
            access: "public",
            handleUploadUrl: "/api/upload",
            multipart: file.size > 4 * 1024 * 1024,
          });
          uploadedFiles.push({
            id: `${Date.now()}-${i}`,
            originalName: file.name,
            storedName: blob.pathname.split("/").pop() || file.name,
            blobUrl: blob.url,
            mimeType: file.type || blob.contentType || "application/octet-stream",
            size: file.size,
            category,
            uploadedAt: new Date().toISOString(),
          });
        }

        setUploadStatus("جاري تسجيل الطلب...");
        res = await fetch("/api/orders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            studentName,
            contact,
            university,
            specialty,
            moduleName,
            assignmentTitle,
            exerciseText,
            notes,
            includeCoverPage,
            strictReferencesOnly,
            uploadedFiles,
          }),
        });
      } else {
        setUploadStatus("جاري إرسال الطلب...");
        const fd = new FormData();
        fd.append("studentName", studentName);
        fd.append("contact", contact);
        fd.append("university", university);
        fd.append("specialty", specialty);
        fd.append("moduleName", moduleName);
        fd.append("assignmentTitle", assignmentTitle);
        fd.append("exerciseText", exerciseText);
        fd.append("notes", notes);
        fd.append("includeCoverPage", String(includeCoverPage));
        fd.append("strictReferencesOnly", String(strictReferencesOnly));
        exerciseFiles.forEach((f) => fd.append("exerciseFiles", f));
        referenceFiles.forEach((f) => fd.append("referenceFiles", f));
        res = await fetch("/api/orders", { method: "POST", body: fd });
      }

      const rawText = await res.text();
      let data: { id?: string; trackingCode?: string; error?: string } = {};
      try {
        data = JSON.parse(rawText);
      } catch {
        if (res.status === 413 || rawText.includes("Request Entity Too Large")) {
          throw new Error(
            "حجم الملفات المرفوعة يتجاوز الحد المسموح به للرفع المباشر. تأكد من تفعيل Vercel Blob أو قلّل حجم الملفات."
          );
        }
        throw new Error(`استجابة غير متوقعة من الخادم (${res.status}).`);
      }

      if (!res.ok || !data.id || !data.trackingCode) {
        throw new Error(data.error || "تعذر إرسال الطلب.");
      }
      setCreatedOrder({ id: data.id, trackingCode: data.trackingCode });
    } catch (err) {
      setError(err instanceof Error ? err.message : "حدث خطأ غير متوقع.");
    } finally {
      setSubmitting(false);
      setUploadStatus("");
    }
  };

  const copyCode = async () => {
    if (!createdOrder) return;
    await navigator.clipboard.writeText(createdOrder.trackingCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
      {/* Hero Banner */}
      <section className="rounded-2xl bg-gradient-to-l from-navy-800 via-navy-700 to-navy-600 text-white p-6 sm:p-8 shadow-md">
        <div className="max-w-3xl space-y-3">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/15 text-xs font-medium">
            <Sparkles className="w-3.5 h-3.5" />
            تنسيق أكاديمي عربي RTL متكامل بمعادلات Word الأصلية
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold leading-snug">
            أرسل نشاطك الجامعي ومراجع المقياس، واستلم الحل منسّقا وجاهزا للرفع
          </h1>
          <p className="text-sm sm:text-base text-slate-200 leading-relaxed">
            يرفع الطالب ملف الأسئلة ومطبوعات المقياس، فيتولى المشرف إعداد الحل ومراجعته بدقة بالاعتماد الحصري على مراجع المقياس ثم تسليمه كملف Word (.docx) من اليمين إلى اليسار مع جداول ومعادلات رياضية وإحصائية أصلية.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-6 pt-5 border-t border-white/15 text-xs sm:text-sm">
          <div className="bg-white/10 rounded-xl p-3">
            <span className="font-bold block mb-0.5">1. تقديم الطلب والمرفقات</span>
            <span className="text-slate-200">ارفع ملف التمرين ومراجع المقياس واحصل على رمز تتبع.</span>
          </div>
          <div className="bg-white/10 rounded-xl p-3">
            <span className="font-bold block mb-0.5">2. الإعداد والمراجعة الدقيقة</span>
            <span className="text-slate-200">توليد الحل وفق مراجعك ثم مراجعة يدوية للحسابات والصياغة.</span>
          </div>
          <div className="bg-white/10 rounded-xl p-3">
            <span className="font-bold block mb-0.5">3. تحميل ملف Word RTL</span>
            <span className="text-slate-200">ملف .docx جاهز للرفع مباشرة على أرضية الجامعة Moodle.</span>
          </div>
        </div>
      </section>

      {createdOrder ? (
        <section className="bg-white border border-emerald-200 rounded-2xl p-6 sm:p-8 shadow-sm text-center space-y-5 max-w-2xl mx-auto">
          <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <div className="space-y-1.5">
            <h2 className="text-2xl font-extrabold text-navy-800">
              تم استلام طلبك بنجاح
            </h2>
            <p className="text-sm text-slate-600">
              احتفظ برمز التتبع أدناه لمتابعة حالة إعداد ومراجعة الحل وتحميل ملف Word فور جاهزيته.
            </p>
          </div>

          <div className="bg-navy-50 border border-navy-200 rounded-xl p-4 inline-flex items-center gap-4">
            <span dir="ltr" className="text-2xl font-mono font-extrabold text-navy-800 tracking-wider">
              {createdOrder.trackingCode}
            </span>
            <button
              type="button"
              onClick={copyCode}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-navy-700 text-white text-xs font-medium hover:bg-navy-600"
            >
              <Copy className="w-3.5 h-3.5" />
              {copied ? "تم النسخ" : "نسخ الرمز"}
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <Link
              href={`/track?code=${encodeURIComponent(createdOrder.trackingCode)}`}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-navy-700 text-white font-bold text-sm hover:bg-navy-600 transition-colors"
            >
              متابعة حالة الطلب الآن
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <button
              type="button"
              onClick={() => {
                setCreatedOrder(null);
                setAssignmentTitle("");
                setExerciseText("");
                setNotes("");
                setExerciseFiles([]);
                setReferenceFiles([]);
              }}
              className="px-5 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-medium text-sm hover:bg-slate-50"
            >
              إرسال طلب آخر
            </button>
          </div>
        </section>
      ) : (
        <form
          onSubmit={handleSubmit}
          className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-sm space-y-6"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-slate-100">
            <div>
              <h2 className="text-xl font-extrabold text-navy-800">
                نموذج تقديم طلب نشاط جامعي
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                أدخل معلومات المقياس وارفع ملف التمرين مع مراجع ودروس المقياس المعتمدة.
              </p>
            </div>
            <Link
              href="/track?code=UFC-2026-1001"
              className="text-xs font-bold text-navy-600 hover:underline"
            >
              معاينة مثال لطلب مكتمل (UFC-2026-1001) ←
            </Link>
          </div>

          {error && (
            <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm font-medium">
              {error}
            </div>
          )}

          {/* Student & Course Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1.5">
                اسم الطالب <span className="text-red-500">*</span>
              </label>
              <input
                required
                type="text"
                value={studentName}
                onChange={(e) => setStudentName(e.target.value)}
                placeholder="مثال: محمد أمين بن علي"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-navy-600"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1.5">
                البريد الإلكتروني أو رقم الهاتف
              </label>
              <input
                type="text"
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                placeholder="example@email.com أو 05XX..."
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-navy-600"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1.5">
                الجامعة / المؤسسة
              </label>
              <input
                type="text"
                value={university}
                onChange={(e) => setUniversity(e.target.value)}
                placeholder="جامعة التكوين المتواصل (UFC)"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-navy-600"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1.5">
                التخصص والمستوى
              </label>
              <input
                type="text"
                value={specialty}
                onChange={(e) => setSpecialty(e.target.value)}
                placeholder="مثال: ماستر 2 إدارة المنظمات — السداسي 3"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-navy-600"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1.5">
                اسم المقياس <span className="text-red-500">*</span>
              </label>
              <input
                required
                type="text"
                value={moduleName}
                onChange={(e) => setModuleName(e.target.value)}
                placeholder="مثال: تحليل المعطيات"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-navy-600"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1.5">
                عنوان النشاط أو التمرين <span className="text-red-500">*</span>
              </label>
              <input
                required
                type="text"
                value={assignmentTitle}
                onChange={(e) => setAssignmentTitle(e.target.value)}
                placeholder="مثال: النشاط المنزلي الأول"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-navy-600"
              />
            </div>
          </div>

          {/* File Uploaders */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Exercise Files */}
            <div className="border-2 border-dashed border-navy-200 rounded-xl p-4 bg-navy-50/40">
              <div className="flex items-center gap-2 text-navy-800 font-bold text-sm mb-1">
                <FileText className="w-4 h-4 text-navy-600" />
                ملفات التمرين أو الأسئلة (PDF / صور)
              </div>
              <p className="text-xs text-slate-500 mb-3">
                ارفع ورقة النشاط أو لقطات شاشة للأسئلة.
              </p>
              <label className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-white border border-navy-200 hover:border-navy-600 text-xs font-bold text-navy-700 cursor-pointer shadow-sm">
                <FileUp className="w-4 h-4" />
                اختيار ملفات التمرين
                <input
                  type="file"
                  multiple
                  accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.csv"
                  onChange={(e) => handleFileAdd(e, setExerciseFiles)}
                  className="hidden"
                />
              </label>
              {exerciseFiles.length > 0 && (
                <ul className="mt-3 space-y-1.5">
                  {exerciseFiles.map((f, i) => (
                    <li
                      key={`${f.name}-${i}`}
                      className="flex items-center justify-between gap-2 bg-white px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs"
                    >
                      <span className="truncate text-slate-700">{f.name}</span>
                      <button
                        type="button"
                        onClick={() =>
                          setExerciseFiles((prev) => prev.filter((_, idx) => idx !== i))
                        }
                        className="text-red-500 hover:text-red-700 shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Reference Files */}
            <div className="border-2 border-dashed border-slate-300 rounded-xl p-4 bg-slate-50/60">
              <div className="flex items-center gap-2 text-slate-800 font-bold text-sm mb-1">
                <FileSpreadsheet className="w-4 h-4 text-navy-600" />
                مراجع ودروس المقياس (PDF / صور / نصوص)
              </div>
              <p className="text-xs text-slate-500 mb-3">
                ارفع المحاضرات والمطبوعات المعتمدة للالتزام بقوانينها ورموزها.
              </p>
              <label className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-white border border-slate-300 hover:border-navy-600 text-xs font-bold text-slate-700 cursor-pointer shadow-sm">
                <FileUp className="w-4 h-4" />
                إضافة مراجع المقياس
                <input
                  type="file"
                  multiple
                  accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.csv"
                  onChange={(e) => handleFileAdd(e, setReferenceFiles)}
                  className="hidden"
                />
              </label>
              {referenceFiles.length > 0 && (
                <ul className="mt-3 space-y-1.5">
                  {referenceFiles.map((f, i) => (
                    <li
                      key={`${f.name}-${i}`}
                      className="flex items-center justify-between gap-2 bg-white px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs"
                    >
                      <span className="truncate text-slate-700">{f.name}</span>
                      <button
                        type="button"
                        onClick={() =>
                          setReferenceFiles((prev) => prev.filter((_, idx) => idx !== i))
                        }
                        className="text-red-500 hover:text-red-700 shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Pasted Exercise Text & Notes */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1.5">
                نص التمرين أو الأسئلة (اختياري في حال رفع ملف)
              </label>
              <textarea
                rows={4}
                value={exerciseText}
                onChange={(e) => setExerciseText(e.target.value)}
                placeholder="يمكنك لصق نص التمرين أو المعطيات هنا مباشرة..."
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-navy-600"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1.5">
                ملاحظات أو تعليمات إضافية للمشرف
              </label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="مثال: مستوى المعنوية 5%، تقريب النتائج إلى 4 أرقام بعد الفاصلة..."
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-navy-600"
              />
            </div>
          </div>

          {/* Formatting Preferences */}
          <div className="flex flex-col sm:flex-row gap-4 p-4 rounded-xl bg-slate-50 border border-slate-200 text-sm">
            <label className="flex items-center gap-2.5 cursor-pointer text-slate-700">
              <input
                type="checkbox"
                checked={!includeCoverPage}
                onChange={(e) => setIncludeCoverPage(!e.target.checked)}
                className="w-4 h-4 accent-navy-700"
              />
              <span>بدون واجهة جامعية (دخول مباشر في نص الحل)</span>
            </label>
            <label className="flex items-center gap-2.5 cursor-pointer text-slate-700">
              <input
                type="checkbox"
                checked={strictReferencesOnly}
                onChange={(e) => setStrictReferencesOnly(e.target.checked)}
                className="w-4 h-4 accent-navy-700"
              />
              <span>الاعتماد الحصري على مراجع المقياس المرفوعة فقط</span>
            </label>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-navy-700 text-white font-bold text-sm hover:bg-navy-600 disabled:opacity-60 shadow-sm transition-colors"
            >
              <Send className="w-4 h-4" />
              {submitting ? (uploadStatus || "جاري إرسال الطلب...") : "إرسال الطلب والحصول على رمز التتبع"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
