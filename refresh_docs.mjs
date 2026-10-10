// サービス資料を「作り直す → 検査する → (承諾後に) 公開する」ための道具。
// 夜の定期タスク（shittoru-docs-nightly-refresh）がこれを使う。人が手で使ってもよい。
//
//   node refresh_docs.mjs detect            … 資料が最後に公開されてから、各サービスに変更があったかを一覧（読むだけ）
//   node refresh_docs.mjs build [接頭辞...]   … 作り直して staging/ に置く（docs/ は触らない＝公開されない）
//   node refresh_docs.mjs check             … staging/ の資料を検査（公開してよいかの機械判定）
//   node refresh_docs.mjs publish           … staging/ を docs/ へ移し、対応表を作り直して commit・push
//                                              ★三上様の「公開して」の承諾があったときだけ使う
//
// 公開先：https://shittoruad-gif.github.io/shittoru-service-docs/（push すると数分で反映）
// URL（ファイル名）は変えない。だから以前お送りしたリンクも、無料相談の自動返信も、Notionも最新版を開く。
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const CODE = join(HERE, "..");
const DECK = join(CODE, "ts-deck");
const OUT = join(DECK, "サービス別資料");
const STAGING = join(HERE, "staging");
const DOCS = join(HERE, "docs");

// 接頭辞 → ①生成物の名前 ②変更を見るリポジトリ（お客様に見える変更があり得る場所）
// keep: ["general"] などを書くと、その種類は自動で作り直さない（公開中の版を別の作り方で作ったときに使う）。
// 作り直した版が公開中より薄くなったときは check が止めるので、上書きの事故は起きない。
const SERVICES = {
  igads: { deck: "Instagram広告 運用代行", watch: ["shittoru-ig-ads-lp", "IG広告構築"] },
  threads: { deck: "Threads Studio", watch: ["threads_studio", "threads-studio-lp"] },
  makaseru: { deck: "マカセル", watch: ["makaseru", "makaseru-lp"] },
  keiro: { deck: "Keiro", watch: ["keiro"] },
  lp: { deck: "LP制作サービス", watch: ["lp-seisaku-lp", "shittoru-lp-samples"] },
  salonkarte: { deck: "サロンカルテ（予約・店舗運営）", watch: ["salonkarte-lp", "reservation-app"] },
  salonos: { deck: "サロンOS", watch: ["salon-os"] },
  kuchikomi: { deck: "口コミ作成アプリ 制作代行", watch: ["kuchikomi-app-lp", "kuchikomi-lab"] },
  handsnote: { deck: "月刊 HANDS NOTE", watch: ["kyozai-lp", "hands-note-portal"] },
  jiko: { deck: "交通事故", watch: ["traffic-accident-consulting", "jiko-consul-lp"], builder: "build_jiko.cjs" },
};
// 全サービスの資料の材料（ここが変われば全部が古くなり得る）
const SHARED_SOURCES = [join(CODE, "service-catalog/data/services.json"), join(DECK, "deck_data.cjs"), join(DECK, "service_supplement.cjs"), join(DECK, "build_service_decks.cjs"), join(DECK, "build_jiko.cjs")];

const KINDS = { general: "1_一般向け", beginner: "3_はじめての方向け", client: "5_導入者向け" };

// 公開資料に入ってはいけない言葉（2026-09-02 の漏えい事故の再発防止）
const FORBIDDEN = ["原価", "粗利", "歩合", "営業トーク", "想定問答", "スタッフ研修", "社内用",
  // 2026-10-08 三上様：Moveactはしっとるの店でも代表（大木さん）の店でもない＝店名を出さず「導入店舗」と書く
  "Moveact", "自社店舗", "自社実績", "自社実測", "自社運営", "直営",
  // 代理店を悪く書かない
  "代理店は高額", "代理店に頼む", "代理店いらず", "代理店に頼まず"];
// 広告費の具体額は書かない（CLAUDE.md）。料金表の「広告費 月5万円以下」などは三上様の判断待ちのため、まず週の額だけを止める
const AD_SPEND = /週\s?[0-9,]+円/;
// 各資料に入っていなければならない項目。はじめての方向けは「お金のこと」など言い換えているので、どれか1つが入っていればよい
// （HANDS NOTE は料金を出さない例外）
const REQUIRED = {
  料金: /料金|お金のこと|\d{1,3}(,\d{3})+円/,
  流れ: /流れ|はじめるまで|はじめ方|始め方|ステップ|手順|スタート|やること/,
  画面: /画面/,
  よくあるご質問: /よくあるご質問/,
};

