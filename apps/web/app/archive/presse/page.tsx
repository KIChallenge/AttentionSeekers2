import { AGENT_CATALOG, catalogAgent } from "@sv/contracts";
import { ArchiveNav } from "@/components/archive/archive-nav";
import { getSourcesByIds } from "@/components/archive/data.server";
import { PressBrowser, type PressItem } from "@/components/press-browser/press-browser";
import { Page, PageHead } from "@/components/shell/page";
import { allPressPages, originalImageSize } from "@/lib/press-originals";
import { serverPrefs } from "@/lib/server-prefs";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;

// Source ids end in the institution code the position was filed under; used only when the
// archive (database or fixture) does not know the source.
const CODE_ALIAS: Record<string, string> = { aek: "ak" };

function one(v: string | string[] | undefined): string | null {
  const x = Array.isArray(v) ? v[0] : v;
  return x ? x : null;
}

// Pressespiegel: every press review page a press position was paraphrased from, newest first,
// as one continuous scroll of originals with the OCR text layer. Local only, like the viewer.
export default async function PressReviewPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { lang, level } = await serverPrefs();
  const de = lang === "de";
  const groups = allPressPages();
  const sources = await getSourcesByIds(groups.flatMap((g) => g.sourceIds)).catch(() => new Map());

  const items: PressItem[] = groups
    .map(({ page, sourceIds }) => {
      const size = originalImageSize(page.pageId);
      const positions = sourceIds.map((id) => {
        const s = sources.get(id);
        if (s) {
          const agent = AGENT_CATALOG.find((a) => a.role === s.institution.role);
          return {
            sourceId: id,
            key: agent?.id ?? s.institution.code.toLowerCase(),
            name: s.institution.nameDe,
            outlet: s.outlet as string | null,
          };
        }
        const code = id.split("-").pop() ?? "";
        const agent = catalogAgent(CODE_ALIAS[code] ?? code);
        return {
          sourceId: id,
          key: agent?.id ?? code,
          name: agent?.nameDe ?? code.toUpperCase(),
          outlet: null,
        };
      });
      return {
        pageId: page.pageId,
        pageNo: page.pageNo,
        file:
          page.doc
            .split("/")
            .pop()
            ?.replace(/\.pdf$/i, "") ?? "",
        outlet: page.outlet ?? positions.find((p) => p.outlet)?.outlet ?? null,
        date: page.date ?? "",
        width: size?.width ?? 1240,
        height: size?.height ?? 1755,
        available: !!size,
        positions: positions.map(({ outlet: _o, ...p }) => p),
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date) || a.pageNo - b.pageNo);

  return (
    <Page>
      <PageHead title={de ? "Pressespiegel" : "Press review"} />
      <ArchiveNav lang={lang} active="press" />
      <PressBrowser
        lang={lang}
        level={level}
        items={items}
        initial={{ year: one(sp.year), outlet: one(sp.outlet), inst: one(sp.inst) }}
      />
    </Page>
  );
}
