// Turns a spoken sentence into a structured expense entry.
// Pure functions, no browser APIs, so the same file runs in tests under Node.

const SMALL = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const SCALE = { hundred: 100, thousand: 1000, million: 1000000 };

const SHILLING_CURRENCIES = new Set(['KES', 'UGX', 'TZS']);
const CURRENCY_WORDS = {
  dollar: 'USD', dollars: 'USD', buck: 'USD', bucks: 'USD', usd: 'USD',
  shilling: 'SHILLING', shillings: 'SHILLING', bob: 'KES', kes: 'KES', ksh: 'KES', kshs: 'KES',
  ugx: 'UGX', tzs: 'TZS',
  euro: 'EUR', euros: 'EUR', eur: 'EUR',
  pound: 'GBP', pounds: 'GBP', quid: 'GBP', gbp: 'GBP',
  rand: 'ZAR', zar: 'ZAR', naira: 'NGN', ngn: 'NGN', rupee: 'INR', rupees: 'INR', inr: 'INR',
};

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const NOT_AMOUNT_AFTER = new Set([
  'day', 'days', 'week', 'weeks', 'month', 'months', 'hour', 'hours', 'minute', 'minutes',
  'am', 'pm', "o'clock", 'oclock', 'people', 'percent', 'km', 'kilometres', 'kilometers', 'litres', 'liters', 'kg', 'kilos',
]);
const SPEND_VERBS = new Set(['spent', 'paid', 'cost', 'costs', 'costing', 'was', 'were']);
const BUY_VERBS = new Set(['bought', 'got', 'ordered', 'had', 'grabbed', 'purchased']);
const PLACE_PREPS = ['at', 'from', 'in'];
const METHOD_PREPS = new Set(['with', 'by', 'via', 'using', 'in', 'through', 'on']);
const METHODS = { mpesa: 'M-Pesa', cash: 'Cash', card: 'Card', visa: 'Card', mastercard: 'Card', paypal: 'PayPal', airtel: 'Airtel Money' };
const DAYPARTS = new Set(['morning', 'afternoon', 'evening', 'night', 'tonight', 'today', 'yesterday', 'town']);
const BOUNDARY = new Set([
  'at', 'in', 'from', 'yesterday', 'today', 'tonight', 'with', 'using', 'via', 'by', 'last', 'this', 'on', 'for',
  'because', 'through', ...WEEKDAYS,
]);
const FILLER = new Set([
  'i', "i've", 'ive', 'just', 'have', 'we', 'spent', 'paid', 'bought', 'got', 'cost', 'costs', 'was', 'were', 'it',
  'a', 'an', 'the', 'some', 'my', 'of', 'and', 'for', 'on', 'to', 'me', 'about', 'around', 'like', 'ordered', 'had',
  'grabbed', 'purchased', 'ago', 'day', 'days', 'week', 'before', 'night', 'morning', 'only',
]);

export const CATEGORIES = ['Food & drink', 'Groceries', 'Transport', 'Bills', 'Shopping', 'Health', 'Entertainment', 'Other'];
const CATEGORY_WORDS = {
  'Food & drink': ['coffee', 'lunch', 'dinner', 'breakfast', 'brunch', 'wrap', 'sandwich', 'pizza', 'burger', 'snack', 'tea',
    'restaurant', 'cafe', 'meal', 'food', 'chips', 'chicken', 'nyama', 'chapati', 'mandazi', 'samosa', 'juice', 'soda',
    'smoothie', 'takeaway', 'takeout', 'supper', 'dessert', 'cake', 'java', 'kfc', 'ugali', 'pilau'],
  Groceries: ['groceries', 'grocery', 'supermarket', 'vegetable', 'fruit', 'milk', 'bread', 'egg', 'rice', 'flour', 'sugar',
    'market', 'naivas', 'carrefour', 'quickmart', 'shopping list', 'unga', 'sukuma', 'tomato', 'onion', 'meat', 'butchery'],
  Transport: ['uber', 'bolt', 'taxi', 'cab', 'matatu', 'bus', 'fare', 'fuel', 'petrol', 'diesel', 'parking', 'boda', 'bodaboda',
    'flight', 'train', 'sgr', 'toll', 'ride', 'ticket', 'airfare', 'ferry'],
  Bills: ['rent', 'electricity', 'token', 'water', 'wifi', 'internet', 'airtime', 'bundle', 'data', 'subscription', 'netflix',
    'spotify', 'insurance', 'bill', 'fee', 'loan', 'dstv', 'showmax', 'gas'],
  Shopping: ['clothes', 'shoe', 'shirt', 'dress', 'trouser', 'jacket', 'phone', 'laptop', 'charger', 'headphone', 'earphone',
    'book', 'gift', 'furniture', 'bag', 'watch', 'cable'],
  Health: ['pharmacy', 'medicine', 'doctor', 'hospital', 'chemist', 'clinic', 'dentist', 'gym', 'vitamin', 'prescription', 'painkiller'],
  Entertainment: ['movie', 'cinema', 'concert', 'game', 'beer', 'drink', 'bar', 'club', 'party', 'show', 'wine', 'event'],
};

