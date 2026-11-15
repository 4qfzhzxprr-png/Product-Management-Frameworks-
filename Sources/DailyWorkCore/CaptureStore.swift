import Foundation

/// Local storage for people, projects and quick captures.
public final class CaptureStore {
    private let db: Database

    public init(path: String) throws {
        db = try Database(path: path)
        try migrate()
    }

    private func migrate() throws {
        let version = try db.query("PRAGMA user_version").first?["user_version"]?.intValue ?? 0
        if version < 1 {
            try db.executeScript("""
                BEGIN;
                CREATE TABLE people (
                    id INTEGER PRIMARY KEY,
                    name TEXT NOT NULL UNIQUE COLLATE NOCASE,
                    is_pm INTEGER NOT NULL DEFAULT 0
                );
                CREATE TABLE projects (
                    id INTEGER PRIMARY KEY,
                    name TEXT NOT NULL UNIQUE COLLATE NOCASE
                );
                CREATE TABLE captures (
                    id INTEGER PRIMARY KEY,
                    created_at REAL NOT NULL,
                    kind TEXT NOT NULL,
                    body TEXT NOT NULL,
                    person_id INTEGER REFERENCES people(id) ON DELETE SET NULL,
                    project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
                    is_win INTEGER NOT NULL DEFAULT 0,
                    done_at REAL
                );
                CREATE INDEX captures_created ON captures(created_at DESC);
                CREATE INDEX captures_person ON captures(person_id);
                CREATE INDEX captures_project ON captures(project_id);
                PRAGMA user_version = 1;
                COMMIT;
                """)
        }
    }

    // MARK: People

    public func people() throws -> [Person] {
        try db.query("SELECT id, name, is_pm FROM people ORDER BY is_pm DESC, name COLLATE NOCASE").map(Self.person)
    }

    /// Returns the existing person when the name is already taken (case-insensitive).
    @discardableResult
    public func addPerson(name: String, isPM: Bool = false) throws -> Person {
        let trimmed = try Self.cleanName(name)
        if let row = try db.query("SELECT id, name, is_pm FROM people WHERE name = ?", [.text(trimmed)]).first {
            return Self.person(row)
        }
        try db.query("INSERT INTO people (name, is_pm) VALUES (?, ?)", [.text(trimmed), .int(isPM ? 1 : 0)])
        return Person(id: db.lastInsertRowID, name: trimmed, isPM: isPM)
    }

    public func setPerson(_ id: Int64, isPM: Bool) throws {
        try db.query("UPDATE people SET is_pm = ? WHERE id = ?", [.int(isPM ? 1 : 0), .int(id)])
    }

    /// Their captures are kept, with no person attached.
    public func deletePerson(_ id: Int64) throws {
        try db.query("DELETE FROM people WHERE id = ?", [.int(id)])
    }

    // MARK: Projects

    public func projects() throws -> [Project] {
        try db.query("SELECT id, name FROM projects ORDER BY name COLLATE NOCASE").map(Self.project)
    }

    /// Returns the existing project when the name is already taken (case-insensitive).
    @discardableResult
    public func addProject(name: String) throws -> Project {
        let trimmed = try Self.cleanName(name)
        if let row = try db.query("SELECT id, name FROM projects WHERE name = ?", [.text(trimmed)]).first {
            return Self.project(row)
        }
        try db.query("INSERT INTO projects (name) VALUES (?)", [.text(trimmed)])
        return Project(id: db.lastInsertRowID, name: trimmed)
    }

    /// Its captures are kept, with no project attached.
    public func deleteProject(_ id: Int64) throws {
        try db.query("DELETE FROM projects WHERE id = ?", [.int(id)])
    }

    // MARK: Captures

    @discardableResult
    public func addCapture(
        body: String,
        kind: CaptureKind = .note,
        personID: Int64? = nil,
        projectID: Int64? = nil,
        isWin: Bool = false,
        at date: Date = Date()
    ) throws -> Capture {
        let trimmed = body.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { throw DatabaseError(message: "A capture needs some text.") }
        try db.query(
            "INSERT INTO captures (created_at, kind, body, person_id, project_id, is_win) VALUES (?, ?, ?, ?, ?, ?)",
            [
                .real(date.timeIntervalSince1970),
                .text(kind.rawValue),
                .text(trimmed),
                personID.map(SQLValue.int) ?? .null,
                projectID.map(SQLValue.int) ?? .null,
                .int(isWin ? 1 : 0),
            ]
        )
        return Capture(
            id: db.lastInsertRowID, createdAt: date, kind: kind, body: trimmed,
            personID: personID, projectID: projectID, isWin: isWin, doneAt: nil
        )
    }

