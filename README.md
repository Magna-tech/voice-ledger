# Voice Ledger

Say what you spent and it gets logged. A static web app with no server: entries are stored only in the browser you use it in.

> "Paid 350 bob for an Uber from Westlands yesterday with M-Pesa"
> becomes KES 350 · Transport · Uber · Westlands · M-Pesa · yesterday's date.

## How it works

- `site/parser.js` turns a sentence into amount, currency, category, description, place, payment method and date. It is rule-based, so it runs instantly and offline.
- `site/app.js` handles the microphone (the browser's built-in speech recognition), storage (`localStorage`), the monthly summary, editing and CSV export.
- If the parser can't find an amount, or the amount is ambiguous ("twelve fifty"), the entry opens for a quick check instead of being saved silently.

## Privacy, stated plainly

Entries never leave the device. Speech-to-text is done by the browser, and Chrome (and some others) send the audio to their own speech service to do it. Typing an entry avoids that. A fully on-device speech model is a possible later step.

## Run locally

```
npx serve site      # or: python3 -m http.server -d site 8000
npm test            # parser tests, needs Node 20+
```

The microphone only works on `https://` or `localhost`.

## Deploy

Pushing to `main` runs the tests, then publishes `site/` to GitHub Pages. One-time setup: repo **Settings → Pages → Source: GitHub Actions**.

On a phone, open the site and choose "Add to Home screen" for an app-like icon; long-pressing the icon offers a "Log an expense by voice" shortcut on Android.

## Known limits

- Voice input needs Chrome, Edge or Safari. Firefox falls back to typing.
- Speech accuracy depends on the browser's recogniser; mixed-language sentences are hit and miss.
- Data lives in one browser. Clearing site data deletes it, so export CSV to back up.
- Categories are keyword-based and English-first.
