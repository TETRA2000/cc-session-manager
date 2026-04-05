import SwiftUI
import CCSessionAPI


struct TimelineView: View {
    @Bindable var viewModel: TimelineViewModel

    init(viewModel: TimelineViewModel) {
        self.viewModel = viewModel
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                FilterBar(
                    selected: viewModel.importance,
                    counts: viewModel.counts,
                    autoScrollEnabled: $viewModel.autoScrollEnabled,
                    onSelect: { viewModel.setImportance($0) }
                )

                if viewModel.loading && viewModel.entries.isEmpty {
                    Spacer()
                    ProgressView("Loading timeline...")
                        .font(.caption)
                    Spacer()
                } else if let error = viewModel.error, viewModel.entries.isEmpty {
                    Spacer()
                    Text(error)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Spacer()
                } else {
                    HStack(spacing: 0) {
                        // Active Sessions Sidebar (iPad / landscape)
                        ActiveSessionsSidebar(
                            sessions: viewModel.activeSessions,
                            selectedId: viewModel.selectedSessionId,
                            onSelect: { viewModel.toggleSession($0) }
                        )
                        .frame(width: 220)

                        Divider()

                        // Feed
                        TimelineFeed(
                            entries: viewModel.filteredEntries,
                            pinnedEntries: viewModel.pinnedEntries,
                            hasMore: viewModel.hasMore,
                            autoScrollEnabled: viewModel.autoScrollEnabled,
                            onLoadMore: { Task { await viewModel.loadMore() } }
                        )
                    }
                }
            }
            .navigationTitle("Timeline")
            .navigationBarTitleDisplayMode(.inline)
        }
    }
}

