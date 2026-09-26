import SwiftUI

struct PeopleView: View {
    @State private var circle: [Person] = []
    @State private var circlesImIn: [Person] = []
    @State private var showingAdd = false
    @State private var newName = ""
    @State private var invite: Invite?
    @State private var errorMessage: String?

    struct Invite: Identifiable {
        let id = UUID()
        let personName: String
        let code: String
    }

    var body: some View {
        List {
            Section {
                ForEach(circle) { person in
                    row(for: person)
                        .deleteDisabled(person.isMe)
                }
                .onDelete { offsets in
                    let people = offsets.map { circle[$0] }
                    Task { await delete(people) }
                }
            } header: {
                Text("Your circle")
            } footer: {
                Text("Invite someone and once they sign in with the code, they'll see every visit you've logged with them, including future ones.")
            }

            if !circlesImIn.isEmpty {
                Section("Circles you're in") {
                    ForEach(circlesImIn) { person in
                        Text("\(person.owner?.displayName ?? "Someone") added you as \(person.name)")
                    }
                }
            }
        }
        .navigationTitle("People")
        .toolbar {
            Button {
                showingAdd = true
            } label: {
                Image(systemName: "person.badge.plus")
            }
            .accessibilityLabel("Add person")
        }
        .alert("Add a person", isPresented: $showingAdd) {
            TextField("Name", text: $newName)
                .textInputAutocapitalization(.words)
            Button("Add") { Task { await add() } }
            Button("Cancel", role: .cancel) { newName = "" }
        }
        .sheet(item: $invite) { InviteSheet(invite: $0) }
        .task { await load() }
        .refreshable { await load() }
        .errorAlert($errorMessage)
    }

    @ViewBuilder private func row(for person: Person) -> some View {
        HStack {
            Text(person.name)
            if person.isMe {
                Text("You")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            if person.isMe {
                EmptyView()
            } else if person.linkedUserId != nil {
                Label("Joined", systemImage: "checkmark.circle.fill")
                    .font(.caption)
                    .foregroundStyle(.green)
            } else {
                Button("Invite") { Task { await makeInvite(for: person) } }
                    .buttonStyle(.bordered)
                    .controlSize(.small)
            }
        }
    }

    private func load() async {
        do {
            async let mine = API.myCircle()
            async let joined = API.circlesImIn()
            circle = try await mine
            circlesImIn = try await joined
        } catch is CancellationError {
        } catch {
            errorMessage = friendlyMessage(error)
        }
    }

    private func add() async {
        let name = newName.trimmingCharacters(in: .whitespaces)
        newName = ""
        guard !name.isEmpty else { return }
        do {
            circle.append(try await API.addPerson(named: name))
        } catch {
            errorMessage = friendlyMessage(error)
        }
    }

    private func delete(_ people: [Person]) async {
        for person in people where !person.isMe {
            do {
                try await API.deletePerson(person.id)
                circle.removeAll { $0.id == person.id }
            } catch {
                errorMessage = friendlyMessage(error)
            }
        }
    }

    private func makeInvite(for person: Person) async {
        do {
            let code = try await API.createInvite(for: person.id)
            invite = Invite(personName: person.name, code: code)
        } catch {
            errorMessage = friendlyMessage(error)
        }
    }
}

private struct InviteSheet: View {
    let invite: PeopleView.Invite
    @Environment(\.dismiss) private var dismiss

    private var message: String {
        "I'm using Resto to keep track of what we order at restaurants. Install it, sign in, and enter invite code \(invite.code) on the Profile tab to see our visits."
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 20) {
                Text("Invite \(invite.personName)")
                    .font(.title2.bold())
                Text(invite.code)
                    .font(.system(size: 44, weight: .bold, design: .monospaced))
                    .textSelection(.enabled)
                Text("When \(invite.personName) enters this code in Resto, they'll see every visit you've logged with them.")
                    .multilineTextAlignment(.center)
                    .foregroundStyle(.secondary)
                ShareLink(item: message) {
                    Label("Send invite", systemImage: "square.and.arrow.up")
                }
                .buttonStyle(.borderedProminent)
            }
            .padding()
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
        .presentationDetents([.medium])
    }
}
