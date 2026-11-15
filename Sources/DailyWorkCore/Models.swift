import Foundation

/// What a quick capture is. The actionable kinds can be marked done.
public enum CaptureKind: String, CaseIterable, Sendable {
    case note
    case thought
    /// Something David promised to do.
    case commitment
    /// Someone asked David for something.
    case askOfMe = "ask_of_me"
    /// David asked someone for something.
    case askOfThem = "ask_of_them"
    /// A note from a 1:1.
    case oneOnOne = "one_on_one"

    public var label: String {
        switch self {
        case .note: return "Note"
        case .thought: return "Thought"
        case .commitment: return "My commitment"
        case .askOfMe: return "Ask of me"
        case .askOfThem: return "Ask of them"
        case .oneOnOne: return "1:1 note"
        }
    }

    /// Can be open or done.
    public var isActionable: Bool {
        switch self {
        case .commitment, .askOfMe, .askOfThem: return true
        case .note, .thought, .oneOnOne: return false
        }
    }

    /// Counts toward the menu bar number while open.
    public var waitsOnMe: Bool {
        self == .commitment || self == .askOfMe
    }
}

public struct Person: Identifiable, Hashable, Sendable {
    public let id: Int64
    public var name: String
    /// A product manager on David's team; gets a card on the team board.
    public var isPM: Bool
}

public struct Project: Identifiable, Hashable, Sendable {
    public let id: Int64
    public var name: String
}

public struct Capture: Identifiable, Hashable, Sendable {
    public let id: Int64
    public var createdAt: Date
    public var kind: CaptureKind
    public var body: String
    public var personID: Int64?
    public var projectID: Int64?
    /// Seeds the Phase 4 narrative bank.
    public var isWin: Bool
    public var doneAt: Date?

    public var isOpen: Bool { kind.isActionable && doneAt == nil }
}

public struct CaptureFilter: Sendable {
    public var personID: Int64?
    public var projectID: Int64?
    public var winsOnly = false
    /// Actionable captures not yet done.
    public var openOnly = false
    /// Open commitments and asks of David.
    public var waitingOnMeOnly = false
    public var search: String?
    public var limit = 500

    public init(
        personID: Int64? = nil,
        projectID: Int64? = nil,
        winsOnly: Bool = false,
        openOnly: Bool = false,
        waitingOnMeOnly: Bool = false,
        search: String? = nil,
        limit: Int = 500
    ) {
        self.personID = personID
        self.projectID = projectID
        self.winsOnly = winsOnly
        self.openOnly = openOnly
        self.waitingOnMeOnly = waitingOnMeOnly
        self.search = search
        self.limit = limit
    }
}
