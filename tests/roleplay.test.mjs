import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadApp, assertLoads, norm } from './harness.mjs';

const app = () => loadApp({ today: '2026-10-21T09:00:00+09:00' });

test('ROLEPLAYS は Card01〜24 が1枚ずつそろう', () => {
  const ids = norm(app().$('ROLEPLAYS')).map(r => r.id);
  assert.deepEqual(ids, Array.from({ length: 24 }, (_, i) => String(i + 1).padStart(2, '0')));
});

test('各カードの全Taskがどこかのセリフで扱われる', () => {
  for (const r of norm(app().$('ROLEPLAYS'))) {
    const used = new Set(r.steps.flatMap(s => [].concat(s.t || [])));
    for (let n = 1; n <= r.tasks.length; n++) assert.ok(used.has(n), `Card${r.id} Task${n} が未使用`);
    for (const s of r.steps) for (const n of [].concat(s.t || [])) {
      assert.ok(n >= 0 && n <= r.tasks.length, `Card${r.id} に存在しないTask${n}`);
    }
  }
});

test('セリフは既知の段階のみ・最後は4パーツの締め', () => {
  const a = app();
  const stages = norm(a.$('RP_STAGES'));
  for (const r of norm(a.$('ROLEPLAYS'))) {
    for (const s of r.steps) {
      assert.ok(stages.includes(s.s), `Card${r.id} 未知の段階 ${s.s}`);
      assert.ok(s.jp && s.en, `Card${r.id} 空のセリフ`);
    }
    const last = r.steps.at(-1);
    assert.equal(last.s, '締め', `Card${r.id} が締めで終わらない`);
    assert.match(last.en, /^So, to summarise/, `Card${r.id} 要約がない`);
    assert.match(last.en, /Do you have any other questions before we finish\?$/, `Card${r.id} 最終質問が最後にない`);
  }
});

test('ロールプレイの進捗キーは通常カードと衝突しない', () => {
  const a = app();
  const keys = norm(a.$('CARDS')).map(c => a.cardKey(c));
  for (const r of norm(a.$('ROLEPLAYS'))) r.steps.forEach((_, k) => keys.push(a.cardKey(norm(a.rpCard(r, k)))));
  assert.equal(new Set(keys).size, keys.length);
});

test('ロールプレイ選択中: 0=カード画面, 1..N=セリフ, N+1=通し', () => {
  const a = app();
  a.$('state.rp = "05"; rebuildOrder();');
  const n = a.$('currentRP().steps.length');
  assert.equal(a.$('state.order.length'), n + 2);
  assert.equal(a.$('currentCard()'), null);               // ロールカード画面
  a.$('state.index = 1');
  assert.equal(a.$('currentCard().cat'), '🎭Card05');
  assert.equal(a.$('currentCard().s'), '導入');
  a.$(`state.index = ${n + 1}`);
  assert.equal(a.$('currentCard()'), null);               // 通し画面
});

test('前回ロールプレイを選んでいても起動できる', () => {
  const a = assertLoads({ storage: { oet_last_cat: 'rp:14' } });
  assert.equal(a.$('state.rp'), '14');
  const b = assertLoads({ storage: { oet_last_cat: 'rp:99' } });   // 存在しない番号は通常モードへ
  assert.equal(b.$('state.rp'), null);
});
