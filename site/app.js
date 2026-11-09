import { parseExpense, CATEGORIES } from './parser.js';

const ENTRIES_KEY = 'voiceledger.entries.v1';
const SETTINGS_KEY = 'voiceledger.settings.v1';
const $ = (id) => document.getElementById(id);

// ---------- storage (this browser only)
function load(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}
let entries = load(ENTRIES_KEY, []);
let settings = { currency: 'KES', lang: 'en-KE', ...load(SETTINGS_KEY, {}) };
const persist = () => { if (!save(ENTRIES_KEY, entries)) setStatus('Could not save: browser storage is full or blocked.', 'error'); };

// ---------- helpers
const money = (amount, currency) => {
  try { return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 2, minimumFractionDigits: 0 }).format(amount); }
  catch { return `${currency} ${amount}`; }
};
const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const dayLabel = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const diff = Math.round((new Date(todayIso().replace(/-/g, '/')) - date) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: y === new Date().getFullYear() ? undefined : 'numeric' });
};
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };
function setStatus(text, kind = '') { const s = $('status'); s.textContent = text; s.className = `status ${kind}`.trim(); }

// ---------- rendering
function render() {
  const month = todayIso().slice(0, 7);
  $('monthName').textContent = new Date().toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const monthEntries = entries.filter((e) => e.date.startsWith(month) && e.amount != null);
  const totals = {};
  monthEntries.forEach((e) => { totals[e.currency] = (totals[e.currency] || 0) + e.amount; });
  const main = totals[settings.currency] !== undefined ? settings.currency : Object.keys(totals)[0];
  const totalEl = $('monthTotal');
  totalEl.textContent = main ? money(totals[main], main) : money(0, settings.currency);
  const others = Object.keys(totals).filter((c) => c !== main);
  if (others.length) totalEl.append(el('small', '', `+ ${others.map((c) => money(totals[c], c)).join(' + ')}`));

  const bars = $('bars');
  bars.replaceChildren();
  const byCat = {};
  monthEntries.filter((e) => e.currency === main).forEach((e) => { byCat[e.category] = (byCat[e.category] || 0) + e.amount; });
  const max = Math.max(0, ...Object.values(byCat));
  Object.entries(byCat).sort((a, b) => b[1] - a[1]).forEach(([cat, sum]) => {
    const li = el('li');
    const track = el('span', 'track');
    const fill = el('span', 'fill');
    fill.style.width = `${Math.max(3, (sum / max) * 100)}%`;
    track.append(fill);
    li.append(el('span', '', cat), track, el('span', 'num', money(sum, main)));
    bars.append(li);
  });

  const list = $('list');
  list.replaceChildren();
  $('empty').hidden = entries.length > 0;
  const sorted = entries.slice().sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt));
  let lastDay = '';
  sorted.forEach((e) => {
    if (e.date !== lastDay) { list.append(el('p', 'day', dayLabel(e.date))); lastDay = e.date; }
    const b = el('button', `entry${e.amount == null ? ' review' : ''}`);
    b.type = 'button';
    b.append(
      el('span', 'desc', e.description),
      el('span', 'amt', e.amount == null ? 'Amount?' : money(e.amount, e.currency)),
      el('span', 'meta', [e.category, e.place, e.method].filter(Boolean).join(' · ')),
    );
    b.addEventListener('click', () => openEdit(e.id));
    list.append(b);
  });
}

// ---------- logging an entry
let lastLoggedId = null;
function log(text) {
  const parsed = parseExpense(text, { defaultCurrency: settings.currency });
  const { needsReview, ...fields } = parsed;
  const entry = { id: (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random()), createdAt: new Date().toISOString(), ...fields };
  entries.push(entry);
  persist();
  render();
  lastLoggedId = entry.id;
  $('loggedTitle').textContent = entry.amount == null ? `Logged without an amount: ${entry.description}` : `Logged ${money(entry.amount, entry.currency)} · ${entry.description}`;
  $('loggedSub').textContent = [entry.category, entry.place, entry.method, dayLabel(entry.date)].filter(Boolean).join(' · ');
  $('logged').hidden = false;
  setStatus(needsReview ? 'I was not sure about the amount. Please check it.' : `Heard: “${text}”`, needsReview ? 'error' : '');
  if (needsReview) openEdit(entry.id);
}

$('loggedUndo').addEventListener('click', () => {
  entries = entries.filter((e) => e.id !== lastLoggedId);
  persist(); render();
  $('logged').hidden = true;
  setStatus('Removed.');
});
$('loggedEdit').addEventListener('click', () => openEdit(lastLoggedId));

$('typeForm').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const text = $('typeInput').value.trim();
  if (!text) return;
  $('typeInput').value = '';
  log(text);
});

// ---------- speech
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null;
let listening = false;
let finalText = '';

function setListening(on) {
  listening = on;
  $('micBtn').setAttribute('aria-pressed', String(on));
  $('micLabel').textContent = on ? 'Listening… tap to stop' : 'Tap and speak';
}

