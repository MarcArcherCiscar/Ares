/**
 * Converts a useful subset of Markdown (what Claude tends to emit) into the
 * HTML subset Telegram accepts: <b> <i> <s> <code> <pre> <a>.
 *
 * Telegram's HTML parser is strict and 400s on malformed markup, so the
 * strategy is: pull out code spans/blocks first (their contents are only
 * HTML-escaped, never markdown-parsed), escape everything else, then apply a
 * small set of inline transforms that can't produce invalid nesting.
 */
const SENTINEL_OPEN = "";
const SENTINEL_CLOSE = "";

export function toTelegramHtml(markdown: string): string {
  const placeholders: string[] = [];
  // Sentinels use private-use code points so a placeholder can't collide with
  // real text (e.g. a bare number) and isn't altered by HTML escaping.
  const stash = (html: string): string => {
    placeholders.push(html);
    return `${SENTINEL_OPEN}${placeholders.length - 1}${SENTINEL_CLOSE}`;
  };

  let text = markdown;

  // Fenced code blocks ```lang\n...\n```
  text = text.replace(/```(\w+)?\n?([\s\S]*?)```/g, (_m, lang: string | undefined, code: string) => {
    const cls = lang ? ` class="language-${escapeHtml(lang)}"` : "";
    return stash(`<pre><code${cls}>${escapeHtml(code.replace(/\n$/, ""))}</code></pre>`);
  });

  // Inline code `...`
  text = text.replace(/`([^`\n]+)`/g, (_m, code: string) => stash(`<code>${escapeHtml(code)}</code>`));

  // Escape the remaining plain text.
  text = escapeHtml(text);

  // Links [text](url)
  text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_m, label: string, url: string) => {
    return `<a href="${url.replace(/"/g, "%22")}">${label}</a>`;
  });

  // Bold **text** or __text__
  text = text.replace(/\*\*([^*\n]+)\*\*/g, "<b>$1</b>");
  text = text.replace(/__([^_\n]+)__/g, "<b>$1</b>");

  // Strikethrough ~~text~~
  text = text.replace(/~~([^~\n]+)~~/g, "<s>$1</s>");

  // Headings (#, ##, …) → bold lines
  text = text.replace(/^#{1,6}\s+(.+)$/gm, "<b>$1</b>");

  // Bullets "- " / "* " → "• "
  text = text.replace(/^[ \t]*[-*]\s+/gm, "• ");

  // Restore stashed code.
  const restore = new RegExp(`${SENTINEL_OPEN}(\\d+)${SENTINEL_CLOSE}`, "g");
  text = text.replace(restore, (_m, i: string) => placeholders[Number(i)]);

  return text;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