const isDigits = (t) => /^\d+(\.\d+)?$/.test(t);
const isNumWord = (t) => t in SMALL || t in TENS || t in SCALE;
const isNumTok = (t) => t !== undefined && (isDigits(t) || isNumWord(t));

export function normalise(text) {
  let s = ` ${String(text || '').toLowerCase()} `;
  s = s.replace(/m[\s-]?pesa/g, 'mpesa');
  s = s.replace(/\$\s?(\d[\d,]*(?:\.\d+)?k?)/g, '$1 dollars');
  s = s.replace(/€\s?(\d[\d,]*(?:\.\d+)?k?)/g, '$1 euros');
  s = s.replace(/£\s?(\d[\d,]*(?:\.\d+)?k?)/g, '$1 pounds');
  s = s.replace(/\b(kes|kshs|ksh|usd|eur|gbp|ugx|tzs|sh)\.?\s?(\d[\d,]*(?:\.\d+)?k?)\b/g, (_, c, n) => `${n} ${c === 'sh' ? 'shillings' : c}`);
  s = s.replace(/(\d)\/[-=]/g, '$1 shillings');
  s = s.replace(/(\d),(?=\d{3}(?:\D|$))/g, '$1');
  s = s.replace(/\b(\d+(?:\.\d+)?)\s?k\b/g, (_, n) => String(Math.round(parseFloat(n) * 1000)));
  s = s.replace(/[^a-z0-9.'\s]/g, ' ');
  s = s.replace(/\.(?!\d)/g, ' ');
  return s.trim().split(/\s+/).filter(Boolean);
}

// Finds runs of number tokens ("two thousand five hundred", "12.50") and their values.
function findNumberRuns(tokens) {
  const runs = [];
  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i];
    const startsWithArticle = (t === 'a' || t === 'an') && tokens[i + 1] in SCALE;
    if (!isNumTok(t) && !startsWithArticle) { i++; continue; }
    const start = i;
    let total = 0;
    let current = 0;
    let hasDigits = false;
    let colloquial = false;
    let prevKind = null;
    while (i < tokens.length) {
      const w = tokens[i];
      if ((w === 'a' || w === 'an') && i === start) { current = 1; prevKind = 'small'; i++; continue; }
      if (isDigits(w)) {
        if (hasDigits || i !== start) break;
        current = parseFloat(w); hasDigits = true; prevKind = 'digits';
      } else if (w in SMALL) {
        if (prevKind === 'small' || prevKind === 'digits' || prevKind === 'teen') break;
        current += SMALL[w]; prevKind = SMALL[w] >= 10 ? 'teen' : 'small';
      } else if (w in TENS) {
        if (prevKind === 'digits' || prevKind === 'small') break;
        // "twelve fifty" / "twenty fifty": spoken shorthand for 1250 / 2050
        if (prevKind === 'teen' || prevKind === 'tens') { current = current * 100 + TENS[w]; colloquial = true; } else current += TENS[w];
        prevKind = 'tens';
      } else if (w === 'hundred') {
        current = (current || 1) * 100; prevKind = 'scale';
      } else if (w in SCALE) {
        total += (current || 1) * SCALE[w]; current = 0; prevKind = 'scale';
      } else if (w === 'and' && prevKind === 'scale' && isNumWord(tokens[i + 1]) && !(tokens[i + 1] in SCALE)) {
        // "two hundred and fifty"
      } else if (w === 'point' && (tokens[i + 1] in SMALL || isDigits(tokens[i + 1] || ''))) {
        let frac = '';
        let j = i + 1;
        while (j < tokens.length && (tokens[j] in SMALL && SMALL[tokens[j]] < 10 || /^\d+$/.test(tokens[j]))) {
          frac += tokens[j] in SMALL ? SMALL[tokens[j]] : tokens[j];
          j++;
        }
        current += parseFloat(`0.${frac}`);
        i = j;
        break;
      } else break;
      i++;
    }
    runs.push({ start, end: i - 1, value: total + current, colloquial });
  }
  return runs;
}

