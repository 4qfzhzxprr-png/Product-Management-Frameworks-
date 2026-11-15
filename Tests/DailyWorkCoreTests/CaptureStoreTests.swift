import XCTest
@testable import DailyWorkCore

final class CaptureStoreTests: XCTestCase {
    private func makeStore() throws -> CaptureStore {
        try CaptureStore(path: ":memory:")
    }

    func testAddAndListCapturesNewestFirst() throws {
        let store = try makeStore()
        try store.addCapture(body: "first", at: Date(timeIntervalSince1970: 100))
        try store.addCapture(body: "  second  ", at: Date(timeIntervalSince1970: 200))

        let captures = try store.captures()
        XCTAssertEqual(captures.map(\.body), ["second", "first"])
        XCTAssertEqual(captures[0].createdAt, Date(timeIntervalSince1970: 200))
        XCTAssertEqual(captures[0].kind, .note)
    }

    func testEmptyCaptureIsRejected() throws {
        let store = try makeStore()
        XCTAssertThrowsError(try store.addCapture(body: "   \n"))
        XCTAssertTrue(try store.captures().isEmpty)
    }

    func testPeopleAreUniqueIgnoringCase() throws {
        let store = try makeStore()
        let first = try store.addPerson(name: "Priya", isPM: true)
        let again = try store.addPerson(name: " priya ")
        XCTAssertEqual(first.id, again.id)
        XCTAssertTrue(again.isPM)
        XCTAssertEqual(try store.people().count, 1)
    }

    func testFilterByPersonAndProject() throws {
        let store = try makeStore()
        let priya = try store.addPerson(name: "Priya", isPM: true)
        let sam = try store.addPerson(name: "Sam")
        let portal = try store.addProject(name: "Portal")
        try store.addCapture(body: "a", personID: priya.id, projectID: portal.id)
        try store.addCapture(body: "b", personID: sam.id)
        try store.addCapture(body: "c", projectID: portal.id)

        XCTAssertEqual(try store.captures(CaptureFilter(personID: priya.id)).map(\.body), ["a"])
        XCTAssertEqual(Set(try store.captures(CaptureFilter(projectID: portal.id)).map(\.body)), ["a", "c"])
    }

    func testWinsFilterAndToggle() throws {
        let store = try makeStore()
        let win = try store.addCapture(body: "shipped it", isWin: true)
        let plain = try store.addCapture(body: "plain")
        XCTAssertEqual(try store.captures(CaptureFilter(winsOnly: true)).map(\.id), [win.id])

        try store.setCapture(plain.id, isWin: true)
        XCTAssertEqual(try store.captures(CaptureFilter(winsOnly: true)).count, 2)
    }

    func testWaitingOnMeCountsOpenCommitmentsAndAsksOfMe() throws {
        let store = try makeStore()
        let commitment = try store.addCapture(body: "send the deck", kind: .commitment)
        try store.addCapture(body: "review my PRD", kind: .askOfMe)
        try store.addCapture(body: "need estimate", kind: .askOfThem)
        try store.addCapture(body: "idea", kind: .thought)

        XCTAssertEqual(try store.waitingOnMeCount(), 2)
        XCTAssertEqual(try store.captures(CaptureFilter(openOnly: true)).count, 3)

        try store.setCapture(commitment.id, done: true)
        XCTAssertEqual(try store.waitingOnMeCount(), 1)
        XCTAssertNotNil(try store.captures().first { $0.id == commitment.id }?.doneAt)

        try store.setCapture(commitment.id, done: false)
        XCTAssertEqual(try store.waitingOnMeCount(), 2)
    }

    func testSearchTreatsWildcardsLiterally() throws {
        let store = try makeStore()
        try store.addCapture(body: "margin up 5% this quarter")
        try store.addCapture(body: "margin up 50 points")

        XCTAssertEqual(try store.captures(CaptureFilter(search: "MARGIN")).count, 2)
        XCTAssertEqual(try store.captures(CaptureFilter(search: "5%")).map(\.body), ["margin up 5% this quarter"])
    }

    func testDeletingPersonKeepsTheirCaptures() throws {
        let store = try makeStore()
        let sam = try store.addPerson(name: "Sam")
        try store.addCapture(body: "kept", personID: sam.id)
        try store.deletePerson(sam.id)

        let captures = try store.captures()
        XCTAssertEqual(captures.count, 1)
        XCTAssertNil(captures[0].personID)
    }

    func testDataSurvivesReopen() throws {
        let path = NSTemporaryDirectory() + "dailywork-test-\(UUID().uuidString).sqlite"
        defer {
            for suffix in ["", "-wal", "-shm"] { try? FileManager.default.removeItem(atPath: path + suffix) }
        }
        do {
            let store = try CaptureStore(path: path)
            try store.addCapture(body: "persisted", kind: .commitment)
        }
        let reopened = try CaptureStore(path: path)
        XCTAssertEqual(try reopened.captures().map(\.body), ["persisted"])
        XCTAssertEqual(try reopened.waitingOnMeCount(), 1)
    }
}
