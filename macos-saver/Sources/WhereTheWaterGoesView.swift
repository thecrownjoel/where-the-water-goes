// Native macOS screensaver (.saver) for Where the Water Goes.
//
// A ScreenSaverView hosting a WKWebView that runs the same web build as the desktop app.
// The web files are bundled inside the .saver and served through a custom URL scheme
// (wtrshd://app/...) rather than file:// URLs, so fetch() of bundled data works and the page
// has a stable origin for CORS requests to USGS and CoCoRaHS. Nothing is downloaded and
// executed: only the bundled files are served, and the Content-Security-Policy limits network
// access to the USGS API and the CoCoRaHS export, matching the Tauri build.
//
// Spike status: builds with the Command Line Tools (no Xcode) and renders in the test harness.
// Not yet signed or notarized, and not yet run inside System Settings on every macOS version.

import ScreenSaver
import WebKit

/// Same policy as src-tauri/tauri.conf.json, minus the Tauri IPC origins.
private let contentSecurityPolicy = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "connect-src 'self' https://api.waterdata.usgs.gov https://data.cocorahs.org",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
].joined(separator: "; ")

private let mimeTypes: [String: String] = [
    "html": "text/html; charset=utf-8",
    "js": "text/javascript; charset=utf-8",
    "css": "text/css; charset=utf-8",
    "json": "application/json",
    "svg": "image/svg+xml",
    "png": "image/png",
    "bin": "application/octet-stream",
    "woff2": "font/woff2",
]

/// Serves files from the bundle's `web` directory, and nothing outside it.
final class BundleSchemeHandler: NSObject, WKURLSchemeHandler {
    static let scheme = "wtrshd"
    private let root: URL

    init(root: URL) {
        self.root = root.standardizedFileURL
    }

    /// Resolve a request URL to a file under `root`, or nil (wrong host, traversal, missing).
    func resolve(_ url: URL) -> URL? {
        guard url.scheme == Self.scheme, url.host == "app" else { return nil }
        var path = url.path
        if path.isEmpty || path == "/" { path = "/index.html" }
        let file = root.appendingPathComponent(String(path.dropFirst())).standardizedFileURL
        guard file.path.hasPrefix(root.path + "/") else { return nil }
        return file
    }

    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        guard let url = task.request.url,
              let file = resolve(url),
              let data = try? Data(contentsOf: file)
        else {
            task.didFailWithError(URLError(.fileDoesNotExist))
            return
        }
        let headers = [
            "Content-Type": mimeTypes[file.pathExtension.lowercased()] ?? "application/octet-stream",
            "Content-Length": String(data.count),
            "Content-Security-Policy": contentSecurityPolicy,
            "Cache-Control": "no-cache",
        ]
        guard let response = HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: headers) else {
            task.didFailWithError(URLError(.badServerResponse))
            return
        }
        task.didReceive(response)
        task.didReceive(data)
        task.didFinish()
    }

    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}
}

/// The screensaver host dismisses the saver on input; the web view must never take it.
final class PassthroughWebView: WKWebView {
    override func hitTest(_ point: NSPoint) -> NSView? { nil }
    override var acceptsFirstResponder: Bool { false }
}

@objc(WhereTheWaterGoesView)
public final class WhereTheWaterGoesView: ScreenSaverView {
    private var webView: WKWebView?
    private var schemeHandler: BundleSchemeHandler?
    private var stopObserver: NSObjectProtocol?

    public override init?(frame: NSRect, isPreview: Bool) {
        super.init(frame: frame, isPreview: isPreview)
        wantsLayer = true
        layer?.backgroundColor = NSColor.black.cgColor
        // The web view drives its own frames; animateOneFrame only needs to tick rarely.
        animationTimeInterval = 1.0

        // macOS 14+ runs savers in legacyScreenSaver, which (as widely reported, and not
        // documented by Apple) keeps the process alive after the saver is dismissed, so the
        // WebGL page would keep rendering behind the desktop. Exit when the system says the
        // screensaver stopped. Not applied to the small System Settings preview.
        if !isPreview {
            stopObserver = DistributedNotificationCenter.default().addObserver(
                forName: NSNotification.Name("com.apple.screensaver.willstop"),
                object: nil, queue: .main
            ) { _ in exit(0) }
        }
    }

    public required init?(coder: NSCoder) {
        super.init(coder: coder)
    }

    deinit {
        if let o = stopObserver { DistributedNotificationCenter.default().removeObserver(o) }
    }

    public override var hasConfigureSheet: Bool { false }
    public override var configureSheet: NSWindow? { nil }

    public override func startAnimation() {
        super.startAnimation()
        if webView == nil { makeWebView() }
    }

    /// Tear the page down when the host stops the saver, so WebGL never keeps rendering behind
    /// the desktop if the process lingers (and the willstop notification never comes).
    public override func stopAnimation() {
        super.stopAnimation()
        webView?.removeFromSuperview()
        webView = nil
        schemeHandler = nil
    }

    public override func animateOneFrame() {}

    private func makeWebView() {
        guard let resources = Bundle(for: WhereTheWaterGoesView.self).resourceURL else { return }
        let handler = BundleSchemeHandler(root: resources.appendingPathComponent("web"))
        let config = WKWebViewConfiguration()
        config.setURLSchemeHandler(handler, forURLScheme: BundleSchemeHandler.scheme)
        config.suppressesIncrementalRendering = true
        let web = PassthroughWebView(frame: bounds, configuration: config)
        web.autoresizingMask = [.width, .height]
        web.setValue(false, forKey: "drawsBackground")
        addSubview(web)
        webView = web
        schemeHandler = handler
        // The preview pane is tiny; the page picks its own quality from the window size.
        let query = isPreview ? "mode=saver&host=macos-saver&preview=1" : "mode=saver&host=macos-saver"
        if let url = URL(string: "\(BundleSchemeHandler.scheme)://app/index.html?\(query)") {
            web.load(URLRequest(url: url))
        }
    }
}
