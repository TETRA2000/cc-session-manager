#if canImport(SwiftUI)
import SwiftUI
import CCSessionAPI

struct ActiveSessionsSidebar: View {
    let sessions: [ActiveSessionInfo]
    let selectedId: String?
    let onSelect: (String) -> Void

    private var needsAttention: [ActiveSessionInfo] {
        sessions.filter(\.hasAttention)
    }

    private var running: [ActiveSessionInfo] {
        sessions.filter { !$0.hasAttention }
    }

    var body: some View {
        List {
            if !needsAttention.isEmpty {
                Section("Needs Attention") {
                    ForEach(needsAttention) { session in
                        SessionRow(
                            session: session,
                            isSelected: selectedId == session.sessionId,
                            onSelect: onSelect
                        )
                    }
                }
            }

            if !running.isEmpty {
                Section("Running") {
                    ForEach(running) { session in
                        SessionRow(
                            session: session,
                            isSelected: selectedId == session.sessionId,
                            onSelect: onSelect
                        )
                    }
                }
            }

            if sessions.isEmpty {
                Text("No active sessions")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity)
                    .padding()
            }
        }
        .listStyle(.sidebar)
    }
}

private struct SessionRow: View {
    let session: ActiveSessionInfo
    let isSelected: Bool
    let onSelect: (String) -> Void

    var body: some View {
        Button {
            onSelect(session.sessionId)
        } label: {
            HStack(spacing: 8) {
                Circle()
                    .fill(session.status == "remote" ? Color.blue : Color.green)
                    .frame(width: 8, height: 8)

                VStack(alignment: .leading, spacing: 2) {
                    Text(session.projectName)
                        .font(.caption)
                        .fontWeight(.medium)
                        .lineLimit(1)

                    HStack(spacing: 4) {
                        Text(relativeTime(session.lastActivity))
                            .font(.caption2)
                            .foregroundStyle(.secondary)

                        StatusBadge(status: session.status)
                    }
                }

                Spacer()

                if session.hasAttention {
                    Circle()
                        .fill(Color.red)
                        .frame(width: 7, height: 7)
                }
            }
            .padding(.vertical, 2)
        }
        .buttonStyle(.plain)
        .listRowBackground(isSelected ? Color.purple.opacity(0.1) : nil)
    }
}

struct StatusBadge: View {
    let status: String

    var body: some View {
        Text(status.uppercased())
            .font(.system(size: 8, weight: .semibold, design: .monospaced))
            .padding(.horizontal, 5)
            .padding(.vertical, 1)
            .background(status == "remote" ? Color.blue.opacity(0.12) : Color.green.opacity(0.12))
            .foregroundStyle(status == "remote" ? .blue : .green)
            .clipShape(RoundedRectangle(cornerRadius: 3))
    }
}

func relativeTime(_ iso: String) -> String {
    guard let date = ISO8601DateFormatter().date(from: iso) else { return iso }
    let diff = Int(Date().timeIntervalSince(date))
    if diff < 60 { return "now" }
    if diff < 3600 { return "\(diff / 60)m ago" }
    if diff < 86400 { return "\(diff / 3600)h ago" }
    return "\(diff / 86400)d ago"
}

#endif
