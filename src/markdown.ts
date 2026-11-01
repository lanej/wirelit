import { fromMarkdown } from 'mdast-util-from-markdown';
import { toMarkdown } from 'mdast-util-to-markdown';
import { mdxToMarkdown } from 'mdast-util-mdx';

/** Comments are Markdown input, never MDX programs. Preserve code and links. */
export function markdown(input: string): string {
  const tree = fromMarkdown(input.trim());
  function escapeHtml(node: { type: string; children?: unknown[]; value?: string }) {
    if (node.type === 'html') node.type = 'text';
    for (const child of node.children ?? []) escapeHtml(child as Parameters<typeof escapeHtml>[0]);
  }
  escapeHtml(tree);
  return toMarkdown(tree, {
    extensions: [mdxToMarkdown()],
    unsafe: [
      { character: '<' },
      { atBreak: true, character: 'i', after: 'mport(?:[\\t ]|$)' },
      { atBreak: true, character: 'e', after: 'xport(?:[\\t ]|$)' },
    ],
  }).trim();
}

export const cell = (value: string) => value.replace(/\|/g, '&#124;').replace(/\r?\n/g, ' ');
export const literal = (value: string) => '`' + value.replace(/`/g, '&#96;') + '`';
/** Quoted JSX attributes use HTML entities, not JavaScript string escapes. */
export const attribute = (value: string) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export const fence = (value: string, language: string) => {
  const ticks = Math.max(3, ...Array.from(value.matchAll(/`+/g), m => m[0].length + 1));
  const delimiter = '`'.repeat(ticks);
  return `${delimiter}${language}\n${value}\n${delimiter}`;
};
