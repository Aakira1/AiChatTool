import {
  AlignmentType,
  Document,
  Footer,
  Header,
  HeadingLevel,
  PageBreak,
  PageNumber,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import PDFDocument from "pdfkit";
import PptxGenJS from "pptxgenjs";

const PINK = "E4007C";
const MAX_BLOCKS = 2000;

/**
 * Parse a subset of markdown into an ordered list of block objects:
 *  { type: 'heading', level, text }
 *  { type: 'paragraph', text }
 *  { type: 'list', ordered, items: [text] }
 *  { type: 'table', columns: [..], rows: [[..]] }
 */
export function parseMarkdownBlocks(content) {
  const lines = String(content ?? "").replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  let i = 0;

  const splitRow = (line) =>
    line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());

  while (i < lines.length && blocks.length < MAX_BLOCKS) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i += 1;
      continue;
    }

    // Heading
    const heading = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      blocks.push({ type: "heading", level: heading[1].length, text: heading[2].trim() });
      i += 1;
      continue;
    }

    // Table (header + |---| divider)
    const divider = lines[i + 1];
    if (
      trimmed.includes("|") &&
      divider &&
      /^\s*\|?[\s:|-]+\|?\s*$/.test(divider) &&
      divider.includes("-")
    ) {
      const columns = splitRow(trimmed);
      const rows = [];
      i += 2;
      while (i < lines.length && lines[i].includes("|") && lines[i].trim()) {
        rows.push(splitRow(lines[i]));
        i += 1;
      }
      blocks.push({ type: "table", columns, rows });
      continue;
    }

    // List (bulleted or numbered) — consume consecutive items
    const listItem = trimmed.match(/^([-*+]|\d+[.)])\s+(.*)$/);
    if (listItem) {
      const ordered = /\d/.test(listItem[1]);
      const items = [];
      while (i < lines.length) {
        const m = lines[i].trim().match(/^([-*+]|\d+[.)])\s+(.*)$/);
        if (!m) break;
        items.push(m[2].trim());
        i += 1;
      }
      blocks.push({ type: "list", ordered, items });
      continue;
    }

    // Paragraph — gather until a blank line or a structural line
    const paraLines = [trimmed];
    i += 1;
    while (i < lines.length && lines[i].trim()) {
      const next = lines[i].trim();
      if (/^(#{1,6})\s+/.test(next) || /^([-*+]|\d+[.)])\s+/.test(next) || next.includes("|")) {
        break;
      }
      paraLines.push(next);
      i += 1;
    }
    blocks.push({ type: "paragraph", text: paraLines.join(" ") });
  }

  return blocks;
}

