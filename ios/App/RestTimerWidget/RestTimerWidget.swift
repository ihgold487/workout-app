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

private struct CreatineReminderSnapshot: Decodable {
    let enabled: Bool
    let reminderTime: String
    let takenDate: String
    let takenToday: Bool

    func isDue(at date: Date) -> Bool {
        guard enabled,
              let reminderDate = reminderDate(on: date) else {
            return false
        }

        return date >= reminderDate && !(takenToday && takenDate == Self.dateKey(for: date))
    }

    func upcomingTimelineDates(after date: Date) -> [Date] {
        guard enabled else { return [] }

        let calendar = Calendar.current
        let startOfToday = calendar.startOfDay(for: date)
        var dates: [Date] = []

        for dayOffset in 0..<31 {
            guard let day = calendar.date(byAdding: .day, value: dayOffset, to: startOfToday),
                  let reminderDate = reminderDate(on: day) else {
                continue
            }

            if reminderDate > date {
                dates.append(reminderDate)
            }

            if let nextDay = calendar.date(byAdding: .day, value: 1, to: day),
               nextDay > date {
                dates.append(nextDay)
            }
        }

        return Array(Set(dates)).sorted()
    }

    private func reminderDate(on date: Date) -> Date? {
        let parts = reminderTime.split(separator: ":").compactMap { Int($0) }
        guard parts.count == 2,
              (0...23).contains(parts[0]),
              (0...59).contains(parts[1]) else {
            return nil
        }

        return Calendar.current.date(
            bySettingHour: parts[0],
            minute: parts[1],
            second: 0,
            of: date
        )
    }

    private static func dateKey(for date: Date) -> String {
        let formatter = DateFormatter()
        formatter.calendar = Calendar.current
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = .current
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: date)
    }
}

private struct NextWorkoutEntry: TimelineEntry {
    let date: Date
    let snapshot: NextWorkoutSnapshot?
    let creatineReminder: CreatineReminderSnapshot?
}

private struct NextWorkoutProvider: TimelineProvider {
    func placeholder(in context: Context) -> NextWorkoutEntry {
        NextWorkoutEntry(date: .now, snapshot: NextWorkoutSnapshot(exerciseCount: 5, planWeek: 2, workoutName: "Upper Body"), creatineReminder: nil)
    }

    func getSnapshot(in context: Context, completion: @escaping (NextWorkoutEntry) -> Void) {
        completion(entry())
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<NextWorkoutEntry>) -> Void) {
        let now = Date()
        let currentEntry = entry(at: now)
        let reminderEntries = currentEntry.creatineReminder?
            .upcomingTimelineDates(after: now)
            .map { entry(at: $0) } ?? []
        let entries = [currentEntry] + reminderEntries
        let refreshDate = reminderEntries.last?.date.addingTimeInterval(1)
            ?? now.addingTimeInterval(24 * 60 * 60)

        completion(Timeline(entries: entries, policy: .after(refreshDate)))
    }

    private func entry(at date: Date = .now) -> NextWorkoutEntry {
        let stored = UserDefaults(suiteName: "group.com.ihgold487.workoutapp")?
            .string(forKey: "homeWidgetSnapshot")
        let snapshot = stored.flatMap { try? JSONDecoder().decode(NextWorkoutSnapshot.self, from: Data($0.utf8)) }
        let creatineStored = UserDefaults(suiteName: "group.com.ihgold487.workoutapp")?
            .string(forKey: "creatineReminderWidgetSnapshot")
        let creatineReminder = creatineStored.flatMap {
            try? JSONDecoder().decode(CreatineReminderSnapshot.self, from: Data($0.utf8))
        }
        return NextWorkoutEntry(date: date, snapshot: snapshot, creatineReminder: creatineReminder)
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
                        backgroundSize: backgroundSize,
                        showsReminderBadge: entry.creatineReminder?.isDue(at: entry.date) ?? false
                    )
                    .frame(width: cellSize, height: cellSize)
                    .offset(x: -tileOutset, y: -tileOutset)
                    SmallWidgetIconLink(
                        systemImage: "scalemass",
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
                        systemImage: "play",
                        action: "start",
                        accessibilityLabel: "Start workout",
                        size: actionIconSize,
                        backgroundSize: backgroundSize,
                        iconWeight: .bold
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
    let showsReminderBadge: Bool

    var body: some View {
        Link(destination: URL(string: "workout://widget?action=home")!) {
            ZStack {
                Circle()
                    .fill(Color.workoutPurplePale)
                    .frame(width: backgroundSize, height: backgroundSize)
                NextWorkoutBrandMark(size: size)
            }
            .overlay(alignment: .topTrailing) {
                if showsReminderBadge {
                    Image("CreatineMortarMark")
                        .renderingMode(.template)
                        .resizable()
                        .scaledToFit()
                        .foregroundStyle(.white)
                        .frame(
                            width: max(19, backgroundSize * 0.27),
                            height: max(19, backgroundSize * 0.27)
                        )
                        .padding(max(3, backgroundSize * 0.045))
                        .background(Color.workoutPurple, in: Circle())
                        .overlay(Circle().stroke(.white.opacity(0.3), lineWidth: 1))
                        .offset(x: backgroundSize * 0.04, y: -backgroundSize * 0.04)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .accessibilityLabel(
            showsReminderBadge
                ? "Open Workout. Creatine reminder due"
                : "Open Workout"
        )
    }
}

private struct SmallWidgetIconLink: View {
    let systemImage: String
    let action: String
    let accessibilityLabel: String
    let size: CGFloat
    let backgroundSize: CGFloat
    var iconWeight: Font.Weight = .semibold

    var body: some View {
        Link(destination: URL(string: "workout://widget?action=\(action)")!) {
            ZStack {
                Circle()
                    .fill(Color.workoutPurplePale)
                    .frame(width: backgroundSize, height: backgroundSize)
                Image(systemName: systemImage)
                    .font(.system(size: size, weight: iconWeight))
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
