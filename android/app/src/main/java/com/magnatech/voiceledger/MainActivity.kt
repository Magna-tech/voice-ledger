package com.magnatech.voiceledger

import android.Manifest
import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.webkit.WebViewAssetLoader
import org.json.JSONObject

/**
 * Hosts the web app from ../site (packaged as assets) in a WebView and adds what a
 * WebView can't do on its own: speech recognition and saving the CSV export.
 * Entries live in the WebView's localStorage, inside this app's private storage.
 */
class MainActivity : ComponentActivity() {

    private lateinit var webView: WebView
    private var recognizer: SpeechRecognizer? = null
    private var pendingLang: String? = null
    private var pendingInterim = true
    private var pendingCsv: String? = null

    // Files are served from a fixed https origin so localStorage and ES modules behave as on the web.
    private val assetLoader by lazy {
        WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()
    }

    private val askForMic = registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        val lang = pendingLang ?: return@registerForActivityResult
        pendingLang = null
        if (granted) beginListening(lang, pendingInterim) else failSpeech("not-allowed")
    }

    private val createCsv = registerForActivityResult(ActivityResultContracts.CreateDocument("text/csv")) { uri ->
        val text = pendingCsv
        pendingCsv = null
        if (uri == null || text == null) {
            notifySaved(false, "cancelled")
            return@registerForActivityResult
        }
        val ok = runCatching {
            contentResolver.openOutputStream(uri)?.use { it.write(text.toByteArray(Charsets.UTF_8)) } ?: error("no stream")
        }.isSuccess
        notifySaved(ok, if (ok) "" else "write-failed")
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        if (BuildConfig.DEBUG) WebView.setWebContentsDebuggingEnabled(true)

        val root = FrameLayout(this)
        webView = WebView(this)
        webView.setBackgroundColor(ContextCompat.getColor(this, R.color.page_bg))
        root.addView(webView, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
        setContentView(root)

        // Keep the page clear of the status bar, navigation bar, notch and keyboard.
        ViewCompat.setOnApplyWindowInsetsListener(root) { v, insets ->
            val i = insets.getInsets(
                WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout() or WindowInsetsCompat.Type.ime(),
            )
            v.setPadding(i.left, i.top, i.right, i.bottom)
            WindowInsetsCompat.CONSUMED
        }

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = false
            allowContentAccess = false
            setSupportZoom(false)
        }
        webView.addJavascriptInterface(Bridge(), "VoiceLedgerAndroid")
        webView.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
                assetLoader.shouldInterceptRequest(request.url)

            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                if (request.url.host == WebViewAssetLoader.DEFAULT_DOMAIN) return false
                // Anything else opens outside the app.
                runCatching { startActivity(Intent(Intent.ACTION_VIEW, request.url)) }
                return true
            }
        }

        // Back closes an open dialog first, then leaves the app.
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                webView.evaluateJavascript("!!(window.__vlNative && window.__vlNative.back())") { handled ->
                    if (handled != "true") {
                        isEnabled = false
                        onBackPressedDispatcher.onBackPressed()
                        isEnabled = true
                    }
                }
            }
        })

        webView.loadUrl(startUrl(intent))
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        if (intent.action == ACTION_LISTEN) webView.loadUrl(startUrl(intent))
    }

    override fun onStop() {
        super.onStop()
        // Don't keep the microphone open in the background.
        if (recognizer != null) {
            recognizer?.cancel()
            destroyRecognizer()
            emit(JSONObject().put("type", "end"))
        }
    }

    override fun onDestroy() {
        destroyRecognizer()
        webView.destroy()
        super.onDestroy()
    }

    private fun startUrl(intent: Intent?) =
        if (intent?.action == ACTION_LISTEN) "$START_URL?listen=1" else START_URL

    // ---------- speech

    private fun startSpeech(lang: String, interim: Boolean) {
        if (!SpeechRecognizer.isRecognitionAvailable(this)) {
            failSpeech("no-recognizer")
            return
        }
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
            beginListening(lang, interim)
        } else {
            pendingLang = lang
            pendingInterim = interim
            askForMic.launch(Manifest.permission.RECORD_AUDIO)
        }
    }

    private fun beginListening(lang: String, interim: Boolean) {
        destroyRecognizer()
        val r = SpeechRecognizer.createSpeechRecognizer(this)
        recognizer = r
        var finished = false
        fun finish() {
            if (finished) return
            finished = true
            emit(JSONObject().put("type", "end"))
            webView.post { if (recognizer === r) destroyRecognizer() }
        }
        r.setRecognitionListener(object : RecognitionListener {
            override fun onReadyForSpeech(params: Bundle?) {}
            override fun onBeginningOfSpeech() {}
            override fun onRmsChanged(rmsdB: Float) {}
            override fun onBufferReceived(buffer: ByteArray?) {}
            override fun onEndOfSpeech() {}
            override fun onEvent(eventType: Int, params: Bundle?) {}

            override fun onPartialResults(partialResults: Bundle?) {
                val text = firstResult(partialResults)
                if (!text.isNullOrBlank()) emitResult(text, final = false)
            }

            override fun onResults(results: Bundle?) {
                val text = firstResult(results)
                if (text.isNullOrBlank()) emitError("no-speech") else emitResult(text, final = true)
                finish()
            }

            override fun onError(error: Int) {
                emitError(errorName(error))
                finish()
            }
        })
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, lang)
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, interim)
            putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
            putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, packageName)
        }
        r.startListening(intent)
    }

    private fun destroyRecognizer() {
        recognizer?.destroy()
        recognizer = null
    }

    private fun firstResult(bundle: Bundle?): String? =
        bundle?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()

    private fun errorName(code: Int) = when (code) {
        SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "not-allowed"
        SpeechRecognizer.ERROR_NO_MATCH, SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "no-speech"
        SpeechRecognizer.ERROR_AUDIO -> "audio-capture"
        SpeechRecognizer.ERROR_NETWORK, SpeechRecognizer.ERROR_NETWORK_TIMEOUT,
        SpeechRecognizer.ERROR_SERVER, SpeechRecognizer.ERROR_SERVER_DISCONNECTED -> "network"
        SpeechRecognizer.ERROR_CLIENT -> "aborted"
        SpeechRecognizer.ERROR_RECOGNIZER_BUSY, SpeechRecognizer.ERROR_TOO_MANY_REQUESTS -> "busy"
        SpeechRecognizer.ERROR_LANGUAGE_NOT_SUPPORTED, SpeechRecognizer.ERROR_LANGUAGE_UNAVAILABLE -> "language-not-supported"
        else -> "error-$code"
    }

    private fun failSpeech(error: String) {
        emitError(error)
        emit(JSONObject().put("type", "end"))
    }

    private fun emitResult(text: String, final: Boolean) =
        emit(JSONObject().put("type", "result").put("text", text).put("final", final))

    private fun emitError(error: String) = emit(JSONObject().put("type", "error").put("error", error))

    private fun emit(event: JSONObject) =
        webView.evaluateJavascript("window.__vlNative && window.__vlNative.speech($event)", null)

    // ---------- CSV export

    private fun saveCsv(name: String, text: String) {
        pendingCsv = text
        try {
            createCsv.launch(name)
        } catch (e: ActivityNotFoundException) {
            pendingCsv = null
            notifySaved(false, "no-picker")
        }
    }

    private fun notifySaved(ok: Boolean, reason: String) =
        webView.evaluateJavascript("window.__vlNative && window.__vlNative.saved($ok, ${JSONObject.quote(reason)})", null)

    /** Called from site/native.js. These run on a WebView thread, so hop to the main thread. */
    private inner class Bridge {
        @JavascriptInterface
        fun startSpeech(lang: String, interim: Boolean) = runOnUiThread { this@MainActivity.startSpeech(lang, interim) }

        @JavascriptInterface
        fun stopSpeech() = runOnUiThread { recognizer?.stopListening() }

        @JavascriptInterface
        fun saveFile(name: String, text: String) = runOnUiThread { saveCsv(name, text) }
    }

    companion object {
        const val ACTION_LISTEN = "com.magnatech.voiceledger.LISTEN"
        const val START_URL = "https://${WebViewAssetLoader.DEFAULT_DOMAIN}/assets/index.html"
    }
}
