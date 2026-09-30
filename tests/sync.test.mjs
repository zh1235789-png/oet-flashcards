// 端末間同期（GitHub Gist）のマージ規則。
// ここが壊れると「iPadで付けた✓がiPhoneの古い状態で上書きされて消える」という
// 気づきにくい事故になるので、カード単位の勝ち負けを固定する。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadApp, norm } from './harness.mjs';

const NOW = '2026-09-30T09:00:00+09:00';
const app = (storage) => loadApp({ today: NOW, storage });

// ローカル状態を組み立てるヘルパ（state は let なので $ 経由で触る）
function withState(a, { known = {}, review = {}, ts = {}, resetAt = 0 } = {}) {
  const s = a.$('state');
  s.known = known; s.review = review; s.ts = ts; s.resetAt = resetAt;
  return s;
}

test('相手の方が新しいカードは相手の印で上書きされる', () => {
  const a = app();
  const s = withState(a, { known: { 'A::x': true }, ts: { 'A::x': 100 } });
  a.mergeRemote({ review: { 'A::x': true }, ts: { 'A::x': 200 } });
  assert.deepEqual(norm(s.known), {});
  assert.deepEqual(norm(s.review), { 'A::x': true });
  assert.equal(s.ts['A::x'], 200);
});

test('自分の方が新しいカードは自分の印が残る', () => {
  const a = app();
  const s = withState(a, { known: { 'A::x': true }, ts: { 'A::x': 300 } });
  a.mergeRemote({ review: { 'A::x': true }, ts: { 'A::x': 200 } });
  assert.deepEqual(norm(s.known), { 'A::x': true });
  assert.deepEqual(norm(s.review), {});
  assert.equal(s.ts['A::x'], 300);
});

test('相手だけが持つカードは取り込む（別端末で進めた分が合流する）', () => {
  const a = app();
  const s = withState(a, { known: { 'A::x': true }, ts: { 'A::x': 100 } });
  a.mergeRemote({ known: { 'B::y': true }, ts: { 'B::y': 50 } });
  assert.deepEqual(norm(s.known), { 'A::x': true, 'B::y': true });
});

test('リセット後は、リセットより前の印を相手から受け取らない', () => {
  const a = app();
  const s = withState(a, { resetAt: 500 });
  a.mergeRemote({ known: { 'A::x': true }, ts: { 'A::x': 400 }, resetAt: 0 });
  assert.deepEqual(norm(s.known), {});
  assert.equal(s.resetAt, 500);
});

test('相手のリセットはこちらにも伝わり、古い印が消える', () => {
  const a = app();
  const s = withState(a, { known: { 'A::x': true }, ts: { 'A::x': 400 }, resetAt: 0 });
  a.mergeRemote({ known: {}, review: {}, ts: {}, resetAt: 900 });
  assert.deepEqual(norm(s.known), {});
  assert.equal(s.resetAt, 900);
});

test('リセット後に付け直した印は残る', () => {
  const a = app();
  const s = withState(a, { known: { 'A::x': true }, ts: { 'A::x': 1000 }, resetAt: 900 });
  a.mergeRemote({ known: {}, review: {}, ts: {}, resetAt: 900 });
  assert.deepEqual(norm(s.known), { 'A::x': true });
});

test('印を外した状態が最新なら、古い印は復活しない', () => {
  const a = app();
  // 相手側: ts はあるが known/review のどちらにも無い＝印が外れている
  const s = withState(a, { known: { 'A::x': true }, ts: { 'A::x': 100 } });
  a.mergeRemote({ known: {}, review: {}, ts: { 'A::x': 200 } });
  assert.deepEqual(norm(s.known), {});
  assert.deepEqual(norm(s.review), {});
});

test('相手のデータが空・壊れていても自分の進捗を消さない', () => {
  const a = app();
  const s = withState(a, { known: { 'A::x': true }, ts: { 'A::x': 100 } });
  for (const bad of [null, undefined, {}, { v: 1 }]) {
    a.mergeRemote(bad);
    assert.deepEqual(norm(s.known), { 'A::x': true }, `壊れた入力 ${JSON.stringify(bad)} で消えた`);
  }
});

test('syncDoc() は同期に必要な4点を含む', () => {
  const a = app();
  withState(a, { known: { 'A::x': true }, review: { 'B::y': true }, ts: { 'A::x': 1, 'B::y': 2 }, resetAt: 7 });
  const doc = norm(a.syncDoc());
  assert.deepEqual(doc.known, { 'A::x': true });
  assert.deepEqual(doc.review, { 'B::y': true });
  assert.deepEqual(doc.ts, { 'A::x': 1, 'B::y': 2 });
  assert.equal(doc.resetAt, 7);
});

test('同期導入前の保存データ（時刻なし）にも時刻を補う', () => {
  // 補わないと ts:0 扱いになり、他端末のどんな古い印にも負けて消える
  const a = app({ oet_flashcards_v1: JSON.stringify({ known: { 'A::x': true }, review: { 'B::y': true } }) });
  const s = a.$('state');
  assert.ok(s.ts['A::x'] > 0);
  assert.ok(s.ts['B::y'] > 0);
});

test('トークン未設定なら同期は何もしない（fetchを呼ばない）', async () => {
  const a = app();
  a.$('SY = {}');
  await a.syncNow();   // harness の fetch は呼ばれると投げる
  assert.equal(a.$('SY.state'), undefined);
});

test('同期状態の表示文はトークンが無ければ空', () => {
  const a = app();
  a.$('SY = {}');
  assert.equal(a.syncText(), '');
});
