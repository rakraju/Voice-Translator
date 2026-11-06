package com.aarkay.voicetranslator

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.app.Activity
import android.app.DownloadManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Environment
import android.webkit.URLUtil
import android.webkit.ValueCallback
import android.widget.Toast
import android.speech.tts.TextToSpeech
import android.webkit.JavascriptInterface
import java.util.Locale
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private var pendingPermissionRequest: PermissionRequest? = null
    private var textToSpeech: TextToSpeech? = null
    private var isTtsReady = false
    private var filePathCallback: ValueCallback<Array<Uri>>? = null

    // Register callback for requesting RECORD_AUDIO permission at runtime
    private val requestAudioPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { isGranted: Boolean ->
        if (isGranted) {
            pendingPermissionRequest?.let {
                it.grant(it.resources)
            }
            Toast.makeText(this, "Microphone access granted!", Toast.LENGTH_SHORT).show()
        } else {
            pendingPermissionRequest?.deny()
            Toast.makeText(this, "Microphone access denied. Voice feature will not work.", Toast.LENGTH_LONG).show()
        }
        pendingPermissionRequest = null
    }

    // Register callback for requesting CAMERA permission at runtime
    private val requestCameraPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { isGranted: Boolean ->
        if (isGranted) {
            pendingPermissionRequest?.let {
                it.grant(it.resources)
            }
            Toast.makeText(this, "Camera access granted!", Toast.LENGTH_SHORT).show()
        } else {
            pendingPermissionRequest?.deny()
            Toast.makeText(this, "Camera access denied. Camera scanning will not work.", Toast.LENGTH_LONG).show()
        }
        pendingPermissionRequest = null
    }

    // Register callback for file chooser / camera capture intent
    private val fileChooserLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        if (result.resultCode == Activity.RESULT_OK) {
            val data = result.data
            val uris = WebChromeClient.FileChooserParams.parseResult(result.resultCode, data)
            filePathCallback?.onReceiveValue(uris)
        } else {
            filePathCallback?.onReceiveValue(null)
        }
        filePathCallback = null
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        initTextToSpeech()
        setContentView(R.layout.activity_main)

        webView = findViewById(R.id.webview)
        setupWebView()

        // Handle back button navigation using OnBackPressedDispatcher (required for Android 16 / target SDK 36)
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (webView.canGoBack()) {
                    webView.goBack()
                } else {
                    isEnabled = false
                    onBackPressedDispatcher.onBackPressed()
                    isEnabled = true
                }
            }
        })

        // Request initial permission on startup so the user is prepared
        checkAndRequestAudioPermission()
    }

    private fun setupWebView() {
        val settings: WebSettings = webView.settings
        
        // Basic configuration
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true // Required for localStorage history/settings
        
        // User agent and display configurations
        settings.useWideViewPort = true
        settings.loadWithOverviewMode = true
        settings.displayZoomControls = false
        settings.builtInZoomControls = false
        
        // Enables audio/speech autoplay inside WebView without user gesture
        settings.mediaPlaybackRequiresUserGesture = false

        // Cache mode: ensure webview revalidates with server for latest updates
        settings.cacheMode = WebSettings.LOAD_DEFAULT

        // Open links in WebView itself instead of default browser
        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView?, url: String?): Boolean {
                if (url != null) {
                    view?.loadUrl(url)
                }
                return true
            }
        }

        // Handle file downloads from WebView (e.g. download TTS translation audio)
        webView.setDownloadListener { url, userAgent, contentDisposition, mimeType, contentLength ->
            try {
                val request = DownloadManager.Request(Uri.parse(url))
                request.setMimeType(mimeType)
                request.addRequestHeader("User-Agent", userAgent)
                request.setDescription("Downloading translated audio...")
                request.setTitle(URLUtil.guessFileName(url, contentDisposition, mimeType))
                request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                request.setDestinationInExternalPublicDir(
                    Environment.DIRECTORY_DOWNLOADS,
                    URLUtil.guessFileName(url, contentDisposition, mimeType)
                )
                val dm = getSystemService(DOWNLOAD_SERVICE) as DownloadManager
                dm.enqueue(request)
                Toast.makeText(applicationContext, "Downloading audio...", Toast.LENGTH_SHORT).show()
            } catch (e: Exception) {
                Toast.makeText(applicationContext, "Failed to download: ${e.message}", Toast.LENGTH_LONG).show()
            }
        }

        // Handle WebView permission requests (e.g. microphone and camera access)
        webView.webChromeClient = object : WebChromeClient() {
            override fun onPermissionRequest(request: PermissionRequest) {
                val resources = request.resources
                for (resource in resources) {
                    if (resource == PermissionRequest.RESOURCE_AUDIO_CAPTURE) {
                        if (ContextCompat.checkSelfPermission(
                                this@MainActivity,
                                Manifest.permission.RECORD_AUDIO
                            ) == PackageManager.PERMISSION_GRANTED
                        ) {
                            request.grant(resources)
                        } else {
                            pendingPermissionRequest = request
                            requestAudioPermissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
                        }
                        return
                    } else if (resource == PermissionRequest.RESOURCE_VIDEO_CAPTURE) {
                        if (ContextCompat.checkSelfPermission(
                                this@MainActivity,
                                Manifest.permission.CAMERA
                            ) == PackageManager.PERMISSION_GRANTED
                        ) {
                            request.grant(resources)
                        } else {
                            pendingPermissionRequest = request
                            requestCameraPermissionLauncher.launch(Manifest.permission.CAMERA)
                        }
                        return
                    }
                }
                super.onPermissionRequest(request)
            }

            override fun onPermissionRequestCanceled(request: PermissionRequest) {
                if (pendingPermissionRequest == request) {
                    pendingPermissionRequest = null
                }
                super.onPermissionRequestCanceled(request)
            }

            // Support camera capture / image upload in WebView
            override fun onShowFileChooser(
                webView: WebView?,
                filePathCallback: ValueCallback<Array<Uri>>?,
                fileChooserParams: FileChooserParams?
            ): Boolean {
                this@MainActivity.filePathCallback?.onReceiveValue(null)
                this@MainActivity.filePathCallback = filePathCallback
                return try {
                    val intent = fileChooserParams?.createIntent() ?: Intent(Intent.ACTION_GET_CONTENT).apply {
                        type = "image/*"
                    }
                    fileChooserLauncher.launch(intent)
                    true
                } catch (e: Exception) {
                    this@MainActivity.filePathCallback = null
                    false
                }
            }
        }

        // Register Android Native Bridge for zero-latency Native Text-to-Speech
        webView.addJavascriptInterface(AndroidBridge(), "AndroidBridge")

        // Load the web app URL from strings.xml
        val appUrl = getString(R.string.web_app_url)
        webView.loadUrl(appUrl)
    }

    private fun checkAndRequestAudioPermission() {
        if (ContextCompat.checkSelfPermission(
                this,
                Manifest.permission.RECORD_AUDIO
            ) != PackageManager.PERMISSION_GRANTED
        ) {
            requestAudioPermissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
        }
    }

    private fun initTextToSpeech() {
        textToSpeech = TextToSpeech(applicationContext) { status ->
            if (status == TextToSpeech.SUCCESS) {
                isTtsReady = true
            }
        }
    }

    private fun getLocaleForLanguage(langCode: String): Locale {
        return try {
            val tag = langCode.trim().replace("_", "-")
            val loc = Locale.forLanguageTag(tag)
            if (loc.language.isNullOrEmpty()) {
                val base = tag.split("-")[0]
                Locale.forLanguageTag(base)
            } else {
                loc
            }
        } catch (_: Exception) {
            Locale.getDefault()
        }
    }

    inner class AndroidBridge {
        @JavascriptInterface
        fun speak(text: String, langCode: String, rate: Float, pitch: Float): Boolean {
            if (!isTtsReady || textToSpeech == null) return false
            return try {
                val locale = getLocaleForLanguage(langCode)
                var langResult = textToSpeech?.setLanguage(locale)
                if (langResult == TextToSpeech.LANG_MISSING_DATA || langResult == TextToSpeech.LANG_NOT_SUPPORTED) {
                    val base = langCode.split("-")[0]
                    langResult = textToSpeech?.setLanguage(Locale(base))
                }
                if (langResult == TextToSpeech.LANG_MISSING_DATA || langResult == TextToSpeech.LANG_NOT_SUPPORTED) {
                    // Device TTS engine does not have this language installed. Return false to trigger web/server TTS stream
                    return false
                }
                textToSpeech?.setSpeechRate(rate)
                textToSpeech?.setPitch(pitch)
                val params = Bundle()
                val utteranceId = "TTS_ID_${System.currentTimeMillis()}"
                val speakResult = textToSpeech?.speak(text, TextToSpeech.QUEUE_FLUSH, params, utteranceId)
                speakResult == TextToSpeech.SUCCESS
            } catch (e: Exception) {
                false
            }
        }

        @JavascriptInterface
        fun stop() {
            try {
                textToSpeech?.stop()
            } catch (_: Exception) {}
        }

        @JavascriptInterface
        fun isAvailable(): Boolean {
            return isTtsReady
        }
    }

    override fun onDestroy() {
        try {
            textToSpeech?.stop()
            textToSpeech?.shutdown()
        } catch (_: Exception) {}
        super.onDestroy()
    }
}
