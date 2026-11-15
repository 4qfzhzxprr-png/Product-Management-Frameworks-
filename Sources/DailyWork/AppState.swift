import DailyWorkCore
import Foundation

enum SidebarItem: Hashable {
    case all
    case open
    case wins
    case person(Int64)
    case project(Int64)
}

/// The app's single source of truth, backed by the local database.
@MainActor
final class AppState: ObservableObject {
    static let shared = AppState()

    @Published private(set) var people: [Person] = []
    @Published private(set) var projects: [Project] = []
    /// Open commitments and asks of David; shown in the menu bar.
    @Published private(set) var waitingOnMe = 0
    /// Bumps on every change so views re-query.
    @Published private(set) var revision = 0
    @Published var lastError: String?

    private let store: CaptureStore

    private init() {
        var startupError: String?
        do {
            store = try CaptureStore(path: try Self.databasePath())
        } catch {
            startupError = "Could not open the local database, so nothing will be saved this session. \(error)"
            // An in-memory database cannot fail to open.
            store = try! CaptureStore(path: ":memory:")
        }
        lastError = startupError
        reload()
    }

    /// ~/Library/Application Support/DailyWork/dailywork.sqlite
    private static func databasePath() throws -> String {
        let support = try FileManager.default.url(
            for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true
        )
        let folder = support.appendingPathComponent("DailyWork", isDirectory: true)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        return folder.appendingPathComponent("dailywork.sqlite").path
    }

    // MARK: Reading

    func captures(for item: SidebarItem, search: String) -> [Capture] {
        var filter = CaptureFilter(search: search)
        switch item {
        case .all: break
        case .open: filter.openOnly = true
        case .wins: filter.winsOnly = true
        case .person(let id): filter.personID = id
        case .project(let id): filter.projectID = id
        }
        do {
            return try store.captures(filter)
        } catch {
            lastError = "\(error)"
            return []
        }
    }

    func personName(_ id: Int64?) -> String? {
        guard let id else { return nil }
        return people.first { $0.id == id }?.name
    }

    func projectName(_ id: Int64?) -> String? {
        guard let id else { return nil }
        return projects.first { $0.id == id }?.name
    }

    // MARK: Writing

    /// Returns false when the capture could not be saved.
    @discardableResult
    func addCapture(body: String, kind: CaptureKind, personID: Int64?, projectID: Int64?, isWin: Bool) -> Bool {
        change {
            try store.addCapture(body: body, kind: kind, personID: personID, projectID: projectID, isWin: isWin)
        }
    }

    func setDone(_ capture: Capture, _ done: Bool) {
        change { try store.setCapture(capture.id, done: done) }
    }

    func setWin(_ capture: Capture, _ isWin: Bool) {
        change { try store.setCapture(capture.id, isWin: isWin) }
    }

    func delete(_ capture: Capture) {
        change { try store.deleteCapture(capture.id) }
    }

    func addPerson(name: String, isPM: Bool) {
        change { try store.addPerson(name: name, isPM: isPM) }
    }

    func setPM(_ person: Person, _ isPM: Bool) {
        change { try store.setPerson(person.id, isPM: isPM) }
    }

    func delete(_ person: Person) {
        change { try store.deletePerson(person.id) }
    }

    func addProject(name: String) {
        change { try store.addProject(name: name) }
    }

    func delete(_ project: Project) {
        change { try store.deleteProject(project.id) }
    }

    @discardableResult
    private func change(_ work: () throws -> Void) -> Bool {
        do {
            try work()
            reload()
            return true
        } catch {
            lastError = "\(error)"
            return false
        }
    }

    private func reload() {
        do {
            people = try store.people()
            projects = try store.projects()
            waitingOnMe = try store.waitingOnMeCount()
            revision += 1
        } catch {
            lastError = "\(error)"
        }
    }
}
