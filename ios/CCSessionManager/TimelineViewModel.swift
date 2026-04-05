import SwiftUI
import CCSessionAPI

@Observable
final class TimelineViewModel {
    var entries: [TimelineEntry] = []
    var activeSessions: [ActiveSessionInfo] = []
    var loading = false
    var error: String?
    var importance: String = "all"
    var selectedSessionId: String?
    var autoScrollEnabled = true
    var hasMore = false

    private var oldestTimestamp: String?
    private var client: SessionClient?
    private var pollTask: Task<Void, Never>?

    init() {}

    var pinnedEntries: [TimelineEntry] {
        let activeIds = Set(activeSessions.map(\.sessionId))
        return entries
            .filter { $0.isAttention && activeIds.contains($0.sessionId) }
            .sorted { $0.timestamp < $1.timestamp }
    }

    var filteredEntries: [TimelineEntry] {
        var result = entries
        if let sid = selectedSessionId {
            result = result.filter { $0.sessionId == sid }
        }
        return result
    }

    var counts: [String: Int] {
        var c = ["all": entries.count, "high": 0, "normal": 0, "low": 0]
        for e in entries { c[e.importance, default: 0] += 1 }
        return c
    }

    func connect(client: SessionClient) {
        self.client = client
        startPolling()
    }

    func disconnect() {
        pollTask?.cancel()
        pollTask = nil
    }

    func startPolling() {
        pollTask?.cancel()
        pollTask = Task { [weak self] in
            while !Task.isCancelled {
                await self?.fetchTimeline()
                try? await Task.sleep(for: .seconds(10))
            }
        }
    }

    func fetchTimeline() async {
        guard let client else { return }
        do {
            let imp = importance == "all" ? nil : importance
            let response = try await client.getTimeline(importance: imp)
            await MainActor.run {
                self.entries = response.entries
                self.activeSessions = response.activeSessions
                self.hasMore = response.hasMore
                self.oldestTimestamp = response.oldestTimestamp
                self.error = nil
                self.loading = false
            }
        } catch {
            await MainActor.run {
                self.error = error.localizedDescription
                self.loading = false
            }
        }
    }

    func loadMore() async {
        guard let client, let before = oldestTimestamp, hasMore else { return }
        do {
            let imp = importance == "all" ? nil : importance
            let response = try await client.getTimeline(before: before, importance: imp)
            await MainActor.run {
                self.entries.append(contentsOf: response.entries)
                self.hasMore = response.hasMore
                self.oldestTimestamp = response.oldestTimestamp
            }
        } catch {
            // Silently ignore load-more failures
        }
    }

    func setImportance(_ value: String) {
        importance = value
        loading = true
        Task { await fetchTimeline() }
    }

    func toggleSession(_ sessionId: String) {
        selectedSessionId = selectedSessionId == sessionId ? nil : sessionId
    }
}

