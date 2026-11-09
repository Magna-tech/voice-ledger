// Bridge to the Android app (android/). Inside the app, MainActivity exposes
// `window.VoiceLedgerAndroid`; in a normal browser this module does nothing.
const bridge = typeof window !== 'undefined' ? window.VoiceLedgerAndroid : undefined;
export const nativeBridge = bridge || null;

let active = null; // the recogniser that is currently listening
let onSaved = null;

if (bridge) {
  // Called by MainActivity through evaluateJavascript.
  window.__vlNative = {
    speech(ev) { if (active) active._handle(ev); },
    saved(ok, reason) { const done = onSaved; onSaved = null; if (done) done({ ok, reason }); },
    back() {
      const open = document.querySelector('dialog[open]');
      if (!open) return false;
      open.close();
      return true;
    },
  };
}

// Same shape as the browser's SpeechRecognition, as far as app.js uses it.
class NativeSpeechRecognition {
  constructor() {
    this.lang = 'en-US';
    this.interimResults = false;
    this.continuous = false;
    this.maxAlternatives = 1;
    this.onresult = null;
    this.onerror = null;
    this.onend = null;
  }
  start() {
    if (active) throw new Error('Already listening');
    active = this;
    bridge.startSpeech(String(this.lang), Boolean(this.interimResults));
  }
  stop() { bridge.stopSpeech(); }
  _handle(ev) {
    if (ev.type === 'result') {
      const result = [{ transcript: ev.text, confidence: 1 }];
      result.isFinal = Boolean(ev.final);
      this.onresult?.({ results: [result] });
    } else if (ev.type === 'error') {
      this.onerror?.({ error: ev.error });
    } else if (ev.type === 'end') {
      active = null;
      this.onend?.();
    }
  }
}

export const NativeRecognition = bridge ? NativeSpeechRecognition : null;

// Opens Android's "save as" picker. Resolves to { ok, reason }.
export function saveFile(name, text) {
  return new Promise((resolve) => {
    onSaved = resolve;
    bridge.saveFile(name, text);
  });
}
