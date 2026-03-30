#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
import Foundation

public final class SessionClient: Sendable {
    public let serverURL: URL
    private let token: String?

    public init(serverURL: URL, token: String? = nil) {
        self.serverURL = serverURL
        self.token = token
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
        // URLAppendingPathComponent may encode slashes; rebuild from string
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
        let (data, response) = try await performRequest(request)
        try checkResponse(response, data: data)
        return try decode(data)
    }

    private func post<Body: Encodable, T: Decodable>(_ path: String, body: Body, method: String = "POST") async throws -> T {
        var request = buildRequest(path: path, method: method)
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(body)
        let (data, response) = try await performRequest(request)
        try checkResponse(response, data: data)
        return try decode(data)
    }

    private func performRequest(_ request: URLRequest) async throws -> (Data, URLResponse) {
        do {
            return try await URLSession.shared.data(for: request)
        } catch {
            throw APIError.networkError(error)
        }
    }

    private func checkResponse(_ response: URLResponse, data: Data) throws {
        guard let httpResponse = response as? HTTPURLResponse else { return }
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

    private func decode<T: Decodable>(_ data: Data) throws -> T {
        do {
            return try JSONDecoder().decode(T.self, from: data)
        } catch {
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
