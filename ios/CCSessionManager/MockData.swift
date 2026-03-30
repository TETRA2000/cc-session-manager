import Foundation
import CCSessionAPI

// MARK: - JSON Decode Helper

private func decode<T: Decodable>(_ json: String) -> T {
    try! JSONDecoder().decode(T.self, from: Data(json.utf8))
}

// MARK: - Mock Data Provider for Previews & Tests

enum MockData {

    static let dashboardResponse: DashboardResponse = decode("""
    {
        "stats": {"projects": 12, "sessions": 87, "active7d": 23, "tokens30d": 1450000},
        "recentSessions": \(sessionsJSON)
    }
    """)

    static let projectsResponse: ProjectsResponse = decode("""
    {"projects": \(projectsJSON)}
    """)

    static let projectDetailResponse: ProjectDetailResponse = decode("""
    {
        "project": \(projectsArray[0]),
        "sessions": \(sessionsJSON)
    }
    """)

    static let transcriptResponse: TranscriptResponse = decode("""
    {
        "meta": \(sessionsArray[0]),
        "entries": \(transcriptJSON)
    }
    """)

    // MARK: - Raw JSON

    private static let projectsArray: [String] = [
        """
        {"id":"-Users-takahiko-repo-cc-kanban","path":"/Users/takahiko/repo/cc-kanban","displayName":"cc-kanban","sessionCount":24,"lastActivity":"2026-03-29T15:30:00.000Z","isWorktree":false}
        """,
        """
        {"id":"-Users-takahiko-repo-my-api","path":"/Users/takahiko/repo/my-api","displayName":"my-api","sessionCount":15,"lastActivity":"2026-03-28T10:00:00.000Z","isWorktree":false}
        """,
        """
        {"id":"-Users-takahiko-repo-landing-page","path":"/Users/takahiko/repo/landing-page","displayName":"landing-page","sessionCount":8,"lastActivity":"2026-03-27T09:00:00.000Z","isWorktree":false}
        """,
        """
        {"id":"-Users-takahiko-repo-data-pipeline","path":"/Users/takahiko/repo/data-pipeline","displayName":"data-pipeline","sessionCount":31,"lastActivity":"2026-03-26T18:00:00.000Z","isWorktree":true}
        """,
        """
        {"id":"-Users-takahiko-repo-mobile-app","path":"/Users/takahiko/repo/mobile-app","displayName":"mobile-app","sessionCount":5,"lastActivity":"2026-03-25T12:00:00.000Z","isWorktree":false}
        """,
    ]

    private static var projectsJSON: String { "[\(projectsArray.joined(separator: ","))]" }

    private static let sessionsArray: [String] = [
        """
        {"id":"c0855413-6e78-489f-abee-d755d354fdf0","projectId":"-Users-takahiko-repo-cc-kanban","summary":"Fix authentication bug in login flow","messageCount":42,"toolCallCount":15,"firstTimestamp":"2026-03-29T14:08:58.896Z","lastTimestamp":"2026-03-29T15:30:00.000Z","gitBranch":"fix/auth-login","model":"claude-opus-4-6","totalTokens":98700,"subAgentCount":3,"lastMessage":null,"webUrl":null,"isActive":true,"isRemoteConnected":false,"entrypoint":"cli","aiSummary":"Fixed authentication bug in login flow by correcting token refresh logic"}
        """,
        """
        {"id":"a1b2c3d4-5678-9abc-def0-123456789abc","projectId":"-Users-takahiko-repo-cc-kanban","summary":"Add drag-and-drop to kanban board","messageCount":67,"toolCallCount":28,"firstTimestamp":"2026-03-28T09:00:00.000Z","lastTimestamp":"2026-03-28T12:45:00.000Z","gitBranch":"feature/dnd","model":"claude-sonnet-4-6","totalTokens":145200,"subAgentCount":1,"lastMessage":null,"webUrl":"https://claude.ai/code/session_abc123","isActive":false,"isRemoteConnected":true,"entrypoint":"cli","aiSummary":"Implemented drag-and-drop card reordering with @dnd-kit"}
        """,
        """
        {"id":"b2c3d4e5-6789-abcd-ef01-23456789abcd","projectId":"-Users-takahiko-repo-my-api","summary":"Refactor database queries for performance","messageCount":23,"toolCallCount":8,"firstTimestamp":"2026-03-27T16:00:00.000Z","lastTimestamp":"2026-03-27T17:15:00.000Z","gitBranch":"main","model":"claude-opus-4-6","totalTokens":52300,"subAgentCount":0,"lastMessage":null,"webUrl":null,"isActive":false,"isRemoteConnected":false,"entrypoint":"cli","aiSummary":"Optimized N+1 queries in user endpoint with eager loading"}
        """,
    ]

    private static var sessionsJSON: String { "[\(sessionsArray.joined(separator: ","))]" }

    private static var transcriptJSON: String {
        """
        [
            {"uuid":"msg-001","type":"user","text":"Fix the authentication bug in the login flow. Users are getting logged out after refreshing the page.","toolCalls":[],"model":null,"timestamp":"2026-03-29T14:08:58.896Z","tokens":null},
            {"uuid":"msg-002","type":"assistant","text":"I'll investigate the login flow. Let me start by looking at the authentication module.","toolCalls":[{"id":"toolu_01Ks","name":"Read","input":{"file_path":"/src/auth/session.ts"},"result":"import { verifyToken } from './jwt';\\n\\nexport async function refreshSession(req) {\\n  const token = req.cookies.get('auth_token');\\n  if (!token) return null;\\n  return verifyToken(token);\\n}","isError":false},{"id":"toolu_02Ab","name":"Grep","input":{"pattern":"refreshSession","path":"/src"},"result":"/src/auth/session.ts:3: export async function refreshSession\\n/src/middleware/auth.ts:12: const session = await refreshSession(req);","isError":false}],"model":"claude-opus-4-6","timestamp":"2026-03-29T14:09:02.879Z","tokens":{"input":1500,"output":800}},
            {"uuid":"msg-003","type":"assistant","text":"Found the bug! The refreshSession function doesn't check token expiry before verifying. Let me fix this.","toolCalls":[{"id":"toolu_03Xy","name":"Edit","input":{"file_path":"/src/auth/session.ts"},"result":"File updated successfully","isError":false}],"model":"claude-opus-4-6","timestamp":"2026-03-29T14:10:15.000Z","tokens":{"input":2200,"output":650}},
            {"uuid":"msg-004","type":"user","text":"Looks good! Can you also add a test for this?","toolCalls":[],"model":null,"timestamp":"2026-03-29T14:11:00.000Z","tokens":null},
            {"uuid":"msg-005","type":"system","text":"Session connected to remote control","toolCalls":[],"model":null,"timestamp":"2026-03-29T14:11:30.000Z","tokens":null}
        ]
        """
    }

    static var sampleProjects: [ProjectSummary] { dashboardResponse.recentSessions.isEmpty ? [] : projectsResponse.projects }
    static var sampleSessions: [SessionSummary] { dashboardResponse.recentSessions }
    static var sampleTranscript: [TranscriptEntry] { transcriptResponse.entries }
}

// MARK: - Preview AppState

extension AppState {
    static var preview: AppState {
        let state = AppState()
        state.client = SessionClient(serverURL: URL(string: "http://192.168.1.100:3456")!, token: "preview-token")
        return state
    }
}