// LibreOffice の場所。/Applications に無い（Homebrew のフォルダにだけある）ことがあるので順に探す
function findSoffice() {
  const cands = [process.env.SOFFICE_BIN, "/Applications/LibreOffice.app/Contents/MacOS/soffice"];
  const cask = "/opt/homebrew/Caskroom/libreoffice";
  if (existsSync(cask)) for (const v of readdirSync(cask).sort().reverse()) cands.push(join(cask, v, "LibreOffice.app/Contents/MacOS/soffice"));
  const found = cands.find((c) => c && existsSync(c));
  if (!found) throw new Error("LibreOffice が見つかりません（SOFFICE_BIN で場所を指定してください）");
  return found;
}

const sh = (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: "utf8", ...opts });
// git の最終コミット日。git 管理外（service-catalog など）はファイルの更新日で代える
const gitDate = (cwd, path) => {
  try {
    const d = sh("git", ["log", "-1", "--format=%cI", "--", path], { cwd, stdio: ["ignore", "pipe", "ignore"] }).trim();
    if (d) return d;
  } catch {}
  try { return statSync(path.startsWith("/") ? path : join(cwd, path)).mtime.toISOString(); } catch { return null; }
};
const pdfText = (f) => sh("pdftotext", ["-layout", f, "-"]);
const pdfPages = (f) => Number((sh("pdfinfo", [f]).match(/Pages:\s+(\d+)/) || [])[1] || 0);
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F2FF}]/u;

function detect() {
  const report = [];
  for (const [prefix, s] of Object.entries(SERVICES)) {
    const published = gitDate(HERE, `docs/${prefix}-general.pdf`);
    const changes = [];
    for (const repo of s.watch) {
      const dir = join(CODE, repo);
      if (!existsSync(join(dir, ".git"))) continue;
      try {
        const log = sh("git", ["log", `--since=${published}`, "--no-merges", "--format=%cs %s"], { cwd: dir }).trim();
        if (log) changes.push(...log.split("\n").map((l) => `${repo}: ${l}`));
      } catch {}
    }
    for (const src of SHARED_SOURCES) {
      const d = gitDate(dirname(src), src);
      if (d && published && d > published) changes.push(`材料: ${src.replace(CODE + "/", "")} (${d.slice(0, 10)})`);
    }
    report.push({ prefix, published: published?.slice(0, 10) ?? "未公開", changes: changes.length, sample: changes.slice(0, 15) });
  }
  console.log(JSON.stringify(report, null, 2));
}

function build(prefixes) {
  const targets = prefixes.length ? prefixes : Object.keys(SERVICES);
  for (const p of targets) if (!SERVICES[p]) throw new Error(`知らない接頭辞: ${p}`);
  rmSync(STAGING, { recursive: true, force: true });
  mkdirSync(STAGING, { recursive: true });
  const needCommon = targets.some((p) => !SERVICES[p].builder);
  if (needCommon) sh("node", ["build_service_decks.cjs"], { cwd: DECK, stdio: "inherit" });
  if (targets.includes("jiko")) sh("node", ["build_jiko.cjs"], { cwd: DECK, stdio: "inherit" });
  const soffice = findSoffice();
  const made = [];
  for (const p of targets) {
    const s = SERVICES[p];
    for (const [kind, suffix] of Object.entries(KINDS)) {
      if (s.keep?.includes(kind)) continue;
      const pptx = join(OUT, `${s.deck}_${suffix}.pptx`);
      if (!existsSync(pptx)) { console.warn(`生成物がありません: ${pptx}`); continue; }
      // LibreOffice 26.8 は macOS の日本語の文字を自分で見つけられない（四角い記号に化ける）ので、置き場所を fonts.conf で教える
      sh(soffice, ["--headless", "--convert-to", "pdf", "--outdir", STAGING, pptx], {
        stdio: "ignore",
        env: { ...process.env, FONTCONFIG_FILE: join(HERE, "fonts.conf") },
      });
      const pdf = join(STAGING, `${s.deck}_${suffix}.pdf`);
      const dest = join(STAGING, `${p}-${kind}.pdf`);
      copyFileSync(pdf, dest);
      rmSync(pdf);
      made.push(`${p}-${kind}.pdf`);
    }
  }
  console.log(`staging/ に ${made.length} 本を作りました：\n` + made.join("\n"));
}

