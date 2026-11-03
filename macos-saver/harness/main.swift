// Test harness for the .saver bundle: loads it the way the screensaver host does (NSBundle
// principal class), shows the view in a window, waits, then reports the page status and
// writes a PNG snapshot of the web view. Lets the saver be checked without installing it.
//
// usage: saver-harness <path.saver> <out.png> [seconds] [--preview]

import AppKit
import ScreenSaver
import WebKit

let args = CommandLine.arguments
guard args.count >= 3 else {
    FileHandle.standardError.write("usage: saver-harness <path.saver> <out.png> [seconds] [--preview]\n".data(using: .utf8)!)
    exit(2)
}
let seconds = args.count > 3 ? Double(args[3]) ?? 12 : 12
let preview = args.contains("--preview")

let app = NSApplication.shared
app.setActivationPolicy(.regular)

guard let bundle = Bundle(path: args[1]), bundle.load(),
      let cls = bundle.principalClass as? ScreenSaverView.Type
else {
    print("FAIL: could not load principal class from \(args[1])")
    exit(1)
}
print("loaded principal class: \(NSStringFromClass(cls))")

let size = preview ? NSSize(width: 296, height: 184) : NSSize(width: 1280, height: 800)
let window = NSWindow(contentRect: NSRect(origin: .init(x: 80, y: 80), size: size),
                      styleMask: [.titled], backing: .buffered, defer: false)
window.title = "saver-harness"
guard let view = cls.init(frame: NSRect(origin: .zero, size: size), isPreview: preview) else {
    print("FAIL: init returned nil")
    exit(1)
}
view.autoresizingMask = [.width, .height]
window.contentView = view
window.makeKeyAndOrderFront(nil)
app.activate(ignoringOtherApps: true)
view.startAnimation()

func findWebView(_ v: NSView) -> WKWebView? {
    if let w = v as? WKWebView { return w }
    for s in v.subviews { if let w = findWebView(s) { return w } }
    return nil
}

let probe = """
JSON.stringify({
  href: location.href,
  status: document.querySelector('#status')?.textContent?.replace(/\\s+/g,' ').trim(),
  layers: document.querySelector('#status-layers')?.textContent?.replace(/\\s+/g,' ').trim(),
  fatal: document.querySelector('#fatal')?.hidden === false ? document.querySelector('#fatal').textContent : null,
  canvas: !!document.querySelector('#globe'),
  webgl2: !!document.createElement('canvas').getContext('webgl2'),
  hidden: document.hidden,
})
"""

DispatchQueue.main.asyncAfter(deadline: .now() + seconds) {
    guard let web = findWebView(view) else {
        print("FAIL: no WKWebView in the saver view")
        exit(1)
    }
    web.evaluateJavaScript(probe) { result, error in
        print("page: \(result ?? "nil") \(error.map { "error: \($0)" } ?? "")")
        web.takeSnapshot(with: nil) { image, error in
            guard let image, let tiff = image.tiffRepresentation,
                  let png = NSBitmapImageRep(data: tiff)?.representation(using: .png, properties: [:])
            else {
                print("FAIL: snapshot \(String(describing: error))")
                exit(1)
            }
            try? png.write(to: URL(fileURLWithPath: args[2]))
            print("snapshot: \(args[2])")
            view.stopAnimation()
            exit(0)
        }
    }
}
app.run()
