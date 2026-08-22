import Capacitor
import UIKit

class MainViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        super.capacitorDidLoad()

        bridge?.registerPluginInstance(WorkoutIdleTimerPlugin())
        bridge?.registerPluginInstance(PickerHapticsPlugin())

        if #available(iOS 16.2, *) {
            bridge?.registerPluginInstance(RestTimerLiveActivityPlugin())
        }
    }
}
