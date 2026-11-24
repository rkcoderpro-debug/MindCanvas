// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { onlinePlaybackTime, youtubeRoomVideo, type RoomPlayback } from "./onlineRooms";
import { captureOnlineRoomInvite, forgetOnlineRoomInvite, onlineRoomUrl, readOnlineRoomLink, rememberOnlineRoomSignIn, restoreOnlineRoomSignIn } from "./onlineRoomRoutes";
import { learningUrl } from "./learningNavigation";

const id = "60000000-0000-4000-8000-000000000001";
afterEach(() => { sessionStorage.clear(); window.history.replaceState({}, "", "/"); });

it("restores a private invitation after signing in without leaving the secret in the player page URL", () => {
  const secret = "a".repeat(64);
  window.history.replaceState({}, "", onlineRoomUrl(id, secret));
  captureOnlineRoomInvite();
  expect(window.location.search).not.toContain(secret);
  expect(readOnlineRoomLink()).toEqual({ id, invite: secret });
  rememberOnlineRoomSignIn();
  window.history.replaceState({}, "", "/?code=oauth-return");
  restoreOnlineRoomSignIn();
  expect(window.location.search).toContain("code=oauth-return");
  expect(window.location.search).not.toContain(secret);
  expect(readOnlineRoomLink()).toEqual({ id, invite: secret });
  forgetOnlineRoomInvite(id);
  expect(readOnlineRoomLink()).toEqual({ id });
  expect(learningUrl("music")).not.toContain("room=");
});

it("uses the room clock for late arrivals and resumes from the held position after a pause", () => {
  const at = "2026-11-24T07:00:00.000Z";
  const playback: RoomPlayback = { at, video_id: "QhYS_p4m09A", title: "Study", attribution: null, playing: true, loop: false, offset: 12, revision: 4 };
  const later = Date.parse(at) + 20_000;
  expect(onlinePlaybackTime(playback, later)).toBe(32);
  expect(onlinePlaybackTime({ ...playback, playing: false }, later)).toBe(12);
  expect(onlinePlaybackTime({ ...playback, loop: true }, later + 90_000, 50)).toBe(22);
});

it("accepts video links and ignores playlist context rather than playing each device's own queue", () => {
  expect(youtubeRoomVideo("https://www.youtube.com/watch?v=QhYS_p4m09A&list=PL123")).toBe("QhYS_p4m09A");
  expect(youtubeRoomVideo("https://youtu.be/QhYS_p4m09A?si=test")).toBe("QhYS_p4m09A");
  expect(youtubeRoomVideo("https://www.youtube.com/playlist?list=PL123")).toBeNull();
  expect(youtubeRoomVideo("https://example.org/watch?v=QhYS_p4m09A")).toBeNull();
});
