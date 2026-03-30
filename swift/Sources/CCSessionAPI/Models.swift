import Foundation

// MARK: - JSON Value (dynamic type for tool call inputs)

public enum JSONValue: Codable, Sendable, Equatable {
    case string(String)
    case number(Double)
    case bool(Bool)
    case object([String: JSONValue])
    case array([JSONValue])
    case null

    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() {
            self = .null
        } else if let value = try? container.decode(Bool.self) {
            self = .bool(value)
        } else if let value = try? container.decode(Double.self) {
            self = .number(value)
        } else if let value = try? container.decode(String.self) {
            self = .string(value)
        } else if let value = try? container.decode([String: JSONValue].self) {
            self = .object(value)
        } else if let value = try? container.decode([JSONValue].self) {
            self = .array(value)
        } else {
            throw DecodingError.typeMismatch(JSONValue.self,
                DecodingError.Context(codingPath: decoder.codingPath, debugDescription: "Unsupported JSON value"))
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .string(let value): try container.encode(value)
        case .number(let value): try container.encode(value)
        case .bool(let value): try container.encode(value)
        case .object(let value): try container.encode(value)
        case .array(let value): try container.encode(value)
        case .null: try container.encodeNil()
        }
    }
}

// MARK: - Dashboard

public struct DashboardStats: Codable, Sendable {
    public let projects: Int
    public let sessions: Int
    public let active7d: Int
    public let tokens30d: Int
}

public struct DashboardResponse: Codable, Sendable {
    public let stats: DashboardStats
    public let recentSessions: [SessionSummary]
}

// MARK: - Projects

public struct ProjectSummary: Codable, Sendable, Identifiable {
    public let id: String
    public let path: String
    public let displayName: String
    public let sessionCount: Int
    public let lastActivity: String
    public let isWorktree: Bool
}

public struct ProjectsResponse: Codable, Sendable {
    public let projects: [ProjectSummary]
}

public struct ProjectDetailResponse: Codable, Sendable {
    public let project: ProjectSummary
    public let sessions: [SessionSummary]
}

public struct ProjectSettings: Codable, Sendable {
    public var displayName: String?
    public var tags: [String]?
    public var preferredModel: String?
    public var customLaunchFlags: [String]?

    public init(displayName: String? = nil, tags: [String]? = nil,
                preferredModel: String? = nil, customLaunchFlags: [String]? = nil) {
        self.displayName = displayName
        self.tags = tags
        self.preferredModel = preferredModel
        self.customLaunchFlags = customLaunchFlags
    }
}

// MARK: - Sessions

public struct SessionSummary: Codable, Sendable, Identifiable {
    public let id: String
    public let projectId: String
    public let summary: String
    public let messageCount: Int
    public let toolCallCount: Int
    public let firstTimestamp: String
    public let lastTimestamp: String
    public let gitBranch: String?
    public let model: String?
    public let totalTokens: Int
    public let subAgentCount: Int
    public let lastMessage: String?
    public let webUrl: String?
    public let isActive: Bool
    public let isRemoteConnected: Bool
    public let entrypoint: String?
    public let aiSummary: String?
}

// MARK: - Transcript

public struct TokenInfo: Codable, Sendable {
    public let input: Int
    public let output: Int
}

public struct ToolCallEntry: Codable, Sendable, Identifiable {
    public let id: String
    public let name: String
    public let input: [String: JSONValue]
    public let result: ToolResult?
    public let isError: Bool?

    public var resultText: String? {
        result?.text
    }
}

/// Tool result can be a string or an array of content blocks
public enum ToolResult: Codable, Sendable {
    case string(String)
    case array([JSONValue])

    public var text: String? {
        switch self {
        case .string(let s): return s
        case .array(let items):
            return items.compactMap { item -> String? in
                if case .object(let obj) = item, case .string(let text)? = obj["text"] { return text }
                if case .string(let s) = item { return s }
                return nil
            }.joined(separator: "\n")
        }
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let s = try? container.decode(String.self) {
            self = .string(s)
        } else if let arr = try? container.decode([JSONValue].self) {
            self = .array(arr)
        } else {
            self = .string("")
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .string(let s): try container.encode(s)
        case .array(let arr): try container.encode(arr)
        }
    }
}

public struct TranscriptEntry: Codable, Sendable, Identifiable {
    public let uuid: String
    public let type: String
    public let text: String?
    public let toolCalls: [ToolCallEntry]
    public let model: String?
    public let timestamp: String
    public let tokens: TokenInfo?

    public var id: String { uuid }
}

public struct TranscriptResponse: Codable, Sendable {
    public let meta: SessionSummary
    public let entries: [TranscriptEntry]
}

// MARK: - Launch

public struct LaunchRequest: Codable, Sendable {
    public let mode: String
    public let projectId: String
    public let projectPath: String?
    public let sessionId: String?
    public let prompt: String?
    public let target: String
    public let webUrl: String?

    public init(mode: String, projectId: String, projectPath: String? = nil,
                sessionId: String? = nil, prompt: String? = nil,
                target: String = "terminal", webUrl: String? = nil) {
        self.mode = mode
        self.projectId = projectId
        self.projectPath = projectPath
        self.sessionId = sessionId
        self.prompt = prompt
        self.target = target
        self.webUrl = webUrl
    }
}

public struct LaunchResult: Codable, Sendable {
    public let ok: Bool
    public let error: String?
}

// MARK: - Create Project

public struct CreateProjectRequest: Codable, Sendable {
    public let name: String
    public let gitInit: Bool
    public let gitRemote: String?
    public let claudeMd: Bool
    public let mcpJson: Bool
    public let launchAfter: Bool

    public init(name: String, gitInit: Bool = false, gitRemote: String? = nil,
                claudeMd: Bool = true, mcpJson: Bool = false, launchAfter: Bool = false) {
        self.name = name
        self.gitInit = gitInit
        self.gitRemote = gitRemote
        self.claudeMd = claudeMd
        self.mcpJson = mcpJson
        self.launchAfter = launchAfter
    }
}

public struct CreateProjectResult: Codable, Sendable {
    public let ok: Bool
    public let path: String?
    public let error: String?
}

// MARK: - Errors

public enum APIError: Error, LocalizedError, Sendable {
    case unauthorized
    case notFound(String)
    case serverError(statusCode: Int, message: String)
    case networkError(Error)
    case decodingError(Error)

    public var errorDescription: String? {
        switch self {
        case .unauthorized: return "Unauthorized — check your auth token"
        case .notFound(let msg): return "Not found: \(msg)"
        case .serverError(let code, let msg): return "Server error \(code): \(msg)"
        case .networkError(let err): return "Network error: \(err.localizedDescription)"
        case .decodingError(let err): return "Decoding error: \(err.localizedDescription)"
        }
    }
}
