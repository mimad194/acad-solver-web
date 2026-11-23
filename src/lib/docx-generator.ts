import JSZip from "jszip";
import type { DocumentBlock, SolutionDocument } from "@/types/order";
import { escapeXml, latexToOmmlDisplay, latexToOmmlInline } from "./latex-to-omml";
import { type DocxThemeConfig, getDocxTheme } from "./style-profiles";

function arRun(
  text: string,
  theme: DocxThemeConfig,
  opts: { szAr?: number; szLa?: number; bold?: boolean; color?: string } = {}
): string {
  if (!text) return "";
  const szAr = opts.szAr ?? theme.szBodyAr;
  const szLa = opts.szLa ?? theme.szBodyLa;
  const boldXml = opts.bold ? `<w:b/><w:bCs/>` : "";
  const colorXml = opts.color ? `<w:color w:val="${opts.color}"/>` : "";
  const spaceAttr = text.startsWith(" ") || text.endsWith(" ") ? ` xml:space="preserve"` : "";
  return `<w:r><w:rPr><w:rFonts w:ascii="${theme.laFont}" w:hAnsi="${theme.laFont}" w:cs="${theme.arFont}"/>${boldXml}${colorXml}<w:sz w:val="${szLa}"/><w:szCs w:val="${szAr}"/><w:rtl/><w:lang w:val="en-US" w:bidi="ar-DZ"/></w:rPr><w:t${spaceAttr}>${escapeXml(text)}</w:t></w:r>`;
}

function laRun(
  text: string,
  theme: DocxThemeConfig,
  opts: { sz?: number; bold?: boolean; color?: string } = {}
): string {
  if (!text) return "";
  const sz = opts.sz ?? theme.szBodyLa;
  const boldXml = opts.bold ? `<w:b/><w:bCs/>` : "";
  const colorXml = opts.color ? `<w:color w:val="${opts.color}"/>` : "";
  const safe =
    text.startsWith("-") || text.startsWith("[") || text.startsWith("(")
      ? `\u200E${text}\u200E`
      : text;
  const spaceAttr = safe.startsWith(" ") || safe.endsWith(" ") ? ` xml:space="preserve"` : "";
  return `<w:r><w:rPr><w:rFonts w:ascii="${theme.laFont}" w:hAnsi="${theme.laFont}" w:cs="${theme.laFont}"/>${boldXml}${colorXml}<w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/><w:lang w:val="en-US" w:bidi="ar-DZ"/></w:rPr><w:t${spaceAttr}>${escapeXml(safe)}</w:t></w:r>`;
}

function parseRichInline(
  text: string,
  theme: DocxThemeConfig,
  opts: { szAr?: number; szLa?: number; bold?: boolean; color?: string } = {}
): string {
  const szAr = opts.szAr ?? theme.szBodyAr;
  const szLa = opts.szLa ?? theme.szBodyLa;
  let xml = "";

  const mathParts = text.split(/(\$[^$]+\$)/g);
  for (const part of mathParts) {
    if (!part) continue;
    if (part.startsWith("$") && part.endsWith("$") && part.length >= 2) {
      const expr = part.slice(1, -1).trim();
      xml += latexToOmmlInline(expr, szLa, opts.color);
      continue;
    }

    const boldParts = part.split(/(\*\*[^*]+\*\*)/g);
    for (const bp of boldParts) {
      if (!bp) continue;
      const isBold = opts.bold || (bp.startsWith("**") && bp.endsWith("**") && bp.length >= 4);
      const clean =
        bp.startsWith("**") && bp.endsWith("**") && bp.length >= 4 ? bp.slice(2, -2) : bp;

      const subParts = clean.split(/((?:[-−]?\d[\d.,]*%?)|\([A-Za-z0-9\s-]+\))/g);
      for (const sp of subParts) {
        if (!sp) continue;
        if (/^(?:[-−]?\d[\d.,]*%?|\([A-Za-z0-9\s-]+\))$/.test(sp)) {
          xml += laRun(sp, theme, { sz: szLa, bold: isBold, color: opts.color });
        } else {
          xml += arRun(sp, theme, { szAr, szLa, bold: isBold, color: opts.color });
        }
      }
    }
  }
  return xml;
}

interface ParaOptions {
  jc?: "both" | "right" | "center" | "left";
  before?: number;
  after?: number;
  line?: number;
  bidi?: boolean;
  keepNext?: boolean;
  indentRight?: number;
  shading?: string;
  borderRight?: { sz?: number; color?: string };
  borderBottom?: { sz?: number; color?: string };
  borderBox?: { sz?: number; color?: string };
  pageBreakBefore?: boolean;
}

