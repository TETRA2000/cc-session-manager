import SwiftUI
import CCSessionAPI

@main
struct CCSessionManagerApp: App {
    @State private var appState = AppState()

    var body: some Scene {
        WindowGroup {
            Group {
                if appState.isConnected {
                    MainTabView()
                } else {
                    ConnectionView()
                }
            }
            .environment(appState)
        }
    }
}

struct MainTabView: View {
    @Environment(AppState.self) private var appState
    @State private var timelineViewModel = TimelineViewModel()

    var body: some View {
        TabView {
            DashboardView()
                .tabItem {
                    Label("Dashboard", systemImage: "chart.bar")
                }

            TimelineView(viewModel: timelineViewModel)
                .tabItem {
                    Label("Timeline", systemImage: "list.bullet")
                }

            ProjectListView()
                .tabItem {
                    Label("Projects", systemImage: "folder")
                }

            NavigationStack {
                TerminalSessionView()
            }
            .tabItem {
                Label("Terminal", systemImage: "terminal")
            }
        }
        .onAppear {
            if let client = appState.client {
                timelineViewModel.connect(client: client)
            }
        }
        .onDisappear {
            timelineViewModel.disconnect()
        }
    }
}
