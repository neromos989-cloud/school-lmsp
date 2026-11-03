package id.web.assessment.man19jkt

import android.annotation.SuppressLint
import android.content.Intent
import android.graphics.Bitmap
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.webkit.CookieManager
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.ProgressBar
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout
import org.json.JSONObject

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var swipe: SwipeRefreshLayout
    private lateinit var progress: ProgressBar
    private var fileCallback: ValueCallback<Array<Uri>>? = null

    private lateinit var startUrl: String
    private lateinit var startHost: String

    private val fileChooser =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            val data = result.data
            val uris: Array<Uri>? = when {
                result.resultCode != RESULT_OK -> null
                data?.clipData != null -> Array(data.clipData!!.itemCount) { data.clipData!!.getItemAt(it).uri }
                data?.data != null -> arrayOf(data.data!!)
                else -> null
            }
            fileCallback?.onReceiveValue(uris)
            fileCallback = null
        }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val code = intent.getStringExtra(SchoolCodeActivity.KEY_CODE) ?: SchoolCodeActivity.savedCode(this)
        if (code == null) {
            startActivity(Intent(this, SchoolCodeActivity::class.java))
            finish()
            return
        }
        startUrl = SchoolCodeActivity.urlFor(code)
        startHost = Uri.parse(startUrl).host ?: ""

        setContentView(R.layout.activity_main)

        webView = findViewById(R.id.webView)
        swipe = findViewById(R.id.swipe)
        progress = findViewById(R.id.progress)

        with(webView.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true          // localStorage / IndexedDB (offline-first)
            databaseEnabled = true
            cacheMode = WebSettings.LOAD_DEFAULT
            allowFileAccess = false
            mediaPlaybackRequiresUserGesture = false
            setSupportZoom(false)
            builtInZoomControls = false
            useWideViewPort = true
            loadWithOverviewMode = true
        }
        CookieManager.getInstance().apply {
            setAcceptCookie(true)
            setAcceptThirdPartyCookies(webView, true)
        }

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val uri = request.url
                if (uri.scheme == "app") {                       // tombol di halaman offline
                    when (uri.host) {
                        "retry" -> view.loadUrl(startUrl)
                        "change-school" -> {
                            startActivity(Intent(this@MainActivity, SchoolCodeActivity::class.java)
                                .putExtra(SchoolCodeActivity.EXTRA_CHANGE, true))
                            finish()
                        }
                    }
                    return true
                }
                if ((uri.scheme == "http" || uri.scheme == "https") && uri.host == startHost) {
                    return false // tetap di dalam aplikasi
                }
                // Link luar (WhatsApp, Drive, dll.) dibuka di aplikasi/browser lain
                try { startActivity(Intent(Intent.ACTION_VIEW, uri)) } catch (e: Exception) { }
                return true
            }

            override fun onPageStarted(view: WebView, url: String?, favicon: Bitmap?) {
                progress.visibility = View.VISIBLE
            }

            override fun onPageFinished(view: WebView, url: String?) {
                progress.visibility = View.GONE
                swipe.isRefreshing = false
                injectTeacher(view, url)
            }

            override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                if (request.isForMainFrame) {
                    view.loadUrl("file:///android_asset/offline.html")
                }
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView, newProgress: Int) {
                progress.progress = newProgress
            }

            override fun onShowFileChooser(
                webView: WebView,
                callback: ValueCallback<Array<Uri>>,
                params: FileChooserParams
            ): Boolean {
                fileCallback?.onReceiveValue(null)
                fileCallback = callback
                return try {
                    fileChooser.launch(params.createIntent()); true
                } catch (e: Exception) {
                    fileCallback = null; false
                }
            }
        }

        swipe.setOnRefreshListener {
            if (webView.url?.startsWith("file:") == true) webView.loadUrl(startUrl)
            else webView.reload()
        }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (webView.canGoBack()) webView.goBack() else finish()
            }
        })

        if (savedInstanceState != null) webView.restoreState(savedInstanceState)
        else webView.loadUrl(startUrl)
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }

    override fun onResume() {
        super.onResume()
        webView.onResume()
        if (webView.url?.startsWith("file:") == true && isOnline()) webView.loadUrl(startUrl)
    }

    override fun onPause() {
        webView.onPause()
        CookieManager.getInstance().flush()
        super.onPause()
    }

    // Mode guru: hanya aktif jika kode guru sudah diisi lewat pintasan "Mode guru".
    // Skrip dibaca dari assets dan dijalankan langsung (tidak memuat file dari luar).
    private val teacherScript: String by lazy {
        assets.open("school-lms-ai.js").bufferedReader().use { it.readText() }
    }

    private fun injectTeacher(view: WebView, url: String?) {
        val code = SchoolCodeActivity.teacherCode(this) ?: return
        if (url == null || Uri.parse(url).host != startHost) return
        val pre = "window.__SLMS_GURU__=true;" +
            "try{sessionStorage.setItem('slms_code'," + JSONObject.quote(code) + ");}catch(e){}\n"
        view.evaluateJavascript(pre + teacherScript, null)
    }

    private fun isOnline(): Boolean {
        val cm = getSystemService(CONNECTIVITY_SERVICE) as ConnectivityManager
        val caps = cm.getNetworkCapabilities(cm.activeNetwork) ?: return false
        return caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }
}
