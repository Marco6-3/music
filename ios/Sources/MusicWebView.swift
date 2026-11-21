import AVFoundation
import SwiftUI
import WebKit

struct MusicWebView: UIViewRepresentable {
    let origin: URL

    func makeCoordinator() -> Coordinator {
        Coordinator(origin: origin)
    }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.allowsInlineMediaPlayback = true
        configuration.limitsNavigationsToAppBoundDomains = true
        configuration.userContentController.addUserScript(WKUserScript(
            // Use the existing standalone player layout and media controls.
            source: "Object.defineProperty(navigator, 'standalone', { value: true });",
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        ))

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator
        webView.isOpaque = false
        webView.backgroundColor = UIColor(red: 0.03, green: 0.06, blue: 0.07, alpha: 1)
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        // WebKit activates the audio session when playback starts.
        try? AVAudioSession.sharedInstance().setCategory(.playback)
        webView.load(URLRequest(url: origin))
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {}

    final class Coordinator: NSObject, WKNavigationDelegate {
        let origin: URL

        init(origin: URL) {
            self.origin = origin
        }

        func webView(
            _ webView: WKWebView,
            decidePolicyFor action: WKNavigationAction,
            decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
        ) {
            guard action.targetFrame?.isMainFrame != false,
                  let url = action.request.url else {
                decisionHandler(.allow)
                return
            }

            if isMusicOrigin(url) || url.absoluteString == "about:blank" {
                if action.targetFrame == nil {
                    decisionHandler(.cancel)
                    webView.load(action.request)
                } else {
                    decisionHandler(.allow)
                }
                return
            }

            decisionHandler(.cancel)
            if action.navigationType == .linkActivated,
               url.scheme == "https" || url.scheme == "http" {
                UIApplication.shared.open(url)
            }
        }

        func webView(
            _ webView: WKWebView,
            decidePolicyFor response: WKNavigationResponse,
            decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void
        ) {
            if response.isForMainFrame,
               let http = response.response as? HTTPURLResponse,
               !isMusicOrigin(http.url) || http.statusCode >= 400 {
                decisionHandler(.cancel)
                showLoadError(in: webView)
                return
            }
            decisionHandler(.allow)
        }

        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
            handleLoadError(error, in: webView)
        }

        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
            handleLoadError(error, in: webView)
        }

        func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
            webView.load(URLRequest(url: origin))
        }

        private func handleLoadError(_ error: Error, in webView: WKWebView) {
            let failure = error as NSError
            if failure.domain == NSURLErrorDomain, failure.code == NSURLErrorCancelled { return }
            showLoadError(in: webView)
        }

        private func isMusicOrigin(_ url: URL?) -> Bool {
            guard let url else { return false }
            return url.scheme == "https"
                && url.host?.lowercased() == origin.host?.lowercased()
                && (url.port ?? 443) == (origin.port ?? 443)
                && url.user == nil && url.password == nil
        }

        private func showLoadError(in webView: WKWebView) {
            webView.loadHTMLString("""
            <!doctype html>
            <html lang="zh-CN"><meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <meta name="color-scheme" content="dark">
            <style>
            body { font: 17px system-ui; margin: 0; min-height: 100vh; display: grid;
                   place-items: center; background: #081013; color: #fff; text-align: center; }
            main { padding: 24px; }
            a { color: #fff; background: #b92242; padding: 12px 22px; border-radius: 8px;
                display: inline-block; text-decoration: none; }
            </style>
            <main><h1>音乐服务暂时无法连接</h1>
            <p>检查网络连接后重试。</p><a href="\(origin.absoluteString)">重新连接</a></main>
            </html>
            """, baseURL: nil)
        }
    }
}
