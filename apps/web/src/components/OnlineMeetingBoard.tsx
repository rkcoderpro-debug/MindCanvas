import { useEffect, useRef, useState } from "react";
import { Armchair, Crown, Hand, Mic, MicOff, Monitor, Phone, PhoneOff, ScreenShare, ScreenShareOff, Video, VideoOff, Volume2 } from "lucide-react";
import { ConnectionState, Room, RoomEvent, Track, type AudioTrack, type Participant, type VideoTrack } from "livekit-client";
import { OnlineRoomError, roomIssue, type MeetingConnection, type OnlineRoom, type RoomAction, type RoomAttendee, type RoomLayout, type RoomReaction } from "../lib/onlineRooms";
import { ProfileAvatar } from "./ProfileAvatar";

type Props = {
  layout: RoomLayout; room: OnlineRoom; owner: string; members: RoomAttendee[]; avatars: Map<string, string>;
  presenter: string | null; vi: boolean; busy: boolean; token: () => Promise<MeetingConnection>;
  run: (action: RoomAction) => Promise<unknown>; serverNow: () => number;
};

const REACTIONS = { clap: ["👏", "Vỗ tay", "Applaud"], heart: ["❤️", "Thả tim", "Send a heart"], like: ["👍", "Đồng ý", "Thumbs up"] } as const;
const mediaEvents = [
  RoomEvent.ConnectionStateChanged, RoomEvent.ParticipantConnected, RoomEvent.ParticipantDisconnected, RoomEvent.TrackSubscribed,
  RoomEvent.TrackUnsubscribed, RoomEvent.TrackMuted, RoomEvent.TrackUnmuted, RoomEvent.LocalTrackPublished, RoomEvent.LocalTrackUnpublished,
  RoomEvent.ActiveSpeakersChanged, RoomEvent.AudioPlaybackStatusChanged, RoomEvent.ParticipantPermissionsChanged,
] as const;

// Eight seats per long side and two at each end; number them clockwise.
const seatPosition = (seat: number) => seat <= 8 ? [1, seat + 1] : seat <= 10 ? [seat - 7, 10]
  : seat <= 18 ? [4, 20 - seat] : [22 - seat, 1];

function mediaTrack(participant: Participant | undefined, source: Track.Source) {
  const publication = participant?.getTrackPublication(source);
  return publication && !publication.isMuted ? publication.track : undefined;
}
function MeetingVideo({ track, name }: { track: VideoTrack; name: string }) {
  const element = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (!element.current) return;
    const video = element.current;
    track.attach(video);
    return () => { track.detach(video); };
  }, [track]);
  return <video ref={element} aria-label={name} muted autoPlay playsInline/>;
}
function MeetingAudio({ track }: { track: AudioTrack }) {
  const element = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    if (!element.current) return;
    const audio = element.current;
    track.attach(audio);
    return () => { track.detach(audio); };
  }, [track]);
  return <audio ref={element} autoPlay/>;
}

