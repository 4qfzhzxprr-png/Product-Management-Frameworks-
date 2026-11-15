import DailyWorkCore
import SwiftUI

struct MainView: View {
    @EnvironmentObject private var state: AppState
    @State private var selection: SidebarItem? = .all
    @State private var search = ""

    var body: some View {
        NavigationSplitView {
            Sidebar(selection: $selection)
                .navigationSplitViewColumnWidth(min: 200, ideal: 230)
        } detail: {
            CaptureList(item: selection ?? .all, search: search)
        }
        .searchable(text: $search, prompt: "Search captures")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button {
                    CapturePanelController.shared.show()
                } label: {
                    Label("Quick Capture", systemImage: "square.and.pencil")
                }
                .help("Quick capture (Control-Option-Space from anywhere)")
            }
        }
        .alert(
            "Something went wrong",
            isPresented: Binding(
                get: { state.lastError != nil },
                set: { if !$0 { state.lastError = nil } }
            )
        ) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(state.lastError ?? "")
        }
        .frame(minWidth: 720, minHeight: 440)
    }
}

private struct Sidebar: View {
    @EnvironmentObject private var state: AppState
    @Binding var selection: SidebarItem?
    @State private var newPerson = ""
    @State private var newProject = ""

    var body: some View {
        List(selection: $selection) {
            Section("Captures") {
                Label("All", systemImage: "tray.full").tag(SidebarItem.all)
                Label("Open", systemImage: "circle").tag(SidebarItem.open)
                    .badge(state.waitingOnMe)
                Label("Wins", systemImage: "star").tag(SidebarItem.wins)
            }

            Section("People") {
                ForEach(state.people) { person in
                    Label(person.name, systemImage: person.isPM ? "person.crop.circle.fill" : "person.crop.circle")
                        .tag(SidebarItem.person(person.id))
                        .contextMenu {
                            Button(person.isPM ? "Not one of my PMs" : "One of my PMs") {
                                state.setPM(person, !person.isPM)
                            }
                            Button("Remove", role: .destructive) {
                                if selection == .person(person.id) { selection = .all }
                                state.delete(person)
                            }
                        }
                }
                TextField("Add person", text: $newPerson)
                    .onSubmit {
                        guard !newPerson.trimmingCharacters(in: .whitespaces).isEmpty else { return }
                        state.addPerson(name: newPerson, isPM: false)
                        newPerson = ""
                    }
            }

            Section("Projects") {
                ForEach(state.projects) { project in
                    Label(project.name, systemImage: "folder")
                        .tag(SidebarItem.project(project.id))
                        .contextMenu {
                            Button("Remove", role: .destructive) {
                                if selection == .project(project.id) { selection = .all }
                                state.delete(project)
                            }
                        }
                }
                TextField("Add project", text: $newProject)
                    .onSubmit {
                        guard !newProject.trimmingCharacters(in: .whitespaces).isEmpty else { return }
                        state.addProject(name: newProject)
                        newProject = ""
                    }
            }
        }
        .listStyle(.sidebar)
    }
}

private struct CaptureList: View {
    @EnvironmentObject private var state: AppState
    let item: SidebarItem
    let search: String

    private var title: String {
        switch item {
        case .all: return "All captures"
        case .open: return "Open"
        case .wins: return "Wins"
        case .person(let id): return state.personName(id) ?? "Person"
        case .project(let id): return state.projectName(id) ?? "Project"
        }
    }

    var body: some View {
        // Reading `revision` makes this view re-query after every change.
        let _ = state.revision
        let captures = state.captures(for: item, search: search)

        Group {
            if captures.isEmpty {
                VStack(spacing: 8) {
                    Text(search.isEmpty ? "Nothing here yet" : "No matches")
                        .font(.title3)
                    Text("Press Control-Option-Space anywhere to capture a note.")
                        .foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                List(captures) { capture in
                    CaptureRow(capture: capture)
                }
            }
        }
        .navigationTitle(title)
    }
}

private struct CaptureRow: View {
    @EnvironmentObject private var state: AppState
    let capture: Capture

    private var detail: String {
        var parts = [capture.kind.label]
        if let person = state.personName(capture.personID) { parts.append(person) }
        if let project = state.projectName(capture.projectID) { parts.append(project) }
        parts.append(capture.createdAt.formatted(date: .abbreviated, time: .shortened))
        return parts.joined(separator: " · ")
    }

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            if capture.kind.isActionable {
                Button {
                    state.setDone(capture, capture.doneAt == nil)
                } label: {
                    Image(systemName: capture.doneAt == nil ? "circle" : "checkmark.circle.fill")
                }
                .buttonStyle(.plain)
                .help(capture.doneAt == nil ? "Mark done" : "Mark not done")
            }

            VStack(alignment: .leading, spacing: 3) {
                Text(capture.body)
                    .strikethrough(capture.doneAt != nil)
                    .foregroundStyle(capture.doneAt == nil ? .primary : .secondary)
                    .textSelection(.enabled)
                Text(detail)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Spacer()

            Button {
                state.setWin(capture, !capture.isWin)
            } label: {
                Image(systemName: capture.isWin ? "star.fill" : "star")
                    .foregroundStyle(capture.isWin ? .yellow : .secondary)
            }
            .buttonStyle(.plain)
            .help(capture.isWin ? "Remove from wins" : "Mark as a win")
        }
        .padding(.vertical, 4)
        .contextMenu {
            Button("Delete", role: .destructive) {
                state.delete(capture)
            }
        }
    }
}
