import SwiftUI
import CCSessionAPI

struct TimelineFeed: View {
    let entries: [TimelineEntry]
    let pinnedEntries: [TimelineEntry]
    let hasMore: Bool
    let autoScrollEnabled: Bool
    let onLoadMore: () -> Void

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: 0) {
                    // Anchor for auto-scroll
                    Color.clear.frame(height: 0).id("top")

                    // Pinned attention section
                    if !pinnedEntries.isEmpty {
                        PinnedSection(entries: pinnedEntries)
                            .padding(.horizontal)
                            .padding(.top, 8)
                    }

                    // Feed entries grouped by time
                    ForEach(groupedByTime(entries), id: \.label) { group in
                        TimeSeparator(label: group.label)
                            .padding(.horizontal)

                        ForEach(Array(group.items.enumerated()), id: \.element.id) { index, entry in
                            let prev = index > 0 ? group.items[index - 1] : nil
                            if let prev, prev.sessionId == entry.sessionId {
                                Text("continued from \(entry.projectName)")
                                    .font(.system(size: 9, design: .monospaced))
                                    .foregroundStyle(.tertiary)
                                    .padding(.leading, 52)
                                    .padding(.vertical, 2)
                            }
                            FeedEntryView(entry: entry)
                                .padding(.horizontal)
                        }
                    }

                    if entries.isEmpty {
                        Text("No recent activity")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .padding(.top, 40)
                    }

                    // Load more trigger
                    if hasMore {
                        ProgressView()
                            .padding()
                            .onAppear { onLoadMore() }
                    }
                }
            }
            .onChange(of: entries.first?.uuid) {
                if autoScrollEnabled {
                    withAnimation {
                        proxy.scrollTo("top")
                    }
                }
            }
        }
    }
}

// MARK: - Pinned Section

struct PinnedSection: View {
    let entries: [TimelineEntry]

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Image(systemName: "exclamationmark.circle.fill")
                    .font(.caption)
                    .foregroundStyle(.red)
                Text("\(entries.count) item\(entries.count == 1 ? "" : "s") need\(entries.count == 1 ? "s" : "") attention")
                    .font(.system(size: 10, weight: .semibold, design: .monospaced))
                    .foregroundStyle(.red)
            }
            .padding(.horizontal, 10)
            .padding(.top, 6)

            ForEach(entries) { entry in
                FeedEntryView(entry: entry)
            }
        }
        .padding(.bottom, 8)
        .background(Color.red.opacity(0.04))
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .overlay(
            RoundedRectangle(cornerRadius: 8)
                .stroke(Color.red.opacity(0.12), lineWidth: 0.5)
        )
    }
}

// MARK: - Time Separator

struct TimeSeparator: View {
    let label: String

    var body: some View {
        HStack(spacing: 8) {
            Text(label)
                .font(.system(size: 9, weight: .medium, design: .monospaced))
                .foregroundStyle(.tertiary)
            Rectangle()
                .fill(Color(.separator).opacity(0.3))
                .frame(height: 0.5)
        }
        .padding(.top, 12)
        .padding(.bottom, 6)
    }
}

// MARK: - Time Grouping

struct TimeGroup: Hashable {
    let label: String
    let items: [TimelineEntry]

    func hash(into hasher: inout Hasher) {
        hasher.combine(label)
    }

    static func == (lhs: TimeGroup, rhs: TimeGroup) -> Bool {
        lhs.label == rhs.label
    }
}

func groupedByTime(_ entries: [TimelineEntry]) -> [TimeGroup] {
    var groups: [TimeGroup] = []
    var currentLabel: String?
    var currentItems: [TimelineEntry] = []

    for entry in entries {
        let label = timeLabel(entry.timestamp)
        if label != currentLabel {
            if let cl = currentLabel {
                groups.append(TimeGroup(label: cl, items: currentItems))
            }
            currentLabel = label
            currentItems = [entry]
        } else {
            currentItems.append(entry)
        }
    }
    if let cl = currentLabel {
        groups.append(TimeGroup(label: cl, items: currentItems))
    }
    return groups
}

private func timeLabel(_ timestamp: String) -> String {
    guard let date = ISO8601DateFormatter().date(from: timestamp) else { return "Unknown" }
    let diff = Int(Date().timeIntervalSince(date)) / 60

    if diff < 2 { return "JUST NOW" }
    if diff < 15 { return "\(diff) MINUTES AGO" }
    if diff < 30 { return "15 MINUTES AGO" }
    if diff < 60 { return "30 MINUTES AGO" }
    let hours = diff / 60
    if hours < 24 { return "\(hours) HOUR\(hours > 1 ? "S" : "") AGO" }
    let days = hours / 24
    return "\(days) DAY\(days > 1 ? "S" : "") AGO"
}
