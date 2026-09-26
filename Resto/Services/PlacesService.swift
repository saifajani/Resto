import CoreLocation
import MapKit

/// A restaurant from Apple Maps, before it has a record in our database.
struct Place: Identifiable, Hashable {
    /// Apple's stable place ID, or a name+coordinate fallback when Maps doesn't provide one.
    let id: String
    let name: String
    let address: String?
    let latitude: Double
    let longitude: Double
    let distance: CLLocationDistance?
}

enum PlacesService {
    static let foodFilter = MKPointOfInterestFilter(including: [
        .restaurant, .cafe, .bakery, .brewery, .winery, .nightlife, .foodMarket,
    ])

    static func nearby(_ location: CLLocation, radius: CLLocationDistance = 1000) async throws -> [Place] {
        let request = MKLocalPointsOfInterestRequest(center: location.coordinate, radius: radius)
        request.pointOfInterestFilter = foodFilter
        let response = try await MKLocalSearch(request: request).start()
        return sortedByDistance(response.mapItems.map { Place(item: $0, from: location) })
    }

    static func search(_ text: String, near location: CLLocation?) async throws -> [Place] {
        let request = MKLocalSearch.Request()
        request.naturalLanguageQuery = text
        request.resultTypes = .pointOfInterest
        request.pointOfInterestFilter = foodFilter
        if let location {
            request.region = MKCoordinateRegion(center: location.coordinate, latitudinalMeters: 25_000, longitudinalMeters: 25_000)
        }
        let response = try await MKLocalSearch(request: request).start()
        return sortedByDistance(response.mapItems.map { Place(item: $0, from: location) })
    }

    private static func sortedByDistance(_ places: [Place]) -> [Place] {
        places.sorted { ($0.distance ?? .greatestFiniteMagnitude) < ($1.distance ?? .greatestFiniteMagnitude) }
    }
}

extension Place {
    init(item: MKMapItem, from origin: CLLocation?) {
        let coordinate = item.placemark.coordinate
        let name = item.name ?? "Unknown"
        let street = [item.placemark.subThoroughfare, item.placemark.thoroughfare]
            .compactMap { $0 }
            .joined(separator: " ")
        let addressParts = [street, item.placemark.locality ?? ""].filter { !$0.isEmpty }

        self.id = item.identifier?.rawValue
            ?? "fallback:\(name.lowercased()):\(String(format: "%.4f,%.4f", coordinate.latitude, coordinate.longitude))"
        self.name = name
        self.address = addressParts.isEmpty ? nil : addressParts.joined(separator: ", ")
        self.latitude = coordinate.latitude
        self.longitude = coordinate.longitude
        self.distance = origin?.distance(from: CLLocation(latitude: coordinate.latitude, longitude: coordinate.longitude))
    }
}
