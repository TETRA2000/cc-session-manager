import SwiftUI
import CCSessionAPI

struct ProjectListView: View {
    @Environment(AppState.self) private var appState
    @State private var projects: [ProjectSummary] = []
    @State private var searchText = ""
    @State private var error: String?

    private var filteredProjects: [ProjectSummary] {
        if searchText.isEmpty { return projects }
        return projects.filter { $0.displayName.localizedCaseInsensitiveContains(searchText) }
    }

    var body: some View {
        NavigationStack {
            List(filteredProjects) { project in
                NavigationLink(value: project.id) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(project.displayName)
                            .fontWeight(.medium)
                        HStack(spacing: 12) {
                            Label("\(project.sessionCount) sessions", systemImage: "bubble.left.and.bubble.right")
                            Label(project.lastActivity.prefix(10).description, systemImage: "clock")
                            if project.isWorktree {
                                Label("Worktree", systemImage: "arrow.triangle.branch")
                            }
                        }
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    }
                    .padding(.vertical, 2)
                }
            }
            .navigationTitle("Projects")
            .searchable(text: $searchText, prompt: "Filter projects")
            .navigationDestination(for: String.self) { projectId in
                ProjectDetailView(projectId: projectId)
            }
            .refreshable { await loadProjects() }
            .task { await loadProjects() }
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
    }

    private func loadProjects() async {
        guard let client = appState.client else { return }
        do {
            let response = try await client.getProjects()
            projects = response.projects
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }
}

struct ProjectDetailView: View {
    @Environment(AppState.self) private var appState
    let projectId: String
    @State private var project: ProjectSummary?
    @State private var sessions: [SessionSummary] = []
    @State private var error: String?

    var body: some View {
        List(sessions) { session in
            NavigationLink(value: session.id) {
                SessionRowView(session: session)
            }
        }
        .navigationTitle(project?.displayName ?? "Project")
        .navigationDestination(for: String.self) { sessionId in
            TranscriptView(sessionId: sessionId)
        }
        .refreshable { await loadProject() }
        .task { await loadProject() }
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

    private func loadProject() async {
        guard let client = appState.client else { return }
        do {
            let response = try await client.getProject(id: projectId)
            project = response.project
            sessions = response.sessions
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }
}
