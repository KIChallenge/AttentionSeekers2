import { Fragment } from "react";

const MASK = "[...]";
const START = String.fromCharCode(1);
const STOP = String.fromCharCode(2);

/**
 * Renders archive text: "[...]" (a sentence masked for CON-1/CON-2) becomes a visible
 * marker, \u0001..\u0002 from ts_headline becomes a highlight.
 */
export function MaskedText({ text, maskedLabel }: { text: string; maskedLabel: string }) {
  const parts = text.split(MASK);
  return (
    <>
      {parts.map((part, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: stable split of immutable text
        <Fragment key={i}>
          {highlight(part)}
          {i < parts.length - 1 ? (
            <span
              className="mx-0.5 inline-flex items-center rounded-[4px] border border-dashed px-1 align-baseline font-mono text-[10px] text-muted-foreground"
              title={maskedLabel}
              data-masked
            >
              ▒ {maskedLabel}
            </span>
          ) : null}
        </Fragment>
      ))}
    </>
  );
}

function highlight(s: string) {
  if (!s.includes(START)) return s;
  const out: React.ReactNode[] = [];
  const re = new RegExp(`${START}([^${STOP}]*)${STOP}`, "g");
  let last = 0;
  let m: RegExpExecArray | null = re.exec(s);
  while (m) {
    out.push(s.slice(last, m.index));
    out.push(
      <mark key={m.index} className="rounded-[3px] bg-warning/20 px-0.5 text-foreground">
        {m[1]}
      </mark>,
    );
    last = m.index + m[0].length;
    m = re.exec(s);
  }
  out.push(s.slice(last));
  return out;
}
