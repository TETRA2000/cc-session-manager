import SwiftUI

struct ContentView: View {
    @State private var serverURL = ""
    @State private var token = ""
    @State private var connected = false
    @State private var viewModel = TimelineViewModel()

    var body: some View {
        if connected {
            TimelineView(viewModel: viewModel)
                .onDisappear { viewModel.disconnect() }
        } else {
            NavigationStack {
                Form {
                    Section("Server") {
                        TextField("URL (e.g. http://192.168.1.100:3456)", text: $serverURL)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .keyboardType(.URL)
                        TextField("Token (optional)", text: $token)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                    }
                    Button("Connect") {
                        guard let url = URL(string: serverURL) else { return }
                        viewModel.connect(serverURL: url, token: token.isEmpty ? nil : token)
                        connected = true
                    }
                    .disabled(serverURL.isEmpty)
                }
                .navigationTitle("Session Manager")
            }
        }
    }
}
