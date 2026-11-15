// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "DailyWork",
    platforms: [.macOS(.v13)],
    products: [
        .executable(name: "DailyWork", targets: ["DailyWork"]),
        .library(name: "DailyWorkCore", targets: ["DailyWorkCore"]),
    ],
    targets: [
        // Models and local storage. No UI, no network.
        .target(name: "DailyWorkCore", linkerSettings: [.linkedLibrary("sqlite3")]),
        // The menu bar app, main window and quick capture panel.
        .executableTarget(name: "DailyWork", dependencies: ["DailyWorkCore"]),
        .testTarget(name: "DailyWorkCoreTests", dependencies: ["DailyWorkCore"]),
    ]
)
