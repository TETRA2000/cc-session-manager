#if canImport(SwiftUI)
import SwiftUI
import CCSessionAPI

struct FeedEntryView: View {
    let entry: TimelineEntry
    @State private var expanded = false

    private var avatarColor: Color {
        switch entry.type {
        case "assistant": .purple
        case "user": .blue
        default: .gray
        }
    }

    private var avatarText: String {
        switch entry.type {
        case "assistant": "AI"
        case "user": "U"
        default: "!"
        }
    }

    private var roleLabel: String {
        entry.type.uppercased()
    }

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            // Importance bar
            RoundedRectangle(cornerRadius: 1.5)
                .fill(entry.importance == "high" ? Color.red : Color.clear)
                .frame(width: 3)

            // Avatar
            Text(avatarText)
                .font(.system(size: 10, weight: .semibold, design: .monospaced))
                .frame(width: 28, height: 28)
                .background(avatarColor.opacity(0.12))
                .foregroundStyle(avatarColor)
                .clipShape(RoundedRectangle(cornerRadius: 6))

            // Body
            VStack(alignment: .leading, spacing: 4) {
                // Header row
                HStack(spacing: 6) {
                    Text(roleLabel)
                        .font(.system(size: 10, weight: .semibold, design: .monospaced))
                        .foregroundStyle(avatarColor)

                    Text(entry.projectName)
                        .font(.system(size: 9, design: .monospaced))
                        .padding(.horizontal, 5)
                        .padding(.vertical, 1)
                        .background(Color(.systemGray5))
                        .clipShape(RoundedRectangle(cornerRadius: 3))

                    if entry.isRemoteConnected {
                        StatusBadge(status: "remote")
                    }

                    if entry.isAttention {
                        AttentionBadge(type: entry.type)
                    }

                    Spacer()

                    Text(relativeTime(entry.timestamp))
                        .font(.system(size: 9, design: .monospaced))
                        .foregroundStyle(.tertiary)
                }

                // Text content
                if let text = entry.text, !text.isEmpty {
                    Text(text)
                        .font(.system(size: 13))
                        .foregroundStyle(.secondary)
                        .lineLimit(expanded ? nil : 3)
                        .onTapGesture { expanded.toggle() }
                }

                // Tool names
                if !entry.toolNames.isEmpty {
                    HStack(spacing: 4) {
                        ForEach(entry.toolNames, id: \.self) { name in
                            Text(name)
                                .font(.system(size: 10, design: .monospaced))
                                .padding(.horizontal, 5)
                                .padding(.vertical, 2)
                                .background(Color.orange.opacity(0.08))
                                .foregroundStyle(.orange)
                                .clipShape(RoundedRectangle(cornerRadius: 4))
                                .overlay(
                                    RoundedRectangle(cornerRadius: 4)
                                        .stroke(Color(.separator).opacity(0.3), lineWidth: 0.5)
                                )
                        }
                    }
                }
            }
        }
        .padding(.vertical, 8)
        .padding(.horizontal, 6)
        .background(
            entry.isAttention
                ? Color.red.opacity(0.04)
                : Color.clear
        )
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .overlay(
            entry.isAttention
                ? RoundedRectangle(cornerRadius: 8)
                    .stroke(Color.red.opacity(0.15), lineWidth: 0.5)
                : nil
        )
    }
}

struct AttentionBadge: View {
    let type: String

    var body: some View {
        Text(type == "system" ? "! ERROR" : "? NEEDS INPUT")
            .font(.system(size: 8, weight: .semibold, design: .monospaced))
            .padding(.horizontal, 5)
            .padding(.vertical, 2)
            .background(Color.red.opacity(0.1))
            .foregroundStyle(.red)
            .clipShape(RoundedRectangle(cornerRadius: 4))
            .overlay(
                RoundedRectangle(cornerRadius: 4)
                    .stroke(Color.red.opacity(0.2), lineWidth: 0.5)
            )
    }
}

#endif
