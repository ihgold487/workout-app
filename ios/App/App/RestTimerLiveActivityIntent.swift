import ActivityKit
import AppIntents
import Foundation
import UserNotifications

@available(iOS 17.0, *)
struct RestTimerToggleIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Pause or resume rest timer"
    static var description = IntentDescription(
        "Pauses or resumes the active workout rest timer."
    )

    func perform() async throws -> some IntentResult {
        guard let activity = Activity<RestTimerActivityAttributes>.activities.first else {
            return .result()
        }

        let current = activity.content.state
        let now = Date()

        if let pausedSeconds = current.pausedSeconds {
            let endsAt = now.addingTimeInterval(TimeInterval(pausedSeconds))
            let resumed = RestTimerActivityAttributes.ContentState(
                startedAt: now,
                endsAt: endsAt,
                exerciseName: current.exerciseName,
                setNumber: current.setNumber,
                totalSets: current.totalSets
            )

            await activity.update(
                ActivityContent(state: resumed, staleDate: endsAt)
            )
            await scheduleCompletionNotification(after: pausedSeconds)
        } else {
            let remainingSeconds = max(
                0,
                Int(ceil(current.endsAt.timeIntervalSince(now)))
            )
            let paused = RestTimerActivityAttributes.ContentState(
                startedAt: now,
                endsAt: now.addingTimeInterval(TimeInterval(remainingSeconds)),
                pausedSeconds: remainingSeconds,
                exerciseName: current.exerciseName,
                setNumber: current.setNumber,
                totalSets: current.totalSets
            )

            await activity.update(
                ActivityContent(state: paused, staleDate: nil)
            )
            UNUserNotificationCenter.current().removePendingNotificationRequests(
                withIdentifiers: [Self.notificationIdentifier]
            )
        }

        return .result()
    }

    private func scheduleCompletionNotification(after seconds: Int) async {
        let center = UNUserNotificationCenter.current()
        center.removePendingNotificationRequests(
            withIdentifiers: [Self.notificationIdentifier]
        )

        guard seconds > 0 else {
            return
        }

        let content = UNMutableNotificationContent()
        content.title = "Rest complete"
        content.body = "Ready for next set"
        content.sound = .default

        let request = UNNotificationRequest(
            identifier: Self.notificationIdentifier,
            content: content,
            trigger: UNTimeIntervalNotificationTrigger(
                timeInterval: TimeInterval(seconds),
                repeats: false
            )
        )

        try? await center.add(request)
    }

    private static let notificationIdentifier = "1001"
}
