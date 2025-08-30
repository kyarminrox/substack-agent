import { marked } from 'marked';
import sanitizeHtml, { type IOptions } from 'sanitize-html';

marked.setOptions({
  gfm: true,
  breaks: false, // Substack handles paragraphs; we’ll keep blank lines as <p>
});

const allowedTags = [
  'p','br','hr',
  'strong','em','b','i','u',
  'blockquote','code','pre',
  'ul','ol','li',
  'h2','h3','h4',
  'a'
];

const allowedAttributes: IOptions['allowedAttributes'] = {
  a: ['href','title','rel','target'],
  code: ['class'],
  pre: ['class'],
};

function linkifyBareUrls(md: string): string {
  if (!md) return md;
  // Convert obvious bare URLs/domains into angle-bracket autolinks for marked
  // Avoid trailing punctuation and simple bracket contexts
  const punct = `[.,!?:;)\]]`;
  const re = new RegExp(
    String.raw`(^|\s)(?!\()((?:https?:\/\/|www\.)\S+|[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})(\/\S*)?`,
    'g',
  );
  return md.replace(re, (_m, pre: string, core: string, path: string | undefined) => {
    let url = core + (path || '');
    // Trim common trailing punctuation
    while (url && new RegExp(punct + '$').test(url)) url = url.slice(0, -1);
    let full = url;
    if (!/^https?:\/\//i.test(full)) full = 'https://' + full;
    return `${pre}<${full}>`;
  });
}

export function mdToHtml(md: string): string {
  const prepped = linkifyBareUrls(md ?? '');
  const raw = marked.parse(prepped);
  const clean = sanitizeHtml(String(raw), {
    allowedTags,
    allowedAttributes,
    transformTags: {
      // Strip any H1 coming from the model; Substack has a separate title field
      'h1': 'p',
      'a': (tagName, attribs) => {
        const href = attribs.href || '';
        if (/^https?:\/\//i.test(href)) {
          if (!attribs.rel) attribs.rel = 'noopener noreferrer';
          if (!attribs.target) attribs.target = '_blank';
        }
        return { tagName, attribs } as any;
      },
    },
  });
  return clean;
}

/** Utility to drop a leading title line like "# Title" or "Title\n====" */
export function stripLeadingMdTitle(md: string): string {
  if (!md) return md;
  const lines = md.trimStart().split(/\r?\n/);
  if (!lines.length) return md;

  // "# Title" style
  if (/^#\s+/.test(lines[0])) {
    return lines.slice(1).join('\n').trimStart();
  }
  // Setext "Title\n====" style
  if (lines.length >= 2 && /^=+\s*$/.test(lines[1])) {
    return lines.slice(2).join('\n').trimStart();
  }
  return md;
}
