import ArgumentParser
import CCSessionAPI

@main
struct CCSession: AsyncParsableCommand {
    static let configuration = CommandConfiguration(
        commandName: "cc-session",
        abstract: "Browse Claude Code sessions from a remote CC Session Manager server.",
        subcommands: [Dashboard.self, Projects.self, Sessions.self, Transcript.self]
    )

    struct GlobalOptions: ParsableArguments {
        @Option(name: .long, help: "Server URL (e.g., http://192.168.1.100:3456)")
        var server: String

        @Option(name: .long, help: "Auth token")
        var token: String?
    }
}

// Placeholder subcommands — full implementation in task 10.1

struct Dashboard: AsyncParsableCommand {
    static let configuration = CommandConfiguration(abstract: "Show dashboard stats and recent sessions")
    @OptionGroup var global: CCSession.GlobalOptions

    func run() async throws {
        print("Not implemented yet")
    }
}

struct Projects: AsyncParsableCommand {
    static let configuration = CommandConfiguration(abstract: "List all projects")
    @OptionGroup var global: CCSession.GlobalOptions

    func run() async throws {
        print("Not implemented yet")
    }
}

struct Sessions: AsyncParsableCommand {
    static let configuration = CommandConfiguration(abstract: "List sessions for a project")
    @OptionGroup var global: CCSession.GlobalOptions
    @Argument(help: "Project ID") var projectId: String

    func run() async throws {
        print("Not implemented yet")
    }
}

struct Transcript: AsyncParsableCommand {
    static let configuration = CommandConfiguration(abstract: "Show session transcript")
    @OptionGroup var global: CCSession.GlobalOptions
    @Argument(help: "Session ID") var sessionId: String

    func run() async throws {
        print("Not implemented yet")
    }
}
