import ActivityKit
import Foundation
import SwiftUI
import WidgetKit

@main
struct RestTimerWidgetBundle: WidgetBundle {
    var body: some Widget {
        RestTimerLiveActivity()
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
            Text(
                timerInterval: state.startedAt...state.endsAt,
                countsDown: true,
                showsHours: false
            )
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
            ProgressView(timerInterval: state.startedAt...state.endsAt, countsDown: true)
                .tint(.workoutPurple)
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
