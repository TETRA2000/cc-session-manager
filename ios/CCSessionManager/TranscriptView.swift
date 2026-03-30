import SwiftUI
import CCSessionAPI

struct TranscriptView: View {
    @Environment(AppState.self) private var appState
    let sessionId: String
    @State private var meta: SessionSummary?
    @State private var entries: [TranscriptEntry] = []
    @State private var error: String?
    var previewData: TranscriptResponse?

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 12) {
                ForEach(entries) { entry in
                    TranscriptEntryView(entry: entry)
                }
            }
            .padding()
        }
        .navigationTitle(meta?.aiSummary?.prefix(40).description ?? "Transcript")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if let webUrl = meta?.webUrl, let url = URL(string: webUrl) {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        print("[CCSessionManager] Opening webUrl: \(webUrl)")
                        UIApplication.shared.open(url)
                    } label: {
                        Label("Open in Web", systemImage: "globe")
                    }
                }
            }
        }
        .refreshable { await loadTranscript() }
        .onChange(of: meta?.webUrl) {
            print("[CCSessionManager] Transcript webUrl: \(meta?.webUrl ?? "nil")")
        }
        .task {
            if let previewData { meta = previewData.meta; entries = previewData.entries; return }
            await loadTranscript()
        }
        .overlay {
            if let error {
                ContentUnavailableView(
                    "Error",
                    systemImage: "exclamationmark.triangle",
                    description: Text(error)
                )
            }
        }
    }

    private func loadTranscript() async {
        guard let client = appState.client else { return }
        do {
            let response = try await client.getTranscript(sessionId: sessionId)
            meta = response.meta
            entries = response.entries
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }
}

struct TranscriptEntryView: View {
    let entry: TranscriptEntry
    @State private var isThinkingExpanded = false

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            // Header
            HStack {
                Label(entry.type.capitalized, systemImage: iconForType(entry.type))
                    .font(.caption)
                    .fontWeight(.semibold)
                    .foregroundStyle(colorForType(entry.type))

                Spacer()

                if let tokens = entry.tokens {
                    Text("\(tokens.input + tokens.output) tokens")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }

            // Message text
            if let text = entry.text, !text.isEmpty {
                Text(text)
                    .font(.body)
                    .textSelection(.enabled)
            }

            // Tool calls
            ForEach(entry.toolCalls) { tool in
                ToolCallView(tool: tool)
            }
        }
        .padding()
        .background(backgroundForType(entry.type))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private func iconForType(_ type: String) -> String {
        switch type {
        case "user": return "person"
        case "assistant": return "sparkles"
        case "system": return "gear"
        default: return "bubble.left"
        }
    }

    private func colorForType(_ type: String) -> Color {
        switch type {
        case "user": return .blue
        case "assistant": return .purple
        case "system": return .orange
        default: return .primary
        }
    }

    private func backgroundForType(_ type: String) -> Color {
        switch type {
        case "user": return .blue.opacity(0.08)
        case "assistant": return .purple.opacity(0.08)
        case "system": return .orange.opacity(0.08)
        default: return .gray.opacity(0.08)
        }
    }
}

struct ToolCallView: View {
    let tool: ToolCallEntry
    @State private var isExpanded = false

    var body: some View {
        DisclosureGroup(isExpanded: $isExpanded) {
            VStack(alignment: .leading, spacing: 4) {
                // Input
                if !tool.input.isEmpty {
                    Text("Input")
                        .font(.caption)
                        .fontWeight(.semibold)
                    Text(formatJSON(tool.input))
                        .font(.caption)
                        .fontDesign(.monospaced)
                        .textSelection(.enabled)
                }

                // Result
                if let result = tool.resultText {
                    Text(tool.isError == true ? "Error" : "Result")
                        .font(.caption)
                        .fontWeight(.semibold)
                        .foregroundStyle(tool.isError == true ? .red : .primary)
                    Text(result.prefix(500).description)
                        .font(.caption)
                        .fontDesign(.monospaced)
                        .textSelection(.enabled)
                        .lineLimit(10)
                }
            }
        } label: {
            Label(tool.name, systemImage: "wrench")
                .font(.caption)
                .foregroundStyle(.teal)
        }
    }

    private func formatJSON(_ dict: [String: JSONValue]) -> String {
        dict.map { key, value in "\(key): \(describeValue(value))" }.joined(separator: "\n")
    }

    private func describeValue(_ value: JSONValue) -> String {
        switch value {
        case .string(let s): return s.count > 100 ? String(s.prefix(100)) + "..." : s
        case .number(let n): return String(n)
        case .bool(let b): return String(b)
        case .null: return "null"
        case .array(let a): return "[\(a.count) items]"
        case .object(let o): return "{\(o.count) keys}"
        }
    }
}

#Preview("Transcript") {
    NavigationStack {
        TranscriptView(
            sessionId: "test",
            previewData: MockData.transcriptResponse
        )
        .environment(AppState.preview)
    }
}

#Preview("Transcript Entry - User") {
    TranscriptEntryView(entry: MockData.sampleTranscript[0])
        .padding()
}

#Preview("Transcript Entry - Assistant with Tools") {
    TranscriptEntryView(entry: MockData.sampleTranscript[1])
        .padding()
}
