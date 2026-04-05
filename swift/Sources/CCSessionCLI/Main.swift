import ArgumentParser
import CCSessionAPI
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
import Foundation

@main
struct CCSession: AsyncParsableCommand {
    static let configuration = CommandConfiguration(
        commandName: "cc-session",
        abstract: "Browse Claude Code sessions from a remote CC Session Manager server.",
        subcommands: [DashboardCmd.self, ProjectsCmd.self, SessionsCmd.self, TranscriptCmd.self, TimelineCmd.self],
        defaultSubcommand: TimelineCmd.self
    )
}

struct GlobalOptions: ParsableArguments {
    @Option(name: .long, help: "Server URL (e.g., http://192.168.1.100:3456)")
    var server: String

    @Option(name: .long, help: "Auth token")
    var token: String?

    func makeClient() throws -> SessionClient {
        guard let url = URL(string: server) else {
            throw ValidationError("Invalid server URL: \(server)")
        }
        return SessionClient(serverURL: url, token: token)
    }
}

// MARK: - Dashboard

struct DashboardCmd: AsyncParsableCommand {
    static let configuration = CommandConfiguration(commandName: "dashboard", abstract: "Show dashboard stats and recent sessions")
    @OptionGroup var global: GlobalOptions

    func run() async throws {
        let client = try global.makeClient()
        let dashboard = try await client.getDashboard()
        let s = dashboard.stats
        print("Dashboard")
        print("=========")
        print("Projects:    \(s.projects)")
        print("Sessions:    \(s.sessions)")
        print("Active (7d): \(s.active7d)")
        print("Tokens (30d): \(s.tokens30d)")
        print("")
        print("Recent Sessions")
        print("---------------")
        for session in dashboard.recentSessions.prefix(10) {
            let summary = session.aiSummary ?? session.summary
            let model = session.model ?? "unknown"
            let status = session.isActive ? " [ACTIVE]" : (session.isRemoteConnected ? " [REMOTE]" : "")
            print("  \(summary)\(status)")
            print("    \(session.messageCount) msgs | \(model) | \(session.lastTimestamp.prefix(10))")
        }
    }
}

// MARK: - Projects

struct ProjectsCmd: AsyncParsableCommand {
    static let configuration = CommandConfiguration(commandName: "projects", abstract: "List all projects")
    @OptionGroup var global: GlobalOptions

    func run() async throws {
        let client = try global.makeClient()
        let response = try await client.getProjects()
        print("Projects (\(response.projects.count))")
        print(String(repeating: "=", count: 40))
        for project in response.projects {
            let wt = project.isWorktree ? " [worktree]" : ""
            print("  \(project.displayName)\(wt)")
            print("    \(project.sessionCount) sessions | last: \(project.lastActivity.prefix(10))")
            print("    id: \(project.id)")
        }
    }
}

// MARK: - Sessions

struct SessionsCmd: AsyncParsableCommand {
    static let configuration = CommandConfiguration(commandName: "sessions", abstract: "List sessions for a project")
    @OptionGroup var global: GlobalOptions
    @Argument(help: "Project ID") var projectId: String

    func run() async throws {
        let client = try global.makeClient()
        let response = try await client.getProject(id: projectId)
        print("Sessions for \(response.project.displayName) (\(response.sessions.count))")
        print(String(repeating: "=", count: 50))
        for session in response.sessions {
            let summary = session.aiSummary ?? session.summary
            let model = session.model ?? "unknown"
            let branch = session.gitBranch.map { " (\($0))" } ?? ""
            let status = session.isActive ? " [ACTIVE]" : (session.isRemoteConnected ? " [REMOTE]" : "")
            print("  \(summary)\(status)")
            print("    \(session.messageCount) msgs | \(model)\(branch) | \(session.lastTimestamp.prefix(10))")
            print("    id: \(session.id)")
        }
    }
}

// MARK: - Timeline

struct TimelineCmd: AsyncParsableCommand {
    static let configuration = CommandConfiguration(commandName: "timeline", abstract: "Show cross-session timeline feed")
    @OptionGroup var global: GlobalOptions
    @Option(name: .long, help: "Filter by importance: all, high, normal") var importance: String = "all"
    @Option(name: .long, help: "Max entries to show") var limit: Int = 50

    func run() async throws {
        let client = try global.makeClient()
        let response = try await client.getTimeline(limit: limit, importance: importance)

        // Show active sessions
        if !response.activeSessions.isEmpty {
            print("Active Sessions")
            print(String(repeating: "-", count: 40))
            for session in response.activeSessions {
                let status = session.status.uppercased()
                let attention = session.hasAttention ? " ⚠" : ""
                print("  \(session.projectName) [\(status)]\(attention)  \(session.lastActivity.prefix(19))")
            }
            print("")
        }

        // Show timeline entries
        print("Timeline (\(response.entries.count) entries)")
        print(String(repeating: "=", count: 60))
        for entry in response.entries {
            let role = entry.type.uppercased()
            let imp = entry.importance == "high" ? " [!]" : ""
            let attn = entry.isAttention ? " ⚠ NEEDS INPUT" : ""
            let remote = entry.isRemoteConnected ? " [REMOTE]" : ""
            print("")
            print("[\(role)] \(entry.projectName)\(remote)\(imp)\(attn)  \(entry.timestamp.prefix(19))")
            if let text = entry.text, !text.isEmpty {
                let truncated = text.count > 200 ? String(text.prefix(200)) + "..." : text
                print("  \(truncated)")
            }
            if !entry.toolNames.isEmpty {
                print("  tools: \(entry.toolNames.joined(separator: ", "))")
            }
        }

        if response.hasMore {
            print("\n... more entries available (use --limit to increase)")
        }
    }
}

// MARK: - Transcript

struct TranscriptCmd: AsyncParsableCommand {
    static let configuration = CommandConfiguration(commandName: "transcript", abstract: "Show session transcript")
    @OptionGroup var global: GlobalOptions
    @Argument(help: "Session ID") var sessionId: String

    func run() async throws {
        let client = try global.makeClient()
        let response = try await client.getTranscript(sessionId: sessionId)
        let meta = response.meta
        print("Transcript: \(meta.aiSummary ?? meta.summary)")
        print("\(meta.messageCount) messages | \(meta.toolCallCount) tool calls | \(meta.totalTokens) tokens")
        print(String(repeating: "=", count: 60))
        for entry in response.entries {
            let role = entry.type.uppercased()
            print("")
            print("[\(role)] \(entry.timestamp.prefix(19))")
            if let text = entry.text, !text.isEmpty {
                print(text)
            }
            for tool in entry.toolCalls {
                let err = tool.isError == true ? " [ERROR]" : ""
                print("  → \(tool.name)\(err)")
                if let result = tool.resultText {
                    let truncated = result.count > 200 ? String(result.prefix(200)) + "..." : result
                    print("    \(truncated)")
                }
            }
        }
    }
}
