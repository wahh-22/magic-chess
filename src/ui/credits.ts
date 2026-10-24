export interface Credit {
  asset: string;
  author: string;
  license: string;
  url?: string;
}

/** Fixed credits for what ships outside public/environment. */
export const GAME_CREDITS: { title: string; lines: Credit[] }[] = [
  { title: "Pieces", lines: [{ asset: "ARCANA piece models", author: "Wilmer Henao", license: "CC BY 4.0",
    url: "https://creativecommons.org/licenses/by/4.0/" }] },
  { title: "Key art", lines: [{ asset: "Key art rendered in-engine from the ARCANA piece models", author: "Wilmer Henao",
    license: "CC BY 4.0", url: "https://creativecommons.org/licenses/by/4.0/" }] },
  { title: "Sounds", lines: [{ asset: "Impact Sounds", author: "Kenney", license: "CC0 1.0",
    url: "https://kenney.nl/assets/impact-sounds" }] },
  { title: "Engine", lines: [{ asset: "Stockfish", author: "The Stockfish developers", license: "GPLv3",
    url: "https://stockfishchess.org" }] },
  { title: "Typefaces", lines: [
    { asset: "Cinzel", author: "The Cinzel Project Authors", license: "SIL OFL 1.1", url: "/fonts/OFL-Cinzel.txt" },
    { asset: "Cormorant Garamond", author: "The Cormorant Project Authors", license: "SIL OFL 1.1",
      url: "/fonts/OFL-CormorantGaramond.txt" },
  ] },
];

const LINK = /\[([^\]]*)\]\(([^)\s]+)\)/;
const URL_PATTERN = /https?:\/\/\S+/;

function cells(line: string): string[] {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
}

function plain(cell: string): string {
  return cell.replace(LINK, "$1").replace(/[*`]/g, "").trim();
}

function link(cell: string | undefined): string | undefined {
  if (!cell) return undefined;
  return cell.match(LINK)?.[2] ?? cell.match(URL_PATTERN)?.[0];
}

/** Asset name: link text, else the last path segment of a bare URL (".../a/rolling_hills"). */
function assetName(cell: string): string {
  const text = plain(cell);
  const url = text.match(URL_PATTERN)?.[0];
  return url ? url.replace(/\/+$/, "").split("/").at(-1) ?? text : text;
}

/**
 * Author credits from the Markdown tables of public/environment/LICENSE.md: every table whose
 * header has an author and a licence column. One entry per asset and author, in file order.
 */
export function environmentCredits(markdown: string): Credit[] {
  const credits: Credit[] = [];
  const seen = new Set<string>();
  const lines = markdown.split("\n");
  for (let index = 0; index < lines.length; index++) {
    if (!lines[index]!.trim().startsWith("|") || !/^\s*\|?\s*:?-{3,}/.test(lines[index + 1] ?? "")) continue;
    const header = cells(lines[index]!).map((cell) => cell.toLowerCase());
    const author = header.findIndex((cell) => cell.includes("author"));
    const license = header.findIndex((cell) => /licen[cs]e/.test(cell));
    const asset = [header.findIndex((cell) => /asset|model|name/.test(cell)), header.findIndex((cell) => cell.includes("source"))]
      .find((column) => column >= 0) ?? 0;
    const source = header.findIndex((cell, column) => column !== asset && /source|page|url|link/.test(cell));
    index += 2;
    for (; index < lines.length && lines[index]!.trim().startsWith("|"); index++) {
      if (author < 0 || license < 0) continue;
      const row = cells(lines[index]!);
      const credit: Credit = { asset: assetName(row[asset] ?? ""), author: plain(row[author] ?? ""),
        license: plain(row[license] ?? "") };
      const url = link(row[asset]) ?? link(row[source]);
      if (url) credit.url = url;
      const key = `${credit.asset}\n${credit.author}`;
      if (!credit.author || seen.has(key)) continue;
      seen.add(key);
      credits.push(credit);
    }
  }
  return credits;
}
