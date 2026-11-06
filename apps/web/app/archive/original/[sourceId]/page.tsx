import Link from "next/link";
import { getSource } from "@/components/archive/data.server";
import { loadPageText } from "@/components/press-original/ocr.server";
import { matchPassage } from "@/components/press-original/passage";
import {
  type Paraphrase,
  PressOriginalViewer,
} from "@/components/press-original/press-original-viewer";
import { originalImagePath, pressPageFor } from "@/lib/press-originals";
import { serverPrefs } from "@/lib/server-prefs";

export const dynamic = "force-dynamic";

// Source check for a press position: the original page of the press review it was paraphrased
// from, with a selectable text layer from the OCR and the passage our pipeline most likely
// drew on. Shown only here, clearly labelled, never inside the debate, the stage or the result.
export default async function PressOriginalPage({
  params,
}: {
  params: Promise<{ sourceId: string }>;
}) {
  const id = decodeURIComponent((await params).sourceId);
  const { lang, level } = await serverPrefs();
  const de = lang === "de";
  const page = pressPageFor(id);
  const available = page ? !!originalImagePath(page.pageId) : false;
  const file =
    page?.doc
      .split("/")
      .pop()
      ?.replace(/\.pdf$/i, "") ?? "";

  // The paraphrase the simulation actually uses (name-masked, in the institution's voice)
  // comes from the archive; the OCR text is only matched against it to point at a passage.
  const [text, source] = available
    ? await Promise.all([loadPageText(page?.pageId ?? -1), getSource(id)])
    : [null, null];
  const paraphrase: Paraphrase | null = source
    ? {
        institution: source.source.institution.nameDe,
        title: source.source.title,
        text: source.segments.map((g) => g.text).join(" "),
      }
    : null;
  const used =
    text && paraphrase
      ? matchPassage(
          text,
          [paraphrase.title, paraphrase.text].filter(Boolean).join(". "),
          paraphrase.institution,
        )
      : null;

  return (
    <main className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6">
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
        <PressOriginalViewer
          lang={lang}
          level={level}
          imageSrc={`/api/press/original/${page.pageId}`}
          alt={de ? "Originalseite des Pressespiegels" : "Original press review page"}
          page={text}
          used={used}
          paraphrase={paraphrase}
        />
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