export default function OnlineMeetingBoard({ layout, room, owner, members, avatars, presenter, vi, busy, token, run, serverNow }: Props) {
  const label = (vn: string, en: string) => vi ? vn : en;
  const [call, setCall] = useState<Room | null>(null);
  const current = useRef<Room | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [mediaBusy, setMediaBusy] = useState(false);
  const [error, setError] = useState("");
  const [, paint] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const reactionsExist = members.some(person => person.reaction_at && Date.parse(person.reaction_at) + 8000 > serverNow());
  useEffect(() => {
    if (!reactionsExist) return;
    const timer = window.setInterval(() => paint(n => n + 1), 500);
    return () => window.clearInterval(timer);
  }, [reactionsExist]);
  useEffect(() => () => {
    const instance = current.current;
    current.current = null;
    if (instance) {
      instance.removeAllListeners();
      void instance.disconnect(true).catch(() => undefined);
    }
  }, []);

  const endCall = (instance: Room) => {
    if (current.current !== instance) return;
    current.current = null;
    instance.removeAllListeners();
    void instance.disconnect(true).catch(() => undefined);
    setCall(null);
    setConnecting(false);
    setMediaBusy(false);
  };
  const connect = async () => {
    if (current.current) return;
    setConnecting(true); setError("");
    const instance = new Room({ adaptiveStream: true, dynacast: true });
    current.current = instance;
    const repaint = () => { if (current.current === instance) paint(n => n + 1); };
    for (const event of mediaEvents) instance.on(event, repaint);
    instance.on(RoomEvent.Disconnected, () => {
      if (current.current !== instance) return;
      endCall(instance);
      setError(label("Cuộc gọi đã ngắt. Bạn có thể kết nối lại.", "The call disconnected. You can reconnect."));
    });
    try {
      const auth = await token();
      if (current.current !== instance) return;
      await instance.connect(auth.url, auth.token, { websocketTimeout: 10000, peerConnectionTimeout: 10000 });
      if (current.current !== instance) {
        void instance.disconnect(true).catch(() => undefined);
        return;
      }
      setCall(instance);
      void instance.startAudio().catch(() => undefined);
    } catch (err) {
      if (current.current !== instance) return;
      endCall(instance);
      setError(err instanceof OnlineRoomError ? roomIssue(err, vi)
        : label("Không kết nối được cuộc gọi. Hãy thử lại hoặc tiếp tục bằng chat.", "Could not connect to the call. Try again or continue in chat."));
    } finally { if (current.current === instance) setConnecting(false); }
  };

  const local = call?.localParticipant;
  const connected = call?.state === ConnectionState.Connected;
  const canPresent = presenter === owner;
  const isSharing = Boolean(local?.isScreenShareEnabled);
  // The provider revokes previous presenter permissions. Stop capture locally as well.
  useEffect(() => {
    if (call && !canPresent && isSharing) void call.localParticipant.setScreenShareEnabled(false).catch(() => undefined);
  }, [call, canPresent, isSharing]);

  const toggle = async (device: "mic" | "camera" | "screen") => {
    if (!call || !connected || mediaBusy || (device === "screen" && !canPresent)) return;
    setMediaBusy(true); setError("");
    try {
      const person = call.localParticipant;
      if (device === "mic") await person.setMicrophoneEnabled(!person.isMicrophoneEnabled);
      else if (device === "camera") await person.setCameraEnabled(!person.isCameraEnabled);
      else await person.setScreenShareEnabled(!person.isScreenShareEnabled);
      if (current.current !== call) {
        // Capture permission can finish after the user has left the room.
        for (const track of call.localParticipant.trackPublications.values()) track.track?.stop();
      }
    } catch {
      if (current.current === call) setError(device === "screen"
        ? label("Không thể chia sẻ màn hình. Kiểm tra quyền trình chiếu hoặc thử lại trên máy tính.", "Could not share the screen. Check presenter permissions or try on a computer.")
        : label("Không bật được thiết bị. Kiểm tra quyền truy cập mic hoặc camera trong trình duyệt.", "Could not enable the device. Check browser microphone or camera permissions."));
    } finally { if (current.current === call) setMediaBusy(false); }
  };

  const peopleInStage = new Map<string, Participant>(call ? [[owner, call.localParticipant], ...call.remoteParticipants] : []);
  const presenterName = members.find(person => person.id === presenter)?.name;
  const screen = presenter && presenterName ? mediaTrack(peopleInStage.get(presenter), Track.Source.ScreenShare) as VideoTrack | undefined : undefined;
  const cameras = members.flatMap(person => {
    const track = mediaTrack(peopleInStage.get(person.id), Track.Source.Camera) as VideoTrack | undefined;
    return track ? [{ person, track }] : [];
  });
  const audio = members.filter(person => person.id !== owner).flatMap(person => {
    const participant = peopleInStage.get(person.id);
    return [Track.Source.Microphone, ...(person.id === presenter ? [Track.Source.ScreenShareAudio] : [])].flatMap(source => {
      const track = mediaTrack(participant, source) as AudioTrack | undefined;
      return track ? [{ key: `${person.id}:${source}`, track }] : [];
    });
  });
  const bySeat = new Map(members.map(person => [person.seat, person]));
  const supportsCapture = Boolean(navigator.mediaDevices?.getUserMedia);
  const supportsScreen = Boolean(navigator.mediaDevices?.getDisplayMedia);
  const handRaised = Boolean(members.find(person => person.id === owner)?.hand_raised_at);
  const deviceControls = [
    { id: "mic", on: Boolean(local?.isMicrophoneEnabled), OnIcon: Mic, OffIcon: MicOff, text: local?.isMicrophoneEnabled ? label("Tắt mic", "Mute mic") : label("Bật mic", "Turn on mic") },
    { id: "camera", on: Boolean(local?.isCameraEnabled), OnIcon: Video, OffIcon: VideoOff, text: local?.isCameraEnabled ? label("Tắt camera", "Turn off camera") : label("Bật camera", "Turn on camera") },
    { id: "screen", on: isSharing, OnIcon: ScreenShareOff, OffIcon: ScreenShare, text: isSharing ? label("Dừng chia sẻ", "Stop sharing") : label("Chia sẻ màn hình", "Share screen") },
  ] as const;

  return <section className="online-meeting" data-view={layout} aria-label={label("Không gian họp", "Meeting space")}>
    <div className="online-meeting-heading">
      <span className="online-room-live-tag"><Armchair size={15}/>{members.length}/{room.capacity} {label("chỗ ngồi", "seats")}</span>
      <span className="online-meeting-call-state" data-connected={connected} role="status">{connecting ? label("Đang kết nối cuộc gọi…", "Connecting call…") : connected ? label("Đã vào cuộc gọi", "In the call") : call ? label("Đang kết nối lại…", "Reconnecting…") : label("Chưa vào cuộc gọi", "Not in the call")}</span>
    </div>
    <div className="online-meeting-table" data-expanded={expanded}>
      <div className="online-meeting-display">
        <header className="online-meeting-display-heading"><Monitor size={16}/><strong>{screen ? `${presenterName ?? label("Thành viên", "Participant")} · ${label("Đang trình chiếu", "Presenting")}` : label("Màn hình chung", "Shared screen")}</strong>
          {screen && <button type="button" className="online-meeting-focus" aria-pressed={expanded} onClick={() => setExpanded(value => !value)}>{expanded ? label("Thu gọn", "Shrink") : label("Phóng to", "Expand")}</button>}
        </header>
        {screen ? <div className="online-meeting-screen"><MeetingVideo track={screen} name={label("Màn hình đang chia sẻ", "Shared screen")}/></div>
          : cameras.length ? <div className="online-meeting-cameras" data-single={cameras.length === 1}>
            {cameras.map(({ person, track }) => <figure key={person.id}><MeetingVideo track={track} name={person.name}/><figcaption>{person.name}</figcaption></figure>)}
          </div> : <div className="online-meeting-placeholder"><Monitor size={32}/><p>{label("Phần trình chiếu sẽ hiện ở đây", "Shared content will appear here")}</p><small>{label("Mic và camera tắt khi bạn kết nối.", "Your mic and camera are off when you connect.")}</small></div>}
      </div>
      {Array.from({ length: room.capacity }, (_, index) => {
        const seat = index + 1, person = bySeat.get(seat), participant = person && peopleInStage.get(person.id);
        const [row, col] = seatPosition(seat);
        const reaction = person?.reaction && person.reaction_at && Date.parse(person.reaction_at) + 8000 > serverNow() ? REACTIONS[person.reaction] : undefined;
        const title = `${label("Ghế", "Seat")} ${seat}${person ? `: ${person.name}` : ` · ${label("trống", "vacant")}`}`;
        const style = { gridRow: row, gridColumn: col };
        return person ? <div className="online-meeting-seat" key={seat} style={style} title={title} aria-label={title} data-self={person.id === owner} data-speaking={Boolean(participant?.isSpeaking)}>
          <ProfileAvatar name={person.name} url={avatars.get(person.id)} className="online-meeting-avatar"/>
          <span>{person.name}</span>{person.id === room.host_id && <Crown className="online-meeting-crown" size={12} aria-label={label("Chủ phòng", "Host")}/>}
          {person.hand_raised_at && <Hand className="online-meeting-hand" size={15} aria-label={label("Đang giơ tay", "Hand raised")}/>}
          {reaction && <span className="online-meeting-reaction" role="img" aria-label={vi ? reaction[1] : reaction[2]}>{reaction[0]}</span>}
        </div> : <button type="button" className="online-meeting-seat online-meeting-seat-empty" key={seat} style={style} disabled={busy} title={title} aria-label={title} onClick={() => void run({ name: "seat", seat })}><Armchair size={19}/><span>{seat}</span></button>;
      })}
    </div>
    {audio.map(({ key, track }) => <MeetingAudio key={key} track={track}/>)}
    <div className="online-meeting-controls" aria-label={label("Điều khiển cuộc gọi", "Call controls")} role="group">
      {!call ? <button type="button" className="primary-button" disabled={connecting} onClick={() => void connect()}><Phone size={16}/>{label("Kết nối cuộc gọi", "Connect to call")}</button>
        : <>
          {deviceControls.map(({ id, on, OnIcon, OffIcon, text }) => {
            const disabled = !connected || mediaBusy || (id === "screen" ? !canPresent || !supportsScreen : !supportsCapture);
            const Icon = on ? OnIcon : OffIcon;
            return <button type="button" key={id} className="secondary-button" disabled={disabled} aria-pressed={on} onClick={() => void toggle(id)}><Icon size={16}/>{text}</button>;
          })}
          <button className="secondary-button" type="button" onClick={() => endCall(call)}><PhoneOff size={16}/>{label("Rời cuộc gọi", "Leave call")}</button>
          {connected && !call.canPlaybackAudio && <button className="secondary-button" type="button" onClick={() => void call.startAudio().catch(() => setError(label("Trình duyệt chưa cho phép phát âm thanh.", "The browser has not allowed audio playback.")))}><Volume2 size={16}/>{label("Bật âm thanh", "Enable audio")}</button>}
        </>}
    </div>
    {call && !supportsCapture && <small className="online-room-muted">{label("Trình duyệt này không hỗ trợ bật mic hoặc camera; bạn vẫn có thể nghe và chat.", "This browser cannot enable a microphone or camera. You can still listen and chat.")}</small>}
    {call && canPresent && !supportsScreen && <small className="online-room-muted">{label("Thiết bị này không hỗ trợ chia sẻ màn hình. Hãy thử trên máy tính.", "Screen sharing is unavailable on this device. Try a desktop browser.")}</small>}
    {call && !canPresent && <small className="online-room-muted">{label("Chủ phòng có thể cấp quyền trình chiếu trong mục Mọi người.", "The host can grant presenting rights in People.")}</small>}
    {error && <p role="alert" className="online-room-feedback">{error}</p>}
    <div className="online-meeting-controls" role="group" aria-label={label("Tương tác trong phòng", "Room reactions")}>
      <button type="button" className="secondary-button" disabled={busy} aria-pressed={handRaised} onClick={() => void run({ name: "hand", raised: !handRaised })}><Hand size={16}/>{handRaised ? label("Hạ tay", "Lower hand") : label("Giơ tay", "Raise hand")}</button>
      {(Object.keys(REACTIONS) as RoomReaction[]).map(reaction => {
        const [emoji, vn, en] = REACTIONS[reaction];
        return <button type="button" key={reaction} className="secondary-button" disabled={busy} aria-label={label(vn, en)} title={label(vn, en)} onClick={() => void run({ name: "reaction", reaction })}>{emoji}</button>;
      })}
    </div>
  </section>;
}
