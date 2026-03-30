import SwiftUI
import CCSessionAPI

@Observable
final class AppState {
    var client: SessionClient?
    var isConnected: Bool { client != nil }
    var connectionError: String?

    init() {
        // Try to load saved connection
        if let saved = KeychainService.load() {
            self.client = SessionClient(serverURL: saved.serverURL, token: saved.token)
        }
    }

    func connect(serverURL: URL, token: String) async {
        let newClient = SessionClient(serverURL: serverURL, token: token)
        // Test connection by fetching dashboard
        do {
            _ = try await newClient.getDashboard()
            self.client = newClient
            self.connectionError = nil
            // Save to Keychain
            try? KeychainService.save(ServerConnection(serverURL: serverURL, token: token))
        } catch {
            self.connectionError = "Connection failed: \(error.localizedDescription)"
        }
    }

    func disconnect() {
        client = nil
        connectionError = nil
        KeychainService.delete()
    }
}
