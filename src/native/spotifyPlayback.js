import { Capacitor, registerPlugin } from "@capacitor/core";

const SpotifyPlayback = registerPlugin("SpotifyPlayback");

export function canUseNativeSpotifyPlayback() {
  return Capacitor.isNativePlatform();
}

export async function getSpotifyPlaybackState() {
  if (!canUseNativeSpotifyPlayback()) {
    return { available: false, connected: false, authorized: false };
  }
  return SpotifyPlayback.getState();
}

export async function connectSpotifyPlayback() {
  return SpotifyPlayback.connect();
}

export async function toggleSpotifyPlayback() {
  return SpotifyPlayback.togglePlayback();
}

export async function skipSpotifyNext() {
  return SpotifyPlayback.skipNext();
}

export async function skipSpotifyPrevious() {
  return SpotifyPlayback.skipPrevious();
}

export async function openSpotifyApp() {
  return SpotifyPlayback.openSpotify();
}

export function addSpotifyPlaybackListener(listener) {
  if (!canUseNativeSpotifyPlayback()) {
    return Promise.resolve({ remove() {} });
  }
  return SpotifyPlayback.addListener("spotifyStateChanged", listener);
}
