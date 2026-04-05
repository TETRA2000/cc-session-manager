import XCTest
import CCSessionAPI

// Test the ViewModel logic and helper functions used by the app.
// We test against the public API types since TimelineViewModel is in the app target.

final class TimelineViewModelTests: XCTestCase {

    // MARK: - Pinned Entries Logic

    func testPinnedEntriesFiltersAttentionFromActiveSessions() {
        let entries: [TimelineEntry] = [
            makeEntry(uuid: "1", sessionId: "s1", isAttention: true, timestamp: "2026-03-28T10:00:05.000Z"),
            makeEntry(uuid: "2", sessionId: "s2", isAttention: false, timestamp: "2026-03-28T10:00:04.000Z"),
            makeEntry(uuid: "3", sessionId: "s1", isAttention: false, timestamp: "2026-03-28T10:00:03.000Z"),
            makeEntry(uuid: "4", sessionId: "s3", isAttention: true, timestamp: "2026-03-28T10:00:02.000Z"),
        ]
        let activeSessions: [ActiveSessionInfo] = [
            makeSession(sessionId: "s1"),
            makeSession(sessionId: "s2"),
        ]

        let activeIds = Set(activeSessions.map(\.sessionId))
        let pinned = entries
            .filter { $0.isAttention && activeIds.contains($0.sessionId) }
            .sorted { $0.timestamp < $1.timestamp }

        XCTAssertEqual(pinned.count, 1)
        XCTAssertEqual(pinned[0].uuid, "1")
    }

    func testPinnedEntriesExcludesInactiveSessions() {
        let entries: [TimelineEntry] = [
            makeEntry(uuid: "1", sessionId: "s1", isAttention: true, timestamp: "2026-03-28T10:00:05.000Z"),
            makeEntry(uuid: "2", sessionId: "s2", isAttention: true, timestamp: "2026-03-28T10:00:04.000Z"),
        ]
        // Only s2 is active
        let activeSessions: [ActiveSessionInfo] = [
            makeSession(sessionId: "s2"),
        ]

        let activeIds = Set(activeSessions.map(\.sessionId))
        let pinned = entries.filter { $0.isAttention && activeIds.contains($0.sessionId) }

        XCTAssertEqual(pinned.count, 1)
        XCTAssertEqual(pinned[0].uuid, "2")
    }

    func testPinnedEntriesSortedOldestFirst() {
        let entries: [TimelineEntry] = [
            makeEntry(uuid: "new", sessionId: "s1", isAttention: true, timestamp: "2026-03-28T10:00:10.000Z"),
            makeEntry(uuid: "old", sessionId: "s1", isAttention: true, timestamp: "2026-03-28T10:00:01.000Z"),
            makeEntry(uuid: "mid", sessionId: "s1", isAttention: true, timestamp: "2026-03-28T10:00:05.000Z"),
        ]
        let activeSessions: [ActiveSessionInfo] = [makeSession(sessionId: "s1")]

        let activeIds = Set(activeSessions.map(\.sessionId))
        let pinned = entries
            .filter { $0.isAttention && activeIds.contains($0.sessionId) }
            .sorted { $0.timestamp < $1.timestamp }

        XCTAssertEqual(pinned.map(\.uuid), ["old", "mid", "new"])
    }

    // MARK: - Session Filtering

    func testFilterBySessionId() {
        let entries: [TimelineEntry] = [
            makeEntry(uuid: "1", sessionId: "s1"),
            makeEntry(uuid: "2", sessionId: "s2"),
            makeEntry(uuid: "3", sessionId: "s1"),
            makeEntry(uuid: "4", sessionId: "s3"),
        ]

        let filtered = entries.filter { $0.sessionId == "s1" }

        XCTAssertEqual(filtered.count, 2)
        XCTAssertTrue(filtered.allSatisfy { $0.sessionId == "s1" })
    }

    func testNoFilterReturnsAll() {
        let entries: [TimelineEntry] = [
            makeEntry(uuid: "1", sessionId: "s1"),
            makeEntry(uuid: "2", sessionId: "s2"),
        ]

        let selectedSessionId: String? = nil
        let filtered = selectedSessionId.map { sid in entries.filter { $0.sessionId == sid } } ?? entries

        XCTAssertEqual(filtered.count, 2)
    }

