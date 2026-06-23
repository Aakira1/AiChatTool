// Minimal Markdown → HTML used when inserting AI/chat output into the rich-text
// notepad editor. Supports headings, bold/italic/code, bullet, numbered and
// "- [ ]" checklist items, and paragraphs.
export function mdToHtml(md) {
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const inline = (t) =>
    esc(t)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g, "<em>$1</em>")
      .replace(/`(.+?)`/g, "<code>$1</code>");
  const lines = String(md ?? "").replace(/\r/g, "").split("\n");
  let html = "";
  let listTag = null;
  const closeList = () => { if (listTag) { html += `</${listTag}>`; listTag = null; } };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { closeList(); continue; }
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    const check = line.match(/^[-*]\s+\[( |x|X)\]\s+(.*)$/);
    const bullet = line.match(/^[-*]\s+(.*)$/);
    const num = line.match(/^\d+\.\s+(.*)$/);
    if (h) { closeList(); const lvl = h[1].length; html += `<h${lvl}>${inline(h[2])}</h${lvl}>`; }
    else if (check) { if (listTag !== "ul") { closeList(); html += "<ul>"; listTag = "ul"; } html += `<li>${check[1] === " " ? "☐" : "☑"} ${inline(check[2])}</li>`; }
    else if (bullet) { if (listTag !== "ul") { closeList(); html += "<ul>"; listTag = "ul"; } html += `<li>${inline(bullet[1])}</li>`; }
    else if (num) { if (listTag !== "ol") { closeList(); html += "<ol>"; listTag = "ol"; } html += `<li>${inline(num[1])}</li>`; }
    else { closeList(); html += `<p>${inline(line)}</p>`; }
  }
  closeList();
  return html || "<p><br></p>";
}
