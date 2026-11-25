import ActivityKit
import Foundation
import SwiftUI
import WidgetKit

@main
struct RestTimerWidgetBundle: WidgetBundle {
    var body: some Widget {
        RestTimerLiveActivity()
        NextWorkoutWidget()
        WorkoutLockScreenWidget()
    }
}

private struct NextWorkoutSnapshot: Decodable {
    let exerciseCount: Int
    let planWeek: Int?
    let workoutName: String?
}

private struct NextWorkoutEntry: TimelineEntry {
    let date: Date
    let snapshot: NextWorkoutSnapshot?
}

private struct NextWorkoutProvider: TimelineProvider {
    func placeholder(in context: Context) -> NextWorkoutEntry {
        NextWorkoutEntry(date: .now, snapshot: NextWorkoutSnapshot(exerciseCount: 5, planWeek: 2, workoutName: "Upper Body"))
    }

    func getSnapshot(in context: Context, completion: @escaping (NextWorkoutEntry) -> Void) {
        completion(entry())
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<NextWorkoutEntry>) -> Void) {
        completion(Timeline(entries: [entry()], policy: .never))
    }

    private func entry() -> NextWorkoutEntry {
        let stored = UserDefaults(suiteName: "group.com.ihgold487.workoutapp")?
            .string(forKey: "homeWidgetSnapshot")
        let snapshot = stored.flatMap { try? JSONDecoder().decode(NextWorkoutSnapshot.self, from: Data($0.utf8)) }
        return NextWorkoutEntry(date: .now, snapshot: snapshot)
    }
}

private struct NextWorkoutWidget: Widget {
    let kind = "NextWorkoutWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: NextWorkoutProvider()) { entry in
            NextWorkoutWidgetView(entry: entry)
        }
        .configurationDisplayName("Next Workout")
        .description("Preview or start your next workout, or log body weight.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

/// A separate kind gives the Lock Screen mark an independent WidgetKit identity.
/// This keeps the existing Home Screen widget stable while allowing Lock Screen
/// previews to refresh from the current extension bundle.
private struct WorkoutLockScreenWidget: Widget {
    // A new kind ensures iOS obtains a fresh Lock Screen preview instead of
    // retaining a cached preview from the raster-image experiments.
    let kind = "WorkoutLockScreenWidgetV4"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: NextWorkoutProvider()) { entry in
            NextWorkoutWidgetView(entry: entry)
        }
        .configurationDisplayName("Workout")
        .description("Open Workout from your Lock Screen.")
        .supportedFamilies([.accessoryCircular, .accessoryInline])
    }
}

private struct NextWorkoutWidgetView: View {
    @Environment(\.widgetFamily) private var widgetFamily
    let entry: NextWorkoutEntry

