import Foundation
import Supabase

/// All reads and writes to the backend. Row-level security in Postgres decides
/// what each user can see, so these queries don't filter by sharing themselves.
enum API {
    static let personColumns = "id, owner_id, name, is_me, linked_user_id, invite_code"

    static let visitColumns = """
        id, owner_id, restaurant_id, visited_at, notes,
        owner:profiles(display_name),
        visit_people(person:people(\(personColumns))),
        dishes(id, person_id, name, rating, would_order_again, notes, created_at)
        """

    static func currentUserId() async throws -> UUID {
        try await supabase.auth.session.user.id
    }

    // MARK: Restaurants

    /// Finds the shared restaurant record for an Apple Maps place, creating it the first time.
    static func restaurant(for place: Place) async throws -> Restaurant {
        struct Params: Encodable {
            let p_place_id: String
            let p_name: String
            let p_address: String?
            let p_latitude: Double
            let p_longitude: Double
        }
        let params = Params(
            p_place_id: place.id,
            p_name: place.name,
            p_address: place.address,
            p_latitude: place.latitude,
            p_longitude: place.longitude
        )
        return try await supabase.rpc("get_or_create_restaurant", params: params).execute().value
    }

    /// Every restaurant with at least one visit you can see (yours or shared with you), most recent first.
    static func visitedRestaurants() async throws -> [VisitedRestaurant] {
        struct Row: Decodable {
            let visitedAt: Date
            let restaurant: Restaurant

            enum CodingKeys: String, CodingKey {
                case restaurant
                case visitedAt = "visited_at"
            }
        }
        let rows: [Row] = try await supabase
            .from("visits")
            .select("visited_at, restaurant:restaurants(*)")
            .order("visited_at", ascending: false)
            .execute()
            .value

        var order: [UUID] = []
        var byId: [UUID: VisitedRestaurant] = [:]
        for row in rows {
            if let existing = byId[row.restaurant.id] {
                byId[row.restaurant.id] = VisitedRestaurant(
                    restaurant: existing.restaurant,
                    lastVisit: existing.lastVisit,
                    visitCount: existing.visitCount + 1
                )
            } else {
                byId[row.restaurant.id] = VisitedRestaurant(restaurant: row.restaurant, lastVisit: row.visitedAt, visitCount: 1)
                order.append(row.restaurant.id)
            }
        }
        return order.compactMap { byId[$0] }
    }

    // MARK: Visits

    static func visits(at restaurantId: UUID) async throws -> [Visit] {
        try await supabase
            .from("visits")
            .select(visitColumns)
            .eq("restaurant_id", value: restaurantId.uuidString)
            .order("visited_at", ascending: false)
            .execute()
            .value
    }

    /// Saves the visit, who was there and every dish in a single transaction.
    static func createVisit(
        restaurantId: UUID,
        visitedAt: Date,
        notes: String,
        personIds: [UUID],
        dishes: [DraftDish]
    ) async throws {
        struct Params: Encodable {
            let p_restaurant_id: UUID
            let p_visited_at: Date
            let p_person_ids: [UUID]
            let p_dishes: [DraftDish]
            let p_notes: String
        }
        let params = Params(
            p_restaurant_id: restaurantId,
            p_visited_at: visitedAt,
            p_person_ids: personIds,
            p_dishes: dishes,
            p_notes: notes
        )
        try await supabase.rpc("create_visit", params: params).execute()
    }

    static func deleteVisit(_ id: UUID) async throws {
        try await supabase.from("visits").delete().eq("id", value: id.uuidString).execute()
    }

    // MARK: People

    /// Your circle, with you first.
    static func myCircle() async throws -> [Person] {
        let uid = try await currentUserId()
        return try await supabase
            .from("people")
            .select(personColumns)
            .eq("owner_id", value: uid.uuidString)
            .order("is_me", ascending: false)
            .order("name")
            .execute()
            .value
    }

    /// Other people's circles you've joined with an invite code.
    static func circlesImIn() async throws -> [Person] {
        let uid = try await currentUserId()
        return try await supabase
            .from("people")
            .select("\(personColumns), owner:profiles!people_owner_id_fkey(display_name)")
            .eq("linked_user_id", value: uid.uuidString)
            .neq("owner_id", value: uid.uuidString)
            .execute()
            .value
    }

    static func addPerson(named name: String) async throws -> Person {
        struct NewPerson: Encodable { let name: String }
        return try await supabase
            .from("people")
            .insert(NewPerson(name: name))
            .select(personColumns)
            .single()
            .execute()
            .value
    }

    static func deletePerson(_ id: UUID) async throws {
        try await supabase.from("people").delete().eq("id", value: id.uuidString).execute()
    }

    static func createInvite(for personId: UUID) async throws -> String {
        try await supabase.rpc("create_invite", params: ["p_person_id": personId.uuidString]).execute().value
    }

    static func claimInvite(code: String) async throws -> Person {
        try await supabase.rpc("claim_invite", params: ["p_code": code]).execute().value
    }

    // MARK: Profile

    static func myProfile() async throws -> Profile {
        let uid = try await currentUserId()
        return try await supabase
            .from("profiles")
            .select("display_name")
            .eq("id", value: uid.uuidString)
            .single()
            .execute()
            .value
    }

    static func setDisplayName(_ name: String) async throws {
        try await supabase.rpc("set_display_name", params: ["p_name": name]).execute()
    }
}
