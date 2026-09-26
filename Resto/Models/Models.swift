import Foundation

struct Profile: Codable, Hashable {
    let displayName: String

    enum CodingKeys: String, CodingKey {
        case displayName = "display_name"
    }
}

struct Restaurant: Codable, Identifiable, Hashable {
    let id: UUID
    let placeId: String?
    let name: String
    let address: String?
    let latitude: Double?
    let longitude: Double?

    enum CodingKeys: String, CodingKey {
        case id, name, address, latitude, longitude
        case placeId = "place_id"
    }
}

/// Someone in a user's circle. `isMe` marks the user themselves.
/// `linkedUserId` is set once that person has their own account and claimed an invite.
struct Person: Codable, Identifiable, Hashable {
    let id: UUID
    let ownerId: UUID
    var name: String
    let isMe: Bool
    let linkedUserId: UUID?
    let inviteCode: String?
    var owner: Profile?

    enum CodingKeys: String, CodingKey {
        case id, name, owner
        case ownerId = "owner_id"
        case isMe = "is_me"
        case linkedUserId = "linked_user_id"
        case inviteCode = "invite_code"
    }

    /// "You" when this person is the signed-in user, otherwise their name.
    func displayName(currentUserId: UUID?) -> String {
        if let linkedUserId, linkedUserId == currentUserId { return "You" }
        return name
    }
}

struct Dish: Codable, Identifiable, Hashable {
    let id: UUID
    let personId: UUID
    let name: String
    let rating: Int
    let wouldOrderAgain: Bool
    let notes: String?
    let createdAt: Date?

    enum CodingKeys: String, CodingKey {
        case id, name, rating, notes
        case personId = "person_id"
        case wouldOrderAgain = "would_order_again"
        case createdAt = "created_at"
    }
}

struct Visit: Codable, Identifiable, Hashable {
    let id: UUID
    let ownerId: UUID
    let restaurantId: UUID
    let visitedAt: Date
    let notes: String?
    let owner: Profile?
    let visitPeople: [VisitPerson]
    let dishes: [Dish]

    struct VisitPerson: Codable, Hashable {
        let person: Person?
    }

    enum CodingKeys: String, CodingKey {
        case id, notes, owner, dishes
        case ownerId = "owner_id"
        case restaurantId = "restaurant_id"
        case visitedAt = "visited_at"
        case visitPeople = "visit_people"
    }

    var people: [Person] { visitPeople.compactMap(\.person) }

    var sortedDishes: [Dish] {
        dishes.sorted { ($0.createdAt ?? .distantPast) < ($1.createdAt ?? .distantPast) }
    }

    func person(_ id: UUID) -> Person? { people.first { $0.id == id } }
}

/// A restaurant the user can see visits for, with a little history.
struct VisitedRestaurant: Identifiable, Hashable {
    let restaurant: Restaurant
    let lastVisit: Date
    let visitCount: Int

    var id: UUID { restaurant.id }
}

/// A dish being entered on the Add Visit screen, before it is saved.
struct DraftDish: Identifiable, Hashable, Encodable {
    var id = UUID()
    var personId: UUID
    var name = ""
    var rating = 0
    var wouldOrderAgain = false
    var notes = ""

    var isValid: Bool {
        !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && (1...5).contains(rating)
    }

    enum CodingKeys: String, CodingKey {
        case name, rating, notes
        case personId = "person_id"
        case wouldOrderAgain = "would_order_again"
    }
}
