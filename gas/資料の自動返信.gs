/**
 * 無料相談フォーム「【無料相談】集客・店舗運営サービス｜株式会社しっとる」の回答に、
 * 「気になっているサービス」の資料リンクをメールで自動返信する（2026-10-07 三上様のご依頼）。
 *
 * ■ いつも最新の資料が届く理由
 *   送るたびに、公開サイトの対応表（form-links.json）を読みにいく。
 *   資料を作り直して公開すれば、次の返信から新しい資料・説明文が届く。リンク先のURLも変わらないので、
 *   以前お送りしたメールのリンクも最新版を開く。
 *
 * ■ 送る相手
 *   「ご連絡先」の欄にメールアドレスが書かれた方だけ（LINEのURL・電話番号の方には送らない）。
 *
 * ■ 最初は試運転（TEST_MODE）
 *   スクリプトのプロパティ TEST_MODE が "false" 以外のあいだは、お客様には送らず、
 *   同じ文面を ADMIN_EMAIL（無ければこのスクリプトの持ち主）へだけ送る。中身を確かめてから false にする。
 *
 * ■ 設置
 *   フォームの編集画面 → その他（︙）→ スクリプト エディタ → このファイルを貼る → setup() を1回実行（Googleの許可画面が出る）。
 *   すでにある「IG広告LPフォーム LINE通知」とは別のスクリプトとして動く（そちらは触らない）。
 */

var FORM_LINKS_URL = 'https://shittoruad-gif.github.io/shittoru-service-docs/form-links.json';
var INDEX_URL = 'https://shittoruad-gif.github.io/shittoru-service-docs/';
var SENDER_NAME = '株式会社しっとる';

// 設問は題名の「書き出し」で探す（題名の後ろに補足が付いても拾えるように）
var Q_NAME = 'お名前';
var Q_SHOP = '店舗名・屋号';
var Q_SERVICES = '気になっているサービス';
var Q_CONTACT = 'ご連絡先';

function setup() {
  var form = FormApp.getActiveForm();
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'onFormSubmitSendDocs') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('onFormSubmitSendDocs').forForm(form).onFormSubmit().create();
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('TEST_MODE') === null) props.setProperty('TEST_MODE', 'true');
  Logger.log('設置しました。TEST_MODE=' + props.getProperty('TEST_MODE') + '（true のあいだはお客様に送りません）');
}

function onFormSubmitSendDocs(e) {
  var response = e.response;
  var id = response.getId();
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('sent_' + id)) return; // 同じ回答に二度送らない

  var answers = readAnswers_(response);
  var email = extractEmail_(answers[Q_CONTACT]);
  if (!email) {
    Logger.log('メールアドレスが無いので送りません（回答 ' + id + '）');
    return;
  }

  var mail = buildMail_(answers, loadFormLinks_());
  var testMode = props.getProperty('TEST_MODE') !== 'false';
  var to = testMode ? adminEmail_() : email;
  var subject = (testMode ? '【試運転・お客様には未送信／宛先 ' + email + '】' : '') + mail.subject;

  GmailApp.sendEmail(to, subject, mail.text, { htmlBody: mail.html, name: SENDER_NAME });
  props.setProperty('sent_' + id, new Date().toISOString() + (testMode ? ' test' : ' sent'));
}

/** 設問の題名（書き出し）→ 回答。チェックボックスは配列、それ以外は文字列 */
function readAnswers_(response) {
  var keys = [Q_NAME, Q_SHOP, Q_SERVICES, Q_CONTACT];
  var out = {};
  response.getItemResponses().forEach(function (ir) {
    var title = ir.getItem().getTitle();
    keys.forEach(function (k) {
      // 「お名前」は「お名前のフリガナ」と書き出しが同じなので、完全一致を優先する
      if (out[k] !== undefined) return;
      if (k === Q_NAME ? title === k : title.indexOf(k) === 0) out[k] = ir.getResponse();
    });
  });
  return out;
}

