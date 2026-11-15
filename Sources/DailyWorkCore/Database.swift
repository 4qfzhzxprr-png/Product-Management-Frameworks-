import Foundation
import SQLite3

public struct DatabaseError: Error, CustomStringConvertible {
    public let message: String
    public var description: String { message }
}

public enum SQLValue: Equatable {
    case null
    case int(Int64)
    case real(Double)
    case text(String)

    public var intValue: Int64? {
        if case .int(let v) = self { return v }
        return nil
    }

    public var doubleValue: Double? {
        switch self {
        case .real(let v): return v
        case .int(let v): return Double(v)
        default: return nil
        }
    }

    public var textValue: String? {
        if case .text(let v) = self { return v }
        return nil
    }
}

private let sqliteTransient = unsafeBitCast(-1, to: sqlite3_destructor_type.self)

/// A thin wrapper over the system SQLite. Use from one thread.
public final class Database {
    private var handle: OpaquePointer?

    /// Pass ":memory:" for a throwaway database.
    public init(path: String) throws {
        let flags = SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE | SQLITE_OPEN_FULLMUTEX
        guard sqlite3_open_v2(path, &handle, flags, nil) == SQLITE_OK else {
            let message = handle.flatMap { sqlite3_errmsg($0) }.map { String(cString: $0) } ?? "unknown error"
            sqlite3_close(handle)
            handle = nil
            throw DatabaseError(message: "Could not open database at \(path): \(message)")
        }
        try query("PRAGMA journal_mode = WAL")
        try query("PRAGMA foreign_keys = ON")
    }

    deinit {
        sqlite3_close(handle)
    }

    public var lastInsertRowID: Int64 {
        sqlite3_last_insert_rowid(handle)
    }

    /// Runs one or more statements that take no parameters and return nothing.
    public func executeScript(_ sql: String) throws {
        guard sqlite3_exec(handle, sql, nil, nil, nil) == SQLITE_OK else {
            throw lastError(sql)
        }
    }

    /// Runs one statement and returns its rows keyed by column name.
    @discardableResult
    public func query(_ sql: String, _ params: [SQLValue] = []) throws -> [[String: SQLValue]] {
        var stmt: OpaquePointer?
        guard sqlite3_prepare_v2(handle, sql, -1, &stmt, nil) == SQLITE_OK else {
            throw lastError(sql)
        }
        defer { sqlite3_finalize(stmt) }

        for (offset, param) in params.enumerated() {
            let index = Int32(offset + 1)
            let rc: Int32
            switch param {
            case .null: rc = sqlite3_bind_null(stmt, index)
            case .int(let v): rc = sqlite3_bind_int64(stmt, index, v)
            case .real(let v): rc = sqlite3_bind_double(stmt, index, v)
            case .text(let v): rc = sqlite3_bind_text(stmt, index, v, -1, sqliteTransient)
            }
            guard rc == SQLITE_OK else { throw lastError(sql) }
        }

        var rows: [[String: SQLValue]] = []
        while true {
            let rc = sqlite3_step(stmt)
            if rc == SQLITE_DONE { break }
            guard rc == SQLITE_ROW else { throw lastError(sql) }

            var row: [String: SQLValue] = [:]
            for column in 0..<sqlite3_column_count(stmt) {
                guard let rawName = sqlite3_column_name(stmt, column) else { continue }
                let name = String(cString: rawName)
                switch sqlite3_column_type(stmt, column) {
                case SQLITE_INTEGER:
                    row[name] = .int(sqlite3_column_int64(stmt, column))
                case SQLITE_FLOAT:
                    row[name] = .real(sqlite3_column_double(stmt, column))
                case SQLITE_TEXT:
                    let text = sqlite3_column_text(stmt, column).map { String(cString: $0) } ?? ""
                    row[name] = .text(text)
                default:
                    row[name] = .null
                }
            }
            rows.append(row)
        }
        return rows
    }

    private func lastError(_ sql: String) -> DatabaseError {
        let message = sqlite3_errmsg(handle).map { String(cString: $0) } ?? "unknown error"
        return DatabaseError(message: "\(message) (in: \(sql))")
    }
}
