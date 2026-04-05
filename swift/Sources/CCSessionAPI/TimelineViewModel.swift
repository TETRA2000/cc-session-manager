#if canImport(SwiftUI)
import SwiftUI

@Observable
public final class TimelineViewModel {
    public var entries: [TimelineEntry] = []
    public var activeSessions: [ActiveSessionInfo] = []
    public var loading = false
    public var error: String?
    public var importance: String = "all"
    public var selectedSessionId: String?
    public var autoScrollEnabled = true
    public var hasMore = false

    private var oldestTimestamp: String?
    private var client: SessionClient?
    private var pollTask: Task<Void, Never>?

    public init() {}

    public var pinnedEntries: [TimelineEntry] {
        let activeIds = Set(activeSessions.map(\.sessionId))
        return entries
            .filter { $0.isAttention && activeIds.contains($0.sessionId) }
            .sorted { $0.timestamp < $1.timestamp }
    }

    public var filteredEntries: [TimelineEntry] {
        var result = entries
        if let sid = selectedSessionId {
            result = result.filter { $0.sessionId == sid }
        }
        return result
    }

    public var counts: [String: Int] {
        var c = ["all": entries.count, "high": 0, "normal": 0, "low": 0]
        for e in entries { c[e.importance, default: 0] += 1 }
        return c
    }

    public func connect(client: SessionClient) {
        self.client = client
        startPolling()
    }

    public func disconnect() {
        pollTask?.cancel()
        pollTask = nil
    }

    public func startPolling() {
        pollTask?.cancel()
        pollTask = Task { [weak self] in
            while !Task.isCancelled {
                await self?.fetchTimeline()
                try? await Task.sleep(for: .seconds(10))
            }
        }
    }

    public func fetchTimeline() async {
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

    public func loadMore() async {
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

    public func setImportance(_ value: String) {
        importance = value
        loading = true
        Task { await fetchTimeline() }
    }

    public func toggleSession(_ sessionId: String) {
        selectedSessionId = selectedSessionId == sessionId ? nil : sessionId
    }
}

#endif