    /// Newest first.
    public func captures(_ filter: CaptureFilter = CaptureFilter()) throws -> [Capture] {
        let (clause, params) = Self.whereClause(filter)
        let sql = """
            SELECT id, created_at, kind, body, person_id, project_id, is_win, done_at
            FROM captures \(clause)
            ORDER BY created_at DESC, id DESC LIMIT ?
            """
        return try db.query(sql, params + [.int(Int64(filter.limit))]).compactMap(Self.capture)
    }

    /// Open commitments and asks of David: the menu bar number until the decision queue exists.
    public func waitingOnMeCount() throws -> Int {
        let (clause, params) = Self.whereClause(CaptureFilter(waitingOnMeOnly: true))
        let row = try db.query("SELECT COUNT(*) AS n FROM captures \(clause)", params).first
        return Int(row?["n"]?.intValue ?? 0)
    }

    public func setCapture(_ id: Int64, done: Bool, at date: Date = Date()) throws {
        try db.query(
            "UPDATE captures SET done_at = ? WHERE id = ?",
            [done ? .real(date.timeIntervalSince1970) : .null, .int(id)]
        )
    }

    public func setCapture(_ id: Int64, isWin: Bool) throws {
        try db.query("UPDATE captures SET is_win = ? WHERE id = ?", [.int(isWin ? 1 : 0), .int(id)])
    }

    public func deleteCapture(_ id: Int64) throws {
        try db.query("DELETE FROM captures WHERE id = ?", [.int(id)])
    }

    // MARK: Helpers

    private static func whereClause(_ filter: CaptureFilter) -> (String, [SQLValue]) {
        var conditions: [String] = []
        var params: [SQLValue] = []

        if let personID = filter.personID {
            conditions.append("person_id = ?")
            params.append(.int(personID))
        }
        if let projectID = filter.projectID {
            conditions.append("project_id = ?")
            params.append(.int(projectID))
        }
        if filter.winsOnly {
            conditions.append("is_win = 1")
        }
        if filter.openOnly || filter.waitingOnMeOnly {
            let kinds = CaptureKind.allCases.filter { filter.waitingOnMeOnly ? $0.waitsOnMe : $0.isActionable }
            let placeholders = Array(repeating: "?", count: kinds.count).joined(separator: ", ")
            conditions.append("done_at IS NULL AND kind IN (\(placeholders))")
            params.append(contentsOf: kinds.map { SQLValue.text($0.rawValue) })
        }
        if let search = filter.search?.trimmingCharacters(in: .whitespacesAndNewlines), !search.isEmpty {
            let escaped = search
                .replacingOccurrences(of: "\\", with: "\\\\")
                .replacingOccurrences(of: "%", with: "\\%")
                .replacingOccurrences(of: "_", with: "\\_")
            conditions.append("body LIKE ? ESCAPE '\\'")
            params.append(.text("%\(escaped)%"))
        }

        let clause = conditions.isEmpty ? "" : "WHERE " + conditions.joined(separator: " AND ")
        return (clause, params)
    }

    private static func cleanName(_ name: String) throws -> String {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { throw DatabaseError(message: "A name can't be empty.") }
        return trimmed
    }

    private static func person(_ row: [String: SQLValue]) -> Person {
        Person(
            id: row["id"]?.intValue ?? 0,
            name: row["name"]?.textValue ?? "",
            isPM: row["is_pm"]?.intValue == 1
        )
    }

    private static func project(_ row: [String: SQLValue]) -> Project {
        Project(id: row["id"]?.intValue ?? 0, name: row["name"]?.textValue ?? "")
    }

    private static func capture(_ row: [String: SQLValue]) -> Capture? {
        guard
            let id = row["id"]?.intValue,
            let createdAt = row["created_at"]?.doubleValue,
            let kind = row["kind"]?.textValue.flatMap(CaptureKind.init(rawValue:))
        else { return nil }
        return Capture(
            id: id,
            createdAt: Date(timeIntervalSince1970: createdAt),
            kind: kind,
            body: row["body"]?.textValue ?? "",
            personID: row["person_id"]?.intValue,
            projectID: row["project_id"]?.intValue,
            isWin: row["is_win"]?.intValue == 1,
            doneAt: row["done_at"]?.doubleValue.map(Date.init(timeIntervalSince1970:))
        )
    }
}