// Split text into inline segments marking bold (**x** / __x__) and italic (*x* / _x_).
function inlineSegments(text) {
  const segments = [];
  const re = /(\*\*|__)(.+?)\1|(\*|_)(.+?)\3|`([^`]+)`/g;
  let last = 0;
  let match;
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) segments.push({ text: text.slice(last, match.index) });
    if (match[2] != null) segments.push({ text: match[2], bold: true });
    else if (match[4] != null) segments.push({ text: match[4], italic: true });
    else if (match[5] != null) segments.push({ text: match[5], code: true });
    last = re.lastIndex;
  }
  if (last < text.length) segments.push({ text: text.slice(last) });
  return segments.length ? segments : [{ text }];
}

function stripInline(text) {
  return inlineSegments(text)
    .map((s) => s.text)
    .join("");
}

const HEADING_LEVELS = {
  1: HeadingLevel.HEADING_1,
  2: HeadingLevel.HEADING_2,
  3: HeadingLevel.HEADING_3,
  4: HeadingLevel.HEADING_4,
  5: HeadingLevel.HEADING_5,
  6: HeadingLevel.HEADING_6,
};

/** Build a .docx buffer from markdown content. */
export async function buildDocxBuffer({ title = "Document", content }) {
  const blocks = parseMarkdownBlocks(content);
  const generatedOn = new Date().toLocaleDateString("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const children = [];

  // Cover page: spacer, title, accent rule, date — then a page break.
  children.push(
    new Paragraph({ text: "", spacing: { before: 2800 } }),
    new Paragraph({
      alignment: AlignmentType.LEFT,
      children: [new TextRun({ text: title, bold: true, size: 56, color: "1A1F36" })],
    }),
    new Paragraph({
      border: { bottom: { color: PINK, size: 18, space: 6, style: "single" } },
      spacing: { after: 200 },
      children: [],
    }),
    new Paragraph({
      children: [new TextRun({ text: generatedOn, color: "6B7280", size: 22 })],
    }),
    new Paragraph({ children: [new PageBreak()] }),
  );

  for (const block of blocks) {
    if (block.type === "heading") {
      children.push(
        new Paragraph({
          heading: HEADING_LEVELS[block.level] ?? HeadingLevel.HEADING_6,
          children: inlineSegments(block.text).map(
            (s) => new TextRun({ text: s.text, bold: s.bold, italics: s.italic }),
          ),
        }),
      );
    } else if (block.type === "paragraph") {
      children.push(
        new Paragraph({
          spacing: { after: 120 },
          children: inlineSegments(block.text).map(
            (s) => new TextRun({ text: s.text, bold: s.bold, italics: s.italic }),
          ),
        }),
      );
    } else if (block.type === "list") {
      block.items.forEach((item) => {
        children.push(
          new Paragraph({
            bullet: block.ordered ? undefined : { level: 0 },
            numbering: undefined,
            children: [
              new TextRun({
                text: block.ordered ? `• ${stripInline(item)}` : stripInline(item),
              }),
            ],
          }),
        );
      });
    } else if (block.type === "table") {
      const headerCells = block.columns.map(
        (col) =>
          new TableCell({
            shading: { fill: PINK },
            children: [
              new Paragraph({
                children: [new TextRun({ text: stripInline(col), bold: true, color: "FFFFFF" })],
              }),
            ],
          }),
      );
      const bodyRows = block.rows.map(
        (row) =>
          new TableRow({
            children: block.columns.map(
              (_, c) =>
                new TableCell({
                  children: [new Paragraph(stripInline(row[c] ?? ""))],
                }),
            ),
          }),
      );
      children.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [new TableRow({ children: headerCells }), ...bodyRows],
        }),
      );
      children.push(new Paragraph({ text: "" }));
    }
  }

  const header = new Header({
    children: [
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        children: [new TextRun({ text: title, color: "9AA3B2", size: 16 })],
      }),
    ],
  });

  const footer = new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({ text: "Page ", color: "9AA3B2", size: 16 }),
          new TextRun({ children: [PageNumber.CURRENT], color: "9AA3B2", size: 16 }),
          new TextRun({ text: " of ", color: "9AA3B2", size: 16 }),
          new TextRun({ children: [PageNumber.TOTAL_PAGES], color: "9AA3B2", size: 16 }),
        ],
      }),
    ],
  });

  const doc = new Document({
    sections: [{ headers: { default: header }, footers: { default: footer }, children }],
  });
  return Packer.toBuffer(doc);
}

/** Build a PDF buffer from markdown content. */
export function buildPdfBuffer({ title = "Document", content }) {
  return new Promise((resolve, reject) => {
    try {
      const blocks = parseMarkdownBlocks(content);
      const doc = new PDFDocument({ size: "A4", margin: 56, bufferPages: true });
      const chunks = [];
      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const pink = `#${PINK}`;
      const headingSizes = { 1: 20, 2: 16, 3: 14, 4: 12, 5: 11, 6: 11 };
      const generatedOn = new Date().toLocaleDateString("en-AU", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });
      const left = doc.page.margins.left;
      const right = doc.page.width - doc.page.margins.right;

      // Cover page.
      doc.rect(0, 0, doc.page.width, 10).fill(pink);
      doc.fillColor("#1a1f36").font("Helvetica-Bold").fontSize(34).text(title, left, 260);
      doc
        .moveTo(left, doc.y + 8)
        .lineTo(left + 120, doc.y + 8)
        .lineWidth(3)
        .strokeColor(pink)
        .stroke();
      doc.moveDown(0.8);
      doc.font("Helvetica").fontSize(12).fillColor("#6b7280").text(generatedOn, left);

      // Body starts on a fresh page.
      doc.addPage();

      for (const block of blocks) {
        if (block.type === "heading") {
          doc
            .moveDown(0.3)
            .font("Helvetica-Bold")
            .fontSize(headingSizes[block.level] ?? 11)
            .fillColor("#1a1f36")
            .text(stripInline(block.text));
          doc.moveDown(0.2);
        } else if (block.type === "paragraph") {
          doc.font("Helvetica").fontSize(11).fillColor("#1f2330").text(stripInline(block.text), {
            align: "left",
          });
          doc.moveDown(0.4);
        } else if (block.type === "list") {
          doc.font("Helvetica").fontSize(11).fillColor("#1f2330");
          block.items.forEach((item, idx) => {
            const marker = block.ordered ? `${idx + 1}. ` : "• ";
            doc.text(`${marker}${stripInline(item)}`, { indent: 12 });
          });
          doc.moveDown(0.4);
        } else if (block.type === "table") {
          renderPdfTable(doc, block, pink);
          doc.moveDown(0.4);
        }
      }

      // Footers: page X of N on every page except the cover (drawn after layout).
      const range = doc.bufferedPageRange();
      const footerY = doc.page.height - doc.page.margins.bottom + 18;
      for (let p = range.start; p < range.start + range.count; p += 1) {
        if (p === range.start) continue; // skip cover
        doc.switchToPage(p);
        doc.font("Helvetica").fontSize(8).fillColor("#9aa3b2");
        doc.text(title, left, footerY, { width: (right - left) / 2, lineBreak: false });
        doc.text(`Page ${p} of ${range.count - 1}`, left, footerY, {
          width: right - left,
          align: "right",
          lineBreak: false,
        });
      }

      doc.flushPages();
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