    var body: some View {
        if #available(iOS 17.0, *) {
            if widgetFamily == .systemSmall {
                widgetContent
                    .containerBackground(Color.workoutWidgetBackground, for: .widget)
                    .widgetURL(URL(string: "workout://widget?action=home"))
            } else {
                widgetContent
                    .containerBackground(.fill.tertiary, for: .widget)
                    .widgetURL(URL(string: "workout://widget?action=home"))
            }
        } else {
            widgetContent
                .background(
                    widgetFamily == .systemSmall
                        ? Color.workoutWidgetBackground
                        : Color.black.opacity(0.04)
                )
                .widgetURL(URL(string: "workout://widget?action=home"))
        }
    }

    private var widgetContent: some View {
        Group {
            if widgetFamily == .accessoryInline {
                inlineContent
            } else if widgetFamily == .accessoryCircular {
                circularContent
            } else if widgetFamily == .systemSmall {
                smallHomeScreenContent
            } else {
                homeScreenContent
            }
        }
        .privacySensitive(false)
    }

    private var inlineContent: some View {
        Label(inlineSummary, systemImage: "dumbbell.fill")
            .lineLimit(1)
    }

    private var circularContent: some View {
        Image("WorkoutLockScreenMarkV3")
            .renderingMode(.template)
            .resizable()
            .scaledToFit()
            .foregroundStyle(.primary)
        .frame(width: 64, height: 64)
        .accessibilityLabel("Open Workout")
    }

    private var inlineSummary: String {
        guard let workoutName = entry.snapshot?.workoutName,
              !workoutName.isEmpty else {
            return "Open Workout"
        }

        return "Next: \(workoutName)"
    }

    private var homeScreenContent: some View {
        let snapshot = entry.snapshot
        return VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top, spacing: 8) {
                NextWorkoutBrandMark(size: 40)

                VStack(alignment: .leading, spacing: 2) {
                    Text("NEXT UP")
                        .font(.caption2.weight(.bold))
                        .foregroundStyle(.secondary)
                    Text(snapshot?.workoutName ?? "Open Workout to see your next session")
                        .font(.headline)
                        .lineLimit(1)
                    Text(snapshot.map { "\($0.exerciseCount) exercises\($0.planWeek.map { " · Week \($0)" } ?? "")" } ?? "Your plan stays private on this device")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }
            Spacer(minLength: 0)
            HStack(spacing: 7) {
                WidgetActionLink(title: "Preview", systemImage: "eye", action: "preview")
                WidgetActionLink(title: "Start", systemImage: "play.fill", action: "start", emphasized: true)
                WidgetActionLink(title: "Weight", systemImage: "scalemass.fill", action: "weight")
            }
        }
        .padding()
    }

    private var smallHomeScreenContent: some View {
        GeometryReader { proxy in
            let gap: CGFloat = 4
            let side = min(proxy.size.width, proxy.size.height)
            let cellSize = (side - gap) / 2
            let actionIconSize = ((side - 8) / 2) * 0.46
            let backgroundSize = cellSize + 3
            let tileOutset: CGFloat = 2.5

            VStack(spacing: gap) {
                HStack(spacing: gap) {
                    SmallWidgetAppIconLink(
                        size: cellSize * 0.76,
                        backgroundSize: backgroundSize
                    )
                    .frame(width: cellSize, height: cellSize)
                    .offset(x: -tileOutset, y: -tileOutset)
                    SmallWidgetIconLink(
                        systemImage: "scalemass.fill",
                        action: "weight",
                        accessibilityLabel: "Log body weight",
                        size: actionIconSize,
                        backgroundSize: backgroundSize
                    )
                    .frame(width: cellSize, height: cellSize)
                    .offset(x: tileOutset, y: -tileOutset)
                }
                HStack(spacing: gap) {
                    SmallWidgetIconLink(
                        systemImage: "eye",
                        action: "preview",
                        accessibilityLabel: "Preview workout",
                        size: actionIconSize,
                        backgroundSize: backgroundSize
                    )
                    .frame(width: cellSize, height: cellSize)
                    .offset(x: -tileOutset, y: tileOutset)
                    SmallWidgetIconLink(
                        systemImage: "play.fill",
                        action: "start",
                        accessibilityLabel: "Start workout",
                        size: actionIconSize,
                        backgroundSize: backgroundSize
                    )
                    .frame(width: cellSize, height: cellSize)
                    .offset(x: tileOutset, y: tileOutset)
                }
            }
            .frame(width: side, height: side)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }
}

private struct NextWorkoutBrandMark: View {
    let size: CGFloat

    var body: some View {
        Image("WorkoutAppIcon")
            .renderingMode(.original)
            .resizable()
            .scaledToFit()
            .frame(width: size, height: size)
            .accessibilityHidden(true)
    }
}

private struct WidgetActionLink: View {
    let title: String
    let systemImage: String
    let action: String
    var emphasized = false

    var body: some View {
        Link(destination: URL(string: "workout://widget?action=\(action)")!) {
            Label(title, systemImage: systemImage)
                .font(.caption.weight(.semibold))
                .frame(maxWidth: .infinity)
                .padding(.vertical, 7)
                .background(emphasized ? Color.workoutPurple : Color.primary.opacity(0.08), in: Capsule())
                .foregroundStyle(emphasized ? .white : .primary)
        }
    }
}

private struct SmallWidgetAppIconLink: View {
    let size: CGFloat
    let backgroundSize: CGFloat

    var body: some View {
        Link(destination: URL(string: "workout://widget?action=home")!) {
            ZStack {
                Circle()
                    .fill(Color.workoutPurplePale)
                    .frame(width: backgroundSize, height: backgroundSize)
                NextWorkoutBrandMark(size: size)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .accessibilityLabel("Open Workout")
    }
}

private struct SmallWidgetIconLink: View {
    let systemImage: String
    let action: String
    let accessibilityLabel: String
    let size: CGFloat
    let backgroundSize: CGFloat

    var body: some View {
        Link(destination: URL(string: "workout://widget?action=\(action)")!) {
            ZStack {
                Circle()
                    .fill(Color.workoutPurplePale)
                    .frame(width: backgroundSize, height: backgroundSize)
                Image(systemName: systemImage)
                    .font(.system(size: size, weight: .semibold))
                    .foregroundStyle(Color.workoutPurpleDark)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .accessibilityLabel(accessibilityLabel)
    }
}

struct RestTimerLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: RestTimerActivityAttributes.self) { context in
            RestTimerLockScreenView(context: context)
                .activityBackgroundTint(Color.black.opacity(0.9))
                .activitySystemActionForegroundColor(.white)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    RestTimerBrandMark(size: 28)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    RestTimerText(state: context.state)
                        .font(.title3.monospacedDigit().bold())
                }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(alignment: .leading, spacing: 8) {
                        HStack(spacing: 10) {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(context.state.exerciseName.isEmpty ? "Rest timer" : context.state.exerciseName)
                                    .font(.headline)
                                    .lineLimit(1)
                                RestTimerSetText(state: context.state)
                            }
                            Spacer()
                            RestTimerControl(state: context.state)
                        }
                        RestTimerProgress(state: context.state)
                    }
                }
            } compactLeading: {
                RestTimerBrandMark(size: 20)
            } compactTrailing: {
                RestTimerText(state: context.state)
                    .font(.caption.monospacedDigit().bold())
                    .frame(minWidth: 42)
            } minimal: {
                RestTimerText(state: context.state)
                    .font(.caption2.monospacedDigit().bold())
            }
            .keylineTint(.workoutPurple)
        }
    }
}

