import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
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
  const children = [];

  children.push(
    new Paragraph({
      heading: HeadingLevel.TITLE,
      children: [new TextRun({ text: title, bold: true })],
    }),
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

  const doc = new Document({ sections: [{ children }] });
  return Packer.toBuffer(doc);
}

/** Build a PDF buffer from markdown content. */
export function buildPdfBuffer({ title = "Document", content }) {
  return new Promise((resolve, reject) => {
    try {
      const blocks = parseMarkdownBlocks(content);
      const doc = new PDFDocument({ size: "A4", margin: 56 });
      const chunks = [];
      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const pink = `#${PINK}`;
      const headingSizes = { 1: 20, 2: 16, 3: 14, 4: 12, 5: 11, 6: 11 };

      doc.font("Helvetica-Bold").fontSize(24).fillColor("#1a1f36").text(title);
      doc.moveDown(0.6);

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

/** Turn a title into a safe file name stem. */
export function safeDocName(title) {
  return (
    String(title || "document")
      .replace(/[^\w.-]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 80) || "document"
  );
}
