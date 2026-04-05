// swift-tools-version: 5.9
import PackageDescription

var targets: [Target] = [
    .target(
        name: "CCSessionAPI",
        path: "Sources/CCSessionAPI"
    ),
    .executableTarget(
        name: "CCSessionCLI",
        dependencies: [
            "CCSessionAPI",
            .product(name: "ArgumentParser", package: "swift-argument-parser"),
        ],
        path: "Sources/CCSessionCLI"
    ),
    .testTarget(
        name: "CCSessionAPITests",
        dependencies: ["CCSessionAPI"],
        path: "Tests/CCSessionAPITests"
    ),
]

#if os(macOS) || os(iOS)
targets.append(contentsOf: [
    .executableTarget(
        name: "CCSessionApp",
        dependencies: ["CCSessionAPI"],
        path: "Sources/CCSessionApp"
    ),
    .testTarget(
        name: "CCSessionAppTests",
        dependencies: ["CCSessionAPI"],
        path: "Tests/CCSessionAppTests"
    ),
])
#endif

let package = Package(
    name: "CCSessionManager",
    platforms: [
        .iOS(.v17),
        .macOS(.v14),
    ],
    products: [
        .library(name: "CCSessionAPI", targets: ["CCSessionAPI"]),
        .executable(name: "cc-session", targets: ["CCSessionCLI"]),
    ],
    dependencies: [
        .package(url: "https://github.com/apple/swift-argument-parser.git", from: "1.3.0"),
    ],
    targets: targets
)
