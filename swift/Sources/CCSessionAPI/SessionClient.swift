#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
import Foundation
#if canImport(os)
import os
#endif

#if canImport(os)
private let logger = Logger(subsystem: "CCSessionAPI", category: "SessionClient")
#endif

private func log(_ message: String) {
    #if canImport(os)
    logger.debug("\(message)")
    #endif
    print("[CCSessionAPI] \(message)")
}

public final class SessionClient: Sendable {
    public let serverURL: URL
    private let token: String?

    public init(serverURL: URL, token: String? = nil) {
        self.serverURL = serverURL
        self.token = token
        log("Init: \(serverURL.absoluteString), token: \(token != nil ? "***" : "nil")")
    }

    // MARK: - Dashboard

    public func getDashboard() async throws -> DashboardResponse {
        try await get("/api/dashboard")
    }

    // MARK: - Projects

    public func getProjects() async throws -> ProjectsResponse {
        try await get("/api/projects")
    }

    public func getProject(id: String) async throws -> ProjectDetailResponse {
        try await get("/api/projects/\(id)")
    }

    public func getProjectSettings(id: String) async throws -> ProjectSettings {
        let encoded = id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? id
        return try await get("/api/projects/\(encoded)/settings")
    }

    public func updateProjectSettings(id: String, settings: ProjectSettings) async throws {
        let encoded = id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? id
        let _: OkResponse = try await post("/api/projects/\(encoded)/settings", body: settings, method: "PUT")
    }

    // MARK: - Sessions

    public func getTranscript(sessionId: String) async throws -> TranscriptResponse {
        try await get("/api/sessions/\(sessionId)/transcript")
    }

    // MARK: - Timeline

    public func getTimeline(
        limit: Int? = nil,
        before: String? = nil,
        importance: String? = nil
    ) async throws -> TimelineResponse {
        var path = "/api/timeline"
        var params: [String] = []
        if let limit = limit { params.append("limit=\(limit)") }
        if let before = before {
            params.append("before=\(before.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? before)")
        }
        if let importance = importance, importance != "all" {
            params.append("importance=\(importance)")
        }
        if !params.isEmpty { path += "?" + params.joined(separator: "&") }
        return try await get(path)
    }

    // MARK: - Launch

    public func launchSession(_ request: LaunchRequest) async throws -> LaunchResult {
        try await post("/api/launch", body: request)
    }

    // MARK: - Create Project

    public func createProject(_ request: CreateProjectRequest) async throws -> CreateProjectResult {
        try await post("/api/projects/create", body: request)
    }

    // MARK: - Private

    private func buildRequest(path: String, method: String = "GET") -> URLRequest {
        var url = serverURL.appendingPathComponent(path)
        // appendingPathComponent may double-encode; rebuild from string
        url = URL(string: serverURL.absoluteString.trimmingCharacters(in: CharacterSet(charactersIn: "/")) + path) ?? url
        var request = URLRequest(url: url)
        request.httpMethod = method
        if let token = token {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        return request
    }

    private func get<T: Decodable>(_ path: String) async throws -> T {
        let request = buildRequest(path: path)
        log("\(request.httpMethod ?? "GET") \(request.url?.absoluteString ?? path)")
        let (data, response) = try await performRequest(request)
        try checkResponse(response, data: data, path: path)
        return try decode(data, path: path)
    }

    private func post<Body: Encodable, T: Decodable>(_ path: String, body: Body, method: String = "POST") async throws -> T {
        var request = buildRequest(path: path, method: method)
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(body)
        log("\(method) \(request.url?.absoluteString ?? path)")
        let (data, response) = try await performRequest(request)
        try checkResponse(response, data: data, path: path)
        return try decode(data, path: path)
    }

    private static let session: URLSession = {
        let config = URLSessionConfiguration.default
        let delegate = InsecureSessionDelegate()
        return URLSession(configuration: config, delegate: delegate, delegateQueue: nil)
    }()

    private func performRequest(_ request: URLRequest) async throws -> (Data, URLResponse) {
        do {
            return try await Self.session.data(for: request)
        } catch {
            log("Network error: \(error)")
            throw APIError.networkError(error)
        }
    }

    private func checkResponse(_ response: URLResponse, data: Data, path: String) throws {
        guard let httpResponse = response as? HTTPURLResponse else { return }
        log("\(path) -> \(httpResponse.statusCode) (\(data.count) bytes)")
        switch httpResponse.statusCode {
        case 200...299:
            return
        case 401:
            throw APIError.unauthorized
        case 404:
            let message = (try? JSONDecoder().decode(ErrorBody.self, from: data))?.error ?? "Not found"
            throw APIError.notFound(message)
        default:
            let message = (try? JSONDecoder().decode(ErrorBody.self, from: data))?.error ?? "Unknown error"
            throw APIError.serverError(statusCode: httpResponse.statusCode, message: message)
        }
    }

    private func decode<T: Decodable>(_ data: Data, path: String) throws -> T {
        do {
            return try JSONDecoder().decode(T.self, from: data)
        } catch {
            let preview = String(data: data.prefix(500), encoding: .utf8) ?? "(binary)"
            log("Decode error for \(path): \(error)")
            log("Response body: \(preview)")
            throw APIError.decodingError(error)
        }
    }
}

// Internal types

private struct OkResponse: Decodable {
    let ok: Bool
}

private struct ErrorBody: Decodable {
    let error: String?
}

/// Allows plain HTTP connections by accepting all server trust challenges.
/// Used for local/Tailscale servers that don't have TLS certificates.
private final class InsecureSessionDelegate: NSObject, URLSessionDelegate, Sendable {
    func urlSession(
        _ session: URLSession,
        didReceive challenge: URLAuthenticationChallenge
    ) async -> (URLSession.AuthChallengeDisposition, URLCredential?) {
        if challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust,
           let trust = challenge.protectionSpace.serverTrust {
            return (.useCredential, URLCredential(trust: trust))
        }
        return (.performDefaultHandling, nil)
    }
}
