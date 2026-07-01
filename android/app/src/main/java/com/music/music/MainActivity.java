package com.music.music;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.ColorDrawable;
import android.graphics.drawable.GradientDrawable;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowInsets;
import android.view.inputmethod.InputMethodManager;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;
import android.window.OnBackInvokedDispatcher;

public class MainActivity extends Activity {
    private static final String PREFS_NAME = "music_android";
    private static final String PREF_SERVER_URL = "server_url";

    private WebView webView;
    private ProgressBar progressBar;
    private LinearLayout settingsPanel;
    private EditText urlInput;
    private TextView panelTitle;
    private TextView panelMessage;
    private SharedPreferences preferences;
    private LocalMusicServer localServer;
    private String defaultUrl;
    private boolean receivedMainFrameError;
    private BroadcastReceiver mediaCommandReceiver;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        preferences = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        configureSystemBars();
        defaultUrl = resolveDefaultUrl();

        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);

        FrameLayout root = new FrameLayout(this);
        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(7, 17, 13));
        progressBar = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);

        root.addView(webView, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
        ));

        FrameLayout.LayoutParams progressParams = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(3),
                Gravity.TOP
        );
        root.addView(progressBar, progressParams);

        settingsPanel = createSettingsPanel();
        FrameLayout.LayoutParams panelParams = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT,
                Gravity.CENTER
        );
        int panelMargin = dp(20);
        panelParams.setMargins(panelMargin, 0, panelMargin, 0);
        root.addView(settingsPanel, panelParams);

        applySystemBarInsets(root);
        setContentView(root);
        configureWebView();
        requestNotificationPermissionIfNeeded();
        registerMediaCommandReceiver();
        registerBackNavigationCallback();

        String launchUrl = getLaunchUrl();
        urlInput.setText(launchUrl);
        settingsPanel.setVisibility(View.GONE);
        loadUrl(launchUrl);
    }

    private String resolveDefaultUrl() {
        if (!"local".equalsIgnoreCase(BuildConfig.DEFAULT_WEB_URL)) {
            return BuildConfig.DEFAULT_WEB_URL;
        }
        localServer = new LocalMusicServer(this);
        try {
            return localServer.start();
        } catch (Exception error) {
            Toast.makeText(this, "本地服务启动失败: " + error.getMessage(), Toast.LENGTH_LONG).show();
            return "http://127.0.0.1:41731/?source=android";
        }
    }

    private void configureSystemBars() {
        Window window = getWindow();
        window.setBackgroundDrawable(new ColorDrawable(Color.rgb(7, 17, 13)));
        window.setStatusBarColor(Color.rgb(7, 17, 13));
        window.setNavigationBarColor(Color.rgb(7, 17, 13));
        window.getDecorView().setSystemUiVisibility(0);
    }

    private void configureWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        webView.addJavascriptInterface(new MusicAndroidBridge(), "MusicAndroid");

        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        cookieManager.setAcceptThirdPartyCookies(webView, true);

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                progressBar.setProgress(newProgress);
                progressBar.setVisibility(newProgress >= 100 ? View.GONE : View.VISIBLE);
            }
        });

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String scheme = uri.getScheme();
                if ("http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme)) {
                    return false;
                }
                openExternal(uri);
                return true;
            }

            @Override
            public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                receivedMainFrameError = false;
                progressBar.setVisibility(View.VISIBLE);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                if (!receivedMainFrameError) {
                    settingsPanel.setVisibility(View.GONE);
                    preferences.edit().putString(PREF_SERVER_URL, url).apply();
                }
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) {
                    receivedMainFrameError = true;
                    showSettingsPanel("无法打开当前服务地址。请确认后端已经启动，或切换到可访问的 HTTPS / 局域网地址。", false);
                }
            }

            @Override
            public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse errorResponse) {
                if (request.isForMainFrame()) {
                    receivedMainFrameError = true;
                    showSettingsPanel("服务返回 HTTP " + errorResponse.getStatusCode() + "。请检查后端部署和地址。", false);
                }
            }
        });

        webView.setOnLongClickListener(v -> {
            showSettingsPanel("默认使用手机本地服务。也可以临时切换到局域网电脑或线上 HTTPS 服务地址。", true);
            return true;
        });
    }

    private void requestNotificationPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return;
        if (checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) return;
        requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 41731);
    }

    @SuppressLint("UnspecifiedRegisterReceiverFlag")
    private void registerMediaCommandReceiver() {
        mediaCommandReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                String command = intent != null ? intent.getStringExtra(MusicPlaybackService.EXTRA_COMMAND) : "";
                handleMediaCommand(command);
            }
        };
        IntentFilter filter = new IntentFilter(MusicPlaybackService.ACTION_WEB_COMMAND);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(mediaCommandReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(mediaCommandReceiver, filter);
        }
    }

    private void handleMediaCommand(String command) {
        if (webView == null || command == null) return;
        String safeCommand;
        if ("play".equals(command) || "pause".equals(command) || "next".equals(command) || "previous".equals(command) || "stop".equals(command)) {
            safeCommand = command;
        } else {
            return;
        }
        webView.post(() -> webView.evaluateJavascript(
                "window.musicAndroidHandleCommand&&window.musicAndroidHandleCommand('" + safeCommand + "')",
                null
        ));
    }

    private void updatePlaybackService(String playbackState, String title, String artist) {
        boolean isPlaying = "playing".equals(playbackState);
        boolean isPaused = "paused".equals(playbackState);
        Intent intent = new Intent(this, MusicPlaybackService.class);
        if (isPlaying || isPaused) {
            intent.setAction(MusicPlaybackService.ACTION_UPDATE);
            intent.putExtra(MusicPlaybackService.EXTRA_TITLE, firstNonEmpty(title, "music"));
            intent.putExtra(MusicPlaybackService.EXTRA_ARTIST, firstNonEmpty(artist, "正在播放"));
            intent.putExtra(MusicPlaybackService.EXTRA_PLAYING, isPlaying);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && isPlaying) {
                startForegroundService(intent);
            } else {
                startService(intent);
            }
        } else {
            intent.setAction(MusicPlaybackService.ACTION_STOP);
            startService(intent);
        }
    }

    private String firstNonEmpty(String value, String fallback) {
        if (value == null) return fallback;
        String trimmed = value.trim();
        return trimmed.isEmpty() ? fallback : trimmed;
    }

    private void applySystemBarInsets(View root) {
        root.setOnApplyWindowInsetsListener((view, insets) -> {
            int left;
            int top;
            int right;
            int bottom;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars());
                left = bars.left;
                top = bars.top;
                right = bars.right;
                bottom = bars.bottom;
            } else {
                left = insets.getSystemWindowInsetLeft();
                top = insets.getSystemWindowInsetTop();
                right = insets.getSystemWindowInsetRight();
                bottom = insets.getSystemWindowInsetBottom();
            }
            view.setPadding(left, top, right, bottom);
            return insets;
        });
    }

    private LinearLayout createSettingsPanel() {
        LinearLayout panel = new LinearLayout(this);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setPadding(dp(18), dp(16), dp(18), dp(16));
        panel.setGravity(Gravity.CENTER_HORIZONTAL);

        GradientDrawable background = new GradientDrawable();
        background.setColor(Color.rgb(250, 252, 250));
        background.setCornerRadius(dp(12));
        background.setStroke(dp(1), Color.rgb(211, 222, 215));
        panel.setBackground(background);
        panel.setElevation(dp(8));

        panelTitle = new TextView(this);
        panelTitle.setText(getString(R.string.android_panel_title));
        panelTitle.setTextColor(Color.rgb(8, 25, 18));
        panelTitle.setTextSize(20);
        panelTitle.setTypeface(Typeface.DEFAULT_BOLD);
        panel.addView(panelTitle, matchWrap());

        panelMessage = new TextView(this);
        panelMessage.setTextColor(Color.rgb(64, 78, 70));
        panelMessage.setTextSize(14);
        panelMessage.setPadding(0, dp(8), 0, dp(12));
        panel.addView(panelMessage, matchWrap());

        urlInput = new EditText(this);
        urlInput.setSingleLine(true);
        urlInput.setTextSize(14);
        urlInput.setSelectAllOnFocus(true);
        urlInput.setHint("https://你的域名/?source=android");
        panel.addView(urlInput, matchWrap());

        LinearLayout buttons = new LinearLayout(this);
        buttons.setOrientation(LinearLayout.HORIZONTAL);
        buttons.setGravity(Gravity.END);
        buttons.setPadding(0, dp(12), 0, 0);
        panel.addView(buttons, matchWrap());

        Button resetButton = new Button(this);
        resetButton.setText("本地地址");
        resetButton.setOnClickListener(v -> {
            urlInput.setText(defaultUrl);
            loadUrl(defaultUrl);
        });
        buttons.addView(resetButton, buttonParams());

        Button reloadButton = new Button(this);
        reloadButton.setText("重新加载");
        reloadButton.setOnClickListener(v -> loadUrl(urlInput.getText().toString()));
        buttons.addView(reloadButton, buttonParams());

        Button hideButton = new Button(this);
        hideButton.setText("隐藏");
        hideButton.setOnClickListener(v -> settingsPanel.setVisibility(View.GONE));
        buttons.addView(hideButton, buttonParams());

        return panel;
    }

    private String getLaunchUrl() {
        Uri intentUrl = getIntent() != null ? getIntent().getData() : null;
        if (intentUrl != null && isHttpUrl(intentUrl)) {
            return intentUrl.toString();
        }
        return defaultUrl;
    }

    private void loadUrl(String rawUrl) {
        String normalized = normalizeUrl(rawUrl);
        if (normalized == null) {
            showSettingsPanel("请输入以 http:// 或 https:// 开头的服务地址。", true);
            return;
        }
        hideKeyboard();
        urlInput.setText(normalized);
        if (!isNetworkAvailable()) {
            showSettingsPanel("当前设备没有可用网络。网络恢复后可重新加载。", false);
        }
        preferences.edit().putString(PREF_SERVER_URL, normalized).apply();
        webView.loadUrl(normalized);
    }

    private String normalizeUrl(String rawUrl) {
        if (rawUrl == null) return null;
        String trimmed = rawUrl.trim();
        if (trimmed.isEmpty()) return null;
        if (!trimmed.contains("://")) {
            trimmed = "http://" + trimmed;
        }
        Uri uri = Uri.parse(trimmed);
        if (!isHttpUrl(uri) || uri.getHost() == null) return null;
        return uri.toString();
    }

    private boolean isHttpUrl(Uri uri) {
        if (uri == null) return false;
        String scheme = uri.getScheme();
        return "http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme);
    }

    private boolean isNetworkAvailable() {
        ConnectivityManager connectivityManager = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        if (connectivityManager == null) return true;
        Network network = connectivityManager.getActiveNetwork();
        if (network == null) return false;
        NetworkCapabilities capabilities = connectivityManager.getNetworkCapabilities(network);
        return capabilities != null && capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET);
    }

    private void showSettingsPanel(String message, boolean allowHide) {
        panelMessage.setText(message);
        settingsPanel.setVisibility(View.VISIBLE);
        settingsPanel.bringToFront();
        urlInput.requestFocus();
        if (!allowHide) {
            Toast.makeText(this, "请确认 music 后端地址可访问", Toast.LENGTH_SHORT).show();
        }
    }

    private void openExternal(Uri uri) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (ActivityNotFoundException ignored) {
            Toast.makeText(this, "无法打开外部链接", Toast.LENGTH_SHORT).show();
        }
    }

    private void hideKeyboard() {
        InputMethodManager imm = (InputMethodManager) getSystemService(Context.INPUT_METHOD_SERVICE);
        if (imm != null) {
            imm.hideSoftInputFromWindow(urlInput.getWindowToken(), 0);
        }
    }

    private void registerBackNavigationCallback() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                    OnBackInvokedDispatcher.PRIORITY_DEFAULT,
                    this::handleBackNavigation
            );
        }
    }

    private void handleBackNavigation() {
        if (settingsPanel.getVisibility() == View.VISIBLE) {
            settingsPanel.setVisibility(View.GONE);
        } else if (webView.canGoBack()) {
            webView.goBack();
        } else {
            finish();
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) {
            webView.onResume();
            webView.resumeTimers();
            forceWebViewRedrawAfterResume();
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) forceWebViewRedrawAfterResume();
    }

    private void forceWebViewRedrawAfterResume() {
        if (webView == null) return;
        webView.postDelayed(this::forceWebViewRedrawNow, 120);
        webView.postDelayed(this::forceWebViewRedrawNow, 700);
    }

    private void forceWebViewRedrawNow() {
        if (webView == null) return;
        webView.setVisibility(View.INVISIBLE);
        webView.postDelayed(this::finishWebViewRedrawNow, 32);
    }

    private void finishWebViewRedrawNow() {
        if (webView == null) return;
        webView.setVisibility(View.VISIBLE);
        webView.requestLayout();
        webView.invalidate();
        webView.evaluateJavascript(
                "window.dispatchEvent(new Event('resize'));document.documentElement&&document.documentElement.getBoundingClientRect();",
                null
        );
    }

    @SuppressLint("GestureBackNavigation")
    @Override
    public void onBackPressed() {
        handleBackNavigation();
    }

    @Override
    protected void onDestroy() {
        if (mediaCommandReceiver != null) {
            try {
                unregisterReceiver(mediaCommandReceiver);
            } catch (IllegalArgumentException ignored) {
            }
            mediaCommandReceiver = null;
        }
        if (webView != null) {
            webView.destroy();
        }
        stopService(new Intent(this, MusicPlaybackService.class));
        if (localServer != null) {
            localServer.stop();
            localServer = null;
        }
        super.onDestroy();
    }

    private LinearLayout.LayoutParams matchWrap() {
        return new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        );
    }

    private LinearLayout.LayoutParams buttonParams() {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        );
        params.setMargins(dp(6), 0, 0, 0);
        return params;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private final class MusicAndroidBridge {
        @JavascriptInterface
        public void updatePlayback(String playbackState, String title, String artist) {
            runOnUiThread(() -> updatePlaybackService(playbackState, title, artist));
        }
    }
}
