#if canImport(SwiftUI)
import SwiftUI

struct FilterBar: View {
    let selected: String
    let counts: [String: Int]
    @Binding var autoScrollEnabled: Bool
    let onSelect: (String) -> Void

    private let filters = [
        ("all", "All"),
        ("high", "High"),
        ("normal", "Normal"),
        ("low", "Low"),
    ]

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(filters, id: \.0) { key, label in
                    Button {
                        onSelect(key)
                    } label: {
                        HStack(spacing: 4) {
                            Text(label)
                            Text("\(counts[key, default: 0])")
                                .font(.caption2)
                                .padding(.horizontal, 5)
                                .padding(.vertical, 1)
                                .background(
                                    selected == key
                                        ? Color.purple.opacity(0.2)
                                        : Color(.systemGray5)
                                )
                                .clipShape(Capsule())
                        }
                        .font(.caption)
                        .fontWeight(selected == key ? .semibold : .regular)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(
                            selected == key
                                ? Color.purple.opacity(0.12)
                                : Color.clear
                        )
                        .clipShape(Capsule())
                        .overlay(
                            Capsule()
                                .stroke(
                                    selected == key
                                        ? Color.purple.opacity(0.3)
                                        : Color(.systemGray4),
                                    lineWidth: 0.5
                                )
                        )
                    }
                    .buttonStyle(.plain)
                }

                Spacer()

                Button {
                    autoScrollEnabled.toggle()
                } label: {
                    Label("Auto-scroll", systemImage: autoScrollEnabled ? "arrow.up.circle.fill" : "arrow.up.circle")
                        .font(.caption)
                        .foregroundStyle(autoScrollEnabled ? .purple : .secondary)
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal)
            .padding(.vertical, 8)
        }
        .background(Color(.systemBackground))
        .overlay(alignment: .bottom) {
            Divider()
        }
    }
}

#endif
