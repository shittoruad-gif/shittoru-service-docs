// 資料のPDFを「URLを開けばその場で読める」ページにする（2026-10-10 三上様「いちいちダウンロードしないといけないのが面倒」）。
//
// docs/v/<名前>.html … 各ページを画像にして縦に並べたページ（スマホのGmail等でもダウンロードにならない）
// docs/v/<名前>/p-01.jpg … ページの画像
// PDFはそのまま残す（Notionの資料ページはPDFを表示しているため）。
// PDFの中身が変わっていなければ画像は作り直さない（hash.txt で判断）。
//
// 使い方：node build_viewers.mjs   （refresh_docs.mjs publish の中で自動で呼ばれる）
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

const HERE = dirname(fileURLToPath(import.meta.url));
const DOCS = join(HERE, "docs");
const VIEW = join(DOCS, "v");
const WIDTH = 1600; // 拡大しても文字が読める幅

const manifest = JSON.parse(readFileSync(join(DOCS, "manifest.json"), "utf8"));
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function lastChanged(rel) {
  try {
    const out = execFileSync("git", ["log", "-1", "--format=%cI", "--", rel], { cwd: HERE }).toString().trim();
    if (out) return out.slice(0, 10);
  } catch {}
  return new Date().toISOString().slice(0, 10);
}

function page(service, label, base, pages, size, updated) {
  const title = `${service}｜${label.replace(/^[①-⑩]\s*/, "").replace("（お客様向け）", "")}`;
  const imgs = pages
    .map((f, i) => `<img src="${base}/${f}" width="${size.w}" height="${size.h}" alt="${esc(title)} ${i + 1}ページ目"${i < 2 ? "" : ' loading="lazy"'}>`)
    .join("\n");
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}｜株式会社しっとる</title>
<meta name="robots" content="noindex">
<style>
:root{--bg:#F4F7F7;--card:#FFFFFF;--ink:#13343B;--sub:#4C6B67;--accent:#0E8388;--line:#DCE6E6}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--bg:#0F1E22;--card:#16292E;--ink:#E6F0EF;--sub:#9DB5B2;--accent:#4FC1C5;--line:#24393E}}
:root[data-theme="dark"]{--bg:#0F1E22;--card:#16292E;--ink:#E6F0EF;--sub:#9DB5B2;--accent:#4FC1C5;--line:#24393E}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font-family:"Hiragino Sans","Noto Sans JP",sans-serif;line-height:1.7}
header,footer{max-width:1100px;margin:0 auto;padding:20px 16px 8px}
.svc{font-size:13px;color:var(--sub);margin:0}
h1{font-size:20px;margin:2px 0 4px}
.meta{font-size:12px;color:var(--sub);margin:0}
main{max-width:1100px;margin:0 auto;padding:8px 16px 8px;display:flex;flex-direction:column;gap:14px}
main img{display:block;width:100%;height:auto;border-radius:8px;border:1px solid var(--line);background:var(--card)}
footer{padding-bottom:40px;font-size:13px;color:var(--sub)}
footer a{color:var(--accent)}
footer p{margin:6px 0}
</style>
</head>
<body>
<header>
<p class="svc">${esc(service)}</p>
<h1>${esc(label.replace(/^[①-⑩]\s*/, "").replace("（お客様向け）", ""))}</h1>
<p class="meta">全${pages.length}ページ・${updated} 更新・下へスクロールしてご覧ください（指で広げると拡大できます）</p>
</header>
<main>
${imgs}
</main>
<footer>
<p>保存したい方は <a href="../${base}.pdf">PDFでダウンロード</a></p>
<p><a href="../">ほかのサービスの資料</a></p>
<p>ご不明な点は、お送りしたメールにそのままご返信ください。株式会社しっとる</p>
</footer>
</body>
</html>
`;
}

mkdirSync(VIEW, { recursive: true });
let made = 0, kept = 0;
for (const svc of Object.values(manifest)) {
  for (const d of svc.docs) {
    if (!d.file.endsWith(".pdf")) continue;
    const pdf = join(DOCS, d.file);
    if (!existsSync(pdf)) continue;
    const base = d.file.replace(/\.pdf$/, "");
    const dir = join(VIEW, base);
    const hash = createHash("sha1").update(readFileSync(pdf)).digest("hex");
    const hashFile = join(dir, "hash.txt");
    const fresh = !existsSync(hashFile) || readFileSync(hashFile, "utf8").trim() !== hash;
    if (fresh) {
      rmSync(dir, { recursive: true, force: true });
      mkdirSync(dir, { recursive: true });
      execFileSync("pdftoppm", ["-scale-to-x", String(WIDTH), "-scale-to-y", "-1", "-jpeg", "-jpegopt", "quality=78", pdf, join(dir, "p")]);
      writeFileSync(hashFile, hash + "\n");
      made++;
    } else kept++;
    const pages = readdirSync(dir).filter((f) => f.endsWith(".jpg")).sort();
    const info = execFileSync("pdfinfo", [pdf]).toString();
    const m = info.match(/Page size:\s+([\d.]+) x ([\d.]+)/);
    const size = { w: WIDTH, h: m ? Math.round((WIDTH * Number(m[2])) / Number(m[1])) : 900 };
    writeFileSync(join(VIEW, `${base}.html`), page(svc.name, d.label, base, pages, size, lastChanged(join("docs", d.file))));
  }
}
console.log(`見るページ：作り直し ${made} 本・そのまま ${kept} 本（docs/v/）`);
