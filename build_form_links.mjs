// 無料相談フォームの自動返信メールが読む「対応表」docs/form-links.json を作る。
//
// フォームの「気になっているサービス」の選択肢（文字そのまま）→ 送る資料のURL。
// 自動返信（gas/資料の自動返信.gs）は送るたびにこのJSONを公開URLから読むので、
// 資料を作り直して push すれば、次の返信から最新の資料・説明文が届く。
//
// 材料：manifest.json（資料の一覧）／service-catalog/data/services.json（サービス名と一言説明）
// 使い方：node build_form_links.mjs   （manifest.json か services.json を直したら毎回実行）
import { readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE_URL = "https://shittoruad-gif.github.io/shittoru-service-docs/";
const SERVICES_JSON = join(HERE, "..", "service-catalog", "data", "services.json");

// フォームの選択肢 → manifest.json のキー／services.json の id。
// ★選択肢の文字を変えたら、ここも同じ文字に直す（1文字でも違うと資料が付かない）。
// docs が null のサービスは資料がまだ無い＝メールでは「面談でご案内します」とだけ書く。
const FORM_CHOICES = [
  { choice: "Instagram広告運用代行", docs: "igads", service: "insta-ad-agency" },
  { choice: "LP（ランディングページ）作成", docs: "lp", service: "lp-seisaku" },
  { choice: "HP作成", docs: null, service: null, name: "HP作成" },
  { choice: "公式LINE制作・運用サービス", docs: null, service: null, name: "公式LINE制作・運用" },
  { choice: "Threads自動投稿アプリ", docs: "threads", service: "threads-studio" },
  { choice: "サロンカルテ（予約・電子カルテ管理システム）", docs: "salonkarte", service: "booking-system" },
  { choice: "マカセル（Instagram広告セルフ運用アプリ）", docs: "makaseru", service: "makaseru" },
  { choice: "Keiro（公式LINEの流入経路計測ツール）", docs: "keiro", service: "keiro" },
  { choice: "サロンOS（集客・運営まるごとおまかせプラン）", docs: "salonos", service: "salon-os" },
  { choice: "口コミ作成アプリ制作", docs: "kuchikomi", service: "kuchikomi-app" },
];

// お客様に送るのは「① サービス紹介」と「② はじめての方向け」だけ。
// ③ご導入いただいた方向け・代理店向け・説明書は、検討中の方には送らない。
const SEND_SUFFIXES = ["-general.pdf", "-beginner.pdf"];

function lastChanged(file) {
  // 資料の日付は git の最終コミット日（JST）。未コミットならファイルの更新日。
  try {
    const out = execFileSync("git", ["log", "-1", "--format=%cI", "--", file], { cwd: HERE }).toString().trim();
    if (out) return out.slice(0, 10);
  } catch {}
  return statSync(join(HERE, file)).mtime.toISOString().slice(0, 10);
}

const manifest = JSON.parse(readFileSync(join(HERE, "manifest.json"), "utf8"));
const services = JSON.parse(readFileSync(SERVICES_JSON, "utf8")).services;
const byId = Object.fromEntries(services.map((s) => [s.id, s]));

const problems = [];
const choices = FORM_CHOICES.map((c) => {
  const svc = c.service ? byId[c.service] : null;
  if (c.service && !svc) problems.push(`services.json に id=${c.service} がありません`);
  const entry = {
    choice: c.choice,
    name: svc?.name ?? c.name,
    tagline: svc?.catalog?.tagline ?? "",
    docs: [],
  };
  if (c.docs) {
    const m = manifest[c.docs];
    if (!m) problems.push(`manifest.json に ${c.docs} がありません`);
    for (const d of m?.docs ?? []) {
      if (!SEND_SUFFIXES.some((suf) => d.file.endsWith(suf))) continue;
      const rel = join("docs", d.file);
      if (!existsSync(join(HERE, rel))) {
        problems.push(`ファイルがありません: ${rel}`);
        continue;
      }
      entry.docs.push({ label: d.label.replace(/^[①-⑩]\s*/, "").replace("（お客様向け）", ""), url: BASE_URL + d.file, updated: lastChanged(rel) });
    }
    if (entry.docs.length === 0) problems.push(`${c.choice} に送れる資料が0件です`);
  }
  return entry;
});

if (problems.length) {
  console.error("対応表を作れませんでした：\n- " + problems.join("\n- "));
  process.exit(1);
}

const out = {
  generatedAt: new Date().toISOString(),
  indexUrl: BASE_URL,
  choices,
};
writeFileSync(join(HERE, "docs", "form-links.json"), JSON.stringify(out, null, 2) + "\n");
console.log(`docs/form-links.json を作りました（${choices.length}項目・資料${choices.reduce((n, c) => n + c.docs.length, 0)}本）`);