function renderPdfTable(doc, block, pink) {
  const startX = doc.page.margins.left;
  const usableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const colCount = block.columns.length || 1;
  const colWidth = usableWidth / colCount;
  const rowHeight = 20;

  const drawRow = (cells, { header = false } = {}) => {
    if (doc.y + rowHeight > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
    }
    const y = doc.y;
    if (header) {
      doc.rect(startX, y, usableWidth, rowHeight).fill(pink);
    }
    doc.font(header ? "Helvetica-Bold" : "Helvetica").fontSize(9.5);
    cells.forEach((cell, c) => {
      doc
        .fillColor(header ? "#ffffff" : "#1f2330")
        .text(stripInline(String(cell ?? "")), startX + c * colWidth + 4, y + 6, {
          width: colWidth - 8,
          height: rowHeight,
          ellipsis: true,
          lineBreak: false,
        });
    });
    // cell borders
    doc.strokeColor("#e2e2e8").lineWidth(0.5);
    for (let c = 0; c <= colCount; c += 1) {
      doc.moveTo(startX + c * colWidth, y).lineTo(startX + c * colWidth, y + rowHeight).stroke();
    }
    doc.moveTo(startX, y + rowHeight).lineTo(startX + usableWidth, y + rowHeight).stroke();
    doc.y = y + rowHeight;
  };

  drawRow(block.columns, { header: true });
  block.rows.forEach((row) => drawRow(row));
}

/**
 * Build a PowerPoint (.pptx) buffer from markdown content. A title slide, then
 * one slide per top-level (#/##) heading whose body becomes bullet points; tables
 * are rendered as slide tables. Content before the first heading starts a slide.
 */
