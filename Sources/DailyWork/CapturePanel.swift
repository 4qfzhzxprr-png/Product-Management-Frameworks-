import AppKit
import SwiftUI

/// A floating panel that takes keyboard input without bringing the app forward,
/// so a capture does not pull David out of what he was doing.
private final class FloatingPanel: NSPanel {
    init() {
        super.init(
            contentRect: NSRect(x: 0, y: 0, width: 560, height: 230),
            styleMask: [.titled, .closable, .fullSizeContentView, .nonactivatingPanel],
            backing: .buffered,
            defer: false
        )
        isFloatingPanel = true
        level = .floating
        titleVisibility = .hidden
        titlebarAppearsTransparent = true
        isMovableByWindowBackground = true
        hidesOnDeactivate = false
        isReleasedWhenClosed = false
        collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        standardWindowButton(.miniaturizeButton)?.isHidden = true
        standardWindowButton(.zoomButton)?.isHidden = true
    }

    override var canBecomeKey: Bool { true }

    /// Escape closes the panel.
    override func cancelOperation(_ sender: Any?) {
        close()
    }
}

@MainActor
final class CapturePanelController {
    static let shared = CapturePanelController()

    private let panel = FloatingPanel()

    private init() {}

    func toggle() {
        if panel.isVisible {
            panel.close()
        } else {
            show()
        }
    }

    func show() {
        // A fresh view each time, so the form starts empty.
        let view = CaptureView(onDone: { [weak self] in self?.panel.close() })
            .environmentObject(AppState.shared)
        panel.contentView = NSHostingView(rootView: view)
        panel.center()
        panel.makeKeyAndOrderFront(nil)
    }
}
