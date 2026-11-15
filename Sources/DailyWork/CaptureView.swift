import DailyWorkCore
import SwiftUI

/// The quick capture form shown in the floating panel.
struct CaptureView: View {
    @EnvironmentObject private var state: AppState
    let onDone: () -> Void

    @State private var text = ""
    @State private var kind = CaptureKind.note
    @State private var personID: Int64?
    @State private var projectID: Int64?
    @State private var isWin = false
    @FocusState private var textFocused: Bool

    private var canSave: Bool {
        !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            TextField("Thought, commitment or note", text: $text, axis: .vertical)
                .textFieldStyle(.plain)
                .font(.title3)
                .lineLimit(2...5)
                .focused($textFocused)
                .onSubmit(save)

            Divider()

            HStack(spacing: 12) {
                Picker("Kind", selection: $kind) {
                    ForEach(CaptureKind.allCases, id: \.self) { kind in
                        Text(kind.label).tag(kind)
                    }
                }
                Picker("Person", selection: $personID) {
                    Text("No one").tag(Int64?.none)
                    ForEach(state.people) { person in
                        Text(person.name).tag(Int64?.some(person.id))
                    }
                }
                Picker("Project", selection: $projectID) {
                    Text("None").tag(Int64?.none)
                    ForEach(state.projects) { project in
                        Text(project.name).tag(Int64?.some(project.id))
                    }
                }
            }
            .labelsHidden()

            HStack {
                Toggle("Win", isOn: $isWin)
                    .toggleStyle(.checkbox)
                    .help("Wins are collected for later updates and decks")
                Spacer()
                Text("Return to save, Esc to cancel")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Button("Save", action: save)
                    .keyboardShortcut(.defaultAction)
                    .disabled(!canSave)
            }
        }
        .padding(.horizontal, 20)
        .padding(.bottom, 16)
        .padding(.top, 28)
        .frame(width: 560)
        .onAppear { textFocused = true }
    }

    private func save() {
        guard canSave else { return }
        if state.addCapture(body: text, kind: kind, personID: personID, projectID: projectID, isWin: isWin) {
            onDone()
        }
    }
}
