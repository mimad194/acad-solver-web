"use client";

import React from "react";
import {
  ArrowDown,
  ArrowUp,
  Plus,
  Trash2,
  Type,
  Heading1,
  Heading2,
  Heading3,
  List,
  Sigma,
  Table2,
} from "lucide-react";
import { DocumentBlock, SolutionDocument } from "@/types/order";

const BLOCK_LABELS: Record<DocumentBlock["type"], string> = {
  doc_title: "عنوان الوثيقة الرئيسي",
  exercise_heading: "عنوان تمرين / محور",
  question_heading: "عنوان سؤال",
  sub_heading: "عنوان فرعي",
  paragraph: "فقرة نصية (تدعم $LaTeX$ و **عريض**)",
  bullet: "نقطة تعدادية",
  equation: "معادلة رياضية مستقلة (LaTeX)",
  table: "جدول منسق",
};

function makeEmptyBlock(type: DocumentBlock["type"]): DocumentBlock {
  const id = `blk-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  switch (type) {
    case "equation":
      return { id, type: "equation", latex: "Y_i = \\beta_0 + \\beta_1 X_i + u_i", callout: false };
    case "table":
      return {
        id,
        type: "table",
        caption: "",
        headers: ["البيان", "$X$", "$Y$"],
        rows: [
          ["1", "10", "400"],
          ["المجموع", "10", "400"],
        ],
        hasTotalRow: true,
      };
    case "doc_title":
      return { id, type: "doc_title", text: "حل النشاط..." };
    case "exercise_heading":
      return { id, type: "exercise_heading", text: "التمرين (01)" };
    case "question_heading":
      return { id, type: "question_heading", text: "1) نص السؤال..." };
    case "sub_heading":
      return { id, type: "sub_heading", text: "عنوان فرعي:" };
    case "bullet":
      return { id, type: "bullet", text: "**عنصر:** شرح مختصر..." };
    default:
      return { id, type: "paragraph", text: "فقرة نصية..." };
  }
}

export default function BlockEditor({
  solution,
  onChange,
}: {
  solution: SolutionDocument;
  onChange: (next: SolutionDocument) => void;
}) {
  const updateBlock = (index: number, updated: DocumentBlock) => {
    const blocks = [...solution.blocks];
    blocks[index] = updated;
    onChange({ ...solution, blocks });
  };

  const removeBlock = (index: number) => {
    const blocks = solution.blocks.filter((_, i) => i !== index);
    onChange({ ...solution, blocks });
  };

  const moveBlock = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= solution.blocks.length) return;
    const blocks = [...solution.blocks];
    const tmp = blocks[index];
    blocks[index] = blocks[target];
    blocks[target] = tmp;
    onChange({ ...solution, blocks });
  };

  const appendBlock = (type: DocumentBlock["type"]) => {
    onChange({ ...solution, blocks: [...solution.blocks, makeEmptyBlock(type)] });
  };

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
        <div className="flex-1">
          <label className="block text-xs font-bold text-slate-600 mb-1">
            عنوان الملف المصدّر (.docx)
          </label>
          <input
            type="text"
            value={solution.title}
            onChange={(e) => onChange({ ...solution, title: e.target.value })}
            className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-navy-600"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer pt-2 sm:pt-5">
          <input
            type="checkbox"
            checked={solution.includeCoverPage}
            onChange={(e) =>
              onChange({ ...solution, includeCoverPage: e.target.checked })
            }
            className="w-4 h-4 accent-navy-700 rounded"
          />
          <span>إضافة صفحة واجهة جامعية</span>
        </label>
      </div>

      {solution.blocks.map((block, idx) => (
        <div
          key={block.id}
          className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm"
        >
          <div className="flex items-center justify-between gap-2 pb-2.5 mb-3 border-b border-slate-100">
            <span className="text-xs font-bold px-2.5 py-1 rounded-md bg-navy-50 text-navy-700">
              {idx + 1}. {BLOCK_LABELS[block.type]}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => moveBlock(idx, -1)}
                disabled={idx === 0}
                title="تحريك للأعلى"
                className="p-1.5 rounded hover:bg-slate-100 text-slate-500 disabled:opacity-30"
              >
                <ArrowUp className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => moveBlock(idx, 1)}
                disabled={idx === solution.blocks.length - 1}
                title="تحريك للأسفل"
                className="p-1.5 rounded hover:bg-slate-100 text-slate-500 disabled:opacity-30"
              >
                <ArrowDown className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => removeBlock(idx)}
                title="حذف الكتلة"
                className="p-1.5 rounded hover:bg-red-50 text-red-500"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {block.type === "equation" ? (
            <div className="space-y-2">
              <textarea
                dir="ltr"
                rows={2}
                value={block.latex}
                onChange={(e) =>
                  updateBlock(idx, { ...block, latex: e.target.value })
                }
                placeholder="مثال: \hat{Y}_i = 129.0145 + 16.7302 X_{1i}"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-navy-600"
              />
              <label className="inline-flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(block.callout)}
                  onChange={(e) =>
                    updateBlock(idx, { ...block, callout: e.target.checked })
                  }
                  className="w-4 h-4 accent-navy-700"
                />
                <span>تأطير المعادلة كصندوق نتيجة نهائية مميزة</span>
              </label>
            </div>
          ) : block.type === "table" ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <input
                  type="text"
                  value={block.caption ?? ""}
                  onChange={(e) =>
                    updateBlock(idx, { ...block, caption: e.target.value })
                  }
                  placeholder="عنوان الجدول (اختياري)"
                  className="flex-1 min-w-[200px] px-3 py-1.5 rounded-lg border border-slate-300 text-sm"
                />
                <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(block.hasTotalRow)}
                    onChange={(e) =>
                      updateBlock(idx, {
                        ...block,
                        hasTotalRow: e.target.checked,
                      })
                    }
                    className="w-4 h-4 accent-navy-700"
                  />
                  <span>تمييز الصف الأخير كصف مجموع</span>
                </label>
              </div>

              <div className="overflow-x-auto">
                <table dir="rtl" className="w-full border-collapse text-xs">
                  <thead>
                    <tr>
                      {block.headers.map((h, cIdx) => (
                        <th key={cIdx} className="p-1 border border-slate-200 bg-navy-50">
                          <div className="flex items-center gap-1">
                            <input
                              type="text"
                              value={h}
                              onChange={(e) => {
                                const headers = [...block.headers];
                                headers[cIdx] = e.target.value;
                                updateBlock(idx, { ...block, headers });
                              }}
                              className="w-full min-w-[70px] px-1.5 py-1 bg-white border border-slate-300 rounded text-center font-bold"
                            />
                            {block.headers.length > 1 && (
                              <button
                                type="button"
                                title="حذف العمود"
                                onClick={() => {
                                  const headers = block.headers.filter((_, i) => i !== cIdx);
                                  const rows = block.rows.map((r) => r.filter((_, i) => i !== cIdx));
                                  updateBlock(idx, { ...block, headers, rows });
                                }}
                                className="text-red-400 hover:text-red-600 px-0.5"
                              >
                                ×
                              </button>
                            )}
                          </div>
                        </th>
                      ))}
                      <th className="w-8 bg-slate-50 border border-slate-200" />
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, rIdx) => (
                      <tr key={rIdx}>
                        {block.headers.map((_, cIdx) => (
                          <td key={cIdx} className="p-1 border border-slate-200">
                            <input
                              type="text"
                              value={row[cIdx] ?? ""}
                              onChange={(e) => {
                                const rows = block.rows.map((r) => [...r]);
                                rows[rIdx][cIdx] = e.target.value;
                                updateBlock(idx, { ...block, rows });
                              }}
                              className="w-full min-w-[65px] px-1.5 py-1 border border-slate-200 rounded text-center"
                            />
                          </td>
                        ))}
                        <td className="p-1 border border-slate-200 text-center">
                          <button
                            type="button"
                            onClick={() => {
                              const rows = block.rows.filter((_, i) => i !== rIdx);
                              updateBlock(idx, { ...block, rows });
                            }}
                            className="text-red-400 hover:text-red-600"
                            title="حذف الصف"
                          >
                            <Trash2 className="w-3.5 h-3.5 mx-auto" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const rows = [...block.rows, block.headers.map(() => "")];
                    updateBlock(idx, { ...block, rows });
                  }}
                  className="text-xs px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  إضافة صف
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const headers = [...block.headers, `عمود ${block.headers.length + 1}`];
                    const rows = block.rows.map((r) => [...r, ""]);
                    updateBlock(idx, { ...block, headers, rows });
                  }}
                  className="text-xs px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  إضافة عمود
                </button>
              </div>
            </div>
          ) : (
            <textarea
              rows={block.type === "paragraph" || block.type === "bullet" ? 3 : 1}
              value={block.text}
              onChange={(e) =>
                updateBlock(idx, { ...block, text: e.target.value })
              }
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-navy-600"
            />
          )}
        </div>
      ))}

      {/* Add Block Toolbar */}
      <div className="bg-navy-50/70 border border-dashed border-navy-200 rounded-xl p-4">
        <p className="text-xs font-bold text-navy-700 mb-2.5">إضافة عنصر جديد للحل:</p>
        <div className="flex flex-wrap gap-2">
          {[
            { type: "exercise_heading" as const, label: "عنوان تمرين", icon: Heading1 },
            { type: "question_heading" as const, label: "عنوان سؤال", icon: Heading2 },
            { type: "sub_heading" as const, label: "عنوان فرعي", icon: Heading3 },
            { type: "paragraph" as const, label: "فقرة نصية", icon: Type },
            { type: "bullet" as const, label: "نقطة تعدادية", icon: List },
            { type: "equation" as const, label: "معادلة LaTeX", icon: Sigma },
            { type: "table" as const, label: "جدول", icon: Table2 },
          ].map((btn) => {
            const Icon = btn.icon;
            return (
              <button
                key={btn.type}
                type="button"
                onClick={() => appendBlock(btn.type)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-200 hover:border-navy-600 hover:text-navy-700 text-xs font-medium text-slate-700 shadow-sm transition-colors"
              >
                <Icon className="w-3.5 h-3.5" />
                {btn.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