export async function buildPptxBuffer({ title = "Presentation", content }) {
  const blocks = parseMarkdownBlocks(content);
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: "WIDE", width: 13.333, height: 7.5 });
  pptx.layout = "WIDE";

  // Title slide
  const cover = pptx.addSlide();
  cover.background = { color: "1A1F36" };
  cover.addText(title, {
    x: 0.6,
    y: 2.6,
    w: 12,
    h: 1.6,
    fontSize: 40,
    bold: true,
    color: "FFFFFF",
  });
  cover.addShape(pptx.ShapeType.rect, { x: 0.6, y: 4.3, w: 3, h: 0.08, fill: { color: PINK } });

  let slide = null;
  let bullets = [];
  const flushBullets = () => {
    if (slide && bullets.length) {
      slide.addText(
        bullets.map((b) => ({ text: b.text, options: { bullet: true, indentLevel: b.level } })),
        { x: 0.7, y: 1.5, w: 12, h: 5.3, fontSize: 18, color: "1F2330", valign: "top" },
      );
    }
    bullets = [];
  };
  const newSlide = (heading) => {
    flushBullets();
    slide = pptx.addSlide();
    slide.addText(heading || title, {
      x: 0.7,
      y: 0.4,
      w: 12,
      h: 0.9,
      fontSize: 28,
      bold: true,
      color: "2D1B69",
    });
  };

  for (const block of blocks) {
    if (block.type === "heading" && block.level <= 2) {
      newSlide(stripInline(block.text));
    } else if (block.type === "heading") {
      if (!slide) newSlide(title);
      bullets.push({ text: stripInline(block.text), level: 0 });
    } else if (block.type === "paragraph") {
      if (!slide) newSlide(title);
      bullets.push({ text: stripInline(block.text), level: 0 });
    } else if (block.type === "list") {
      if (!slide) newSlide(title);
      block.items.forEach((item) => bullets.push({ text: stripInline(item), level: 1 }));
    } else if (block.type === "table") {
      if (!slide) newSlide(title);
      flushBullets();
      const headerRow = block.columns.map((c) => ({
        text: stripInline(c),
        options: { bold: true, color: "FFFFFF", fill: { color: PINK } },
      }));
      const bodyRows = block.rows.map((row) =>
        block.columns.map((_, c) => ({ text: stripInline(row[c] ?? "") })),
      );
      slide.addTable([headerRow, ...bodyRows], {
        x: 0.7,
        y: 1.5,
        w: 12,
        fontSize: 12,
        border: { type: "solid", color: "E2E2E8", pt: 0.5 },
      });
    }
  }
  flushBullets();

  const data = await pptx.write({ outputType: "nodebuffer" });
  return Buffer.isBuffer(data) ? data : Buffer.from(data);
}

// ---- Fillable forms ------------------------------------------------------

function formFieldType(label) {
  return /comment|note|address|detail|descrip|message|summary|feedback/i.test(label)
    ? "multiline"
    : "text";
}

/**
 * Extract form fields from markdown/free text. Recognises:
 *  - `# Heading` / `## Heading`        → a section divider
 *  - `- [ ] Option` / `[ ] Option`     → a checkbox
 *  - `Label: ____` or `Label ______`   → a (multi)line text field
 *  - `Label:` (colon, nothing after)   → a (multi)line text field
 * Also accepts an explicit ```form JSON block: {title?, fields:[{label,type}]}.
 */
