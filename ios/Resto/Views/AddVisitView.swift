import SwiftUI

struct AddVisitView: View {
    let restaurant: Restaurant
    let knownDishNames: [String]
    var onSaved: () -> Void

    @Environment(\.dismiss) private var dismiss
    @Environment(AuthManager.self) private var auth

    @State private var circle: [Person] = []
    @State private var selectedPeople: Set<UUID> = []
    @State private var visitedAt = Date()
    @State private var notes = ""
    @State private var dishes: [DraftDish] = []
    @State private var editingDish: DraftDish?
    @State private var newPersonName = ""
    @State private var isSaving = false
    @State private var errorMessage: String?

    private var selectedList: [Person] { circle.filter { selectedPeople.contains($0.id) } }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    DatePicker("When", selection: $visitedAt, in: ...Date())
                }

                Section("Who was there") {
                    ForEach(circle) { person in
                        Button {
                            toggle(person)
                        } label: {
                            HStack {
                                Text(person.isMe ? "\(person.name) (you)" : person.name)
                                    .foregroundStyle(.primary)
                                Spacer()
                                if selectedPeople.contains(person.id) {
                                    Image(systemName: "checkmark")
                                        .foregroundStyle(.tint)
                                }
                            }
                        }
                    }
                    HStack {
                        TextField("Add someone new", text: $newPersonName)
                            .textInputAutocapitalization(.words)
                            .onSubmit { Task { await addPerson() } }
                        Button("Add") { Task { await addPerson() } }
                            .buttonStyle(.borderless)
                            .disabled(newPersonName.trimmingCharacters(in: .whitespaces).isEmpty)
                    }
                }

                Section("What everyone ate") {
                    ForEach(dishes) { dish in
                        Button {
                            editingDish = dish
                        } label: {
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(dish.name)
                                        .foregroundStyle(.primary)
                                    Text(name(of: dish.personId))
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                                Spacer()
                                StarsView(rating: dish.rating)
                                OrderAgainBadge(wouldOrderAgain: dish.wouldOrderAgain)
                            }
                        }
                    }
                    .onDelete { dishes.remove(atOffsets: $0) }

                    Button {
                        editingDish = DraftDish(personId: nextPersonId())
                    } label: {
                        Label("Add a dish", systemImage: "plus")
                    }
                    .disabled(selectedPeople.isEmpty)
                }

                Section("Notes") {
                    TextField("Anything worth remembering about the visit?", text: $notes, axis: .vertical)
                        .lineLimit(2...5)
                }
            }
            .navigationTitle(restaurant.name)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    if isSaving {
                        ProgressView()
                    } else {
                        Button("Save") { Task { await save() } }
                            .disabled(selectedPeople.isEmpty || dishes.isEmpty)
                    }
                }
            }
            .sheet(item: $editingDish) { dish in
                DishEditorView(dish: dish, people: selectedList, knownDishNames: knownDishNames) { saved in
                    if let index = dishes.firstIndex(where: { $0.id == saved.id }) {
                        dishes[index] = saved
                    } else {
                        dishes.append(saved)
                    }
                }
            }
            .task { await loadCircle() }
            .interactiveDismissDisabled(!dishes.isEmpty)
            .errorAlert($errorMessage)
        }
    }

    private func name(of personId: UUID) -> String {
        circle.first { $0.id == personId }?.displayName(currentUserId: auth.userId) ?? "Someone"
    }

    private func toggle(_ person: Person) {
        if selectedPeople.contains(person.id) {
            if dishes.contains(where: { $0.personId == person.id }) {
                errorMessage = "Remove \(person.name)'s dishes before taking them off the visit."
                return
            }
            selectedPeople.remove(person.id)
        } else {
            selectedPeople.insert(person.id)
        }
    }

    /// Suggests the next person who doesn't have a dish yet, so adding a round of dishes is quick.
    private func nextPersonId() -> UUID {
        let withDishes = Set(dishes.map(\.personId))
        return selectedList.first { !withDishes.contains($0.id) }?.id
            ?? dishes.last?.personId
            ?? selectedList.first!.id
    }

    private func loadCircle() async {
        do {
            circle = try await API.myCircle()
            if selectedPeople.isEmpty, let me = circle.first(where: \.isMe) {
                selectedPeople = [me.id]
            }
        } catch {
            errorMessage = friendlyMessage(error)
        }
    }

    private func addPerson() async {
        let name = newPersonName.trimmingCharacters(in: .whitespaces)
        guard !name.isEmpty else { return }
        do {
            let person = try await API.addPerson(named: name)
            circle.append(person)
            selectedPeople.insert(person.id)
            newPersonName = ""
        } catch {
            errorMessage = friendlyMessage(error)
        }
    }

    private func save() async {
        isSaving = true
        defer { isSaving = false }
        do {
            try await API.createVisit(
                restaurantId: restaurant.id,
                visitedAt: visitedAt,
                notes: notes,
                personIds: Array(selectedPeople),
                dishes: dishes
            )
            onSaved()
            dismiss()
        } catch {
            errorMessage = friendlyMessage(error)
        }
    }
}

struct DishEditorView: View {
    @State var dish: DraftDish
    let people: [Person]
    let knownDishNames: [String]
    var onSave: (DraftDish) -> Void

    @Environment(\.dismiss) private var dismiss
    @Environment(AuthManager.self) private var auth

    private var suggestions: [String] {
        let typed = dish.name.trimmingCharacters(in: .whitespaces)
        let matches = typed.isEmpty
            ? knownDishNames
            : knownDishNames.filter {
                $0.localizedCaseInsensitiveContains(typed) && $0.caseInsensitiveCompare(typed) != .orderedSame
            }
        return Array(matches.prefix(8))
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Picker("Who ate it", selection: $dish.personId) {
                        ForEach(people) { person in
                            Text(person.displayName(currentUserId: auth.userId)).tag(person.id)
                        }
                    }
                }

                Section {
                    TextField("Dish name", text: $dish.name)
                        .textInputAutocapitalization(.words)
                    if !suggestions.isEmpty {
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack {
                                ForEach(suggestions, id: \.self) { suggestion in
                                    Button(suggestion) { dish.name = suggestion }
                                        .buttonStyle(.bordered)
                                        .controlSize(.small)
                                }
                            }
                        }
                    }
                } header: {
                    Text("Dish")
                } footer: {
                    if !knownDishNames.isEmpty {
                        Text("Tap a dish from a past visit to reuse its name.")
                    }
                }

                Section("How was it?") {
                    StarRatingPicker(rating: $dish.rating)
                        .frame(maxWidth: .infinity)
                    Toggle("Would order again", isOn: $dish.wouldOrderAgain)
                }

                Section("Notes") {
                    TextField("Too spicy, ask for extra sauce...", text: $dish.notes, axis: .vertical)
                        .lineLimit(1...4)
                }
            }
            .navigationTitle(dish.name.isEmpty ? "Add dish" : dish.name)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") {
                        var cleaned = dish
                        cleaned.name = dish.name.trimmingCharacters(in: .whitespacesAndNewlines)
                        cleaned.notes = dish.notes.trimmingCharacters(in: .whitespacesAndNewlines)
                        onSave(cleaned)
                        dismiss()
                    }
                    .disabled(!dish.isValid)
                }
            }
        }
    }
}
