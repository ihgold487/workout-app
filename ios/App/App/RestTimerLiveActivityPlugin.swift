import ActivityKit
import Capacitor
import Foundation

@available(iOS 16.2, *)
@objc(RestTimerLiveActivityPlugin)
public class RestTimerLiveActivityPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "RestTimerLiveActivityPlugin"
    public let jsName = "RestTimerLiveActivity"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pause", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "resume", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "end", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getState", returnType: CAPPluginReturnPromise)
    ]

    @objc func start(_ call: CAPPluginCall) {
        guard ActivityAuthorizationInfo().areActivitiesEnabled else {
            call.resolve(["supported": false])
            return
        }

        let seconds = max(1, call.getInt("seconds") ?? 1)
        let workoutName = call.getString("workoutName") ?? "Workout"
        let exerciseName = call.getString("exerciseName") ?? ""
        let setNumber = positiveInt(call.getInt("setNumber"))
        let totalSets = positiveInt(call.getInt("totalSets"))
        let requestedStartedAtMs = call.getDouble("startedAtMs") ?? 0
        let now = requestedStartedAtMs > 0
            ? Date(timeIntervalSince1970: requestedStartedAtMs / 1000.0)
            : Date()
        let endsAt = now.addingTimeInterval(TimeInterval(seconds))
        let state = RestTimerActivityAttributes.ContentState(
            startedAt: now,
            endsAt: endsAt,
            exerciseName: exerciseName,
            setNumber: setNumber,
            totalSets: totalSets
        )

        Task {
            await endAllActivities()

            do {
                _ = try Activity<RestTimerActivityAttributes>.request(
                    attributes: RestTimerActivityAttributes(workoutName: workoutName),
                    content: ActivityContent(state: state, staleDate: endsAt),
                    pushType: nil
                )
                call.resolve(["supported": true])
            } catch {
                call.reject("Unable to start rest timer Live Activity", nil, error)
            }
        }
    }

    @objc func pause(_ call: CAPPluginCall) {
        let seconds = max(0, call.getInt("seconds") ?? 0)
        let now = Date()
        let currentState = Activity<RestTimerActivityAttributes>.activities.first?.content.state
        let state = RestTimerActivityAttributes.ContentState(
            startedAt: now,
            endsAt: now.addingTimeInterval(TimeInterval(seconds)),
            pausedSeconds: seconds,
            exerciseName: currentState?.exerciseName ?? "",
            setNumber: currentState?.setNumber,
            totalSets: currentState?.totalSets
        )

        Task {
            await updateAllActivities(state: state, staleDate: nil)
            call.resolve(["supported": true])
        }
    }

    @objc func resume(_ call: CAPPluginCall) {
        let seconds = max(1, call.getInt("seconds") ?? 1)
        let now = Date()
        let endsAt = now.addingTimeInterval(TimeInterval(seconds))
        let currentState = Activity<RestTimerActivityAttributes>.activities.first?.content.state
        let state = RestTimerActivityAttributes.ContentState(
            startedAt: now,
            endsAt: endsAt,
            exerciseName: currentState?.exerciseName ?? "",
            setNumber: currentState?.setNumber,
            totalSets: currentState?.totalSets
        )

        Task {
            await updateAllActivities(state: state, staleDate: endsAt)
            call.resolve(["supported": true])
        }
    }

    @objc func end(_ call: CAPPluginCall) {
        Task {
            await endAllActivities()
            call.resolve(["supported": true])
        }
    }

    @objc func getState(_ call: CAPPluginCall) {
        guard let activity = Activity<RestTimerActivityAttributes>.activities.first else {
            call.resolve(["active": false])
            return
        }

        let state = activity.content.state
        let seconds = state.pausedSeconds ?? max(
            0,
            Int(ceil(state.endsAt.timeIntervalSinceNow))
        )

        call.resolve([
            "active": true,
            "paused": state.pausedSeconds != nil,
            "seconds": seconds
        ])
    }

    private func updateAllActivities(
        state: RestTimerActivityAttributes.ContentState,
        staleDate: Date?
    ) async {
        let content = ActivityContent(state: state, staleDate: staleDate)

        for activity in Activity<RestTimerActivityAttributes>.activities {
            await activity.update(content)
        }
    }

    private func endAllActivities() async {
        for activity in Activity<RestTimerActivityAttributes>.activities {
            await activity.end(nil, dismissalPolicy: .immediate)
        }
    }

    private func positiveInt(_ value: Int?) -> Int? {
        guard let value, value > 0 else {
            return nil
        }

        return value
    }
}
