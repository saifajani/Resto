import AuthenticationServices
import CryptoKit
import Foundation
import Observation
import Supabase

@Observable
@MainActor
final class AuthManager {
    var session: Session?
    var isLoading = true
    var errorMessage: String?

    @ObservationIgnored private var currentNonce: String?

    var userId: UUID? { session?.user.id }

    init() {
        Task { await observeAuthChanges() }
    }

    private func observeAuthChanges() async {
        for await (event, session) in supabase.auth.authStateChanges {
            if event == .initialSession {
                // The stored session may be expired; this refreshes it or returns nil.
                self.session = try? await supabase.auth.session
                isLoading = false
            } else {
                self.session = session
            }
        }
    }

    // MARK: Sign in with Apple

    func prepare(_ request: ASAuthorizationAppleIDRequest) {
        let nonce = Self.randomNonce()
        currentNonce = nonce
        request.requestedScopes = [.fullName, .email]
        request.nonce = Self.sha256(nonce)
    }

    func handle(_ result: Result<ASAuthorization, Error>) async {
        errorMessage = nil
        switch result {
        case .failure(let error):
            if (error as? ASAuthorizationError)?.code != .canceled {
                errorMessage = error.localizedDescription
            }
        case .success(let authorization):
            guard
                let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
                let tokenData = credential.identityToken,
                let idToken = String(data: tokenData, encoding: .utf8),
                let nonce = currentNonce
            else {
                errorMessage = "Apple didn't return a sign-in token. Please try again."
                return
            }
            do {
                try await supabase.auth.signInWithIdToken(
                    credentials: OpenIDConnectCredentials(provider: .apple, idToken: idToken, nonce: nonce)
                )
                // Apple only shares the name on the very first sign-in, so save it right away.
                if let givenName = credential.fullName?.givenName, !givenName.isEmpty {
                    try? await API.setDisplayName(givenName)
                }
            } catch {
                errorMessage = friendlyMessage(error)
            }
        }
    }

    func signOut() async {
        try? await supabase.auth.signOut()
    }

    private static func randomNonce(length: Int = 32) -> String {
        let charset = Array("0123456789ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvwxyz-._")
        var generator = SystemRandomNumberGenerator()
        return String((0..<length).map { _ in charset.randomElement(using: &generator)! })
    }

    private static func sha256(_ input: String) -> String {
        SHA256.hash(data: Data(input.utf8)).map { String(format: "%02x", $0) }.joined()
    }
}
