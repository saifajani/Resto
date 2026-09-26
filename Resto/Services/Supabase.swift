import Foundation
import Supabase

enum AppConfig {
    static let supabaseURL: URL = {
        let host = Bundle.main.object(forInfoDictionaryKey: "SUPABASE_HOST") as? String ?? ""
        guard !host.isEmpty, !host.contains("your-project-ref"), let url = URL(string: "https://\(host)") else {
            fatalError("Set SUPABASE_HOST in Config/Secrets.xcconfig, then run `xcodegen generate` again.")
        }
        return url
    }()

    static let supabaseKey: String = {
        let key = Bundle.main.object(forInfoDictionaryKey: "SUPABASE_ANON_KEY") as? String ?? ""
        guard !key.isEmpty, !key.hasPrefix("your-") else {
            fatalError("Set SUPABASE_ANON_KEY in Config/Secrets.xcconfig, then run `xcodegen generate` again.")
        }
        return key
    }()
}

let supabase = SupabaseClient(supabaseURL: AppConfig.supabaseURL, supabaseKey: AppConfig.supabaseKey)

/// Turns database errors into something readable in an alert.
func friendlyMessage(_ error: Error) -> String {
    if let error = error as? PostgrestError {
        if error.code == "23503" {
            return "That person has dishes logged, so they can't be removed."
        }
        return error.message
    }
    return error.localizedDescription
}
