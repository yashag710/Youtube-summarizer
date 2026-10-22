import type { ReactNode } from "react";

/**
 * Renders the Markdown subset the LLM produces: headings, paragraphs, (nested) lists,
 * tables, **bold**, *italic* and `code`.
 * ponytail: hand-rolled to avoid a dependency; switch to react-markdown if links or images are needed.
 */

const INLINE = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*)/g;

function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(INLINE)) {
    const token = match[0];
    const at = match.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    if (token.startsWith("**")) out.push(<strong key={at} className="font-semibold">{token.slice(2, -2)}</strong>);
    else if (token.startsWith("`")) out.push(<code key={at} className="rounded bg-paper px-1 py-0.5 font-mono text-[0.85em]">{token.slice(1, -1)}</code>);
    else out.push(<em key={at}>{token.slice(1, -1)}</em>);
    last = at + token.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

type Block =
  | { kind: "p"; text: string }
  | { kind: "h"; text: string }
  | { kind: "list"; ordered: boolean; items: { text: string; nested: boolean }[] }
  | { kind: "table"; rows: string[][] };

function parse(text: string): Block[] {
  const blocks: Block[] = [];
  const last = () => blocks[blocks.length - 1];

  for (const raw of text.split("\n")) {
    const line = raw.trim();
    const nested = /^\s{2,}/.test(raw);
    let m: RegExpMatchArray | null;

    if (!line || /^([-*_])\1{2,}$/.test(line)) {
      blocks.push({ kind: "p", text: "" }); // paragraph break
    } else if ((m = line.match(/^#{1,6}\s+(.*)$/))) {
      blocks.push({ kind: "h", text: m[1] });
    } else if (/^\|.*\|$/.test(line)) {
      if (/^\|[\s:|-]+\|$/.test(line)) continue; // header separator row
      const cells = line.slice(1, -1).split("|").map((c) => c.trim());
      const prev = last();
      if (prev?.kind === "table") prev.rows.push(cells);
      else blocks.push({ kind: "table", rows: [cells] });
    } else if ((m = line.match(/^(?:([-*•])|\d+[.)])\s+(.*)$/))) {
      const ordered = !m[1];
      const prev = last();
      if (prev?.kind === "list" && (prev.ordered === ordered || nested)) prev.items.push({ text: m[2], nested });
      else blocks.push({ kind: "list", ordered, items: [{ text: m[2], nested }] });
    } else {
      const prev = last();
      if (prev?.kind === "p" && prev.text) prev.text += ` ${line}`;
      else blocks.push({ kind: "p", text: line });
    }
  }
  return blocks.filter((b) => b.kind !== "p" || b.text);
}

export function Markdown({ text, className = "" }: { text: string; className?: string }) {
  return (
    <div className={`space-y-3 leading-[1.75] ${className}`}>
      {parse(text).map((block, i) => {
        switch (block.kind) {
          case "h":
            return <h3 key={i} className="pt-2 font-sans text-[1.02rem] font-bold text-ink">{inline(block.text)}</h3>;
          case "p":
            return <p key={i}>{inline(block.text)}</p>;
          case "list": {
            const List = block.ordered ? "ol" : "ul";
            return (
              <List key={i} className={`space-y-1.5 pl-5 ${block.ordered ? "list-decimal" : "list-disc"}`}>
                {block.items.map((item, j) => (
                  <li key={j} className={item.nested ? "ml-5 list-[circle]" : ""}>{inline(item.text)}</li>
                ))}
              </List>
            );
          }
          case "table": {
            const [head, ...body] = block.rows;
            return (
              <div key={i} className="overflow-x-auto">
                <table className="w-full border-collapse font-sans text-sm">
                  <thead>
                    <tr>{head.map((cell, j) => <th key={j} className="border-b-2 border-line-strong px-3 py-2 text-left font-semibold">{inline(cell)}</th>)}</tr>
                  </thead>
                  <tbody>
                    {body.map((row, r) => (
                      <tr key={r}>{row.map((cell, j) => <td key={j} className="border-b border-line px-3 py-2 align-top">{inline(cell)}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          }
        }
      })}
    </div>
  );
}
