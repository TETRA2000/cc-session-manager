import SwiftUI
import SwiftTerm
import CCSessionAPI
import Foundation

// MARK: - WebSocket Terminal Connection

@Observable
final class TerminalConnection {
    var isConnected = false
    var sessionId: String?
    var error: String?

    private var task: URLSessionWebSocketTask?
    private var onData: ((Data) -> Void)?
    private var reconnectAttempts = 0
    private let maxReconnectAttempts = 3
    private var serverURL: URL?
    private var token: String?

    func connect(serverURL: URL, token: String?, onData: @escaping (Data) -> Void) {
        self.serverURL = serverURL
        self.token = token
        self.onData = onData
        self.reconnectAttempts = 0
        doConnect()
    }

    private func doConnect() {
        guard let serverURL else { return }
        var urlString = serverURL.absoluteString
            .replacingOccurrences(of: "http://", with: "ws://")
            .replacingOccurrences(of: "https://", with: "wss://")
        urlString = urlString.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        urlString += "/api/terminal/ws"
        if let token {
            urlString += "?token=\(token)"
        }
        guard let url = URL(string: urlString) else {
            error = "Invalid WebSocket URL"
            return
        }

        let session = URLSession(configuration: .default)
        task = session.webSocketTask(with: url)
        task?.resume()

        // Send connect message
        let connectMsg: [String: Any]
        if let sid = sessionId {
            connectMsg = ["type": "connect", "sessionId": sid]
        } else {
            connectMsg = ["type": "connect"]
        }
        if let data = try? JSONSerialization.data(withJSONObject: connectMsg),
           let str = String(data: data, encoding: .utf8) {
            task?.send(.string(str)) { [weak self] err in
                if let err { self?.error = "Send failed: \(err.localizedDescription)" }
            }
        }

        receiveLoop()
    }

    func send(data: Data) {
        let base64 = data.base64EncodedString()
        let msg = #"{"type":"data","data":"\#(base64)"}"#
        task?.send(.string(msg)) { _ in }
    }

    func sendResize(cols: Int, rows: Int) {
        let msg = #"{"type":"resize","cols":\#(cols),"rows":\#(rows)}"#
        task?.send(.string(msg)) { _ in }
    }

    func disconnect() {
        reconnectAttempts = maxReconnectAttempts // prevent auto-reconnect
        task?.cancel(with: .goingAway, reason: nil)
        task = nil
        isConnected = false
    }

    private func receiveLoop() {
        task?.receive { [weak self] result in
            guard let self else { return }
            switch result {
            case .success(let message):
                self.handleMessage(message)
                self.receiveLoop()
            case .failure(let err):
                self.handleDisconnect(err)
            }
        }
    }

    private func handleMessage(_ message: URLSessionWebSocketTask.Message) {
        guard case .string(let text) = message,
              let data = text.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let type = json["type"] as? String else { return }

        switch type {
        case "connected":
            sessionId = json["sessionId"] as? String
            isConnected = true
            reconnectAttempts = 0
            error = nil
        case "data":
            if let b64 = json["data"] as? String, let decoded = Data(base64Encoded: b64) {
                onData?(decoded)
            }
        case "exit":
            let code = json["code"] as? Int ?? 0
            error = "Session ended (exit code \(code))"
            isConnected = false
        case "error":
            error = json["message"] as? String ?? "Unknown error"
        case "pong":
            break
        default:
            break
        }
    }

    private func handleDisconnect(_ err: Error) {
        isConnected = false
        if reconnectAttempts < maxReconnectAttempts {
            reconnectAttempts += 1
            let delay = Double(reconnectAttempts) * 1.0 // exponential-ish backoff
            error = "Reconnecting (\(reconnectAttempts)/\(maxReconnectAttempts))..."
            DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
                self?.doConnect()
            }
        } else {
            error = "Disconnected: \(err.localizedDescription)"
        }
    }
}

// MARK: - SwiftTerm UIViewRepresentable

struct TerminalUIView: UIViewRepresentable {
    let connection: TerminalConnection

    func makeUIView(context: Context) -> TerminalView {
        let tv = TerminalView(frame: .zero)
        tv.configureNativeColors()
        tv.font = UIFont.monospacedSystemFont(ofSize: 14, weight: .regular)
        tv.terminalDelegate = context.coordinator
        context.coordinator.terminalView = tv

        // Feed data from WebSocket into terminal
        connection.onData = { data in
            DispatchQueue.main.async {
                tv.feed(byteArray: ArraySlice(data))
            }
        }

        return tv
    }

    func updateUIView(_ uiView: TerminalView, context: Context) {}

    func makeCoordinator() -> Coordinator {
        Coordinator(connection: connection)
    }

    class Coordinator: NSObject, TerminalViewDelegate {
        weak var terminalView: TerminalView?
        let connection: TerminalConnection

        init(connection: TerminalConnection) {
            self.connection = connection
        }

        func send(source: TerminalView, data: ArraySlice<UInt8>) {
            connection.send(data: Data(data))
        }

        func scrolled(source: TerminalView, position: Double) {}

        func setTerminalTitle(source: TerminalView, title: String) {}

        func sizeChanged(source: TerminalView, newCols: Int, newRows: Int) {
            connection.sendResize(cols: newCols, rows: newRows)
        }

        func hostCurrentDirectoryUpdate(source: TerminalView, directory: String?) {}

        func requestOpenLink(source: TerminalView, link: String, params: [String : String]) {
            if let url = URL(string: link) {
                UIApplication.shared.open(url)
            }
        }
    }

    private func onData(_ handler: @escaping (Data) -> Void) -> TerminalUIView {
        connection.onData = handler
        return self
    }
}

// MARK: - Terminal Session View

struct TerminalSessionView: View {
    @Environment(AppState.self) private var appState
    @State private var connection = TerminalConnection()
    var initialCommand: String?

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            if connection.isConnected {
                TerminalUIView(connection: connection)
                    .ignoresSafeArea(.keyboard)
            } else if let error = connection.error {
                VStack(spacing: 16) {
                    Image(systemName: "terminal")
                        .font(.largeTitle)
                        .foregroundStyle(.secondary)
                    Text(error)
                        .foregroundStyle(.secondary)
                    Button("Retry") {
                        connectTerminal()
                    }
                    .buttonStyle(.bordered)
                }
            } else {
                ProgressView("Connecting...")
                    .foregroundStyle(.white)
            }
        }
        .navigationTitle("Terminal")
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(.black, for: .navigationBar)
        .toolbarColorScheme(.dark, for: .navigationBar)
        .onAppear { connectTerminal() }
        .onDisappear { connection.disconnect() }
    }

    private func connectTerminal() {
        guard let client = appState.client else { return }
        let saved = KeychainService.load()
        connection.connect(
            serverURL: client.serverURL,
            token: saved?.token
        ) { _ in }

        // If there's an initial command (e.g., launching claude), send it after connection
        if let cmd = initialCommand {
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
                if connection.isConnected {
                    connection.send(data: Data((cmd + "\n").utf8))
                }
            }
        }
    }
}
