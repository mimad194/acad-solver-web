/**
 * Recursive-descent LaTeX Math -> Native Word OMML (<m:oMath>) converter.
 * Produces strict ECMA-376 Office Math Markup Language using Cambria Math,
 * ensuring editable native Microsoft Word equations that embed cleanly inside RTL Arabic documents.
 */

export function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

const SYMBOL_MAP: Record<string, { char: string; plain: boolean }> = {
  alpha: { char: "α", plain: false },
  beta: { char: "β", plain: false },
  gamma: { char: "γ", plain: false },
  delta: { char: "δ", plain: false },
  Delta: { char: "Δ", plain: true },
  epsilon: { char: "ε", plain: false },
  varepsilon: { char: "ε", plain: false },
  theta: { char: "θ", plain: false },
  lambda: { char: "λ", plain: false },
  mu: { char: "μ", plain: false },
  pi: { char: "π", plain: false },
  rho: { char: "ρ", plain: false },
  sigma: { char: "σ", plain: false },
  Sigma: { char: "Σ", plain: true },
  tau: { char: "τ", plain: false },
  phi: { char: "φ", plain: false },
  chi: { char: "χ", plain: false },
  omega: { char: "ω", plain: false },
  Omega: { char: "Ω", plain: true },
  times: { char: "×", plain: true },
  cdot: { char: "·", plain: true },
  div: { char: "÷", plain: true },
  pm: { char: "±", plain: true },
  mp: { char: "∓", plain: true },
  approx: { char: "≈", plain: true },
  neq: { char: "≠", plain: true },
  ne: { char: "≠", plain: true },
  le: { char: "≤", plain: true },
  leq: { char: "≤", plain: true },
  ge: { char: "≥", plain: true },
  geq: { char: "≥", plain: true },
  in: { char: "∈", plain: true },
  notin: { char: "∉", plain: true },
  subset: { char: "⊂", plain: true },
  subseteq: { char: "⊆", plain: true },
  infty: { char: "∞", plain: true },
  rightarrow: { char: "→", plain: true },
  to: { char: "→", plain: true },
  Rightarrow: { char: "⇒", plain: true },
  implies: { char: "⇒", plain: true },
  iff: { char: "⇔", plain: true },
  Leftrightarrow: { char: "⇔", plain: true },
  partial: { char: "∂", plain: true },
  forall: { char: "∀", plain: true },
  exists: { char: "∃", plain: true },
  ldots: { char: "…", plain: true },
  cdots: { char: "⋯", plain: true },
  quad: { char: "  ", plain: true },
  qquad: { char: "    ", plain: true },
  ",": { char: " ", plain: true },
  ";": { char: " ", plain: true },
  " ": { char: " ", plain: true },
  "%": { char: "%", plain: true },
  "{": { char: "{", plain: true },
  "}": { char: "}", plain: true },
  "|": { char: "|", plain: true },
};

const UPRIGHT_FUNCTIONS = new Set([
  "SCE", "SCR", "SCT", "SST", "SSR", "SSE", "Se", "SE", "Var", "VAR",
  "Cov", "COV", "AIC", "BIC", "ln", "log", "exp", "sin", "cos", "tan",
  "min", "max", "df", "sig", "Sig", "OLS", "MCO", "ANOVA",
]);

function mathRun(text: string, opts: { plain?: boolean; bold?: boolean; sz?: number; color?: string } = {}): string {
  // Strip any accidental Arabic characters from OMML runs to prevent glyph box corruption
  const safe = text.replace(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/g, " ");
  if (!safe) return "";
  const sz = opts.sz ?? 22;
  let mrpr = "";
  if (opts.plain && opts.bold) {
    mrpr = `<m:rPr><m:sty m:val="b"/></m:rPr>`;
  } else if (opts.plain) {
    mrpr = `<m:rPr><m:sty m:val="p"/></m:rPr>`;
  } else if (opts.bold) {
    mrpr = `<m:rPr><m:sty m:val="bi"/></m:rPr>`;
  }
  const colorXml = opts.color ? `<w:color w:val="${opts.color}"/>` : "";
  const wrpr = `<w:rPr><w:rFonts w:ascii="Cambria Math" w:hAnsi="Cambria Math" w:cs="Cambria Math"/>${colorXml}<w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/></w:rPr>`;
  const needsSpace = safe.startsWith(" ") || safe.endsWith(" ");
  const spaceAttr = needsSpace ? ` xml:space="preserve"` : "";
  return `<m:r>${mrpr}${wrpr}<m:t${spaceAttr}>${escapeXml(safe)}</m:t></m:r>`;
}

class LatexParser {
  private src: string;
  private pos: number;
  private sz: number;
  private color?: string;

  constructor(src: string, sz = 22, color?: string) {
    this.src = src.trim();
    this.pos = 0;
    this.sz = sz;
    this.color = color;
  }

  private peek(): string {
    return this.src[this.pos] ?? "";
  }

  private skipSpaces() {
    while (this.pos < this.src.length && /\s/.test(this.src[this.pos])) {
      this.pos++;
    }
  }

