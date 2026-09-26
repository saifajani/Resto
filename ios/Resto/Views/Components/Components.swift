import SwiftUI

/// Tappable 1 to 5 star picker.
struct StarRatingPicker: View {
    @Binding var rating: Int

    var body: some View {
        HStack(spacing: 10) {
            ForEach(1...5, id: \.self) { value in
                Image(systemName: value <= rating ? "star.fill" : "star")
                    .font(.system(size: 30))
                    .foregroundStyle(value <= rating ? Color.yellow : Color.secondary)
                    .onTapGesture { rating = value }
                    .accessibilityLabel("\(value) star\(value == 1 ? "" : "s")")
                    .accessibilityAddTraits(value == rating ? .isSelected : [])
            }
        }
    }
}

/// Small read-only stars.
struct StarsView: View {
    let rating: Int

    var body: some View {
        HStack(spacing: 1) {
            ForEach(1...5, id: \.self) { value in
                Image(systemName: value <= rating ? "star.fill" : "star")
            }
        }
        .font(.caption2)
        .foregroundStyle(.yellow)
        .accessibilityElement()
        .accessibilityLabel("\(rating) out of 5 stars")
    }
}

struct OrderAgainBadge: View {
    let wouldOrderAgain: Bool

    var body: some View {
        Image(systemName: wouldOrderAgain ? "arrow.uturn.backward.circle.fill" : "xmark.circle")
            .foregroundStyle(wouldOrderAgain ? Color.green : Color.secondary)
            .accessibilityLabel(wouldOrderAgain ? "Would order again" : "Would not order again")
    }
}

extension View {
    /// Shows an alert whenever `message` is non-nil.
    func errorAlert(_ message: Binding<String?>) -> some View {
        alert(
            "Something went wrong",
            isPresented: Binding(
                get: { message.wrappedValue != nil },
                set: { if !$0 { message.wrappedValue = nil } }
            )
        ) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(message.wrappedValue ?? "")
        }
    }
}
