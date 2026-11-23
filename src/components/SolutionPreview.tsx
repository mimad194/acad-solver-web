"use client";

import React from "react";
import katex from "katex";
import { DocumentBlock, SolutionDocument } from "@/types/order";

function renderLatexHtml(expr: string, displayMode: boolean): string {
  try {
    return katex.renderToString(expr, {
      displayMode,
      throwOnError: false,
      strict: false,
    });
  } catch {
    return expr;
  }
}

function RichInlineText({ text }: { text: string }) {
  const mathParts = text.split(/(\$[^$]+\$)/g);
  return (
    <>
      {mathParts.map((part, idx) => {
        if (!part) return null;
        if (part.startsWith("$") && part.endsWith("$") && part.length >= 2) {
          const expr = part.slice(1, -1).trim();
          return (
            <span
              key={idx}
              className="inline-block align-middle mx-0.5"
              dangerouslySetInnerHTML={{ __html: renderLatexHtml(expr, false) }}
            />
          );
        }
        const boldParts = part.split(/(\*\*[^*]+\*\*)/g);
        return (
          <React.Fragment key={idx}>
            {boldParts.map((bp, bIdx) => {
              if (bp.startsWith("**") && bp.endsWith("**") && bp.length >= 4) {
                return (
                  <strong key={bIdx} className="font-bold text-navy-900">
                    {bp.slice(2, -2)}
                  </strong>
                );
              }
              return <React.Fragment key={bIdx}>{bp}</React.Fragment>;
            })}
          </React.Fragment>
        );
      })}
    </>
  );
}

function isPureNumeric(val: string): boolean {
  return /^\s*[-−+]?\d[\d\s.,]*%?\s*$/.test(val);
}

function PreviewBlock({ block }: { block: DocumentBlock }) {
  switch (block.type) {
    case "doc_title":
      return (
        <h1 className="text-center text-2xl sm:text-3xl font-extrabold text-navy-700 pb-3 mb-6 border-b-2 border-navy-700">
          <RichInlineText text={block.text} />
        </h1>
      );

    case "exercise_heading":
      return (
        <h2 className="text-xl font-bold text-navy-800 bg-navy-50 border-r-4 border-navy-700 px-4 py-2 mt-6 mb-4 rounded-l">
          <RichInlineText text={block.text} />
        </h2>
      );

    case "question_heading":
      return (
        <h3 className="text-lg font-bold text-navy-600 pb-1.5 mt-5 mb-3 border-b border-navy-100">
          <RichInlineText text={block.text} />
        </h3>
      );

    case "sub_heading":
      return (
        <h4 className="text-base font-bold text-navy-700 mt-4 mb-2">
          <RichInlineText text={block.text} />
        </h4>
      );

    case "paragraph":
      return (
        <p className="text-[15px] sm:text-[15.5px] leading-8 text-slate-800 text-right sm:text-justify mb-3 break-words">
          <RichInlineText text={block.text} />
        </p>
      );

    case "bullet":
      return (
        <div className="flex items-start gap-2.5 pr-2 sm:pr-4 mb-2 text-[15px] sm:text-[15.5px] leading-8 text-slate-800">
          <span className="text-navy-600 font-bold mt-0.5">•</span>
          <p className="flex-1 text-right sm:text-justify break-words min-w-0">
            <RichInlineText text={block.text} />
          </p>
        </div>
      );

    case "equation":
      return (
        <div
          className={`my-3 px-4 py-2.5 overflow-x-auto text-center ${
            block.callout
              ? "bg-[#F4F7FA] border border-[#C5D3E0] border-r-4 border-r-navy-600 rounded"
              : ""
          }`}
        >
          <div
            dangerouslySetInnerHTML={{
              __html: renderLatexHtml(block.latex, true),
            }}
          />
        </div>
      );

    case "table":
      return (
        <div className="my-4">
          {block.caption && (
            <p className="text-center text-sm font-bold text-navy-700 mb-2">
              <RichInlineText text={block.caption} />
            </p>
          )}
          <div className="overflow-x-auto rounded border border-navy-600">
            <table dir="rtl" className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-navy-600 text-white">
                  {block.headers.map((h, i) => (
                    <th
                      key={i}
                      className="border border-navy-600/40 px-2.5 py-2 font-bold text-center whitespace-nowrap"
                    >
                      <RichInlineText text={h} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.rows.map((row, rIdx) => {
                  const isTotal =
                    Boolean(block.hasTotalRow) && rIdx === block.rows.length - 1;
                  return (
                    <tr
                      key={rIdx}
                      className={
                        isTotal
                          ? "bg-[#E3ECF5] font-bold text-navy-800"
                          : rIdx % 2 === 1
                          ? "bg-[#F7FAFD]"
                          : "bg-white"
                      }
                    >
                      {block.headers.map((_, cIdx) => {
                        const cell = row[cIdx] ?? "";
                        const numeric = isPureNumeric(cell);
                        return (
                          <td
                            key={cIdx}
                            dir={numeric ? "ltr" : "rtl"}
                            className="border border-[#C5D1DE] px-2.5 py-1.5 text-center whitespace-nowrap"
                          >
                            {numeric ? cell : <RichInlineText text={cell} />}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      );
  }
}

export default function SolutionPreview({
  solution,
}: {
  solution: SolutionDocument;
}) {
  return (
    <div dir="rtl" className="academic-paper rounded-xl p-4 sm:p-10 max-w-4xl mx-auto overflow-hidden">
      {solution.includeCoverPage && (
        <div className="mb-8 sm:mb-10 pb-6 sm:pb-8 border-b-2 border-dashed border-slate-300 text-center space-y-2.5 sm:space-y-3">
          <p className="font-bold text-navy-800 text-sm sm:text-base">الجمهورية الجزائرية الديمقراطية الشعبية</p>
          <p className="font-bold text-navy-700 text-xs sm:text-sm">وزارة التعليم العالي والبحث العلمي</p>
          {solution.coverMeta?.university && (
            <p className="font-bold text-navy-600 text-base sm:text-lg">{solution.coverMeta.university}</p>
          )}
          {solution.coverMeta?.specialty && (
            <p className="text-slate-700 font-medium text-sm sm:text-base">
              التخصص والمستوى: {solution.coverMeta.specialty}
            </p>
          )}
          {solution.coverMeta?.moduleName && (
            <p className="text-navy-800 font-bold text-sm sm:text-base">
              المقياس: {solution.coverMeta.moduleName}
            </p>
          )}
          <div className="my-4 sm:my-5 inline-block max-w-full px-4 sm:px-8 py-3 sm:py-4 bg-navy-50 border-2 border-navy-700 rounded-lg">
            <p className="text-lg sm:text-2xl font-extrabold text-navy-800 break-words">{solution.title}</p>
          </div>
          {solution.coverMeta?.studentName && (
            <p className="text-right font-bold text-slate-700 pt-2">
              من إعداد الطالب(ة): {solution.coverMeta.studentName}
            </p>
          )}
          <p className="text-xs text-slate-400">
            السنة الجامعية: {solution.coverMeta?.academicYear || "2026 / 2027"}
          </p>
        </div>
      )}

      <div>
        {solution.blocks.map((block) => (
          <PreviewBlock key={block.id} block={block} />
        ))}
      </div>
    </div>
  );
}