private struct RestTimerLockScreenView: View {
    let context: ActivityViewContext<RestTimerActivityAttributes>

    var body: some View {
        HStack(spacing: 14) {
            RestTimerBrandMark(size: 48)

            VStack(alignment: .leading, spacing: 5) {
                Text(context.state.pausedSeconds == nil ? "Rest timer" : "Rest paused")
                    .font(.headline)
                Text(context.state.exerciseName.isEmpty ? "Next set" : context.state.exerciseName)
                    .font(.subheadline.weight(.semibold))
                    .lineLimit(1)
                RestTimerSetText(state: context.state)
                RestTimerProgress(state: context.state)
            }

            Spacer(minLength: 8)

            VStack(spacing: 10) {
                RestTimerText(state: context.state)
                    .font(.title.monospacedDigit().bold())
                RestTimerControl(state: context.state)
            }
        }
        .padding()
    }
}

private struct RestTimerBrandMark: View {
    let size: CGFloat

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: size * 0.24, style: .continuous)
                .fill(Color.workoutPurple.opacity(0.22))

            Image("WorkoutAppIcon")
                .renderingMode(.original)
                .resizable()
                .scaledToFit()
                .padding(size * 0.06)
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }
}

private struct RestTimerSetText: View {
    let state: RestTimerActivityAttributes.ContentState

    var body: some View {
        if let setNumber = state.setNumber, let totalSets = state.totalSets {
            Text("Set \(setNumber) of \(totalSets)")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }
}

private struct RestTimerControl: View {
    let state: RestTimerActivityAttributes.ContentState

    @ViewBuilder
    var body: some View {
        if #available(iOS 17.0, *) {
            Button(intent: RestTimerToggleIntent()) {
                Image(systemName: state.pausedSeconds == nil ? "pause.fill" : "play.fill")
                    .frame(width: 34, height: 34)
                    .background(Color.workoutPurple, in: Circle())
                    .foregroundStyle(.white)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(state.pausedSeconds == nil ? "Pause rest timer" : "Resume rest timer")
        }
    }
}

private struct RestTimerText: View {
    let state: RestTimerActivityAttributes.ContentState

    var body: some View {
        if let pausedSeconds = state.pausedSeconds {
            Text(Self.format(seconds: pausedSeconds))
        } else {
            TimelineView(.periodic(from: .now, by: 1)) { timeline in
                if timeline.date < state.endsAt {
                    Text(
                        timerInterval: state.startedAt...state.endsAt,
                        countsDown: true,
                        showsHours: false
                    )
                } else {
                    Text(
                        timerInterval: state.endsAt...Date.distantFuture,
                        countsDown: false,
                        showsHours: false
                    )
                }
            }
        }
    }

    private static func format(seconds: Int) -> String {
        String(format: "%d:%02d", seconds / 60, seconds % 60)
    }
}

private struct RestTimerProgress: View {
    let state: RestTimerActivityAttributes.ContentState

    var body: some View {
        if state.pausedSeconds == nil {
            TimelineView(.periodic(from: .now, by: 1)) { timeline in
                if timeline.date < state.endsAt {
                    ProgressView(timerInterval: state.startedAt...state.endsAt, countsDown: true)
                        .tint(.workoutPurple)
                } else {
                    ProgressView(value: 0)
                        .tint(.workoutPurple)
                }
            }
        } else {
            ProgressView(value: 0)
                .tint(.workoutPurple)
        }
    }
}

private extension Color {
    static let workoutPurple = Color(
        red: 170.0 / 255.0,
        green: 59.0 / 255.0,
        blue: 255.0 / 255.0
    )

    static let workoutPurplePale = Color(
        red: 244.0 / 255.0,
        green: 233.0 / 255.0,
        blue: 255.0 / 255.0
    )

    static let workoutPurpleDark = Color(
        red: 101.0 / 255.0,
        green: 34.0 / 255.0,
        blue: 141.0 / 255.0
    )

    static let workoutWidgetBackground = Color(
        red: 253.0 / 255.0,
        green: 252.0 / 255.0,
        blue: 255.0 / 255.0
    )
}