function check() {
  if (!existsSync(STAGING)) { console.error("staging/ がありません。先に build を実行してください"); process.exit(1); }
  const files = readdirSync(STAGING).filter((f) => f.endsWith(".pdf"));
  if (!files.length) { console.error("staging/ に資料が1本もありません（作り直しが途中で失敗しています）"); process.exit(1); }
  const results = [];
  for (const f of files) {
    const p = join(STAGING, f);
    const text = pdfText(p);
    const pages = pdfPages(p);
    const live = join(DOCS, f);
    // 2026-10-09 三上様「最初にことばをずらずら並べるのは変」→ 先頭の「この資料に出てくることば」ページをやめ、各ページの下に入れた。
    // その分は薄くなって当然なので、公開中の版からそのページを除いた枚数と比べる
    // 途中にはさむ「ここまでに出てきたことば」の1枚も、ことばが減れば無くなって当然なので、両方から除いて比べる
    const glossaryPages = (t) => (t.match(/この資料に出てくることば|ここまでに出てきたことば/g) || []).length;
    const liveGlossary = existsSync(live) ? glossaryPages(pdfText(live)) - glossaryPages(text) : 0;
    const livePages = existsSync(live) ? pdfPages(live) - Math.max(0, liveGlossary) : 0;
    const issues = [];
    const forbidden = FORBIDDEN.filter((w) => text.includes(w));
    if (forbidden.length) issues.push(`社内の言葉が入っている: ${forbidden.join("・")}`);
    if (EMOJI.test(text)) issues.push("絵文字が入っている");
    if (AD_SPEND.test(text)) issues.push(`広告費の具体額が入っている: ${text.match(AD_SPEND)[0]}`);
    const fonts = sh("pdffonts", [p]);
    if (!/Hiragino|Noto|Gothic|Mincho/i.test(fonts)) issues.push("日本語の文字が埋め込まれていない（文字化けの恐れ）");
    const missing = Object.entries(REQUIRED)
      .filter(([name]) => !(name === "料金" && f.startsWith("handsnote")))
      .filter(([, re]) => !re.test(text))
      .map(([name]) => name);
    if (missing.length) issues.push(`必要な項目が無い: ${missing.join("・")}`);
    if (livePages && pages < livePages) issues.push(`公開中より薄い（${livePages}→${pages}ページ）`);
    if (/\d{1,3}(,\d{3})+円/.test(text) && f.startsWith("handsnote")) issues.push("HANDS NOTEに金額が出ている");
    results.push({ file: f, pages, livePages, ok: issues.length === 0, issues });
  }
  const bad = results.filter((r) => !r.ok);
  console.log(JSON.stringify({ total: results.length, ng: bad.length, results }, null, 2));
  writeFileSync(join(STAGING, "check.json"), JSON.stringify(results, null, 2));
  if (bad.length) process.exit(2);
}

function publish() {
  const checked = join(STAGING, "check.json");
  if (!existsSync(checked)) { console.error("検査（check）を通っていません"); process.exit(1); }
  const results = JSON.parse(readFileSync(checked, "utf8"));
  if (results.some((r) => !r.ok)) { console.error("検査で止まった資料があるので公開しません"); process.exit(2); }
  for (const r of results) copyFileSync(join(STAGING, r.file), join(DOCS, r.file));
  // 開けばその場で読めるページ（docs/v/）→ 資料一覧 → 自動返信の対応表 の順に作り直す
  sh("node", ["build_viewers.mjs"], { cwd: HERE, stdio: "inherit" });
  sh("node", ["build_index.mjs"], { cwd: HERE, stdio: "inherit" });
  sh("node", ["build_form_links.mjs"], { cwd: HERE, stdio: "inherit" });
  sh("git", ["add", "docs"], { cwd: HERE });
  const names = results.map((r) => r.file).join(" ");
  sh("git", ["commit", "-m", `資料の更新（夜の作り直し・三上様承諾済み）: ${names}`], { cwd: HERE, stdio: "inherit" });
  sh("git", ["push"], { cwd: HERE, stdio: "inherit" });
  rmSync(STAGING, { recursive: true, force: true });
  console.log(`${results.length} 本を公開しました。数分で https://shittoruad-gif.github.io/shittoru-service-docs/ に反映されます`);
}

const [cmd, ...rest] = process.argv.slice(2);
if (cmd === "detect") detect();
else if (cmd === "build") build(rest);
else if (cmd === "check") check();
else if (cmd === "publish") publish();
else console.log("使い方: node refresh_docs.mjs detect | build [接頭辞...] | check | publish");
