import SwiftUI

@main
struct RestoApp: App {
    @State private var auth = AuthManager()
    @State private var location = LocationManager()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(auth)
                .environment(location)
        }
    }
}

struct RootView: View {
    @Environment(AuthManager.self) private var auth

    var body: some View {
        Group {
            if auth.isLoading {
                ProgressView()
            } else if auth.session != nil {
                MainTabView()
            } else {
                SignInView()
            }
        }
    }
}

struct MainTabView: View {
    var body: some View {
        TabView {
            NavigationStack { NearbyView() }
                .tabItem { Label("Restaurants", systemImage: "fork.knife") }
            NavigationStack { PeopleView() }
                .tabItem { Label("People", systemImage: "person.2") }
            NavigationStack { ProfileView() }
                .tabItem { Label("Profile", systemImage: "person.crop.circle") }
        }
    }
}
