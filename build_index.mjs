// 資料一覧ページ docs/index.html を作る（2026-10-10 三上様「まずはサービスのLPに飛び、LPで概要を理解してもらい、詳細は資料で。YouTubeの動画も載せて」）。
//
// 1サービス＝1枚のカード：① 紹介ページ（LP）→ ② 動画 → ③ 資料（docs/v/ の「開けばその場で読める」ページ）。
// ご契約後の方向けの資料は、カードの下に小さく並べる。
// 材料：links.json（LP・動画）／docs/manifest.json（資料）／service-catalog/data/services.json（一言説明）
// 使い方：node build_index.mjs   （refresh_docs.mjs publish の中で自動で呼ばれる）
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const DOCS = join(HERE, "docs");
const FORM_URL = "https://forms.gle/pykh67HNXvwQ4rcdA"; // 各LP共通の無料相談フォーム
const SERVICE_ID = { igads: "insta-ad-agency", lp: "lp-seisaku", threads: "threads-studio", salonkarte: "booking-system", makaseru: "makaseru", keiro: "keiro", salonos: "salon-os", kuchikomi: "kuchikomi-app", jiko: "jiko", handsnote: "hands-note" };

const links = JSON.parse(readFileSync(join(HERE, "links.json"), "utf8"));
const manifest = JSON.parse(readFileSync(join(DOCS, "manifest.json"), "utf8"));
const services = JSON.parse(readFileSync(join(HERE, "..", "service-catalog", "data", "services.json"), "utf8")).services;
const byId = Object.fromEntries(services.map((s) => [s.id, s]));
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const plain = (label) => label.replace(/^[①-⑩]\s*/, "").replace("（お客様向け）", "");
const isAfterContract = (file) => /-(client|agency|manual)\./.test(file);
const docHref = (file) => (file.endsWith(".pdf") ? `v/${file.replace(/\.pdf$/, ".html")}` : file);

function video(v, playlist) {
  if (!v) return "";
  const list = playlist ? `<a class="sub" href="https://www.youtube.com/playlist?list=${esc(playlist)}" target="_blank" rel="noopener">ほかの動画（使い方・よくある質問）</a>` : "";
  return `<div class="video">
<a class="yt" href="https://www.youtube.com/watch?v=${esc(v.id)}" data-id="${esc(v.id)}" target="_blank" rel="noopener" aria-label="動画を再生：${esc(v.title)}">
<img src="https://i.ytimg.com/vi/${esc(v.id)}/hqdefault.jpg" alt="" loading="lazy" width="480" height="360"><span class="play" aria-hidden="true"></span></a>
<p class="vt">${esc(v.title)}</p>${list}</div>`;
}

const cards = links.order
  .filter((k) => manifest[k])
  .map((k, n) => {
    const m = manifest[k];
    const l = links.services[k] || {};
    const svc = byId[SERVICE_ID[k]];
    const tagline = svc?.catalog?.tagline || "";
    const main = m.docs.filter((d) => !isAfterContract(d.file));
    const after = m.docs.filter((d) => isAfterContract(d.file));
    const step = (i) => `<span class="num">${i}</span>`;
    let i = 1;
    const lpBlock = l.lp
      ? `<div class="step">${step(i++)}<div><p class="sh">まずは紹介ページで概要を</p><a class="btn" href="${esc(l.lp)}" target="_blank" rel="noopener">紹介ページを開く</a></div></div>`
      : "";
    const videoBlock = l.intro ? `<div class="step">${step(i++)}<div><p class="sh">動画で見る</p>${video(l.intro, l.playlist)}</div></div>` : "";
    const docBlock = `<div class="step">${step(i++)}<div><p class="sh">くわしくは資料で（開けばその場で読めます）</p><ul class="docs">${main
      .map((d) => `<li><a href="${esc(docHref(d.file))}">${esc(plain(d.label))}</a></li>`)
      .join("")}</ul></div></div>`;
    const afterBlock = after.length
      ? `<p class="after">ご契約後の方へ：${after.map((d) => `<a href="${esc(docHref(d.file))}">${esc(plain(d.label))}</a>`).join("／")}</p>`
      : "";
    return `<section class="card" id="${esc(k)}">
<p class="for">${esc(l.for || "")}</p>
<h2>${esc(m.name)}</h2>
${tagline ? `<p class="tag">${esc(tagline)}</p>` : ""}
${lpBlock}${videoBlock}${docBlock}${afterBlock}
</section>`;
  })
  .join("\n");

const nav = links.order.filter((k) => manifest[k]).map((k) => `<a href="#${esc(k)}">${esc(manifest[k].name)}</a>`).join("");
const ov = links.overview;

