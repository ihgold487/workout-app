import Capacitor
import Foundation

@objc(ProvisioningExpiryPlugin)
public class ProvisioningExpiryPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "ProvisioningExpiryPlugin"
    public let jsName = "ProvisioningExpiry"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getExpiration", returnType: CAPPluginReturnPromise)
    ]

    @objc func getExpiration(_ call: CAPPluginCall) {
        guard let profileURL = Bundle.main.url(
            forResource: "embedded",
            withExtension: "mobileprovision"
        ) else {
            call.resolve()
            return
        }

        do {
            let profileData = try Data(contentsOf: profileURL)
            let profileText = String(decoding: profileData, as: UTF8.self)
            let pattern = "<key>ExpirationDate</key>\\s*<date>([^<]+)</date>"
            let expression = try NSRegularExpression(pattern: pattern)
            let range = NSRange(
                profileText.startIndex..<profileText.endIndex,
                in: profileText
            )

            guard
                let match = expression.firstMatch(in: profileText, range: range),
                let dateRange = Range(match.range(at: 1), in: profileText),
                let expirationDate = ISO8601DateFormatter().date(
                    from: String(profileText[dateRange])
                )
            else {
                call.resolve()
                return
            }

            call.resolve([
                "expirationDate": ISO8601DateFormatter().string(from: expirationDate)
            ])
        } catch {
            call.resolve()
        }
    }
}
