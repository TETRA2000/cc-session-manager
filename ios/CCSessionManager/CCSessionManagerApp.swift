import SwiftUI

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
    var body: some View {
        TabView {
            DashboardView()
                .tabItem {
                    Label("Dashboard", systemImage: "chart.bar")
                }

            ProjectListView()
                .tabItem {
                    Label("Projects", systemImage: "folder")
                }

            TerminalPlaceholderView()
                .tabItem {
                    Label("Terminal", systemImage: "terminal")
                }
        }
    }
}

struct TerminalPlaceholderView: View {
    var body: some View {
        NavigationStack {
            ContentUnavailableView(
                "Terminal",
                systemImage: "terminal",
                description: Text("Terminal access coming soon")
            )
            .navigationTitle("Terminal")
        }
    }
}