function makeParagraph(innerXml: string, opts: ParaOptions = {}): string {
  const jc = opts.jc ?? "both";
  const before = opts.before ?? 60;
  const after = opts.after ?? 80;
  const line = opts.line ?? 276;
  const bidi = opts.bidi ?? true;

  let ppr = "<w:pPr>";
  if (opts.keepNext) ppr += "<w:keepNext/>";
  if (opts.pageBreakBefore) ppr += "<w:pageBreakBefore/>";

  if (opts.borderBox || opts.borderRight || opts.borderBottom) {
    ppr += "<w:pBdr>";
    if (opts.borderBox) {
      const bsz = opts.borderBox.sz ?? 6;
      const bcol = opts.borderBox.color ?? "C5D3E0";
      ppr += `<w:top w:val="single" w:sz="${bsz}" w:space="6" w:color="${bcol}"/>`;
      ppr += `<w:left w:val="single" w:sz="${bsz}" w:space="6" w:color="${bcol}"/>`;
      ppr += `<w:bottom w:val="single" w:sz="${bsz}" w:space="6" w:color="${bcol}"/>`;
      ppr += `<w:right w:val="single" w:sz="${bsz}" w:space="6" w:color="${bcol}"/>`;
    }
    if (opts.borderRight) {
      ppr += `<w:right w:val="single" w:sz="${opts.borderRight.sz ?? 24}" w:space="8" w:color="${opts.borderRight.color ?? "1B365D"}"/>`;
    }
    if (opts.borderBottom) {
      ppr += `<w:bottom w:val="single" w:sz="${opts.borderBottom.sz ?? 12}" w:space="4" w:color="${opts.borderBottom.color ?? "1B365D"}"/>`;
    }
    ppr += "</w:pBdr>";
  }

  if (opts.shading) {
    ppr += `<w:shd w:val="clear" w:color="auto" w:fill="${opts.shading}"/>`;
  }
  if (bidi) ppr += "<w:bidi/>";
  ppr += `<w:spacing w:before="${before}" w:after="${after}" w:line="${line}" w:lineRule="auto"/>`;
  if (opts.indentRight) {
    ppr += `<w:ind w:right="${opts.indentRight}"/>`;
  }
  ppr += `<w:jc w:val="${jc}"/>`;
  ppr += "</w:pPr>";

  return `<w:p>${ppr}${innerXml}</w:p>`;
}

function isPureNumeric(val: string): boolean {
  return /^\s*[-−+]?\d[\d\s.,]*%?\s*$/.test(val);
}

function computeColWidths(headers: string[], rows: string[][], maxWidth = 9860): number[] {
  const numCols = headers.length;
  if (numCols === 0) return [];
  const weights = headers.map((h, colIdx) => {
    const cleanH = h.replace(/\$[^$]+\$/g, "XXXX");
    let maxLen = Math.max(cleanH.length, 3);
    for (const r of rows) {
      const cell = (r[colIdx] ?? "").replace(/\$[^$]+\$/g, "XXXX");
      maxLen = Math.max(maxLen, Math.min(cell.length, 28));
    }
    return Math.max(maxLen, 3);
  });
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const raw = weights.map((w) => Math.max(520, Math.round((w / totalWeight) * maxWidth)));
  const sum = raw.reduce((a, b) => a + b, 0);
  const scaled = raw.map((w) => Math.round((w * maxWidth) / sum));
  const diff = maxWidth - scaled.reduce((a, b) => a + b, 0);
  if (scaled.length > 0) scaled[scaled.length - 1] += diff;
  return scaled;
}