  private readCommand(): string {
    // Assumes current char is '\'
    this.pos++;
    if (this.pos >= this.src.length) return "";
    const ch = this.src[this.pos];
    if (!/[a-zA-Z]/.test(ch)) {
      this.pos++;
      return ch;
    }
    const start = this.pos;
    while (this.pos < this.src.length && /[a-zA-Z]/.test(this.src[this.pos])) {
      this.pos++;
    }
    return this.src.slice(start, this.pos);
  }

  private readGroup(): string {
    this.skipSpaces();
    if (this.peek() === "{") {
      this.pos++;
      const out = this.parseSequence("}");
      if (this.peek() === "}") this.pos++;
      return out;
    }
    return this.parseAtom();
  }

  private readRawBraceText(): string {
    this.skipSpaces();
    if (this.peek() !== "{") {
      const ch = this.peek();
      this.pos++;
      return ch;
    }
    this.pos++;
    let depth = 1;
    const start = this.pos;
    while (this.pos < this.src.length && depth > 0) {
      if (this.src[this.pos] === "{") depth++;
      else if (this.src[this.pos] === "}") depth--;
      this.pos++;
    }
    return this.src.slice(start, this.pos - 1);
  }

  public parseAll(): string {
    return this.parseSequence(null);
  }

  private parseSequence(stopChar: string | null, stopAtRight = false): string {
    let out = "";
    while (this.pos < this.src.length) {
      this.skipSpaces();
      if (this.pos >= this.src.length) break;
      const ch = this.peek();
      if (stopChar && ch === stopChar) break;
      if (stopAtRight && this.src.startsWith("\\right", this.pos)) break;
      out += this.parsePrimaryWithScripts();
    }
    return out;
  }

  private parsePrimaryWithScripts(): string {
    let base = this.parseAtom();
    let sub: string | null = null;
    let sup: string | null = null;

    while (true) {
      this.skipSpaces();
      const ch = this.peek();
      if (ch === "_" && sub === null) {
        this.pos++;
        sub = this.readGroup();
      } else if (ch === "^" && sup === null) {
        this.pos++;
        sup = this.readGroup();
      } else {
        break;
      }
    }

    if (sub !== null && sup !== null) {
      return `<m:sSubSup><m:e>${base}</m:e><m:sub>${sub}</m:sub><m:sup>${sup}</m:sup></m:sSubSup>`;
    }
    if (sub !== null) {
      return `<m:sSub><m:e>${base}</m:e><m:sub>${sub}</m:sub></m:sSub>`;
    }
    if (sup !== null) {
      return `<m:sSup><m:e>${base}</m:e><m:sup>${sup}</m:sup></m:sSup>`;
    }
    return base;
  }

