import AppKit
import Carbon.HIToolbox
import SwiftUI

@main
struct DailyWorkApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @StateObject private var state = AppState.shared

    var body: some Scene {
        Window("Daily Work", id: "main") {
            MainView()
                .environmentObject(state)
        }

        MenuBarExtra {
            MenuBarMenu()
                .environmentObject(state)
        } label: {
            Image(systemName: "tray.full")
            if state.waitingOnMe > 0 {
                Text("\(state.waitingOnMe)")
            }
        }
    }
}

private struct MenuBarMenu: View {
    @EnvironmentObject private var state: AppState
    @Environment(\.openWindow) private var openWindow

    var body: some View {
        Text(state.waitingOnMe == 1 ? "1 item waiting on you" : "\(state.waitingOnMe) items waiting on you")

        Divider()

        Button("Quick Capture") {
            CapturePanelController.shared.show()
        }
        Button("Open Daily Work") {
            openWindow(id: "main")
            NSApp.activate(ignoringOtherApps: true)
        }

        Divider()

        Button("Quit Daily Work") {
            NSApp.terminate(nil)
        }
        .keyboardShortcut("q")
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    private var captureHotKey: HotKey?

    func applicationDidFinishLaunching(_ notification: Notification) {
        // Needed when launched with `swift run`, where there is no app bundle.
        NSApp.setActivationPolicy(.regular)

        // Control-Option-Space.
        captureHotKey = HotKey(keyCode: kVK_Space, modifiers: controlKey | optionKey) {
            CapturePanelController.shared.toggle()
        }
        if captureHotKey == nil {
            AppState.shared.lastError =
                "Control-Option-Space is taken by another app, so the capture shortcut is off. "
                + "Quick capture still works from the menu bar."
        }
    }

    /// Closing the main window leaves the menu bar item and shortcut running.
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        false
    }
}