function renderTableBlock(
  block: Extract<DocumentBlock, { type: "table" }>,
  theme: DocxThemeConfig
): string {
  let out = "";
  if (block.caption) {
    out += makeParagraph(
      parseRichInline(block.caption, theme, {
        szAr: theme.szBodyAr - 2,
        szLa: theme.szBodyLa - 2,
        bold: true,
        color: theme.primaryColor,
      }),
      { jc: "center", before: 80, after: 40, keepNext: true }
    );
  }

  const colWidths = computeColWidths(block.headers, block.rows, 9860);
  const totalW = colWidths.reduce((a, b) => a + b, 0);
  const dense = block.headers.length >= 8;
  const szNum = dense ? 18 : 20;
  const szAr = dense ? Math.max(20, theme.szBodyAr - 6) : Math.max(22, theme.szBodyAr - 4);

  let tbl = `<w:tbl><w:tblPr><w:bidiVisual/><w:tblW w:w="${totalW}" w:type="dxa"/><w:jc w:val="center"/>`;
  tbl += `<w:tblBorders>`;
  tbl += `<w:top w:val="single" w:sz="8" w:space="0" w:color="${theme.accentColor}"/>`;
  tbl += `<w:left w:val="single" w:sz="8" w:space="0" w:color="${theme.accentColor}"/>`;
  tbl += `<w:bottom w:val="single" w:sz="8" w:space="0" w:color="${theme.accentColor}"/>`;
  tbl += `<w:right w:val="single" w:sz="8" w:space="0" w:color="${theme.accentColor}"/>`;
  tbl += `<w:insideH w:val="single" w:sz="4" w:space="0" w:color="${theme.borderColor}"/>`;
  tbl += `<w:insideV w:val="single" w:sz="4" w:space="0" w:color="${theme.borderColor}"/>`;
  tbl += `</w:tblBorders>`;
  tbl += `<w:tblLayout w:type="fixed"/>`;
  tbl += `<w:tblCellMar><w:top w:w="60" w:type="dxa"/><w:left w:w="50" w:type="dxa"/><w:bottom w:w="60" w:type="dxa"/><w:right w:w="50" w:type="dxa"/></w:tblCellMar>`;
  tbl += `</w:tblPr><w:tblGrid>`;
  for (const w of colWidths) {
    tbl += `<w:gridCol w:w="${w}"/>`;
  }
  tbl += `</w:tblGrid>`;

  // Header row
  tbl += `<w:tr><w:trPr><w:cantSplit/><w:tblHeader/></w:trPr>`;
  block.headers.forEach((h, i) => {
    const inner = parseRichInline(h, theme, {
      szAr,
      szLa: szNum,
      bold: true,
      color: theme.headerText,
    });
    tbl += `<w:tc><w:tcPr><w:tcW w:w="${colWidths[i]}" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="${theme.headerBg}"/><w:vAlign w:val="center"/></w:tcPr>`;
    tbl += makeParagraph(inner, { jc: "center", before: 20, after: 20, line: 240, bidi: true });
    tbl += `</w:tc>`;
  });
  tbl += `</w:tr>`;

  // Data rows
  block.rows.forEach((row, rIdx) => {
    const isTotal = Boolean(block.hasTotalRow) && rIdx === block.rows.length - 1;
    const zebra = !isTotal && rIdx % 2 === 1;
    const fill = isTotal ? theme.totalBg : zebra ? theme.zebraBg : null;
    const color = isTotal ? theme.primaryColor : "1A1A1A";

    tbl += `<w:tr><w:trPr><w:cantSplit/></w:trPr>`;
    for (let i = 0; i < block.headers.length; i++) {
      const val = (row[i] ?? "").trim();
      const shdXml = fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>` : "";
      tbl += `<w:tc><w:tcPr><w:tcW w:w="${colWidths[i]}" w:type="dxa"/>${shdXml}<w:vAlign w:val="center"/></w:tcPr>`;
      if (isPureNumeric(val)) {
        tbl += makeParagraph(laRun(val, theme, { sz: szNum, bold: isTotal, color }), {
          jc: "center",
          before: 20,
          after: 20,
          line: 240,
          bidi: false,
        });
      } else {
        tbl += makeParagraph(
          parseRichInline(val, theme, { szAr, szLa: szNum, bold: isTotal, color }),
          {
            jc: "center",
            before: 20,
            after: 20,
            line: 240,
            bidi: true,
          }
        );
      }
      tbl += `</w:tc>`;
    }
    tbl += `</w:tr>`;
  });

  tbl += `</w:tbl>`;
  return out + tbl + makeParagraph("", { before: 0, after: 40, line: 120 });
}

function renderCoverPage(doc: SolutionDocument, theme: DocxThemeConfig): string {
  const m = doc.coverMeta ?? {};
  let xml = "";
  xml += makeParagraph(
    arRun("الجمهورية الجزائرية الديمقراطية الشعبية", theme, {
      szAr: theme.szBodyAr + 4,
      bold: true,
      color: theme.primaryColor,
    }),
    { jc: "center", before: 120, after: 40 }
  );
  xml += makeParagraph(
    arRun("وزارة التعليم العالي والبحث العلمي", theme, {
      szAr: theme.szBodyAr + 2,
      bold: true,
      color: theme.primaryColor,
    }),
    { jc: "center", before: 20, after: 120 }
  );
  if (m.university) {
    xml += makeParagraph(
      arRun(m.university, theme, {
        szAr: theme.szBodyAr + 6,
        bold: true,
        color: theme.accentColor,
      }),
      { jc: "center", before: 60, after: 160 }
    );
  }
  if (m.specialty) {
    xml += makeParagraph(
      arRun(`التخصص والمستوى: ${m.specialty}`, theme, {
        szAr: theme.szBodyAr + 2,
        bold: true,
      }),
      { jc: "center", before: 40, after: 80 }
    );
  }
  if (m.moduleName) {
    xml += makeParagraph(
      arRun(`المقياس: ${m.moduleName}`, theme, {
        szAr: theme.szBodyAr + 4,
        bold: true,
        color: theme.primaryColor,
      }),
      { jc: "center", before: 40, after: 320 }
    );
  }
  xml += makeParagraph(
    arRun(doc.title, theme, {
      szAr: theme.szBodyAr + 12,
      bold: true,
      color: theme.primaryColor,
    }),
    {
      jc: "center",
      before: 200,
      after: 360,
      shading: theme.exHeadingBg,
      borderBox: { sz: 12, color: theme.primaryColor },
    }
  );
  if (m.studentName) {
    xml += makeParagraph(
      arRun(`من إعداد الطالب(ة): ${m.studentName}`, theme, {
        szAr: theme.szBodyAr + 2,
        bold: true,
      }),
      { jc: "right", before: 300, after: 120 }
    );
  }
  xml += makeParagraph(
    arRun(`السنة الجامعية: ${m.academicYear || "2026 / 2027"}`, theme, {
      szAr: theme.szBodyAr,
      color: "4A5568",
    }),
    { jc: "center", before: 400, after: 80 }
  );
  xml += `<w:p><w:r><w:br w:type="page"/></w:r></w:p>`;
  return xml;
}

function renderBlock(block: DocumentBlock, theme: DocxThemeConfig): string {
  switch (block.type) {
    case "doc_title":
      return makeParagraph(
        parseRichInline(block.text, theme, {
          szAr: theme.szBodyAr + 10,
          szLa: theme.szBodyLa + 8,
          bold: true,
          color: theme.primaryColor,
        }),
        {
          jc: "center",
          before: 0,
          after: 180,
          line: 260,
          keepNext: true,
          borderBottom: { sz: 14, color: theme.primaryColor },
        }
      );

    case "exercise_heading":
      return makeParagraph(
        parseRichInline(block.text, theme, {
          szAr: theme.szBodyAr + 6,
          szLa: theme.szBodyLa + 4,
          bold: true,
          color: theme.primaryColor,
        }),
        {
          jc: "right",
          before: 200,
          after: 110,
          line: 260,
          keepNext: true,
          shading: theme.exHeadingBg,
          borderRight: { sz: 24, color: theme.primaryColor },
        }
      );

    case "question_heading":
      return makeParagraph(
        parseRichInline(block.text, theme, {
          szAr: theme.szBodyAr + 2,
          szLa: theme.szBodyLa + 2,
          bold: true,
          color: theme.accentColor,
        }),
        {
          jc: "right",
          before: 150,
          after: 70,
          line: 260,
          keepNext: true,
          borderBottom: { sz: 4, color: theme.borderColor },
        }
      );

    case "sub_heading":
      return makeParagraph(
        parseRichInline(block.text, theme, {
          szAr: theme.szBodyAr,
          szLa: theme.szBodyLa,
          bold: true,
          color: theme.subHeadingColor,
        }),
        {
          jc: "right",
          before: 100,
          after: 50,
          line: 260,
          keepNext: true,
        }
      );

    case "paragraph":
      return makeParagraph(parseRichInline(block.text, theme), {
        jc: "both",
        before: 50,
        after: 70,
        line: 276,
      });

    case "bullet":
      return makeParagraph(
        arRun("•  ", theme, { bold: true, color: theme.accentColor }) +
          parseRichInline(block.text, theme),
        {
          jc: "both",
          before: 30,
          after: 55,
          line: 276,
          indentRight: 260,
        }
      );

    case "equation": {
      const sz = block.latex.length > 90 ? 20 : block.callout ? 23 : 22;
      const omathPara = latexToOmmlDisplay(block.latex, sz);
      return makeParagraph(omathPara, {
        jc: "center",
        before: 55,
        after: 75,
        line: 260,
        bidi: true,
        shading: block.callout ? theme.calloutBg : undefined,
        borderBox: block.callout ? { sz: 6, color: theme.borderColor } : undefined,
        borderRight: block.callout ? { sz: 20, color: theme.accentColor } : undefined,
      });
    }

    case "table":
      return renderTableBlock(block, theme);
  }
}

const CONTENT_TYPES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>
  <Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>
</Types>`;

const RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const DOC_RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>
</Relationships>`;

function buildStylesXml(theme: DocxThemeConfig): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault>
      <w:rPr>
        <w:rFonts w:ascii="${theme.laFont}" w:hAnsi="${theme.laFont}" w:cs="${theme.arFont}"/>
        <w:sz w:val="${theme.szBodyLa}"/>
        <w:szCs w:val="${theme.szBodyAr}"/>
        <w:lang w:val="en-US" w:bidi="ar-DZ"/>
      </w:rPr>
    </w:rPrDefault>
    <w:pPrDefault>
      <w:pPr>
        <w:bidi/>
        <w:spacing w:after="80" w:line="276" w:lineRule="auto"/>
      </w:pPr>
    </w:pPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:qFormat/>
  </w:style>
</w:styles>`;
}

const SETTINGS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">
  <w:zoom w:percent="100"/>
  <w:defaultTabStop w:val="708"/>
  <w:themeFontLang w:val="en-US" w:bidi="ar-DZ"/>
  <m:mathPr>
    <m:mathFont m:val="Cambria Math"/>
    <m:brkBin m:val="before"/>
    <m:brkBinSub m:val="--"/>
    <m:smallFrac m:val="0"/>
    <m:dispDef/>
    <m:lMargin m:val="0"/>
    <m:rMargin m:val="0"/>
    <m:defJc m:val="centerGroup"/>
    <m:wrapIndent m:val="1440"/>
    <m:intLim m:val="subSup"/>
    <m:naryLim m:val="undOvr"/>
  </m:mathPr>
</w:settings>`;

function buildFooterXml(theme: DocxThemeConfig): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:p>
    <w:pPr>
      <w:pBdr><w:top w:val="single" w:sz="4" w:space="4" w:color="${theme.borderColor}"/></w:pBdr>
      <w:bidi/>
      <w:jc w:val="center"/>
    </w:pPr>
    <w:r>
      <w:rPr>
        <w:rFonts w:ascii="${theme.laFont}" w:hAnsi="${theme.laFont}" w:cs="${theme.arFont}"/>
        <w:color w:val="666666"/>
        <w:sz w:val="18"/><w:szCs w:val="22"/><w:rtl/>
      </w:rPr>
      <w:t xml:space="preserve">صفحة </w:t>
    </w:r>
    <w:fldSimple w:instr=" PAGE ">
      <w:r><w:rPr><w:rFonts w:ascii="${theme.laFont}" w:hAnsi="${theme.laFont}" w:cs="${theme.laFont}"/><w:color w:val="666666"/><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr><w:t>1</w:t></w:r>
    </w:fldSimple>
    <w:r>
      <w:rPr>
        <w:rFonts w:ascii="${theme.laFont}" w:hAnsi="${theme.laFont}" w:cs="${theme.arFont}"/>
        <w:color w:val="666666"/>
        <w:sz w:val="18"/><w:szCs w:val="22"/><w:rtl/>
      </w:rPr>
      <w:t xml:space="preserve"> من </w:t>
    </w:r>
    <w:fldSimple w:instr=" NUMPAGES ">
      <w:r><w:rPr><w:rFonts w:ascii="${theme.laFont}" w:hAnsi="${theme.laFont}" w:cs="${theme.laFont}"/><w:color w:val="666666"/><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr><w:t>1</w:t></w:r>
    </w:fldSimple>
  </w:p>
</w:ftr>`;
}

export async function generateRtlDocxBuffer(solution: SolutionDocument): Promise<Uint8Array> {
  const theme = getDocxTheme(solution.docxTheme);
  let bodyContent = "";
  if (solution.includeCoverPage) {
    bodyContent += renderCoverPage(solution, theme);
  }
  for (const block of solution.blocks) {
    bodyContent += renderBlock(block, theme);
  }

  const documentXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ` +
    `xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" ` +
    `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<w:body>${bodyContent}` +
    `<w:sectPr>` +
    `<w:footerReference w:type="default" r:id="rId1"/>` +
    `<w:pgSz w:w="11906" w:h="16838"/>` +
    `<w:pgMar w:top="1020" w:right="1020" w:bottom="1020" w:left="1020" w:header="567" w:footer="567" w:gutter="0"/>` +
    `<w:bidi/>` +
    `</w:sectPr></w:body></w:document>`;

  const zip = new JSZip();
  zip.file("[Content_Types].xml", CONTENT_TYPES_XML);
  zip.file("_rels/.rels", RELS_XML);
  zip.file("word/_rels/document.xml.rels", DOC_RELS_XML);
  zip.file("word/document.xml", documentXml);
  zip.file("word/styles.xml", buildStylesXml(theme));
  zip.file("word/settings.xml", SETTINGS_XML);
  zip.file("word/footer1.xml", buildFooterXml(theme));

  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}
