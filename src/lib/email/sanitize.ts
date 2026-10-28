import sanitizeHtml from "sanitize-html";
/** Email HTML is authored by admins; candidate values are escaped separately. */
export function sanitizeEmailHtml(html: string) {
  return sanitizeHtml(html, {
    allowedTags: [
      "div",
      "p",
      "br",
      "span",
      "strong",
      "b",
      "em",
      "i",
      "u",
      "h1",
      "h2",
      "h3",
      "h4",
      "ul",
      "ol",
      "li",
      "blockquote",
      "a",
      "table",
      "thead",
      "tbody",
      "tr",
      "td",
      "th",
      "hr",
    ],
    allowedAttributes: {
      a: ["href", "title"],
      "*": ["style"],
      td: ["colspan", "rowspan"],
      th: ["colspan", "rowspan"],
    },
    allowedSchemes: ["https", "http", "mailto"],
    allowProtocolRelative: false,
    allowedStyles: {
      "*": {
        color: [/^#[\da-f]{3,8}$/i, /^(?:black|white|red|blue|green|gray)$/],
        "background-color": [/^#[\da-f]{3,8}$/i],
        "font-family": [/^[\w\s,'-]+$/],
        "font-size": [/^\d+(?:px|em|rem|%)$/],
        "line-height": [/^[\d.]+(?:px|em|%)?$/],
        "font-weight": [/^(?:bold|normal|[1-9]00)$/],
        "text-align": [/^(?:left|right|center)$/],
        padding: [/^[\d\s.]+(?:px|em|%)$/],
        border: [/^[\d\w\s#.-]+$/],
      },
    },
  });
}