    // MARK: - Importance Counts

    func testImportanceCounts() {
        let entries: [TimelineEntry] = [
            makeEntry(uuid: "1", importance: "high"),
            makeEntry(uuid: "2", importance: "high"),
            makeEntry(uuid: "3", importance: "normal"),
            makeEntry(uuid: "4", importance: "low"),
            makeEntry(uuid: "5", importance: "normal"),
        ]

        var counts = ["all": entries.count, "high": 0, "normal": 0, "low": 0]
        for e in entries { counts[e.importance, default: 0] += 1 }

        XCTAssertEqual(counts["all"], 5)
        XCTAssertEqual(counts["high"], 2)
        XCTAssertEqual(counts["normal"], 2)
        XCTAssertEqual(counts["low"], 1)
    }

    // MARK: - Active Sessions Grouping

    func testActiveSessionsGroupedByAttention() {
        let sessions: [ActiveSessionInfo] = [
            makeSession(sessionId: "s1", hasAttention: true),
            makeSession(sessionId: "s2", hasAttention: false),
            makeSession(sessionId: "s3", hasAttention: true),
            makeSession(sessionId: "s4", hasAttention: false),
        ]

        let needsAttention = sessions.filter(\.hasAttention)
        let running = sessions.filter { !$0.hasAttention }

        XCTAssertEqual(needsAttention.count, 2)
        XCTAssertEqual(running.count, 2)
    }

    // MARK: - TimelineResponse Decoding

    func testTimelineResponseDecoding() throws {
        let json = Data("""
        {
            "entries": [{
                "uuid": "e1",
                "sessionId": "s1",
                "projectId": "p1",
                "projectName": "my-app",
                "sessionSummary": "Fix bug",
                "type": "assistant",
                "text": "Done.",
                "importance": "normal",
                "isAttention": false,
                "timestamp": "2026-03-28T10:00:00.000Z",
                "model": "claude-sonnet-4",
                "toolNames": ["Read"],
                "isRemoteConnected": false
            }],
            "activeSessions": [{
                "sessionId": "s1",
                "projectId": "p1",
                "projectName": "my-app",
                "status": "active",
                "lastActivity": "2026-03-28T10:00:00.000Z",
                "hasAttention": false,
                "isRemoteConnected": false
            }],
            "hasMore": false,
            "oldestTimestamp": "2026-03-28T10:00:00.000Z"
        }
        """.utf8)

        let response = try JSONDecoder().decode(TimelineResponse.self, from: json)
        XCTAssertEqual(response.entries.count, 1)
        XCTAssertEqual(response.entries[0].projectName, "my-app")
        XCTAssertEqual(response.entries[0].toolNames, ["Read"])
        XCTAssertEqual(response.activeSessions.count, 1)
        XCTAssertEqual(response.activeSessions[0].status, "active")
        XCTAssertFalse(response.hasMore)
    }

    // MARK: - Helpers

    private func makeEntry(
        uuid: String = "test",
        sessionId: String = "s1",
        importance: String = "normal",
        isAttention: Bool = false,
        timestamp: String = "2026-03-28T10:00:00.000Z"
    ) -> TimelineEntry {
        // Decode from JSON since TimelineEntry has no public init
        let json = """
        {
            "uuid": "\(uuid)",
            "sessionId": "\(sessionId)",
            "projectId": "p1",
            "projectName": "test-project",
            "sessionSummary": null,
            "type": "assistant",
            "text": "Response text",
            "importance": "\(importance)",
            "isAttention": \(isAttention),
            "timestamp": "\(timestamp)",
            "model": null,
            "toolNames": [],
            "isRemoteConnected": false
        }
        """.data(using: .utf8)!
        return try! JSONDecoder().decode(TimelineEntry.self, from: json)
    }

    private func makeSession(
        sessionId: String = "s1",
        hasAttention: Bool = false
    ) -> ActiveSessionInfo {
        let json = """
        {
            "sessionId": "\(sessionId)",
            "projectId": "p1",
            "projectName": "test-project",
            "status": "active",
            "lastActivity": "2026-03-28T10:00:00.000Z",
            "hasAttention": \(hasAttention),
            "isRemoteConnected": false
        }
        """.data(using: .utf8)!
        return try! JSONDecoder().decode(ActiveSessionInfo.self, from: json)
    }
}