export function parseFormFields(content) {
  const text = String(content ?? "");

  const jsonBlock = text.match(/```form\s*\n([\s\S]*?)```/i);
  if (jsonBlock) {
    try {
      const parsed = JSON.parse(jsonBlock[1].trim());
      if (Array.isArray(parsed?.fields) && parsed.fields.length) {
        return parsed.fields
          .slice(0, 200)
          .map((f) => ({
            label: String(f.label ?? "Field").slice(0, 120),
            type: ["text", "multiline", "checkbox", "section"].includes(f.type)
              ? f.type
              : "text",
          }));
      }
    } catch {
      /* fall through to heuristic parsing */
    }
  }

  const fields = [];
  for (const raw of text.replace(/\r\n/g, "\n").split("\n")) {
    const line = raw.trim();
    if (!line || fields.length >= 200) continue;

    const heading = line.match(/^#{1,6}\s+(.*)$/);
    if (heading) {
      fields.push({ label: stripInline(heading[1]).slice(0, 120), type: "section" });
      continue;
    }

    const checkbox = line.match(/^(?:[-*]\s*)?\[\s?\]\s*(.+)$/);
    if (checkbox) {
      fields.push({ label: stripInline(checkbox[1]).slice(0, 120), type: "checkbox" });
      continue;
    }

    const underscored = line.match(/^(.{1,60}?)[:\s-]*_{3,}\s*$/);
    if (underscored && /[a-z]/i.test(underscored[1])) {
      const label = stripInline(underscored[1]).replace(/[:\-\s]+$/, "");
      fields.push({ label: label.slice(0, 120), type: formFieldType(label) });
      continue;
    }

    const colon = line.match(/^([A-Za-z][^:]{0,58}):\s*$/);
    if (colon) {
      const label = stripInline(colon[1]);
      fields.push({ label: label.slice(0, 120), type: formFieldType(label) });
    }
  }
  return fields;
}

/** Build a fillable AcroForm PDF from field definitions (or parsed content). */
export function buildFormPdfBuffer({ title = "Form", fields }) {
  return new Promise((resolve, reject) => {
    try {
      const list = (fields?.length ? fields : [{ label: "Field 1", type: "text" }]).slice(0, 200);
      const doc = new PDFDocument({ size: "A4", margin: 56 });
      const chunks = [];
      doc.on("data", (c) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);
      doc.initForm();

      const left = doc.page.margins.left;
      const right = doc.page.width - doc.page.margins.right;
      const width = right - left;
      const bottom = doc.page.height - doc.page.margins.bottom;
      const pink = `#${PINK}`;

      doc.rect(0, 0, doc.page.width, 10).fill(pink);
      doc.fillColor("#1a1f36").font("Helvetica-Bold").fontSize(22).text(title, left, 40);
      doc.moveDown(1);

      const ensureSpace = (needed) => {
        if (doc.y + needed > bottom) doc.addPage();
      };

      list.forEach((field, index) => {
        const name = `f${index}_${(field.label || "field").replace(/[^\w]+/g, "_").slice(0, 30)}`;

        if (field.type === "section") {
          ensureSpace(40);
          doc.moveDown(0.5);
          doc
            .font("Helvetica-Bold")
            .fontSize(13)
            .fillColor("#2d1b69")
            .text(field.label, left, doc.y);
          doc
            .moveTo(left, doc.y + 3)
            .lineTo(right, doc.y + 3)
            .lineWidth(0.8)
            .strokeColor("#e2e2e8")
            .stroke();
          doc.moveDown(0.6);
          return;
        }

        if (field.type === "checkbox") {
          ensureSpace(26);
          const y = doc.y;
          doc.formCheckbox(name, left, y, 13, 13, { borderColor: "888888", borderWidth: 1 });
          doc
            .font("Helvetica")
            .fontSize(11)
            .fillColor("#1f2330")
            .text(field.label, left + 22, y + 1, { width: width - 22 });
          doc.y = Math.max(doc.y, y + 13) + 10;
          return;
        }

        const fieldHeight = field.type === "multiline" ? 54 : 20;
        ensureSpace(fieldHeight + 26);
        doc
          .font("Helvetica-Bold")
          .fontSize(10)
          .fillColor("#1f2330")
          .text(field.label, left, doc.y);
        const y = doc.y + 2;
        doc.formText(name, left, y, width, fieldHeight, {
          borderColor: "888888",
          borderWidth: 1,
          multiline: field.type === "multiline",
          align: "left",
          fontSize: 11,
        });
        doc.y = y + fieldHeight + 14;
      });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

/** Turn a title into a safe file name stem. */
export function safeDocName(title) {
  return (
    String(title || "document")
      .replace(/[^\w.-]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 80) || "document"
  );
}
