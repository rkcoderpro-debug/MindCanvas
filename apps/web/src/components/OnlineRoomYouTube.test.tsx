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
