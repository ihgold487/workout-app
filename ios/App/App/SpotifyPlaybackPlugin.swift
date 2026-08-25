import Capacitor
import SpotifyiOS
import UIKit

@objc(SpotifyPlaybackPlugin)
public class SpotifyPlaybackPlugin: CAPPlugin, CAPBridgedPlugin, SPTAppRemoteDelegate, SPTAppRemotePlayerStateDelegate {
    public let identifier = "SpotifyPlaybackPlugin"
    public let jsName = "SpotifyPlayback"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getState", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "connect", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "togglePlayback", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "skipNext", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "skipPrevious", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openSpotify", returnType: CAPPluginReturnPromise)
    ]

    private static weak var activeInstance: SpotifyPlaybackPlugin?
    private static let clientID = "218fcde5bf514a409efbf42f51d8ea59"
    private static let redirectURL = URL(string: "workout-app-ihgold487-spotify://callback")!
    private static let accessTokenKey = "spotifyAppRemoteAccessToken"

    private lazy var configuration = SPTConfiguration(
        clientID: Self.clientID,
        redirectURL: Self.redirectURL
    )

    private lazy var appRemote: SPTAppRemote = {
        let remote = SPTAppRemote(configuration: configuration, logLevel: .none)
        remote.delegate = self
        remote.connectionParameters.accessToken = UserDefaults.standard.string(forKey: Self.accessTokenKey)
        return remote
    }()

    private var isPaused: Bool?
    private var trackName: String?
    private var artistName: String?
    private var playlistContextURI: String?
    private var playlistImageDataURL: String?
    private var canSkipNext = false
    private var canSkipPrevious = false
    private var lastError: String?

    override public func load() {
        Self.activeInstance = self
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(applicationDidBecomeActive),
            name: UIApplication.didBecomeActiveNotification,
            object: nil
        )
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
    }

    public static func handleAuthorizationCallback(_ url: URL) -> Bool {
        guard url.scheme == redirectURL.scheme, let plugin = activeInstance else {
            return false
        }

        let parameters = plugin.appRemote.authorizationParameters(from: url)
        if let token = parameters?[SPTAppRemoteAccessTokenKey] {
            UserDefaults.standard.set(token, forKey: accessTokenKey)
            plugin.appRemote.connectionParameters.accessToken = token
            plugin.lastError = nil
            plugin.appRemote.connect()
        } else if let message = parameters?[SPTAppRemoteErrorDescriptionKey] {
            plugin.lastError = message
            plugin.emitState()
        }
        return true
    }

    @objc private func applicationDidBecomeActive() {
        guard !appRemote.isConnected,
              appRemote.connectionParameters.accessToken != nil else {
            return
        }
        appRemote.connect()
    }

    @objc func getState(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if !self.appRemote.isConnected,
               self.appRemote.connectionParameters.accessToken != nil {
                self.appRemote.connect()
            }
            call.resolve(self.statePayload())
        }
    }

    @objc func connect(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.lastError = nil
            if self.appRemote.isConnected {
                call.resolve(self.statePayload())
                return
            }

            // A plain App Remote connection cannot wake Spotify after playback
            // has stopped and iOS has suspended it. An explicit user tap may
            // launch Spotify and resume the last item, which restores the
            // connection and reuses authorization when it is still valid.
            self.appRemote.authorizeAndPlayURI("") { spotifyInstalled in
                DispatchQueue.main.async {
                    if !spotifyInstalled {
                        self.lastError = "Spotify is not installed on this device."
                        self.emitState()
                    }
                }
            }
            call.resolve(self.statePayload())
        }
    }

    @objc func togglePlayback(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard self.appRemote.isConnected, let playerAPI = self.appRemote.playerAPI else {
                self.connect(call)
                return
            }

            let completion: SPTAppRemoteCallback = { _, error in
                DispatchQueue.main.async {
                    if let error {
                        self.lastError = error.localizedDescription
                        self.emitState()
                        call.reject("Spotify playback command failed", nil, error)
                    } else {
                        self.lastError = nil
                        call.resolve(self.statePayload())
                    }
                }
            }

            if self.isPaused == false {
                playerAPI.pause(completion)
            } else {
                playerAPI.resume(completion)
            }
        }
    }

    @objc func skipNext(_ call: CAPPluginCall) {
        performPlayerCommand(call, allowed: canSkipNext) { playerAPI, completion in
            playerAPI.skip(toNext: completion)
        }
    }

    @objc func skipPrevious(_ call: CAPPluginCall) {
        performPlayerCommand(call, allowed: canSkipPrevious) { playerAPI, completion in
            playerAPI.skip(toPrevious: completion)
        }
    }

    @objc func openSpotify(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let url = URL(string: "spotify:") else {
                call.reject("Unable to create Spotify URL")
                return
            }
            UIApplication.shared.open(url) { opened in
                opened ? call.resolve() : call.reject("Unable to open Spotify")
            }
        }
    }

    public func appRemoteDidEstablishConnection(_ appRemote: SPTAppRemote) {
        lastError = nil
        appRemote.playerAPI?.delegate = self
        appRemote.playerAPI?.subscribe(toPlayerState: { [weak self] _, error in
            if let error {
                self?.lastError = error.localizedDescription
            }
            self?.emitState()
        })
        emitState()
    }

    public func appRemote(_ appRemote: SPTAppRemote, didFailConnectionAttemptWithError error: Error?) {
        isPaused = nil
        trackName = nil
        artistName = nil
        playlistContextURI = nil
        playlistImageDataURL = nil
        lastError = error?.localizedDescription ?? "Unable to connect to Spotify."
        emitState()
    }

    public func appRemote(_ appRemote: SPTAppRemote, didDisconnectWithError error: Error?) {
        isPaused = nil
        trackName = nil
        artistName = nil
        playlistContextURI = nil
        playlistImageDataURL = nil
        if let error {
            lastError = error.localizedDescription
        }
        emitState()
    }

    public func playerStateDidChange(_ playerState: SPTAppRemotePlayerState) {
        isPaused = playerState.isPaused
        trackName = playerState.track.name
        artistName = playerState.track.artist.name
        canSkipNext = playerState.playbackRestrictions.canSkipNext
        canSkipPrevious = playerState.playbackRestrictions.canSkipPrevious
        lastError = nil
        updatePlaylistArtwork(for: playerState.contextURI.absoluteString)
        emitState()
    }

    private func statePayload() -> [String: Any] {
        var payload: [String: Any] = [
            "available": true,
            "connected": appRemote.isConnected,
            "authorized": appRemote.connectionParameters.accessToken != nil,
            "canSkipNext": canSkipNext,
            "canSkipPrevious": canSkipPrevious
        ]
        if let isPaused { payload["isPaused"] = isPaused }
        if let trackName { payload["trackName"] = trackName }
        if let artistName { payload["artistName"] = artistName }
        if let playlistImageDataURL { payload["playlistImageDataURL"] = playlistImageDataURL }
        if let lastError { payload["error"] = lastError }
        return payload
    }

    private func updatePlaylistArtwork(for contextURI: String) {
        guard contextURI.hasPrefix("spotify:playlist:") else {
            playlistContextURI = nil
            playlistImageDataURL = nil
            return
        }

        guard contextURI != playlistContextURI || playlistImageDataURL == nil else {
            return
        }

        playlistContextURI = contextURI
        playlistImageDataURL = nil

        appRemote.contentAPI?.fetchContentItem(forURI: contextURI) { [weak self] result, error in
            guard let self,
                  error == nil,
                  self.playlistContextURI == contextURI,
                  let contentItem = result as? SPTAppRemoteContentItem else {
                return
            }

            self.appRemote.imageAPI?.fetchImage(
                forItem: contentItem,
                with: CGSize(width: 96, height: 96)
            ) { [weak self] result, error in
                guard let self,
                      error == nil,
                      self.playlistContextURI == contextURI,
                      let image = result as? UIImage,
                      let imageData = image.pngData() else {
                    return
                }

                self.playlistImageDataURL = "data:image/png;base64,\(imageData.base64EncodedString())"
                self.emitState()
            }
        }
    }

    private func emitState() {
        DispatchQueue.main.async {
            self.notifyListeners("spotifyStateChanged", data: self.statePayload())
        }
    }

    private func performPlayerCommand(
        _ call: CAPPluginCall,
        allowed: Bool,
        command: @escaping (SPTAppRemotePlayerAPI, SPTAppRemoteCallback?) -> Void
    ) {
        DispatchQueue.main.async {
            guard allowed else {
                call.reject("This Spotify playback action is currently restricted.")
                return
            }
            guard self.appRemote.isConnected, let playerAPI = self.appRemote.playerAPI else {
                call.reject("Spotify is not connected.")
                return
            }
            command(playerAPI) { _, error in
                DispatchQueue.main.async {
                    if let error {
                        self.lastError = error.localizedDescription
                        self.emitState()
                        call.reject("Spotify playback command failed", nil, error)
                    } else {
                        self.lastError = nil
                        call.resolve(self.statePayload())
                    }
                }
            }
        }
    }
}
