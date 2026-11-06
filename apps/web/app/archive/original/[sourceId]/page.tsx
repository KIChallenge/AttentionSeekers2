import Link from "next/link";
import { originalImagePath, pressPageFor } from "@/lib/press-originals";
import { serverPrefs } from "@/lib/server-prefs";

export const dynamic = "force-dynamic";

// Source check for a press position: the original page of the press review it was paraphrased
// from. Shown only here, clearly labelled, never inside the debate, the stage or the result.
export default async function PressOriginalPage({
  params,
}: {
  params: Promise<{ sourceId: string }>;
}) {
  const id = decodeURIComponent((await params).sourceId);
  const { lang } = await serverPrefs();
  const de = lang === "de";
  const page = pressPageFor(id);
  const available = page ? !!originalImagePath(page.pageId) : false;
  const file =
    page?.doc
      .split("/")
      .pop()
      ?.replace(/\.pdf$/i, "") ?? "";
  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      <Link
        href={`/archive/sources/${encodeURIComponent(id)}`}
        className="mb-3 inline-block text-sm text-muted-foreground hover:text-foreground"
      >
        ← {de ? "Zur Quelle" : "Back to source"}
      </Link>
      <h1 className="text-2xl font-semibold">{de ? "Original prüfen" : "Check the original"}</h1>
      {page ? (
        <p className="mt-1 text-sm text-muted-foreground">
          {[page.outlet, page.date, file, `${de ? "Seite" : "page"} ${page.pageNo}`]
            .filter(Boolean)
            .join(" · ")}
        </p>
      ) : null}
      <div className="mt-4 rounded-2xl border border-warning/40 bg-warning/10 p-4 text-sm">
        {de
          ? "Originalseite aus dem DVSV-Pressespiegel (SV-Box). Sie kann Namen und Aussagen realer Personen enthalten und dient nur der Prüfung der Quelle. Die Simulation verwendet ausschließlich die personenbereinigte Paraphrase in der Stimme der Institution."
          : "Original page from the DVSV press review (SV-Box). It may contain names and statements of real people and is shown only to check the source. The simulation uses only the person-free paraphrase in the institution's voice."}
      </div>
      {page && available ? (
        <a
          href={`/api/press/original/${page.pageId}`}
          target="_blank"
          rel="noreferrer"
          className="mt-4 block overflow-hidden rounded-2xl border bg-white"
          title={de ? "In voller Auflösung öffnen" : "Open in full resolution"}
        >
          {/* biome-ignore lint/performance/noImgElement: local, unoptimised scan served by our own route */}
          <img
            src={`/api/press/original/${page.pageId}`}
            alt={de ? "Originalseite des Pressespiegels" : "Original press review page"}
            className="h-auto w-full"
          />
        </a>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">
          {de
            ? "Die Originalseite ist auf diesem Rechner nicht verfügbar. Sie liegt im Pressespiegel auf der SV-Box unter der angegebenen Datei und Seite."
            : "The original page is not available on this machine. It is in the press review on the SV-Box under the file and page above."}
        </p>
      )}
    </main>
  );
}
