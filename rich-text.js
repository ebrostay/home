// Safe rendering of a small Markdown subset for property descriptions.
// Source text is stored as plain text (the admin types it, optionally with the
// editor's formatting toolbar) and rendered to a whitelisted set of tags here —
// the input is always HTML-escaped first, so stored text can never inject markup.
// Shared by the property page (render) and previews/SEO/search (strip).
(function (global) {
  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  // Inline emphasis on already-escaped text: bold first, then italic. Only '*'
  // and '**' are markers (never '_'), so underscores in the text are left alone.
  // Written without look-behind for older-Safari compatibility.
  function inlineFormat(text) {
    return text
      .replace(/\*\*(\S(?:[\s\S]*?\S)?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(\S(?:[\s\S]*?\S)?)\*/g, "<em>$1</em>");
  }

  function isBulletLine(line) {
    const trimmed = line.trim();
    return /^[-*]\s+/.test(trimmed) && trimmed.length > 2;
  }

  // Render one block (text between blank lines) to HTML, grouping consecutive
  // bullet lines into a list and the rest into a paragraph — so "Header:\n- a\n- b"
  // becomes a paragraph followed by a list.
  function renderBlock(block) {
    const out = [];
    let para = [];
    let list = [];
    const flushPara = () => {
      if (para.length) out.push(`<p>${para.map((line) => inlineFormat(escapeHtml(line))).join("<br>")}</p>`);
      para = [];
    };
    const flushList = () => {
      if (list.length) out.push(`<ul>${list.map((line) => `<li>${inlineFormat(escapeHtml(line))}</li>`).join("")}</ul>`);
      list = [];
    };
    block.split("\n").forEach((line) => {
      if (isBulletLine(line)) { flushPara(); list.push(line.trim().replace(/^[-*]\s+/, "")); }
      else { flushList(); para.push(line); }
    });
    flushPara();
    flushList();
    return out.join("");
  }

  // Render the Markdown subset to HTML: paragraphs (blank line), line breaks
  // (single newline), bullet lists ("- " / "* "), bold (**) and italic (*).
  function renderRichText(source) {
    const text = String(source ?? "").replace(/\r\n?/g, "\n").trim();
    if (!text) return "";
    return text.split(/\n{2,}/).map(renderBlock).join("");
  }

  // Flatten the same Markdown subset to one line of plain text, for meta
  // descriptions, card snippets, search indexing and prefilled emails.
  function stripRichText(source) {
    return String(source ?? "")
      .replace(/\r\n?/g, "\n")
      .replace(/\*\*(\S(?:[\s\S]*?\S)?)\*\*/g, "$1")
      .replace(/\*(\S(?:[\s\S]*?\S)?)\*/g, "$1")
      .replace(/^\s*[-*]\s+/gm, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  const api = { renderRichText, stripRichText, escapeHtml };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else global.RichText = api;
})(typeof window !== "undefined" ? window : globalThis);