  private parseAtom(): string {
    this.skipSpaces();
    if (this.pos >= this.src.length) return "";
    const ch = this.peek();

    // Braced group
    if (ch === "{") {
      this.pos++;
      const inner = this.parseSequence("}");
      if (this.peek() === "}") this.pos++;
      return inner;
    }

    // Backslash command
    if (ch === "\\") {
      const cmd = this.readCommand();

      if (cmd === "frac" || cmd === "dfrac" || cmd === "tfrac") {
        const num = this.readGroup();
        const den = this.readGroup();
        return `<m:f><m:fPr><m:type m:val="bar"/></m:fPr><m:num>${num}</m:num><m:den>${den}</m:den></m:f>`;
      }

      if (cmd === "sqrt") {
        this.skipSpaces();
        let deg = "";
        if (this.peek() === "[") {
          this.pos++;
          deg = this.parseSequence("]");
          if (this.peek() === "]") this.pos++;
        }
        const rad = this.readGroup();
        if (deg) {
          return `<m:rad><m:deg>${deg}</m:deg><m:e>${rad}</m:e></m:rad>`;
        }
        return `<m:rad><m:radPr><m:degHide m:val="1"/></m:radPr><m:deg/><m:e>${rad}</m:e></m:rad>`;
      }

      if (cmd === "hat" || cmd === "widehat") {
        const inner = this.readGroup();
        return `<m:acc><m:accPr><m:chr m:val="&#x0302;"/></m:accPr><m:e>${inner}</m:e></m:acc>`;
      }

      if (cmd === "bar" || cmd === "overline") {
        const inner = this.readGroup();
        return `<m:acc><m:accPr><m:chr m:val="&#x0304;"/></m:accPr><m:e>${inner}</m:e></m:acc>`;
      }

      if (cmd === "sum") {
        let sub = "";
        let sup = "";
        while (true) {
          this.skipSpaces();
          if (this.peek() === "_" && !sub) {
            this.pos++;
            sub = this.readGroup();
          } else if (this.peek() === "^" && !sup) {
            this.pos++;
            sup = this.readGroup();
          } else {
            break;
          }
        }
        const subHide = sub ? "" : `<m:subHide m:val="1"/>`;
        const supHide = sup ? "" : `<m:supHide m:val="1"/>`;
        return `<m:nary><m:naryPr><m:chr m:val="&#x2211;"/><m:limLoc m:val="undOvr"/>${subHide}${supHide}</m:naryPr><m:sub>${sub}</m:sub><m:sup>${sup}</m:sup><m:e>${mathRun("", { plain: true, sz: this.sz })}</m:e></m:nary>`;
      }

      if (cmd === "left") {
        this.skipSpaces();
        let beg = this.peek();
        if (beg === "\\") {
          const dcmd = this.readCommand();
          beg = dcmd === "{" ? "{" : dcmd === "|" ? "|" : "(";
        } else {
          this.pos++;
        }
        const inner = this.parseSequence(null, true);
        let end = ")";
        if (this.src.startsWith("\\right", this.pos)) {
          this.pos += 6;
          this.skipSpaces();
          const ech = this.peek();
          if (ech === "\\") {
            const ecmd = this.readCommand();
            end = ecmd === "}" ? "}" : ecmd === "|" ? "|" : ")";
          } else if (ech) {
            end = ech;
            this.pos++;
          }
        }
        const begAttr = beg === "." ? "" : `<m:begChr m:val="${escapeXml(beg)}"/>`;
        const endAttr = end === "." ? "" : `<m:endChr m:val="${escapeXml(end)}"/>`;
        return `<m:d><m:dPr>${begAttr}${endAttr}</m:dPr><m:e>${inner}</m:e></m:d>`;
      }

      if (cmd === "text" || cmd === "mathrm" || cmd === "operatorname") {
        const txt = this.readRawBraceText();
        return mathRun(txt, { plain: true, sz: this.sz, color: this.color });
      }

      if (cmd === "mathbf" || cmd === "boldsymbol" || cmd === "textbf") {
        const txt = this.readRawBraceText();
        return mathRun(txt, { plain: true, bold: true, sz: this.sz, color: this.color });
      }

      if (cmd in SYMBOL_MAP) {
        const sym = SYMBOL_MAP[cmd];
        const spaced = ["=", "+", "−", "×", "±", "≈", "≠", "≤", "≥", "∈", "⇒", "→", "⇔"].includes(sym.char)
          ? ` ${sym.char} `
          : sym.char;
        return mathRun(spaced, { plain: sym.plain, sz: this.sz, color: this.color });
      }

      if (UPRIGHT_FUNCTIONS.has(cmd)) {
        return mathRun(cmd, { plain: true, sz: this.sz, color: this.color });
      }

      return mathRun(cmd, { plain: true, sz: this.sz, color: this.color });
    }

    // Numbers (digits + decimals + commas inside numbers + trailing %)
    if (/[0-9]/.test(ch)) {
      const start = this.pos;
      while (this.pos < this.src.length && /[0-9.,]/.test(this.src[this.pos])) {
        // Avoid consuming a trailing comma followed by space as part of a number
        if (this.src[this.pos] === "," && !/[0-9]/.test(this.src[this.pos + 1] ?? "")) break;
        this.pos++;
      }
      if (this.src[this.pos] === "%") this.pos++;
      return mathRun(this.src.slice(start, this.pos), { plain: true, sz: this.sz, color: this.color });
    }

    // Letters / multi-letter upright identifiers
    if (/[a-zA-Z]/.test(ch)) {
      const start = this.pos;
      while (this.pos < this.src.length && /[a-zA-Z]/.test(this.src[this.pos])) {
        this.pos++;
      }
      const word = this.src.slice(start, this.pos);
      if (UPRIGHT_FUNCTIONS.has(word)) {
        return mathRun(word, { plain: true, sz: this.sz, color: this.color });
      }
      if (word.length === 1) {
        return mathRun(word, { plain: false, sz: this.sz, color: this.color });
      }
      // Split multi-letter math variable sequence (e.g. xy -> x, y) so scripts attach to last letter cleanly
      this.pos = start + 1;
      return mathRun(word[0], { plain: false, sz: this.sz, color: this.color });
    }

    // Operators & punctuation
    this.pos++;
    if (ch === "-") {
      return mathRun(" − ", { plain: true, sz: this.sz, color: this.color });
    }
    if (ch === "+" || ch === "=" || ch === "<" || ch === ">") {
      return mathRun(` ${ch} `, { plain: true, sz: this.sz, color: this.color });
    }
    if (ch === ";") {
      return mathRun(" ; ", { plain: true, sz: this.sz, color: this.color });
    }
    if (ch === ",") {
      return mathRun(", ", { plain: true, sz: this.sz, color: this.color });
    }
    return mathRun(ch, { plain: true, sz: this.sz, color: this.color });
  }
}

export function latexToOmmlInline(latex: string, sz = 22, color?: string): string {
  const parser = new LatexParser(latex, sz, color);
  return `<m:oMath>${parser.parseAll()}</m:oMath>`;
}

export function latexToOmmlDisplay(latex: string, sz = 22, color?: string): string {
  const parser = new LatexParser(latex, sz, color);
  return `<m:oMathPara><m:oMathParaPr><m:jc m:val="center"/></m:oMathParaPr><m:oMath>${parser.parseAll()}</m:oMath></m:oMathPara>`;
}
