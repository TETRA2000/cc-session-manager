import SwiftUI
import CCSessionAPI

struct DashboardView: View {
    @Environment(AppState.self) private var appState
    @State private var dashboard: DashboardResponse?
    @State private var error: String?
    @State private var isLoading = false
    var previewData: DashboardResponse?

    var body: some View {
        NavigationStack {
            List {
                if let dashboard {
                    Section("Stats") {
                        StatRow(label: "Projects", value: "\(dashboard.stats.projects)", icon: "folder")
                        StatRow(label: "Sessions", value: "\(dashboard.stats.sessions)", icon: "bubble.left.and.bubble.right")
                        StatRow(label: "Active (7d)", value: "\(dashboard.stats.active7d)", icon: "bolt")
                        StatRow(label: "Tokens (30d)", value: formatTokens(dashboard.stats.tokens30d), icon: "number")
                    }

                    Section("Recent Sessions") {
                        ForEach(dashboard.recentSessions) { session in
                            NavigationLink(value: session.id) {
                                SessionRowView(session: session)
                            }
                        }
                    }
                }

                if let error {
                    Section {
                        Label(error, systemImage: "exclamationmark.triangle")
                            .foregroundStyle(.red)
                    }
                }
            }
            .navigationTitle("Dashboard")
            .navigationDestination(for: String.self) { sessionId in
                TranscriptView(sessionId: sessionId)
            }
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Disconnect") {
                        appState.disconnect()
                    }
                }
            }
            .refreshable { await loadDashboard() }
            .task {
                if let previewData { dashboard = previewData; return }
                await loadDashboard()
            }
        }
    }

    private func loadDashboard() async {
        guard let client = appState.client else { return }
        isLoading = true
        do {
            dashboard = try await client.getDashboard()
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
        isLoading = false
    }

    private func formatTokens(_ count: Int) -> String {
        if count >= 1_000_000 { return String(format: "%.1fM", Double(count) / 1_000_000) }
        if count >= 1_000 { return String(format: "%.1fK", Double(count) / 1_000) }
        return "\(count)"
    }
}

struct StatRow: View {
    let label: String
    let value: String
    let icon: String

    var body: some View {
        HStack {
            Label(label, systemImage: icon)
            Spacer()
            Text(value)
                .foregroundStyle(.secondary)
        }
    }
}

struct SessionRowView: View {
    let session: SessionSummary

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(session.aiSummary ?? session.summary)
                    .lineLimit(2)
                Spacer()
                if session.isActive {
                    Text("ACTIVE")
                        .font(.caption2)
                        .fontWeight(.semibold)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(.green.opacity(0.2))
                        .foregroundStyle(.green)
                        .clipShape(Capsule())
                }
                if session.isRemoteConnected {
                    Text("REMOTE")
                        .font(.caption2)
                        .fontWeight(.semibold)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(.blue.opacity(0.2))
                        .foregroundStyle(.blue)
                        .clipShape(Capsule())
                }
            }
            HStack(spacing: 12) {
                if let model = session.model {
                    Label(model.replacingOccurrences(of: "claude-", with: ""), systemImage: "cpu")
                }
                if let branch = session.gitBranch {
                    Label(branch, systemImage: "arrow.triangle.branch")
                }
                Label("\(session.messageCount) msgs", systemImage: "bubble.left")
            }
            .font(.caption)
            .foregroundStyle(.secondary)
        }
        .padding(.vertical, 2)
    }
}

#Preview("Dashboard") {
    DashboardView(previewData: MockData.dashboardResponse)
        .environment(AppState.preview)
}

#Preview("Session Row - Active") {
    List {
        SessionRowView(session: MockData.sampleSessions[0])
        SessionRowView(session: MockData.sampleSessions[1])
        SessionRowView(session: MockData.sampleSessions[2])
    }
}
