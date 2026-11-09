import test from 'node:test';
import assert from 'node:assert/strict';
import { parseExpense } from '../site/parser.js';

// Monday 9 November 2026
const now = new Date(2026, 10, 9, 12, 0, 0);
const p = (t, o = {}) => parseExpense(t, { now, defaultCurrency: 'KES', ...o });

test('the pitch sentence', () => {
  const e = p('I just spent twelve dollars on a coffee and a wrap at the airport');
  assert.equal(e.amount, 12);
  assert.equal(e.currency, 'USD');
  assert.equal(e.category, 'Food & drink');
  assert.equal(e.description, 'Coffee and a wrap');
  assert.equal(e.place, 'Airport');
  assert.equal(e.date, '2026-11-09');
  assert.equal(e.needsReview, false);
});

test('shillings slang, place, method, yesterday', () => {
  const e = p('Paid 350 bob for an Uber from Westlands yesterday with M-Pesa');
  assert.equal(e.amount, 350);
  assert.equal(e.currency, 'KES');
  assert.equal(e.category, 'Transport');
  assert.equal(e.description, 'Uber');
  assert.equal(e.place, 'Westlands');
  assert.equal(e.method, 'M-Pesa');
  assert.equal(e.date, '2026-11-08');
});

test('number words with scales', () => {
  assert.equal(p('rent two hundred and fifty thousand shillings').amount, 250000);
  assert.equal(p('spent two thousand five hundred on groceries').amount, 2500);
  assert.equal(p('a hundred bob for airtime').amount, 100);
  assert.equal(p('twenty five dollars for lunch').amount, 25);
});

test('symbols, commas, k suffix, decimals', () => {
  assert.equal(p('$12.50 for lunch').amount, 12.5);
  assert.equal(p('$12.50 for lunch').currency, 'USD');
  assert.equal(p('KSh 1,200 on fuel').amount, 1200);
  assert.equal(p('paid 2.5k for shoes').amount, 2500);
  assert.equal(p('500/- matatu fare').amount, 500);
  assert.equal(p('twelve dollars and fifty cents for a sandwich').amount, 12.5);
});

test('quantity is not mistaken for the amount', () => {
  assert.equal(p('bought two coffees for 600').amount, 600);
  assert.equal(p('paid 600 for two coffees').amount, 600);
  assert.equal(p('3 beers 900').amount, 900);
  assert.equal(p('bought two coffees for 600').description, 'Two coffees');
});

test('dates', () => {
  assert.equal(p('lunch 450 two days ago').date, '2026-11-07');
  assert.equal(p('lunch 450 two days ago').amount, 450);
  assert.equal(p('spent 800 on dinner on friday').date, '2026-11-06');
  assert.equal(p('spent 800 on dinner last monday').date, '2026-11-02');
  assert.equal(p('day before yesterday paid 200 for parking').date, '2026-11-07');
});

test('terse entry', () => {
  const e = p('lunch at Java two thousand shillings');
  assert.equal(e.amount, 2000);
  assert.equal(e.place, 'Java');
  assert.equal(e.description, 'Lunch');
  assert.equal(e.category, 'Food & drink');
});

test('no amount is flagged for review', () => {
  const e = p('bought some coffee at the airport');
  assert.equal(e.amount, null);
  assert.equal(e.needsReview, true);
});

test('ambiguous shorthand is flagged', () => {
  const e = p('twelve fifty for lunch');
  assert.equal(e.amount, 1250);
  assert.equal(e.needsReview, true);
});

test('time of day is not an amount', () => {
  assert.equal(p('paid 300 for parking at 3 pm').amount, 300);
});

test('default currency follows the setting', () => {
  assert.equal(p('lunch 15', { defaultCurrency: 'USD' }).currency, 'USD');
  assert.equal(p('lunch 5000 shillings', { defaultCurrency: 'UGX' }).currency, 'UGX');
});
