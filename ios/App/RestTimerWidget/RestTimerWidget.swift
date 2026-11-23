import ActivityKit
import Foundation
import SwiftUI
import WidgetKit

@main
struct RestTimerWidgetBundle: WidgetBundle {
    var body: some Widget {
        RestTimerLiveActivity()
        NextWorkoutWidget()
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
        .supportedFamilies([.systemMedium])
    }
}

private struct NextWorkoutWidgetView: View {
    let entry: NextWorkoutEntry

    var body: some View {
        if #available(iOS 17.0, *) {
            content
                .containerBackground(.fill.tertiary, for: .widget)
        } else {
            content
                .background(Color.black.opacity(0.04))
        }
    }

    private var content: some View {
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
}
