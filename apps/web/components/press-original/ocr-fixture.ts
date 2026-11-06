// Tiny synthetic Tesseract TSV for the OCR and passage tests: a two-block page with one
// speckle below the confidence floor and one low-confidence word.

const HEADER =
  "level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext";

function row(
  level: number,
  b: number,
  p: number,
  l: number,
  w: number,
  box: [number, number, number, number],
  conf: number,
  text = "",
) {
  return [level, 1, b, p, l, w, ...box, conf, text].join("\t");
}

export const TSV = [
  HEADER,
  row(1, 0, 0, 0, 0, [0, 0, 1240, 1755], -1),
  row(2, 1, 0, 0, 0, [50, 50, 300, 30], -1),
  row(5, 1, 1, 1, 1, [50, 50, 60, 30], 96.5, "Tiroler"),
  row(5, 1, 1, 1, 2, [120, 52, 100, 26], 95.1, "Tageszeitung"),
  row(5, 1, 1, 2, 1, [50, 90, 80, 20], 12, "|||"),
  row(5, 1, 1, 2, 2, [140, 90, 80, 20], 88.123, "Heimkosten"),
  row(5, 2, 1, 1, 1, [600, 50, 90, 20], 91, "Ärztekammer"),
  row(5, 2, 1, 1, 2, [700, 50, 90, 20], 91, "fordert"),
  row(5, 2, 1, 1, 3, [800, 50, 90, 20], 91, "mehr"),
  row(5, 2, 1, 2, 1, [600, 80, 90, 20], 91, "Kassenstellen"),
  row(5, 2, 1, 2, 2, [700, 80, 90, 20], 91, "für"),
  row(5, 2, 1, 2, 3, [800, 80, 90, 20], 91, "Landärzte"),
  row(5, 2, 1, 2, 4, [900, 80, 90, 20], 91, "und"),
  row(5, 2, 1, 2, 5, [1000, 80, 90, 20], 91, "Honorare"),
  row(5, 2, 1, 3, 1, [600, 110, 90, 20], 91, "Versorgung"),
  row(5, 2, 1, 3, 2, [700, 110, 90, 20], 91, "im"),
  row(5, 2, 1, 3, 3, [800, 110, 90, 20], 91, "ländlichen"),
  row(5, 2, 1, 3, 4, [900, 110, 90, 20], 91, "Raum"),
  row(5, 2, 1, 3, 5, [1000, 110, 60, 20], 45, "sichern"),
].join("\n");
