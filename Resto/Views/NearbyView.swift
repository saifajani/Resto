import CoreLocation
import SwiftUI

struct NearbyView: View {
    @Environment(LocationManager.self) private var location

    @State private var nearby: [Place] = []
    @State private var searchResults: [Place] = []
    @State private var mine: [VisitedRestaurant] = []
    @State private var query = ""
    @State private var isLoadingNearby = false
    @State private var isSearching = false
    @State private var openingPlaceId: String?
    @State private var selected: Restaurant?
    @State private var errorMessage: String?

    private var trimmedQuery: String { query.trimmingCharacters(in: .whitespaces) }
    private var visitedPlaceIds: Set<String> { Set(mine.compactMap(\.restaurant.applePlaceId)) }

    var body: some View {
        List {
            if trimmedQuery.isEmpty {
                browseSections
            } else {
                searchSections
            }
        }
        .navigationTitle("Restaurants")
        .searchable(text: $query, prompt: "Search restaurants")
        .navigationDestination(item: $selected) { RestaurantDetailView(restaurant: $0) }
        .refreshable {
            location.request()
            await loadMine()
            await loadNearby()
        }
        .onAppear {
            location.request()
            Task { await loadMine() }
        }
        .task(id: location.location) { await loadNearby() }
        .task(id: trimmedQuery) { await runSearch() }
        .errorAlert($errorMessage)
    }

    // MARK: Sections

    @ViewBuilder private var browseSections: some View {
        let beenHere = nearby.filter { visitedPlaceIds.contains($0.id) }
        let others = nearby.filter { !visitedPlaceIds.contains($0.id) }

        if location.isDenied {
            Section {
                Text("Turn on location for Resto in Settings to see restaurants near you. You can still search by name.")
                    .foregroundStyle(.secondary)
            }
        }

        if !beenHere.isEmpty {
            Section("You've been here") {
                ForEach(beenHere) { placeRow($0, visited: true) }
            }
        }

        if !location.isDenied {
            Section("Nearby") {
                if others.isEmpty {
                    if isLoadingNearby || location.location == nil {
                        HStack {
                            ProgressView()
                            Text("Finding restaurants near you")
                                .foregroundStyle(.secondary)
                        }
                    } else {
                        Text("No restaurants found nearby.")
                            .foregroundStyle(.secondary)
                    }
                }
                ForEach(others) { placeRow($0, visited: false) }
            }
        }

        if !mine.isEmpty {
            Section("Your restaurants") {
                ForEach(mine) { visitedRow($0) }
            }
        }
    }

    @ViewBuilder private var searchSections: some View {
        let matches = mine.filter { $0.restaurant.name.localizedCaseInsensitiveContains(trimmedQuery) }

        if !matches.isEmpty {
            Section("Your restaurants") {
                ForEach(matches) { visitedRow($0) }
            }
        }

        Section("Places") {
            if searchResults.isEmpty {
                if isSearching {
                    ProgressView()
                } else {
                    Text("No places match \"\(trimmedQuery)\"")
                        .foregroundStyle(.secondary)
                }
            }
            ForEach(searchResults) { placeRow($0, visited: visitedPlaceIds.contains($0.id)) }
        }
    }

    // MARK: Rows

    private func placeRow(_ place: Place, visited: Bool) -> some View {
        Button {
            Task { await open(place) }
        } label: {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(place.name)
                        .foregroundStyle(.primary)
                    if let address = place.address {
                        Text(address)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                Spacer()
                if openingPlaceId == place.id {
                    ProgressView()
                } else if let distance = place.distance {
                    Text(Self.format(distance))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                if visited {
                    Image(systemName: "checkmark.seal.fill")
                        .foregroundStyle(.green)
                }
            }
        }
        .disabled(openingPlaceId != nil)
    }

    private func visitedRow(_ visited: VisitedRestaurant) -> some View {
        Button {
            selected = visited.restaurant
        } label: {
            VStack(alignment: .leading, spacing: 2) {
                Text(visited.restaurant.name)
                    .foregroundStyle(.primary)
                Text("\(visited.visitCount) visit\(visited.visitCount == 1 ? "" : "s") · last \(visited.lastVisit.formatted(date: .abbreviated, time: .omitted))")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private static func format(_ meters: CLLocationDistance) -> String {
        Measurement(value: meters, unit: UnitLength.meters)
            .formatted(.measurement(width: .abbreviated, usage: .road))
    }

    // MARK: Loading

    private func loadMine() async {
        do {
            mine = try await API.visitedRestaurants()
        } catch is CancellationError {
        } catch {
            errorMessage = friendlyMessage(error)
        }
    }

    private func loadNearby() async {
        guard let current = location.location else { return }
        isLoadingNearby = true
        defer { isLoadingNearby = false }
        // MapKit throws when an area has no results, so treat any failure as "nothing nearby".
        nearby = (try? await PlacesService.nearby(current)) ?? []
    }

    private func runSearch() async {
        let text = trimmedQuery
        guard !text.isEmpty else {
            searchResults = []
            return
        }
        isSearching = true
        defer { isSearching = false }
        // Debounce: .task(id:) cancels this when the query changes again.
        try? await Task.sleep(for: .milliseconds(350))
        guard !Task.isCancelled else { return }
        let results = (try? await PlacesService.search(text, near: location.location)) ?? []
        if !Task.isCancelled { searchResults = results }
    }

    private func open(_ place: Place) async {
        openingPlaceId = place.id
        defer { openingPlaceId = nil }
        do {
            selected = try await API.restaurant(for: place)
        } catch {
            errorMessage = friendlyMessage(error)
        }
    }
}
