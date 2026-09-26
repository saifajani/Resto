import SwiftUI

struct ProfileView: View {
    @Environment(AuthManager.self) private var auth

    @State private var displayName = ""
    @State private var savedName = ""
    @State private var inviteCode = ""
    @State private var isWorking = false
    @State private var statusMessage: String?
    @State private var errorMessage: String?

    var body: some View {
        Form {
            Section {
                TextField("Your name", text: $displayName)
                    .textInputAutocapitalization(.words)
                Button("Save name") { Task { await saveName() } }
                    .disabled(trimmedName.isEmpty || trimmedName == savedName || isWorking)
            } header: {
                Text("Your name")
            } footer: {
                Text("This is how you appear to people you share visits with.")
            }

            Section {
                TextField("Invite code", text: $inviteCode)
                    .textInputAutocapitalization(.characters)
                    .autocorrectionDisabled()
                    .font(.body.monospaced())
                Button("Join") { Task { await join() } }
                    .disabled(inviteCode.trimmingCharacters(in: .whitespaces).count < 6 || isWorking)
            } header: {
                Text("Got an invite code?")
            } footer: {
                Text("Enter the code a friend or family member sent you to see the visits they've logged with you.")
            }

            if let statusMessage {
                Section {
                    Label(statusMessage, systemImage: "checkmark.circle.fill")
                        .foregroundStyle(.green)
                }
            }

            Section {
                Button("Sign out", role: .destructive) {
                    Task { await auth.signOut() }
                }
            }
        }
        .navigationTitle("Profile")
        .task { await loadProfile() }
        .errorAlert($errorMessage)
    }

    private var trimmedName: String { displayName.trimmingCharacters(in: .whitespaces) }

    private func loadProfile() async {
        if let profile = try? await API.myProfile() {
            displayName = profile.displayName
            savedName = profile.displayName
        }
    }

    private func saveName() async {
        isWorking = true
        defer { isWorking = false }
        do {
            try await API.setDisplayName(trimmedName)
            savedName = trimmedName
            statusMessage = "Name saved."
        } catch {
            errorMessage = friendlyMessage(error)
        }
    }

    private func join() async {
        isWorking = true
        defer { isWorking = false }
        do {
            let person = try await API.claimInvite(code: inviteCode)
            inviteCode = ""
            statusMessage = "You're in! Visits logged with \(person.name) now show up on your restaurant pages."
        } catch {
            errorMessage = friendlyMessage(error)
        }
    }
}
