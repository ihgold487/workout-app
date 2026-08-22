import ActivityKit
import Foundation

@available(iOS 16.1, *)
public struct RestTimerActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        public let startedAt: Date
        public let endsAt: Date
        public let pausedSeconds: Int?
        public let exerciseName: String
        public let setNumber: Int?
        public let totalSets: Int?

        public init(
            startedAt: Date,
            endsAt: Date,
            pausedSeconds: Int? = nil,
            exerciseName: String = "",
            setNumber: Int? = nil,
            totalSets: Int? = nil
        ) {
            self.startedAt = startedAt
            self.endsAt = endsAt
            self.pausedSeconds = pausedSeconds
            self.exerciseName = exerciseName
            self.setNumber = setNumber
            self.totalSets = totalSets
        }
    }

    public let workoutName: String

    public init(workoutName: String) {
        self.workoutName = workoutName
    }
}
