import Capacitor
import UIKit

@objc(WorkoutIdleTimerPlugin)
public class WorkoutIdleTimerPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "WorkoutIdleTimerPlugin"
    public let jsName = "WorkoutIdleTimer"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setAutoLockEnabled", returnType: CAPPluginReturnPromise)
    ]
    private var autoLockEnabled = true

    override public func load() {
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(appDidBecomeActive),
            name: UIApplication.didBecomeActiveNotification,
            object: nil
        )
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(appWillTerminate),
            name: UIApplication.willTerminateNotification,
            object: nil
        )
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
        setSystemAutoLockEnabled(true)
    }

    @objc func setAutoLockEnabled(_ call: CAPPluginCall) {
        let enabled = call.getBool("enabled") ?? true

        DispatchQueue.main.async {
            self.autoLockEnabled = enabled
            self.setSystemAutoLockEnabled(enabled)
            call.resolve([
                "enabled": enabled
            ])
        }
    }

    @objc private func appDidBecomeActive() {
        setSystemAutoLockEnabled(autoLockEnabled)
    }

    @objc private func appWillTerminate() {
        setSystemAutoLockEnabled(true)
    }

    private func setSystemAutoLockEnabled(_ enabled: Bool) {
        DispatchQueue.main.async {
            UIApplication.shared.isIdleTimerDisabled = !enabled
        }
    }
}