function startListening() {
  if (!SR || listening) return;
  rec = new SR();
  rec.lang = settings.lang;
  rec.interimResults = true;
  rec.continuous = false;
  rec.maxAlternatives = 1;
  finalText = '';
  rec.onresult = (ev) => {
    let interim = '';
    finalText = '';
    for (const r of ev.results) { if (r.isFinal) finalText += r[0].transcript; else interim += r[0].transcript; }
    setStatus((finalText + interim).trim() || 'Listening…', 'live');
  };
  rec.onerror = (ev) => {
    const messages = {
      'not-allowed': 'Microphone access is blocked. Allow it in the browser’s site settings, or type instead.',
      'service-not-allowed': 'Speech recognition is not allowed here. Type instead.',
      'no-speech': 'I did not hear anything. Tap and try again.',
      'audio-capture': 'No microphone found.',
      network: 'Speech recognition needs a connection in this browser. Type instead.',
    };
    if (ev.error !== 'aborted') setStatus(messages[ev.error] || `Speech error: ${ev.error}`, 'error');
  };
  rec.onend = () => {
    setListening(false);
    const text = finalText.trim();
    if (text) log(text);
  };
  try { rec.start(); setListening(true); setStatus('Listening…', 'live'); }
  catch { setStatus('Could not start the microphone. Type instead.', 'error'); }
}

$('micBtn').addEventListener('click', () => { if (listening) rec.stop(); else startListening(); });
if (!SR) {
  $('micBtn').disabled = true;
  $('micLabel').textContent = 'Voice not supported';
  setStatus('This browser has no built-in speech recognition. Type your expense below, or open this page in Chrome, Edge or Safari.');
}

// ---------- edit dialog
const editDialog = $('editDialog');
const editForm = $('editForm');
let editingId = null;
CATEGORIES.forEach((c) => editForm.elements.category.append(new Option(c, c)));

function openEdit(id) {
  const e = entries.find((x) => x.id === id);
  if (!e) return;
  editingId = id;
  const f = editForm.elements;
  f.amount.value = e.amount ?? '';
  f.currency.value = e.currency;
  f.description.value = e.description;
  f.category.value = e.category;
  f.date.value = e.date;
  f.place.value = e.place || '';
  f.method.value = e.method || '';
  $('editHeard').textContent = e.raw ? `“${e.raw}”` : '';
  editDialog.showModal();
  if (e.amount == null) f.amount.focus();
}
editForm.addEventListener('submit', () => {
  const e = entries.find((x) => x.id === editingId);
  if (!e) return;
  const f = editForm.elements;
  e.amount = parseFloat(f.amount.value);
  e.currency = f.currency.value.trim().toUpperCase() || settings.currency;
  e.description = f.description.value.trim();
  e.category = f.category.value;
  e.date = f.date.value;
  e.place = f.place.value.trim();
  e.method = f.method.value.trim();
  persist(); render();
  if (editingId === lastLoggedId) $('logged').hidden = true;
});
$('editCancel').addEventListener('click', () => editDialog.close());
$('editDelete').addEventListener('click', () => {
  entries = entries.filter((x) => x.id !== editingId);
  persist(); render();
  if (editingId === lastLoggedId) $('logged').hidden = true;
  editDialog.close();
});

// ---------- settings
const settingsDialog = $('settingsDialog');
const settingsForm = $('settingsForm');
$('settingsBtn').addEventListener('click', () => {
  settingsForm.elements.currency.value = settings.currency;
  settingsForm.elements.lang.value = settings.lang;
  $('clearAll').textContent = 'Delete all entries';
  settingsDialog.showModal();
});
settingsForm.addEventListener('submit', () => {
  settings = { currency: settingsForm.elements.currency.value, lang: settingsForm.elements.lang.value };
  save(SETTINGS_KEY, settings);
  render();
});
$('clearAll').addEventListener('click', (ev) => {
  const b = ev.currentTarget;
  if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = `Tap again to delete ${entries.length} entries`; return; }
  b.dataset.armed = '';
  entries = [];
  persist(); render();
  $('logged').hidden = true;
  settingsDialog.close();
});

// ---------- CSV export
function csvCell(v) {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s) && typeof v !== 'number') s = `'${s}`; // stop spreadsheets running it as a formula
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
$('exportBtn').addEventListener('click', () => {
  if (!entries.length) { setStatus('Nothing to export yet.'); return; }
  const cols = ['date', 'amount', 'currency', 'category', 'description', 'place', 'method', 'raw'];
  const rows = entries.slice().sort((a, b) => a.date.localeCompare(b.date)).map((e) => cols.map((c) => csvCell(e[c])).join(','));
  const blob = new Blob([`﻿${cols.join(',')}\n${rows.join('\n')}\n`], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `voice-ledger-${todayIso()}.csv`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

// ---------- start
render();
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
// Home-screen shortcut: open straight into listening.
if (new URLSearchParams(location.search).get('listen') === '1') startListening();
