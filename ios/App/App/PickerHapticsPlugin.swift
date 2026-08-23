import Capacitor
import UIKit

@objc(PickerHapticsPlugin)
public class PickerHapticsPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "PickerHapticsPlugin"
    public let jsName = "PickerHaptics"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "selectionChanged", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "warning", returnType: CAPPluginReturnPromise)
    ]
    private let pickerImpactFeedbackGenerator = UIImpactFeedbackGenerator(style: .rigid)
    private let notificationFeedbackGenerator = UINotificationFeedbackGenerator()

    override public func load() {
        pickerImpactFeedbackGenerator.prepare()
        notificationFeedbackGenerator.prepare()
    }

    @objc func selectionChanged(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.pickerImpactFeedbackGenerator.impactOccurred(intensity: 0.75)
            self.pickerImpactFeedbackGenerator.prepare()
            call.resolve()
        }
    }

    @objc func warning(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.notificationFeedbackGenerator.notificationOccurred(.warning)
            self.notificationFeedbackGenerator.prepare()
            call.resolve()
        }
    }
}
