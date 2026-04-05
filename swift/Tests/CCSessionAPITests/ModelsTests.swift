import XCTest
@testable import CCSessionAPI

final class ModelsTests: XCTestCase {

    // MARK: - JSONValue

    func testJSONValueDecodeString() throws {
        let json = Data(#""hello""#.utf8)
        let value = try JSONDecoder().decode(JSONValue.self, from: json)
        XCTAssertEqual(value, .string("hello"))
    }

    func testJSONValueDecodeNumber() throws {
        let json = Data("42.5".utf8)
        let value = try JSONDecoder().decode(JSONValue.self, from: json)
        XCTAssertEqual(value, .number(42.5))
    }

    func testJSONValueDecodeBool() throws {
        let json = Data("true".utf8)
        let value = try JSONDecoder().decode(JSONValue.self, from: json)
        XCTAssertEqual(value, .bool(true))
    }

    func testJSONValueDecodeNull() throws {
        let json = Data("null".utf8)
        let value = try JSONDecoder().decode(JSONValue.self, from: json)
        XCTAssertEqual(value, .null)
    }

    func testJSONValueDecodeObject() throws {
        let json = Data(#"{"key": "value", "num": 1}"#.utf8)
        let value = try JSONDecoder().decode(JSONValue.self, from: json)
        XCTAssertEqual(value, .object(["key": .string("value"), "num": .number(1)]))
    }

    func testJSONValueDecodeArray() throws {
        let json = Data(#"[1, "two", true]"#.utf8)
        let value = try JSONDecoder().decode(JSONValue.self, from: json)
        XCTAssertEqual(value, .array([.number(1), .string("two"), .bool(true)]))
    }

    func testJSONValueRoundTrip() throws {
        let original = JSONValue.object([
            "file_path": .string("/src/auth.ts"),
            "line": .number(42),
            "options": .object(["verbose": .bool(true)]),
            "tags": .array([.string("a"), .string("b")]),
            "empty": .null,
        ])
        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(JSONValue.self, from: data)
        XCTAssertEqual(original, decoded)
    }

    // MARK: - DashboardStats

    func testDashboardStatsDecode() throws {
        let json = Data(#"{"projects":89,"sessions":507,"active7d":53,"tokens30d":1234}"#.utf8)
        let stats = try JSONDecoder().decode(DashboardStats.self, from: json)
        XCTAssertEqual(stats.projects, 89)
        XCTAssertEqual(stats.sessions, 507)
        XCTAssertEqual(stats.active7d, 53)
        XCTAssertEqual(stats.tokens30d, 1234)
    }

    // MARK: - ProjectSummary

    func testProjectSummaryDecode() throws {
        let json = Data("""
        {
            "id": "-Users-takahiko-repo-my-app",
            "path": "/Users/takahiko/repo/my-app",
            "displayName": "my-app",
            "sessionCount": 12,
            "lastActivity": "2026-03-29T10:00:00.000Z",
            "isWorktree": false
        }
        """.utf8)
        let project = try JSONDecoder().decode(ProjectSummary.self, from: json)
        XCTAssertEqual(project.id, "-Users-takahiko-repo-my-app")
        XCTAssertEqual(project.displayName, "my-app")
        XCTAssertEqual(project.sessionCount, 12)
        XCTAssertFalse(project.isWorktree)
    }

    // MARK: - SessionSummary

    func testSessionSummaryDecode() throws {
        let json = Data("""
        {
            "id": "c0855413-6e78-489f-abee-d755d354fdf0",
            "projectId": "-Users-takahiko-repo-cc-kanban",
            "summary": "Fix authentication bug in login flow",
            "messageCount": 42,
            "toolCallCount": 15,
            "firstTimestamp": "2026-03-27T14:08:58.896Z",
            "lastTimestamp": "2026-03-27T15:30:00.000Z",
            "gitBranch": "main",
            "model": "claude-opus-4-6",
            "totalTokens": 98700,
            "subAgentCount": 3,
            "lastMessage": null,
            "webUrl": null,
            "isActive": false,
            "isRemoteConnected": false,
            "entrypoint": "cli",
            "aiSummary": "Fixed auth bug in login flow"
        }
        """.utf8)
        let session = try JSONDecoder().decode(SessionSummary.self, from: json)
        XCTAssertEqual(session.id, "c0855413-6e78-489f-abee-d755d354fdf0")
        XCTAssertEqual(session.messageCount, 42)
        XCTAssertEqual(session.model, "claude-opus-4-6")
        XCTAssertNil(session.webUrl)
        XCTAssertEqual(session.aiSummary, "Fixed auth bug in login flow")
    }

    // MARK: - ToolCallEntry

    func testToolCallEntryDecode() throws {
        let json = Data("""
        {
            "id": "toolu_01KsLAje88yGeqHw3DpUW84q",
            "name": "Read",
            "input": {"file_path": "/src/auth.ts"},
            "result": "file contents...",
            "isError": false
        }
        """.utf8)
        let entry = try JSONDecoder().decode(ToolCallEntry.self, from: json)
        XCTAssertEqual(entry.name, "Read")
        XCTAssertEqual(entry.input["file_path"], .string("/src/auth.ts"))
        XCTAssertEqual(entry.result, "file contents...")
        XCTAssertEqual(entry.isError, false)
    }

    // MARK: - TranscriptEntry

    func testTranscriptEntryDecode() throws {
        let json = Data("""
        {
            "uuid": "8e8d4d0c-831e-4b5f-997e-c2aa1ce877af",
            "type": "user",
            "text": "Fix the login bug",
            "toolCalls": [],
            "model": null,
            "timestamp": "2026-03-27T14:08:58.896Z",
            "tokens": null
        }
        """.utf8)
        let entry = try JSONDecoder().decode(TranscriptEntry.self, from: json)
        XCTAssertEqual(entry.type, "user")
        XCTAssertEqual(entry.text, "Fix the login bug")
        XCTAssertTrue(entry.toolCalls.isEmpty)
        XCTAssertNil(entry.tokens)
    }

    func testTranscriptEntryWithTokens() throws {
        let json = Data("""
        {
            "uuid": "a1b2c3d4",
            "type": "assistant",
            "text": "I'll investigate.",
            "toolCalls": [],
            "model": "claude-opus-4-6",
            "timestamp": "2026-03-27T14:09:02.879Z",
            "tokens": {"input": 1500, "output": 800}
        }
        """.utf8)
        let entry = try JSONDecoder().decode(TranscriptEntry.self, from: json)
        XCTAssertEqual(entry.tokens?.input, 1500)
        XCTAssertEqual(entry.tokens?.output, 800)
    }

    // MARK: - Timeline

    func testTimelineEntryDecode() throws {
        let json = Data("""
        {
            "uuid": "tl-entry-001",
            "sessionId": "session-abc-123",
            "projectId": "test-project",
            "projectName": "my-app",
            "sessionSummary": "Fix auth bug",
            "type": "assistant",
            "text": "I'll fix the authentication issue.",
            "importance": "high",
            "isAttention": true,
            "timestamp": "2026-03-28T10:00:05.000Z",
            "model": "claude-sonnet-4-20250514",
            "toolNames": ["Read", "Edit"],
            "isRemoteConnected": false
        }
        """.utf8)
        let entry = try JSONDecoder().decode(TimelineEntry.self, from: json)
        XCTAssertEqual(entry.uuid, "tl-entry-001")
        XCTAssertEqual(entry.sessionId, "session-abc-123")
        XCTAssertEqual(entry.projectName, "my-app")
        XCTAssertEqual(entry.importance, "high")
        XCTAssertTrue(entry.isAttention)
        XCTAssertEqual(entry.toolNames, ["Read", "Edit"])
        XCTAssertEqual(entry.id, "tl-entry-001")
    }

    func testActiveSessionInfoDecode() throws {
        let json = Data("""
        {
            "sessionId": "session-abc-123",
            "projectId": "test-project",
            "projectName": "my-app",
            "status": "active",
            "lastActivity": "2026-03-28T10:00:12.000Z",
            "hasAttention": true,
            "isRemoteConnected": false
        }
        """.utf8)
        let session = try JSONDecoder().decode(ActiveSessionInfo.self, from: json)
        XCTAssertEqual(session.sessionId, "session-abc-123")
        XCTAssertEqual(session.status, "active")
        XCTAssertTrue(session.hasAttention)
        XCTAssertEqual(session.id, "session-abc-123")
    }

    func testTimelineResponseDecode() throws {
        let json = Data("""
        {
            "entries": [{
                "uuid": "tl-001",
                "sessionId": "s1",
                "projectId": "p1",
                "projectName": "app",
                "sessionSummary": null,
                "type": "user",
                "text": "Hello",
                "importance": "normal",
                "isAttention": false,
                "timestamp": "2026-03-28T10:00:00.000Z",
                "model": null,
                "toolNames": [],
                "isRemoteConnected": false
            }],
            "activeSessions": [],
            "hasMore": true,
            "oldestTimestamp": "2026-03-28T10:00:00.000Z"
        }
        """.utf8)
        let response = try JSONDecoder().decode(TimelineResponse.self, from: json)
        XCTAssertEqual(response.entries.count, 1)
        XCTAssertTrue(response.activeSessions.isEmpty)
        XCTAssertTrue(response.hasMore)
        XCTAssertEqual(response.oldestTimestamp, "2026-03-28T10:00:00.000Z")
    }

    // MARK: - APIError

    func testAPIErrorDescriptions() {
        XCTAssertTrue(APIError.unauthorized.localizedDescription.contains("Unauthorized"))
        XCTAssertTrue(APIError.notFound("Session").localizedDescription.contains("Session"))
        XCTAssertTrue(APIError.serverError(statusCode: 500, message: "fail").localizedDescription.contains("500"))
    }
}
