import Capacitor
import HealthKit

@objc(AppleHealthPlugin)
public class AppleHealthPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AppleHealthPlugin"
    public let jsName = "AppleHealth"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getHeartRateAuthorizationStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestHeartRateAuthorization", returnType: CAPPluginReturnPromise)
    ]

    private let healthStore = HKHealthStore()

    @objc func getHeartRateAuthorizationStatus(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable() else {
            call.resolve([
                "available": false,
                "requestStatus": "unavailable"
            ])
            return
        }

        guard let heartRate = HKObjectType.quantityType(forIdentifier: .heartRate) else {
            call.reject("Heart-rate data is unavailable on this device.")
            return
        }

        healthStore.getRequestStatusForAuthorization(toShare: [], read: [heartRate]) { status, error in
            if let error {
                call.reject("Unable to check Apple Health access.", nil, error)
                return
            }

            call.resolve([
                "available": true,
                "requestStatus": self.requestStatusName(status)
            ])
        }
    }

    @objc func requestHeartRateAuthorization(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable() else {
            call.reject("Apple Health is unavailable on this device.")
            return
        }

        guard let heartRate = HKObjectType.quantityType(forIdentifier: .heartRate) else {
            call.reject("Heart-rate data is unavailable on this device.")
            return
        }

        healthStore.requestAuthorization(toShare: [], read: [heartRate]) { success, error in
            if let error {
                call.reject("Apple Health authorization could not be requested.", nil, error)
                return
            }

            call.resolve(["requestCompleted": success])
        }
    }

    private func requestStatusName(_ status: HKAuthorizationRequestStatus) -> String {
        switch status {
        case .shouldRequest:
            return "shouldRequest"
        case .unnecessary:
            return "unnecessary"
        case .unknown:
            return "unknown"
        @unknown default:
            return "unknown"
        }
    }
}
