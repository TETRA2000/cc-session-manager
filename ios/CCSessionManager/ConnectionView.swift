import SwiftUI

struct ConnectionView: View {
    @Environment(AppState.self) private var appState
    @State private var serverURL = ""
    @State private var token = ""
    @State private var isConnecting = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Server") {
                    TextField("URL (e.g., http://192.168.1.100:3456)", text: $serverURL)
                        .textContentType(.URL)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)

                    SecureField("Auth Token", text: $token)
                        .textContentType(.password)
                }

                if let error = appState.connectionError {
                    Section {
                        Label(error, systemImage: "exclamationmark.triangle")
                            .foregroundStyle(.red)
                    }
                }

                Section {
                    Button(action: connect) {
                        if isConnecting {
                            ProgressView()
                                .frame(maxWidth: .infinity)
                        } else {
                            Text("Connect")
                                .frame(maxWidth: .infinity)
                        }
                    }
                    .disabled(serverURL.isEmpty || token.isEmpty || isConnecting)
                }
            }
            .navigationTitle("CC Session Manager")
        }
    }

    private func connect() {
        guard let url = URL(string: serverURL) else {
            return
        }
        isConnecting = true
        Task {
            await appState.connect(serverURL: url, token: token)
            isConnecting = false
        }
    }
}
