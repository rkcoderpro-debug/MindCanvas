// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import type { getYouTube } from "../lib/youtubeIframe";
import OnlineRoomYouTube from "./OnlineRoomYouTube";

it("reuses the room iframe, pauses it when collapsed and resumes at the room position", async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  type Events = ConstructorParameters<Awaited<ReturnType<typeof getYouTube>>["Player"]>[1]["events"];
  let events!: Events;
  const player = {
    playVideo: vi.fn(), pauseVideo: vi.fn(), destroy: vi.fn(), seekTo: vi.fn(), setVolume: vi.fn(),
    getDuration: vi.fn(() => 120), getCurrentTime: vi.fn(() => 0),
  };
  const create = vi.fn(function (_iframe: HTMLIFrameElement, config: { events: Events }) { events = config.events; return player; });
  const measure = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    return this.dataset.location ? new DOMRect(this.dataset.location === "room" ? 80 : 120, 120, 320, 210) : new DOMRect();
  });
  const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  vi.stubGlobal("YT", { Player: create });
  const host = document.createElement("div"), root = createRoot(host);
  document.body.append(host);
  const play = { video_id: "3Lfr3BhvkQY", title: "Test piano", attribution: null, offset: 0, at: "2026-11-25T00:00:00Z", revision: 1, loop: true, playing: true };
  let time = Date.parse(play.at) + 17000;
  function Scene({ location }: { location: "room" | "island" | "hidden" }) {
    const [room, setRoom] = useState<HTMLDivElement | null>(null), [mini, setMini] = useState<HTMLDivElement | null>(null);
    return <>
      {location === "room" && <div ref={setRoom} data-location="room"/>}
      {location === "island" && <div ref={setMini} data-location="island"/>}
      <OnlineRoomYouTube playback={play} compact={location !== "room"} slot={location === "room" ? room : mini}
        controlSlot={null} serverNow={() => time} onEnded={() => {}} vi volume={0.4}/>
    </>;
  }
  const go = (location: "room" | "island" | "hidden") => act(async () => root.render(<Scene location={location}/>));
  try {
    await go("room");
    const frame = document.querySelector(".room-youtube-float iframe")!;
    await act(async () => events.onReady({ target: player as never }));
    expect(player.seekTo).toHaveBeenCalledWith(17, true);
    expect(player.playVideo).toHaveBeenCalled();
    await go("island");
    expect(document.querySelector(".room-youtube-float.on-island:not([hidden]) iframe")).toBe(frame);
    expect(create).toHaveBeenCalledTimes(1);
    await go("hidden");
    expect(player.pauseVideo).toHaveBeenCalled();
    expect(document.querySelector(".room-youtube-float[hidden] iframe")).toBe(frame);
    time += 9000;
    await go("island");
    expect(player.seekTo).toHaveBeenLastCalledWith(26, true);
    expect(player.setVolume).toHaveBeenLastCalledWith(40);
    expect(create).toHaveBeenCalledTimes(1);
  } finally {
    await act(async () => root.unmount());
    host.remove();
    measure.mockRestore(); visibility.mockRestore(); vi.unstubAllGlobals();
  }
});

it("seeks the shared playlist index for a late listener and reports an end once", async () => {
  type Events = ConstructorParameters<Awaited<ReturnType<typeof getYouTube>>["Player"]>[1]["events"];
  let events!: Events, index = 0, time = 0;
  const player = {
    playVideo: vi.fn(), pauseVideo: vi.fn(), destroy: vi.fn(), setVolume: vi.fn(),
    getDuration: () => 180, getCurrentTime: () => time,
    seekTo: vi.fn((value: number) => { time = value; }),
    getPlaylist: () => ["qa_music_01", "qa_music_02", "qa_music_03", "qa_music_04"], getPlaylistIndex: () => index,
    playVideoAt: vi.fn((value: number) => { index = value; }), getVideoUrl: () => "",
  };
  vi.stubGlobal("YT", { Player: function (_frame: HTMLIFrameElement, config: { events: Events }) { events = config.events; return player; } });
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ title: "Bài số ba" })));
  const visible = vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  const measure = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(() => new DOMRect(20, 80, 350, 220));
  const host = document.createElement("div"), root = createRoot(host);
  document.body.append(host);
  const onEnded = vi.fn(), onTitle = vi.fn();
  const playback = { video_id: null, playlist_id: "PLRoomPlaylist", playlist_index: 2, title: "Nhạc chung",
    attribution: null, offset: 12, at: "2026-11-25T00:00:00Z", revision: 7, loop: false, playing: true };
  function Fixture() {
    const [slot, setSlot] = useState<HTMLDivElement | null>(null);
    return <><div ref={setSlot}/><OnlineRoomYouTube playback={playback} serverNow={() => Date.parse(playback.at) + 11000}
      onEnded={onEnded} onTitle={onTitle} vi slot={slot} compact={false} volume={0} controlSlot={null}/></>;
  }
  try {
    await act(async () => root.render(<Fixture/>));
    const frame = document.querySelector<HTMLIFrameElement>(".room-youtube-float iframe")!;
    const url = new URL(frame.src);
    expect(url.searchParams.get("list")).toBe("PLRoomPlaylist");
    expect(url.searchParams.get("controls")).toBe("0");
    expect(url.searchParams.get("disablekb")).toBe("1");
    await act(async () => events.onReady({ target: player }));
    expect(player.playVideoAt).toHaveBeenCalledExactlyOnceWith(2);
    await act(async () => events.onStateChange({ data: 1 }));
    expect(player.seekTo).toHaveBeenCalledWith(23, true);
    expect(onTitle).toHaveBeenCalledWith(7, "Bài số ba");
    expect(player.setVolume).toHaveBeenLastCalledWith(0);
    await act(async () => { events.onStateChange({ data: 0 }); events.onStateChange({ data: 0 }); });
    expect(onEnded).toHaveBeenCalledExactlyOnceWith(7, 2, true);
    expect(player.pauseVideo).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    host.remove(); visible.mockRestore(); measure.mockRestore(); vi.unstubAllGlobals();
  }
});