function resolveCurrency(word, defaultCurrency) {
  const c = CURRENCY_WORDS[word];
  if (c === 'SHILLING') return SHILLING_CURRENCIES.has(defaultCurrency) ? defaultCurrency : 'KES';
  return c;
}

function isoDate(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function titleCase(s) {
  return s.replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

function categorise(tokens) {
  const words = new Set();
  for (const t of tokens) { words.add(t); if (t.length > 3 && t.endsWith('s')) words.add(t.slice(0, -1)); if (t.endsWith('es')) words.add(t.slice(0, -2)); }
  let best = 'Other';
  let bestScore = 0;
  for (const [cat, list] of Object.entries(CATEGORY_WORDS)) {
    const score = list.filter((w) => words.has(w)).length;
    if (score > bestScore) { best = cat; bestScore = score; }
  }
  return best;
}

export function parseExpense(text, opts = {}) {
  const now = opts.now ? new Date(opts.now) : new Date();
  const defaultCurrency = opts.defaultCurrency || 'KES';
  const raw = String(text || '').trim();
  const tokens = normalise(raw);
  const used = new Set();
  const use = (a, b) => { for (let k = a; k <= b; k++) used.add(k); };
  const runs = findNumberRuns(tokens);
  const numIdx = new Set();
  runs.forEach((r) => { for (let k = r.start; k <= r.end; k++) numIdx.add(k); });

  // ---- date
  let offset = 0;
  const joined = ` ${tokens.join(' ')} `;
  for (const r of runs) {
    const unit = tokens[r.end + 1];
    if (tokens[r.end + 2] === 'ago' && /^(day|days|week|weeks)$/.test(unit || '')) {
      offset = -Math.round(r.value) * (unit.startsWith('week') ? 7 : 1);
      r.excluded = true; use(r.start, r.end + 2);
    }
  }
  if (joined.includes(' day before yesterday ')) offset = -2;
  else if (joined.includes(' yesterday ') || joined.includes(' last night ')) offset = -1;
  else if (joined.includes(' last week ')) offset = -7;
  else if (offset === 0) {
    const wi = tokens.findIndex((t) => WEEKDAYS.includes(t));
    if (wi !== -1) {
      let diff = (now.getDay() - WEEKDAYS.indexOf(tokens[wi]) + 7) % 7;
      if (diff === 0 && tokens[wi - 1] === 'last') diff = 7;
      offset = -diff;
      use(['on', 'last', 'this'].includes(tokens[wi - 1]) ? wi - 1 : wi, wi);
    }
  }
  tokens.forEach((t, k) => { if (t === 'yesterday' || t === 'today' || t === 'tonight') used.add(k); });
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);

  // ---- amount
  for (const r of runs) {
    const next = tokens[r.end + 1];
    const prev = tokens[r.start - 1];
    r.currency = resolveCurrency(next, defaultCurrency);
    if (r.currency) continue;
    if (NOT_AMOUNT_AFTER.has(next)) r.excluded = true;
    if (prev === 'at' && !SPEND_VERBS.has(tokens[r.start - 2])) r.excluded = true; // "at three"
  }
  // "twelve dollars and fifty cents"
  runs.forEach((r, idx) => {
    if (!r.currency) return;
    const c = runs[idx + 1];
    if (c && /^cents?$/.test(tokens[c.end + 1] || '') && c.start - r.end <= 3) {
      r.value += c.value / 100; c.excluded = true; r.centsEnd = c.end + 1;
    }
  });
  const candidates = runs.filter((r) => !r.excluded && r.value > 0);
  const amountRun = candidates.find((r) => r.currency)
    || candidates.find((r) => SPEND_VERBS.has(tokens[r.start - 1]))
    || candidates.find((r) => tokens[r.start - 1] === 'for')
    || candidates.slice().sort((a, b) => b.value - a.value)[0]
    || null;
  let amount = null;
  let currency = defaultCurrency;
  if (amountRun) {
    amount = Math.round(amountRun.value * 100) / 100;
    if (amountRun.currency) currency = amountRun.currency;
    use(amountRun.start, amountRun.centsEnd || (amountRun.currency ? amountRun.end + 1 : amountRun.end));
  }

  // ---- payment method
  let method = '';
  tokens.forEach((t, k) => {
    if (!METHODS[t] || method) return;
    method = METHODS[t];
    let a = k;
    if (['credit', 'debit', 'my'].includes(tokens[a - 1])) a--;
    if (tokens[a - 1] === 'my') a--;
    if (METHOD_PREPS.has(tokens[a - 1])) a--;
    use(a, tokens[k + 1] === 'money' ? k + 1 : k);
  });

  // ---- place
  let place = '';
  for (const prep of PLACE_PREPS) {
    for (let k = 0; k < tokens.length && !place; k++) {
      if (tokens[k] !== prep || used.has(k)) continue;
      let j = k + 1;
      if (tokens[j] === 'the') j++;
      const words = [];
      while (j < tokens.length && words.length < 4) {
        const w = tokens[j];
        if (BOUNDARY.has(w) || w === 'and' || numIdx.has(j) || used.has(j) || w in CURRENCY_WORDS || METHODS[w]) break;
        words.push(w); j++;
      }
      if (!words.length || DAYPARTS.has(words[0]) && words[0] !== 'town') continue;
      place = titleCase(words.join(' '));
      use(k, j - 1);
    }
    if (place) break;
  }

  // ---- description
  const takeUntil = (startIdx, stopAtFor) => {
    const out = [];
    for (let k = startIdx; k < tokens.length; k++) {
      const w = tokens[k];
      if (used.has(k) || (BOUNDARY.has(w) && (w !== 'for' || stopAtFor))) break;
      if (numIdx.has(k) && tokens[k - 1] === 'for') break;
      out.push(w);
    }
    while (out.length && ['a', 'an', 'the', 'some', 'my'].includes(out[0])) out.shift();
    while (out.length && ['and', 'for', 'a', 'the'].includes(out[out.length - 1])) out.pop();
    return out.join(' ');
  };
  let description = '';
  const amountEnd = amountRun ? amountRun.end : -1;
  for (let k = amountEnd + 1; k < tokens.length && !description; k++) {
    if ((tokens[k] === 'on' || tokens[k] === 'for') && !used.has(k) && !used.has(k + 1) && !numIdx.has(k + 1)) description = takeUntil(k + 1, true);
  }
  if (!description) {
    const v = tokens.findIndex((t, k) => BUY_VERBS.has(t) && !used.has(k));
    if (v !== -1) description = takeUntil(v + 1, true);
  }
  if (!description) {
    description = tokens.filter((t, k) => !used.has(k) && !FILLER.has(t) && !(numIdx.has(k))).join(' ');
  }
  description = description ? description[0].toUpperCase() + description.slice(1) : raw;

  return {
    amount,
    currency,
    category: categorise(tokens),
    description,
    place,
    method,
    date: isoDate(date),
    raw,
    needsReview: amount === null || Boolean(amountRun && amountRun.colloquial),
  };
}
