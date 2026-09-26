import SwiftUI

struct RestaurantDetailView: View {
    let restaurant: Restaurant

    @Environment(AuthManager.self) private var auth

    @State private var visits: [Visit] = []
    @State private var isLoading = true
    @State private var showingAddVisit = false
    @State private var visitToDelete: Visit?
    @State private var errorMessage: String?

    var body: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: 4) {
                    Text(restaurant.name)
                        .font(.title2.bold())
                    if let address = restaurant.address {
                        Text(address)
                            .foregroundStyle(.secondary)
                    }
                }
                Button {
                    showingAddVisit = true
                } label: {
                    Label("Log a visit", systemImage: "plus.circle.fill")
                }
            }

            if isLoading && visits.isEmpty {
                Section { ProgressView() }
            } else if visits.isEmpty {
                Section {
                    Text("No visits yet. Log what everyone ate so you remember next time.")
                        .foregroundStyle(.secondary)
                }
            } else {
                ForEach(summaryGroups) { group in
                    Section(group.title) {
                        ForEach(group.items) { DishSummaryRow(item: $0) }
                    }
                }
                ForEach(visits) { visitSection($0) }
            }
        }
        .navigationTitle(restaurant.name)
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .refreshable { await load() }
        .sheet(isPresented: $showingAddVisit) {
            AddVisitView(restaurant: restaurant, knownDishNames: knownDishNames) {
                Task { await load() }
            }
        }
        .confirmationDialog(
            "Delete this visit?",
            isPresented: Binding(get: { visitToDelete != nil }, set: { if !$0 { visitToDelete = nil } }),
            titleVisibility: .visible,
            presenting: visitToDelete
        ) { visit in
            Button("Delete visit", role: .destructive) {
                Task { await delete(visit) }
            }
        } message: { _ in
            Text("This removes the visit and every dish logged on it.")
        }
        .errorAlert($errorMessage)
    }

    // MARK: Visit timeline

    private func visitSection(_ visit: Visit) -> some View {
        Section {
            if visit.dishes.isEmpty {
                Text("No dishes logged")
                    .foregroundStyle(.secondary)
            }
            ForEach(visit.sortedDishes) { dish in
                DishRow(
                    dish: dish,
                    personName: visit.person(dish.personId)?.displayName(currentUserId: auth.userId) ?? "Someone"
                )
            }
            if let notes = visit.notes, !notes.isEmpty {
                Text(notes)
                    .font(.callout)
                    .italic()
                    .foregroundStyle(.secondary)
            }
        } header: {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(visit.visitedAt.formatted(date: .abbreviated, time: .omitted))
                        .font(.subheadline.weight(.semibold))
                    Text(peopleLine(for: visit))
                        .font(.caption)
                }
                Spacer()
                if visit.ownerId == auth.userId {
                    Menu {
                        Button("Delete visit", systemImage: "trash", role: .destructive) {
                            visitToDelete = visit
                        }
                    } label: {
                        Image(systemName: "ellipsis.circle")
                    }
                }
            }
            .textCase(nil)
        } footer: {
            if visit.ownerId != auth.userId, let owner = visit.owner {
                Text("Logged by \(owner.displayName)")
            }
        }
    }

    private func peopleLine(for visit: Visit) -> String {
        let names = visit.people.map { $0.displayName(currentUserId: auth.userId) }
        return names.isEmpty ? "" : names.formatted(.list(type: .and))
    }

    // MARK: "What to order" summary

    struct DishSummary: Identifiable {
        let id: String
        let name: String
        let rating: Int
        let wouldOrderAgain: Bool
        let timesOrdered: Int
        let notes: String?
    }

    struct SummaryGroup: Identifiable {
        let id: UUID
        let title: String
        let items: [DishSummary]
    }

    /// One group per person, one row per distinct dish, using the most recent rating.
    private var summaryGroups: [SummaryGroup] {
        var people: [UUID: Person] = [:]
        var personOrder: [UUID] = []
        var dishesByPerson: [UUID: [String: DishSummary]] = [:]

        for visit in visits { // newest first
            for person in visit.people where people[person.id] == nil {
                people[person.id] = person
            }
            for dish in visit.dishes {
                let key = dish.name.trimmingCharacters(in: .whitespaces).lowercased()
                var forPerson = dishesByPerson[dish.personId] ?? [:]
                if forPerson.isEmpty { personOrder.append(dish.personId) }
                if let existing = forPerson[key] {
                    forPerson[key] = DishSummary(
                        id: existing.id,
                        name: existing.name,
                        rating: existing.rating,
                        wouldOrderAgain: existing.wouldOrderAgain,
                        timesOrdered: existing.timesOrdered + 1,
                        notes: existing.notes
                    )
                } else {
                    forPerson[key] = DishSummary(
                        id: "\(dish.personId)-\(key)",
                        name: dish.name,
                        rating: dish.rating,
                        wouldOrderAgain: dish.wouldOrderAgain,
                        timesOrdered: 1,
                        notes: dish.notes
                    )
                }
                dishesByPerson[dish.personId] = forPerson
            }
        }

        let isYou: (UUID) -> Bool = { people[$0]?.linkedUserId == auth.userId }
        let ordered = personOrder.filter(isYou) + personOrder.filter { !isYou($0) }

        return ordered.map { personId in
            let items = (dishesByPerson[personId] ?? [:]).values.sorted {
                ($0.wouldOrderAgain ? 1 : 0, $0.rating, $0.timesOrdered) > ($1.wouldOrderAgain ? 1 : 0, $1.rating, $1.timesOrdered)
            }
            let title = isYou(personId) ? "Your dishes" : "\(people[personId]?.name ?? "Someone")'s dishes"
            return SummaryGroup(id: personId, title: title, items: items)
        }
    }

    private var knownDishNames: [String] {
        var seen = Set<String>()
        var names: [String] = []
        for dish in visits.flatMap(\.dishes) where seen.insert(dish.name.lowercased()).inserted {
            names.append(dish.name)
        }
        return names
    }

    // MARK: Data

    private func load() async {
        defer { isLoading = false }
        do {
            visits = try await API.visits(at: restaurant.id)
        } catch is CancellationError {
        } catch {
            errorMessage = friendlyMessage(error)
        }
    }

    private func delete(_ visit: Visit) async {
        do {
            try await API.deleteVisit(visit.id)
            visits.removeAll { $0.id == visit.id }
        } catch {
            errorMessage = friendlyMessage(error)
        }
    }
}

private struct DishSummaryRow: View {
    let item: RestaurantDetailView.DishSummary

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Text(item.name)
                    if item.timesOrdered > 1 {
                        Text("×\(item.timesOrdered)")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                if let notes = item.notes, !notes.isEmpty {
                    Text(notes)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            Spacer()
            StarsView(rating: item.rating)
            OrderAgainBadge(wouldOrderAgain: item.wouldOrderAgain)
        }
    }
}

private struct DishRow: View {
    let dish: Dish
    let personName: String

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: 2) {
                Text(dish.name)
                Text(personName)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                if let notes = dish.notes, !notes.isEmpty {
                    Text(notes)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            Spacer()
            StarsView(rating: dish.rating)
            OrderAgainBadge(wouldOrderAgain: dish.wouldOrderAgain)
        }
    }
}
