// 📌 今日の5フレーズ：毎日5つ、言えなかったものは翌日も出る
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadApp, assertLoads, norm } from './harness.mjs';

const at = (day) => loadApp({ today: day + 'T09:00:00+09:00' });
const pickKeys = (a, daily, day) => norm(a.dailyPick(daily, day)).map(i => a.cardKey(a.$('CARDS')[i]));
const pool = (a) => norm(a.dailyPool());

test('対象は⭐最優先のフレーズだけ（ルール・禁止句カードは除く）', () => {
  const a = at('2026-11-11');
  const cards = norm(a.$('CARDS'));
  const p = pool(a);
  assert.ok(p.length >= 30);
  assert.ok(p.every(i => cards[i].cat === '⭐最優先' && !cards[i].en.startsWith('(')));
});

test('記録が無ければ優先度の順に先頭5つ', () => {
  const a = at('2026-11-11');
  assert.equal(JSON.stringify(norm(a.dailyPick({}, '2026-11-11'))), JSON.stringify(pool(a).slice(0, 5)));
});

test('言えたものは翌日外れ、✗と未着手は翌日も出る', () => {
  const a = at('2026-11-12');
  const k = pickKeys(a, {}, '2026-11-11');
  const daily = {
    [k[0]]: { ok: '2026-11-11', ng: '', ts: 1 },
    [k[1]]: { ok: '', ng: '2026-11-11', ts: 2 },
    [k[2]]: { ok: '2026-11-11', ng: '', ts: 3 },
  };
  const next = pickKeys(a, daily, '2026-11-12');
  assert.equal(next.length, 5);
  assert.ok(!next.includes(k[0]) && !next.includes(k[2]), '言えたものが残った');
  for (const x of [k[1], k[3], k[4]]) assert.ok(next.includes(x), '✗か未着手が消えた');
  const st = a.dailyStatus(daily, '2026-11-12');
  assert.equal(st.carried, 1);
  assert.equal(st.done, 0);
});

test('同じ日のうちは印を付けても5つの顔ぶれが変わらない', () => {
  const a = at('2026-11-11');
  const before = pickKeys(a, {}, '2026-11-11');
  const daily = {};
  before.forEach((k, i) => { daily[k] = i % 2 ? { ok: '', ng: '2026-11-11', ts: i } : { ok: '2026-11-11', ng: '', ts: i }; });
  assert.equal(pickKeys(a, daily, '2026-11-11').join('|'), before.join('|'));
  assert.equal(a.dailyStatus(daily, '2026-11-11').done, 3);
});

test('全部言えたら、言えた日が古いものから復習に戻る', () => {
  const a = at('2026-12-31');
  const cards = a.$('CARDS');
  const daily = {};
  pool(a).forEach((i, n) => { daily[a.cardKey(cards[i])] = { ok: n === 7 ? '2026-11-01' : '2026-11-20', ng: '', ts: n }; });
  const got = norm(a.dailyPick(daily, '2026-12-31'));
  assert.equal(got.length, 5);
  assert.equal(got[0], pool(a)[7]);
});

test('markKnown/markReview は今日の5つに入るカードだけ記録する', () => {
  const a = at('2026-11-11');
  a.$('state.category = "daily"; state.rp = null; rebuildOrder()');
  a.markReview();   // 1枚目 ✗
  a.markKnown();    // 2枚目 ✓
  const d = norm(a.$('state.daily'));
  const k = pickKeys(a, {}, '2026-11-11');
  assert.equal(d[k[0]].ng, '2026-11-11');
  assert.equal(d[k[1]].ok, '2026-11-11');
  a.$('state.category = "all"; rebuildOrder(); state.index = 300');
  const other = norm(a.$('CARDS')).findIndex(c => c.cat !== '⭐最優先');
  a.$(`state.order = [${other}]; state.index = 0`);
  a.markKnown();
  assert.equal(Object.keys(norm(a.$('state.daily'))).length, 2, '5つ以外のカードを記録した');
});

test('同期: 今日の記録もカード単位で新しい方を採用し、リセット前は捨てる', () => {
  const a = at('2026-11-11');
  const got = norm(a.mergeDaily(
    { x: { ok: '2026-11-10', ts: 100 }, y: { ng: '2026-11-10', ts: 300 }, old: { ok: '2026-11-01', ts: 5 } },
    { x: { ng: '2026-11-11', ts: 200 }, y: { ok: '2026-11-11', ts: 250 }, z: { ok: '2026-11-11', ts: 400 } },
    10));
  assert.equal(got.x.ng, '2026-11-11');
  assert.equal(got.y.ng, '2026-11-10');
  assert.equal(got.z.ok, '2026-11-11');
  assert.ok(!('old' in got));
  assert.ok(norm(a.syncDoc()).daily);
});

test('初回は今日の5フレーズで開く・保存した記録を読み戻す', () => {
  const a = assertLoads({ today: '2026-11-11T09:00:00+09:00' });
  assert.equal(a.$('state.category'), 'daily');
  const b = assertLoads({ today: '2026-11-11T09:00:00+09:00', storage: {
    oet_flashcards_v1: JSON.stringify({ known: {}, review: {}, ts: {}, daily: { 'q::w': { ok: '2026-11-10', ts: 1 } } }),
    oet_last_cat: 'all' } });
  assert.equal(b.$('state.category'), 'all');
  assert.equal(norm(b.$('state.daily'))['q::w'].ok, '2026-11-10');
});

test('全体の暗記進捗: 最後の印が✓だけ暗記済み、✗と未着手を分けて数える', () => {
  const a = at('2026-11-13');
  const cards = a.$('CARDS');
  const p = pool(a);
  const daily = {
    [a.cardKey(cards[p[0]])]: { ok: '2026-11-11', ng: '', ts: 1 },
    [a.cardKey(cards[p[1]])]: { ok: '2026-11-13', ng: '2026-11-12', ts: 2 },
    [a.cardKey(cards[p[2]])]: { ok: '', ng: '2026-11-12', ts: 3 },
  };
  const o = norm(a.dailyOverall(daily, '2026-11-13'));
  assert.equal(o.total, p.length);
  assert.equal(o.learned, 2);
  assert.equal(o.ng, 1);
  assert.equal(o.untouched, p.length - 3);
  assert.equal(o.remaining, p.length - 2);
  assert.equal(o.pct, Math.round(2 / p.length * 100));
  // 毎日5つで最短何日か（今日の分を1日と数える）
  assert.equal(o.days, Math.ceil((p.length - 2) / 5));
});

test('全体の暗記進捗: 記録なしは0%、全部言えたら残り0', () => {
  const a = at('2026-11-13');
  const cards = a.$('CARDS');
  assert.equal(norm(a.dailyOverall({}, '2026-11-13')).learned, 0);
  const all = {};
  pool(a).forEach((i, n) => { all[a.cardKey(cards[i])] = { ok: '2026-11-10', ng: '', ts: n }; });
  const o = norm(a.dailyOverall(all, '2026-11-13'));
  assert.equal(o.remaining, 0);
  assert.equal(o.days, 0);
  assert.equal(o.pct, 100);
});
