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

## Android app

`android/` is an Android app (Android 8.0 and newer) that packages the same `site/` files, so the website and the app never drift apart.

- **Stored on the phone only.** Entries live in the app's private storage. The app has no internet permission, so it cannot send them anywhere, and cloud backup is turned off. Uninstalling the app deletes the entries, so use **Export CSV** to keep a copy (it opens Android's "Save as" picker).
- **Voice** uses the phone's speech recognition service (usually Google's) through Android's `SpeechRecognizer`. Like Chrome, that service may send audio to Google unless the language has been downloaded for offline speech. The first tap asks for microphone permission. Typing works without it.
- Long-press the app icon for a **Log an expense by voice** shortcut.

### Install

Download the APK from the repo's Releases page and open it on the phone. Android will ask you to allow installs from that source the first time.

### Build

Needs JDK 17+, the Android SDK and Gradle 8.11+ (Android Studio provides all three). Open `android/` in Android Studio, or:

```
cd android
gradle assembleDebug      # app/build/outputs/apk/debug/app-debug.apk
gradle assembleRelease    # signed only if signing is set up, see below
```

Release signing reads `~/.voice-ledger-signing/keystore.properties` (or the file named by `VOICE_LEDGER_SIGNING`) with `storeFile`, `storePassword`, `keyAlias` and `keyPassword`. Keep that keystore backed up: Android only installs updates signed with the same key.

Every push that touches `android/` or `site/` builds a debug APK and an unsigned release APK in GitHub Actions (download them from the run's artifacts). Published releases are signed locally with `apksigner`, so the signing key is never uploaded.

## Known limits

- Voice input needs Chrome, Edge or Safari. Firefox falls back to typing.
- Speech accuracy depends on the browser's recogniser; mixed-language sentences are hit and miss.
- Data lives in one browser (or in the Android app). Clearing site data, or uninstalling the app, deletes it, so export CSV to back up.
- The website and the Android app keep separate entries; there is no sync.
- Categories are keyword-based and English-first.
