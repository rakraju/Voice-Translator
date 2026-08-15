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
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private var pendingPermissionRequest: PermissionRequest? = null

    // Register callback for requesting RECORD_AUDIO permission at runtime
    private val requestAudioPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { isGranted: Boolean ->
        if (isGranted) {
            // Grant the pending WebView permission request if we have one
            pendingPermissionRequest?.let {
                it.grant(it.resources)
            }
            Toast.makeText(this, "Microphone access granted!", Toast.LENGTH_SHORT).show()
        } else {
            // Deny WebView permission request if user refused runtime permission
            pendingPermissionRequest?.deny()
            Toast.makeText(this, "Microphone access denied. Voice feature will not work.", Toast.LENGTH_LONG).show()
        }
        pendingPermissionRequest = null
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        webView = findViewById(R.id.webview)
        setupWebView()

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

        // Open links in WebView itself instead of default browser
        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView?, url: String?): Boolean {
                if (url != null) {
                    view?.loadUrl(url)
                }
                return true
            }

            override fun onReceivedSslError(
                view: WebView?,
                handler: android.webkit.SslErrorHandler?,
                error: android.net.http.SslError?
            ) {
                // Ignore self-signed SSL certificate validation checks for local testing
                handler?.proceed()
            }
        }

        // Handle WebView permission requests (e.g. microphone access requested by JS Web Speech API)
        webView.webChromeClient = object : WebChromeClient() {
            override fun onPermissionRequest(request: PermissionRequest) {
                val resources = request.resources
                for (resource in resources) {
                    if (resource == PermissionRequest.RESOURCE_AUDIO_CAPTURE) {
                        // Check if we already have system microphone permission
                        if (ContextCompat.checkSelfPermission(
                                this@MainActivity,
                                Manifest.permission.RECORD_AUDIO
                            ) == PackageManager.PERMISSION_GRANTED
                        ) {
                            request.grant(resources)
                        } else {
                            // If not, cache the request and ask the user for runtime permission
                            pendingPermissionRequest = request
                            requestAudioPermissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
                        }
                        return
                    }
                }
                // For other resources, request grant directly or default handle
                super.onPermissionRequest(request)
            }

            override fun onPermissionRequestCanceled(request: PermissionRequest) {
                if (pendingPermissionRequest == request) {
                    pendingPermissionRequest = null
                }
                super.onPermissionRequestCanceled(request)
            }
        }

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

    // Handle back button navigation inside WebView
    override fun onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack()
        } else {
            super.onBackPressed()
        }
    }
}
