import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { musicSourceLabel, parseMusicLink, type MusicTrack } from "../lib/musicStorage";

export type LinkControls = {
  play: () => void; pause: () => void; seek: (seconds: number) => void; setVolume?: (value: number) => void;
};
type LinkStatus = { playing?: boolean; paused?: boolean; ended?: boolean; time?: number; duration?: number };
type Props = {
  track: MusicTrack; rect: DOMRect | null;
  onReady: (controls: LinkControls) => void; onUpdate: (status: LinkStatus) => void; onError: () => void;
};
type SpotifyUpdate = { isPaused: boolean; isBuffering: boolean; position: number; duration: number };
type SpotifyController = {
  addListener: (event: string, callback: (event: { data: SpotifyUpdate }) => void) => void;
  play: () => void; pause: () => void; seek: (seconds: number) => void; destroy: () => void;
};
type SpotifyApi = {
  createController: (element: HTMLElement, options: { uri: string; width: string; height: string },
    callback: (controller: SpotifyController) => void) => void;
};
type SoundCloudEvent = "READY" | "PLAY" | "PAUSE" | "FINISH" | "PLAY_PROGRESS" | "SEEK" | "ERROR";
type SoundCloudController = {
  bind: (event: string, callback: (status: { currentPosition: number }) => void) => void;
  unbind: (event: string) => void;
  getDuration: (callback: (duration: number) => void) => void;
  play: () => void; pause: () => void; seekTo: (milliseconds: number) => void; setVolume: (percent: number) => void;
};
type SoundCloudApi = { Widget: ((frame: HTMLIFrameElement) => SoundCloudController) & { Events: Record<SoundCloudEvent, string> } };
const runtime = window as Window & {
  onSpotifyIframeApiReady?: (api: SpotifyApi) => void;
  SC?: SoundCloudApi;
};
let spotify: Promise<SpotifyApi> | undefined;
let soundCloud: Promise<SoundCloudApi> | undefined;

function loadScript<T>(url: string, attach: (script: HTMLScriptElement, resolve: (api: T) => void) => void) {
  return new Promise<T>((resolve, reject) => {
    const script = document.createElement("script");
    const fail = () => {
      window.clearTimeout(timeout);
      script.remove();
      reject(new Error("Music SDK failed to load"));
    };
    const timeout = window.setTimeout(fail, 12000);
    script.src = url;
    script.async = true;
    script.onerror = fail;
    attach(script, api => { window.clearTimeout(timeout); resolve(api); });
    document.head.append(script);
  });
}

function loadSpotify() {
  return spotify ??= loadScript<SpotifyApi>("https://open.spotify.com/embed/iframe-api/v1", (_, ready) => {
    runtime.onSpotifyIframeApiReady = ready;
  }).catch(error => { spotify = undefined; throw error; });
}

function loadSoundCloud() {
  if (runtime.SC) return Promise.resolve(runtime.SC);
  return soundCloud ??= loadScript<SoundCloudApi>("https://w.soundcloud.com/player/api.js", (script, ready) => {
    script.onload = () => { if (runtime.SC) ready(runtime.SC); };
  }).catch(error => { soundCloud = undefined; throw error; });
}

export default function MusicLinkPlayback(props: Props) {
  const host = useRef<HTMLDivElement>(null);
  const latest = useRef(props);
  latest.current = props;
  const { rect, track } = props;

  useEffect(() => {
    const root = host.current;
    const parsed = track.url && parseMusicLink(track.url);
    if (!root || !parsed || !parsed.embedUrl) { latest.current.onError(); return; }
    let live = true;
    let dispose: (() => void) | undefined;
    const update = (status: LinkStatus) => { if (live) latest.current.onUpdate(status); };
    const fail = () => { if (live) latest.current.onError(); };
    const watchdog = window.setTimeout(fail, 18000);
    const ready = (controls: LinkControls) => {
      if (!live) return;
      window.clearTimeout(watchdog);
      latest.current.onReady(controls);
    };

    if (parsed.source === "spotify") {
      const uri = `spotify:${new URL(parsed.url!).pathname.split("/").filter(Boolean).join(":")}`;
      const slot = document.createElement("div");
      root.append(slot);
      void loadSpotify().then(api => {
        if (!live) return;
        api.createController(slot, { uri, width: "100%", height: "152" }, controller => {
          if (!live) { controller.destroy(); return; }
          dispose = () => controller.destroy();
          controller.addListener("playback_update", ({ data }) => update({
            playing: !data.isPaused && !data.isBuffering, paused: data.isPaused,
            time: data.position / 1000, duration: data.duration / 1000,
          }));
          controller.addListener("ready", () => ready({
            play: () => controller.play(), pause: () => controller.pause(), seek: seconds => controller.seek(Math.floor(seconds)),
          }));
        });
      }).catch(fail);
    } else {
      // Load the API before inserting the frame, so READY is observed even with a cached embed.
      const embedUrl = parsed.embedUrl;
      void loadSoundCloud().then(api => {
        if (!live) return;
        const frame = document.createElement("iframe");
        frame.src = embedUrl;
        frame.title = "Trình phát SoundCloud";
        frame.allow = "autoplay";
        root.append(frame);
        const player = api.Widget(frame), events = api.Widget.Events;
        const progress = ({ currentPosition }: { currentPosition: number }) =>
          update({ time: currentPosition / 1000 });
        player.bind(events.READY, () => ready({
          play: () => player.play(), pause: () => player.pause(),
          seek: seconds => player.seekTo(seconds * 1000), setVolume: value => player.setVolume(value * 100),
        }));
        player.bind(events.PLAY, () => {
          update({ playing: true });
          player.getDuration(length => update({ duration: length / 1000 }));
        });
        player.bind(events.PAUSE, () => update({ playing: false, paused: true }));
        player.bind(events.FINISH, () => { update({ playing: false, ended: !track.isPlaylist }); });
        player.bind(events.PLAY_PROGRESS, progress);
        player.bind(events.SEEK, progress);
        player.bind(events.ERROR, fail);
        dispose = () => { for (const event of ["READY", "PLAY", "PAUSE", "FINISH", "PLAY_PROGRESS", "SEEK", "ERROR"] as const) player.unbind(events[event]); };
      }).catch(fail);
    }

    return () => {
      live = false;
      window.clearTimeout(watchdog);
      dispose?.();
      root.replaceChildren();
    };
  }, [track.isPlaylist, track.url]);

  return createPortal(<section className="music-link-surface" aria-label={`Trình phát ${musicSourceLabel(track.source)}`}
    hidden={!rect} inert={!rect} style={rect ? { left: rect.x, top: rect.y, width: rect.width, height: rect.height } : undefined}>
    <div ref={host}/>
  </section>, document.body);
}