const html = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>しっとる サービス資料</title>
<meta name="description" content="株式会社しっとるの集客サービスの紹介ページ・動画・資料をまとめたページです。">
<style>
:root{--bg:#F4F7F7;--card:#FFFFFF;--ink:#13343B;--sub:#4C6B67;--accent:#0E8388;--accent-ink:#FFFFFF;--soft:#E6F1F1;--line:#DCE6E6}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--bg:#0F1E22;--card:#16292E;--ink:#E6F0EF;--sub:#9DB5B2;--accent:#4FC1C5;--accent-ink:#0F1E22;--soft:#1C3439;--line:#24393E}}
:root[data-theme="dark"]{--bg:#0F1E22;--card:#16292E;--ink:#E6F0EF;--sub:#9DB5B2;--accent:#4FC1C5;--accent-ink:#0F1E22;--soft:#1C3439;--line:#24393E}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font-family:"Hiragino Sans","Noto Sans JP",sans-serif;line-height:1.75;-webkit-text-size-adjust:100%}
.wrap{max-width:1080px;margin:0 auto;padding:0 16px}
header{padding:32px 0 8px}
h1{font-size:24px;margin:0 0 6px}
.lead{margin:0 0 16px;color:var(--sub)}
.flow{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 20px;padding:0;list-style:none}
.flow li{background:var(--soft);border-radius:999px;padding:4px 14px;font-size:14px}
.overview{display:grid;grid-template-columns:minmax(0,320px) 1fr;gap:16px;align-items:center;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px;margin-bottom:16px}
.overview .video{margin:0}
.overview p{margin:0}
nav.jump{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:14px;margin:8px 0 20px}
nav.jump a{color:var(--accent)}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,460px),1fr));gap:16px}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:20px 18px;min-width:0}
.for{margin:0;font-size:13px;color:var(--accent);font-weight:bold}
h2{font-size:20px;margin:2px 0 4px}
.tag{margin:0 0 12px;color:var(--sub);font-size:14px}
.step{display:grid;grid-template-columns:28px 1fr;gap:10px;padding:12px 0;border-top:1px solid var(--line)}
.step>div{min-width:0}
.num{width:26px;height:26px;border-radius:50%;background:var(--accent);color:var(--accent-ink);display:grid;place-items:center;font-size:13px;font-weight:bold}
.sh{margin:0 0 8px;font-weight:bold;font-size:15px}
.btn{display:inline-block;background:var(--accent);color:var(--accent-ink);text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:bold}
.video{max-width:360px}
.yt{position:relative;display:block;border-radius:8px;overflow:hidden;aspect-ratio:16/9;background:#000}
.yt img{width:100%;height:100%;object-fit:cover;display:block}
.yt iframe{position:absolute;inset:0;width:100%;height:100%;border:0}
.play{position:absolute;left:50%;top:50%;width:64px;height:44px;margin:-22px 0 0 -32px;border-radius:12px;background:rgba(200,0,0,.9)}
.play::after{content:"";position:absolute;left:26px;top:13px;border-style:solid;border-width:9px 0 9px 15px;border-color:transparent transparent transparent #fff}
.vt{margin:6px 0 0;font-size:14px}
.sub{font-size:13px;color:var(--accent)}
.docs{margin:0;padding-left:18px}
.docs a{color:var(--accent);font-weight:bold}
.after{margin:10px 0 0;font-size:13px;color:var(--sub)}
.after a{color:var(--sub)}
.cta{margin:28px 0;background:var(--soft);border-radius:12px;padding:20px;text-align:center}
.cta p{margin:0 0 10px}
footer{padding:8px 0 40px;font-size:13px;color:var(--sub)}
footer a{color:var(--sub)}
@media (max-width:640px){.overview{grid-template-columns:1fr}h1{font-size:21px}}
</style>
</head>
<body>
<div class="wrap">
<header>
<h1>株式会社しっとる サービス資料</h1>
<p class="lead">気になるサービスの「紹介ページ」で全体をつかんでから、動画や資料でくわしくご覧ください。資料はダウンロードせずに、その場で読めます。</p>
<ol class="flow"><li>1 紹介ページで概要</li><li>2 動画で使っている様子</li><li>3 資料でくわしく</li></ol>
</header>
${ov ? `<div class="overview">${video(ov, null)}<div><p class="sh">どれを選べばいいか迷ったら</p><p>困りごとから、合うサービスを2分でご紹介しています。</p>${ov.playlist ? `<p><a class="sub" href="https://www.youtube.com/playlist?list=${esc(ov.playlist)}" target="_blank" rel="noopener">動画の一覧を見る</a></p>` : ""}</div></div>` : ""}
<nav class="jump" aria-label="サービス">${nav}</nav>
<main class="grid">
${cards}
</main>
<div class="cta"><p>ご不明な点やお見積もりは、無料相談からお気軽にどうぞ。</p><a class="btn" href="${FORM_URL}" target="_blank" rel="noopener">無料相談を申し込む</a></div>
<footer>株式会社しっとる${links.channel ? `／<a href="${esc(links.channel)}" target="_blank" rel="noopener">YouTubeチャンネル</a>` : ""}</footer>
</div>
<script>
document.querySelectorAll('.yt').forEach(function(a){a.addEventListener('click',function(e){e.preventDefault();var f=document.createElement('iframe');f.src='https://www.youtube-nocookie.com/embed/'+a.dataset.id+'?autoplay=1&rel=0';f.allow='autoplay; encrypted-media; picture-in-picture';f.allowFullscreen=true;f.title=a.getAttribute('aria-label');a.innerHTML='';a.appendChild(f);});});
</script>
</body>
</html>
`;
writeFileSync(join(DOCS, "index.html"), html);
const missing = links.order.filter((k) => manifest[k]).flatMap((k) => manifest[k].docs.filter((d) => !existsSync(join(DOCS, docHref(d.file)))).map((d) => d.file));
if (missing.length) { console.error("見るページが無い資料：" + missing.join(" ")); process.exit(1); }
console.log("docs/index.html を作りました");
