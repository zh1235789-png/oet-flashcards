import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadApp, norm } from './harness.mjs';

const app = () => loadApp({ today: '2026-09-21T09:00:00+09:00' });

test('cardKey() はカテゴリと日本語文を連結する', () => {
  assert.equal(app().cardKey({ cat: '⭐最優先', jp: 'お大事に' }), '⭐最優先::お大事に');
});

test('cardKey() は同じ文でもカテゴリが違えば別キーになる', () => {
  const a = app();
  assert.notEqual(a.cardKey({ cat: 'A', jp: '同じ文' }), a.cardKey({ cat: 'B', jp: '同じ文' }));
});

test('CARDS のキーは全件でユニーク（進捗が混線しない）', () => {
  const a = app();
  const cards = norm(a.$('CARDS'));
  const keys = cards.map(c => a.cardKey(c));
  assert.equal(new Set(keys).size, keys.length,
    `キー衝突あり: ${keys.filter((k, i) => keys.indexOf(k) !== i).join(', ')}`);
});

// ---- voiceScore(): 読み上げ音声の選択 ----

const V = (name, lang) => ({ name, lang });

test('voiceScore() は英語以外を強く除外する', () => {
  assert.equal(app().voiceScore(V('Kyoko', 'ja-JP')), -100);
});

test('voiceScore() は機械的な軽量音声を減点する', () => {
  const a = app();
  assert.ok(a.voiceScore(V('Daniel Compact', 'en-GB')) < a.voiceScore(V('Daniel', 'en-GB')));
  assert.ok(a.voiceScore(V('Eloquence Reed', 'en-US')) < 0);
});

test('voiceScore() は高品質音声を優先する', () => {
  const a = app();
  assert.ok(a.voiceScore(V('Serena Premium', 'en-GB')) > a.voiceScore(V('Serena', 'en-GB')));
  assert.ok(a.voiceScore(V('Google UK English Female', 'en-GB')) > a.voiceScore(V('Fred', 'en-GB')));
});

test('voiceScore() は OET 向けに英/豪を米より優先する', () => {
  const a = app();
  const gb = a.voiceScore(V('Voice', 'en-GB'));
  const au = a.voiceScore(V('Voice', 'en-AU'));
  const us = a.voiceScore(V('Voice', 'en-US'));
  assert.ok(gb > au && au > us, `en-GB ${gb} / en-AU ${au} / en-US ${us}`);
});

test('voiceScore() は大文字小文字を区別しない', () => {
  const a = app();
  assert.equal(a.voiceScore(V('SERENA PREMIUM', 'en-GB')), a.voiceScore(V('serena premium', 'en-GB')));
});

// ---- filteredCards(): カテゴリ／復習モードの絞り込み ----

test('filteredCards() は既定で全カードを返す', () => {
  const a = app();
  assert.equal(a.filteredCards().length, a.$('CARDS').length);
});

test('filteredCards() はカテゴリで絞る', () => {
  const a = app();
  const cat = norm(a.$('CARDS'))[0].cat;
  a.$(`state.category = ${JSON.stringify(cat)}`);
  const got = a.filteredCards();
  assert.ok(got.length > 0);
  assert.ok(norm(got).every(c => c.cat === cat));
});

test('filteredCards() は復習モードで印をつけたカードだけ返す', () => {
  const a = app();
  const first = norm(a.$('CARDS'))[0];
  a.$('state.reviewMode = true');
  assert.deepEqual(norm(a.filteredCards()), [], '印がないのに復習カードが出た');
  a.$(`state.review[${JSON.stringify(a.cardKey(first))}] = true`);
  const got = norm(a.filteredCards());
  assert.equal(got.length, 1);
  assert.equal(got[0].jp, first.jp);
});

test('filteredCards() は元の並び順の添字 _i を保つ', () => {
  const a = app();
  const cards = norm(a.filteredCards());
  assert.deepEqual(cards.map(c => c._i).slice(0, 5), [0, 1, 2, 3, 4]);
});