function extractEmail_(contact) {
  var m = String(contact || '').match(/[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/);
  return m ? m[0] : null;
}

/** 対応表を公開サイトから読む。読めなければ null（そのときは資料一覧のページだけを案内する） */
function loadFormLinks_() {
  try {
    var res = UrlFetchApp.fetch(FORM_LINKS_URL + '?t=' + Date.now(), { muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) return null;
    return JSON.parse(res.getContentText());
  } catch (err) {
    Logger.log('対応表を読めませんでした: ' + err);
    return null;
  }
}

function buildMail_(answers, links) {
  var name = String(answers[Q_NAME] || '').trim();
  var shop = String(answers[Q_SHOP] || '').trim();
  var picked = answers[Q_SERVICES] || [];
  if (!Array.isArray(picked)) picked = [picked];

  var byChoice = {};
  ((links && links.choices) || []).forEach(function (c) { byChoice[c.choice] = c; });
  var indexUrl = (links && links.indexUrl) || INDEX_URL;

  var blocks = []; // { name, tagline, docs: [{label,url}] }
  var noDocs = [];
  picked.forEach(function (p) {
    var c = byChoice[p];
    if (c && c.docs && c.docs.length) blocks.push(c);
    else if (c) noDocs.push(c.name);
    // 「まだ決まっていない」「その他」は個別の資料なし（下の資料一覧で案内）
  });

  var greetingName = (shop ? shop + ' ' : '') + (name ? name + ' 様' : 'ご担当者 様');
  var subject = '【株式会社しっとる】無料相談のお申し込みありがとうございます（資料のご案内）';

  var t = [];
  t.push(greetingName, '');
  t.push('株式会社しっとるです。無料相談のお申し込みをいただき、ありがとうございます。');
  t.push('Zoom面談の日時は、ご希望をもとにあらためてご連絡いたします。', '');
  if (blocks.length) {
    t.push('面談の前に、気になっているとお答えいただいたサービスの資料をお送りします。');
    t.push('お時間のあるときにご覧ください。', '');
    blocks.forEach(function (b) {
      t.push('■ ' + b.name);
      if (b.tagline) t.push(b.tagline);
      b.docs.forEach(function (d) { t.push('・' + d.label + '：' + d.url); });
      t.push('');
    });
  }
  if (noDocs.length) {
    t.push('■ ' + noDocs.join('・'));
    t.push('こちらは面談のときに、お店の状況に合わせて詳しくご案内します。', '');
  }
  t.push(blocks.length ? 'ほかのサービスの資料も、こちらの一覧からご覧いただけます。' : 'しっとるのサービスの資料は、こちらの一覧からご覧いただけます。');
  t.push(indexUrl, '');
  t.push('資料のリンクは、いつ開いても最新の内容が表示されます。');
  t.push('ご不明な点は、このメールにそのままご返信ください。', '');
  t.push('株式会社しっとる');
  var text = t.join('\n');

  var h = [];
  h.push('<div style="font-family:sans-serif;font-size:15px;line-height:1.8;color:#222">');
  h.push('<p>' + esc_(greetingName) + '</p>');
  h.push('<p>株式会社しっとるです。無料相談のお申し込みをいただき、ありがとうございます。<br>Zoom面談の日時は、ご希望をもとにあらためてご連絡いたします。</p>');
  if (blocks.length) {
    h.push('<p>面談の前に、気になっているとお答えいただいたサービスの資料をお送りします。お時間のあるときにご覧ください。</p>');
    blocks.forEach(function (b) {
      h.push('<div style="border:1px solid #ddd;border-radius:8px;padding:12px 16px;margin:12px 0">');
      h.push('<div style="font-weight:bold;font-size:16px">' + esc_(b.name) + '</div>');
      if (b.tagline) h.push('<div style="color:#555;font-size:14px">' + esc_(b.tagline) + '</div>');
      b.docs.forEach(function (d) {
        h.push('<div style="margin-top:6px"><a href="' + esc_(d.url) + '">' + esc_(d.label) + '</a></div>');
      });
      h.push('</div>');
    });
  }
  if (noDocs.length) {
    h.push('<p><b>' + esc_(noDocs.join('・')) + '</b>は、面談のときにお店の状況に合わせて詳しくご案内します。</p>');
  }
  h.push('<p>' + (blocks.length ? 'ほかのサービスの資料も、' : 'しっとるのサービスの資料は、') + '<a href="' + esc_(indexUrl) + '">こちらの一覧</a>からご覧いただけます。<br>資料のリンクは、いつ開いても最新の内容が表示されます。</p>');
  h.push('<p>ご不明な点は、このメールにそのままご返信ください。</p>');
  h.push('<p>株式会社しっとる</p></div>');

  return { subject: subject, text: text, html: h.join('') };
}

function adminEmail_() {
  return PropertiesService.getScriptProperties().getProperty('ADMIN_EMAIL') || Session.getEffectiveUser().getEmail();
}

function esc_(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** 試運転用：いちばん新しい回答で、文面を ADMIN_EMAIL へ送ってみる（お客様には送らない） */
function testWithLatestResponse() {
  var responses = FormApp.getActiveForm().getResponses();
  if (!responses.length) { Logger.log('回答がまだありません'); return; }
  var r = responses[responses.length - 1];
  var answers = readAnswers_(r);
  var mail = buildMail_(answers, loadFormLinks_());
  GmailApp.sendEmail(adminEmail_(), '【試し送信】' + mail.subject, mail.text, { htmlBody: mail.html, name: SENDER_NAME });
  Logger.log('試し送信しました（宛先 ' + adminEmail_() + '・回答者のメール ' + extractEmail_(answers[Q_CONTACT]) + '）');
}
