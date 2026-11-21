import { memo, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api";
import { cacheRoomKey, clearRoomKeyCache, createInvitationToken, createRoomKey, decryptRoomMetadata, decryptRoomText, encryptInvitationLabel, encryptRoomMetadataWithKey, encryptRoomText, unwrapRoomKey, wrapRoomKeyForUser } from "../crypto";
import type { Message, RoomDetails } from "../types";
import { getSocket } from "../socket";

function getRoomDisplayName(details: RoomDetails, encryptedName: string): string {
  if (details.type === "direct") {
    return details.direct_peer_name
      ?? details.members.find((member) => member.user_id !== details.my_user_id)?.username
      ?? encryptedName
      ?? "Direct chat";
  }
  return encryptedName || "Encrypted group";
}

async function decryptMessage(
  roomId: string,
  message: Message,
  roomType?: RoomDetails["type"],
): Promise<Message> {
  if (message.type === "system") return { ...message, display_content: message.content ?? "System notice" };
  if (!message.encrypted_content || !message.encrypted_iv || !message.encryption_version) {
    return { ...message, display_content: "Encrypted message unavailable" };
  }
  try {
    const text = await decryptRoomText(roomId, {
      iv: message.encrypted_iv,
      ciphertext: message.encrypted_content,
    }, message.encryption_version);
    return { ...message, display_content: text };
  } catch {
    const unavailable = roomType === "group"
      ? "This message uses an earlier group key that is not available on this account. New members can read messages sent after they joined."
      : "This message is encrypted with a key unavailable on this device.";
    return { ...message, display_content: unavailable };
  }
}

function canReuseMessageDecryption(previous: Message, next: Message): boolean {
  return previous.type === next.type
    && previous.encrypted_content === next.encrypted_content
    && previous.encrypted_iv === next.encrypted_iv
    && previous.encryption_version === next.encryption_version
    && previous.content === next.content
    && previous.edited_at === next.edited_at;
}

function sameMessageMetadata(previous: Message, next: Message): boolean {
  return previous.sender_id === next.sender_id
    && previous.sender_name === next.sender_name
    && previous.reply_to_id === next.reply_to_id
    && previous.created_at === next.created_at
    && previous.edited_at === next.edited_at;
}

const MessageBubble = memo(function MessageBubble({ message, isMine }: { message: Message; isMine: boolean }) {
  return (
    <div className={`bubble ${isMine ? "bubble-mine" : "bubble-theirs"}`}>
      <small className="muted">{isMine ? "You" : (message.sender_name ?? "Member")}</small>
      <p>{message.display_content ?? "Encrypted message"}</p>
    </div>
  );
});

type PublicKeyResponse = { public_key: JsonWebKey };
type UserLite = { id: string; username: string; status: "online" | "away" | "offline" };
type CallStatus = "idle" | "incoming" | "calling" | "connecting" | "connected";
type CallSignalPayload = {
  roomId: string;
  fromUserId: string;
  callId: string;
  kind: "offer" | "answer" | "ice" | "hangup" | "reject";
  data?: Record<string, unknown>;
};
type IncomingCall = { callId: string; fromUserId: string; sdp: RTCSessionDescriptionInit };

function getCallIceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ];
  // TURN credentials are client-visible by design. Use short-lived credentials
  // from your TURN provider; never put the provider's shared API secret here.
  const turnUrls = (import.meta.env.VITE_TURN_URL ?? "").split(",").map((value) => value.trim()).filter(Boolean);
  const username = import.meta.env.VITE_TURN_USERNAME;
  const credential = import.meta.env.VITE_TURN_CREDENTIAL;
  if (turnUrls.length && username && credential) servers.push({ urls: turnUrls, username, credential });
  return servers;
}

export default function ChatRoomPage() {
  const { roomId = "" } = useParams();
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [roomName, setRoomName] = useState("Encrypted room");
  const [keyVersion, setKeyVersion] = useState(1);
  const [room, setRoom] = useState<RoomDetails | null>(null);
  const [error, setError] = useState("");
  const [infoOpen, setInfoOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [memberSearch, setMemberSearch] = useState("");
  const [searchResults, setSearchResults] = useState<UserLite[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [searching, setSearching] = useState(false);
  const [savingMembers, setSavingMembers] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteMode, setInviteMode] = useState<"approval" | "instant">("approval");
  const [inviteUrl, setInviteUrl] = useState("");
  const [inviteId, setInviteId] = useState("");
  const [pendingRequests, setPendingRequests] = useState<Array<{ user_id: string; username: string; status: string }>>([]);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [callStatus, setCallStatus] = useState<CallStatus>("idle");
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [micMuted, setMicMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const socketRef = useRef<ReturnType<typeof getSocket> | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const callStatusRef = useRef<CallStatus>("idle");
  const activeCallIdRef = useRef<string | null>(null);
  const peerUserIdRef = useRef<string | null>(null);
  const pendingIceRef = useRef<RTCIceCandidateInit[]>([]);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<Message[]>([]);

  async function fetchLatestRoomWithCurrentKey() {
    const latest = await api<RoomDetails>(`/rooms/${roomId}`);
    clearRoomKeyCache(roomId, latest.current_key_version);
    for (const envelope of latest.key_envelopes) {
      await unwrapRoomKey(roomId, envelope.wrapped_key, envelope.key_version);
    }
    if (!latest.key_envelopes.some((envelope) => envelope.key_version === latest.current_key_version)) {
      throw new Error("Your current room encryption key is not available on this device. Ask an owner or admin to refresh your membership.");
    }
    return latest;
  }

  async function loadRoom() {
    try {
      const details = await api<RoomDetails>(`/rooms/${roomId}`);
      // Rebuild this room's local key cache from this account's persisted envelopes.
      clearRoomKeyCache(roomId);
      for (const envelope of details.key_envelopes) {
        await unwrapRoomKey(roomId, envelope.wrapped_key, envelope.key_version);
      }
      const currentEnvelope = details.key_envelopes.find((item) => item.key_version === details.current_key_version);
      if (!currentEnvelope) throw new Error("Your device does not have the current room encryption key.");
      const encryptedName = details.type === "direct"
        ? ""
        : (await decryptRoomMetadata(roomId, details.encrypted_metadata, details.current_key_version)).name;
      const encryptedMessages = await api<Message[]>(`/rooms/${roomId}/messages`);
      const readable = await Promise.all(encryptedMessages.map((message) => decryptMessage(roomId, message, details.type)));
      setRoom(details);
      setRoomName(getRoomDisplayName(details, encryptedName));
      setKeyVersion(details.current_key_version);
      messagesRef.current = readable;
      setMessages(readable);
      setError("");
    } catch (err) { setError((err as Error).message); }
  }

  useEffect(() => {
    messagesRef.current = [];
    setMessages([]);
    let active = true;
    let poll = 0;
    let refreshInFlight = false;
    const refreshRoomAndMessages = async () => {
      if (refreshInFlight) return;
      refreshInFlight = true;
      try {
        // Membership changes rotate the group's key. Refresh this member's
        // key envelope before decrypting messages encrypted with the new key.
        const details = await api<RoomDetails>(`/rooms/${roomId}`);
        for (const envelope of details.key_envelopes) {
          await unwrapRoomKey(roomId, envelope.wrapped_key, envelope.key_version);
        }
        const currentEnvelope = details.key_envelopes.find(
          (item) => item.key_version === details.current_key_version,
        );
        if (!currentEnvelope) {
          throw new Error("Your device does not have the current room encryption key. Reload the room.");
        }
        const encryptedName = details.type === "direct"
          ? ""
          : (await decryptRoomMetadata(
              roomId,
              details.encrypted_metadata,
              details.current_key_version,
            )).name;
        if (!active) return;
        setRoom((previous) => {
          // Avoid restarting the add-member username search every poll when
          // the member list and encryption version have not actually changed.
          const unchanged = previous
            && previous.current_key_version === details.current_key_version
            && previous.my_role === details.my_role
            && JSON.stringify(previous.members) === JSON.stringify(details.members)
            && JSON.stringify(previous.key_envelopes) === JSON.stringify(details.key_envelopes);
          return unchanged ? previous : details;
        });
        setRoomName(getRoomDisplayName(details, encryptedName));
        setKeyVersion(details.current_key_version);

        const latest = await api<Message[]>(`/rooms/${roomId}/messages?limit=30`);
        const cachedById = new Map(messagesRef.current.map((message) => [message.id, message]));
        const readable = await Promise.all(latest.map(async (message) => {
          const cached = cachedById.get(message.id);
          if (cached && canReuseMessageDecryption(cached, message)) {
            return sameMessageMetadata(cached, message)
              ? cached
              : { ...cached, ...message, display_content: cached.display_content };
          }
          return decryptMessage(roomId, message, details.type);
        }));
        if (!active) return;
        const byId = new Map(messagesRef.current.map((message) => [message.id, message]));
        for (const message of readable) byId.set(message.id, message);
        const nextMessages = [...byId.values()].sort((a, b) => a.created_at.localeCompare(b.created_at));
        const unchanged = nextMessages.length === messagesRef.current.length
          && nextMessages.every((message, index) => message === messagesRef.current[index]);
        if (!unchanged) {
          messagesRef.current = nextMessages;
          setMessages(nextMessages);
        }
        setError("");
      } catch {
        // Keep the last successfully loaded room during brief network drops.
      } finally {
        refreshInFlight = false;
      }
    };
    void (async () => {
      await loadRoom();
      if (!active) return;
      // Refresh membership and encryption envelopes along with the messages.
      const connection = (navigator as Navigator & {
        connection?: { saveData?: boolean; effectiveType?: string };
      }).connection;
      const isConstrainedNetwork = Boolean(
        connection?.saveData || ["slow-2g", "2g"].includes(connection?.effectiveType ?? ""),
      );
      const refreshInterval = isConstrainedNetwork
        ? 20000
        : window.matchMedia("(max-width: 640px)").matches ? 12000 : 8000;
      poll = window.setInterval(() => {
        if (document.visibilityState === "visible") void refreshRoomAndMessages();
      }, refreshInterval);
    })();

    const refreshWhenAvailable = () => {
      if (document.visibilityState === "visible" && navigator.onLine) {
        void refreshRoomAndMessages();
      }
    };
    document.addEventListener("visibilitychange", refreshWhenAvailable);
    window.addEventListener("online", refreshWhenAvailable);
    return () => {
      active = false;
      if (poll) window.clearInterval(poll);
      document.removeEventListener("visibilitychange", refreshWhenAvailable);
      window.removeEventListener("online", refreshWhenAvailable);
    };
  }, [roomId]);

  const lastMessageId = messages[messages.length - 1]?.id;
  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    bottom.current?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "end" });
  }, [lastMessageId]);

  useEffect(() => {
    const query = memberSearch.trim();
    if (!addOpen || query.length < 2) { setSearchResults([]); setSearching(false); return; }
    let active = true;
    setSearching(true);
    const timer = window.setTimeout(() => {
      void api<UserLite[]>(`/users?q=${encodeURIComponent(query)}`)
        .then((users) => {
          if (active) {
            const current = new Set(room?.members.map((member) => member.user_id) ?? []);
            setSearchResults(users.filter((user) => !current.has(user.id)));
          }
        })
        .catch((err) => { if (active) setError((err as Error).message); })
        .finally(() => { if (active) setSearching(false); });
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [memberSearch, addOpen, room]);

  async function loadOlder() {
    if (!messages.length) return;
    try {
      const older = await api<Message[]>(`/rooms/${roomId}/messages?before=${messages[0].id}`);
      const readable = await Promise.all(older.map((message) => decryptMessage(roomId, message, room?.type)));
      const next = [...readable, ...messagesRef.current];
      messagesRef.current = next;
      setMessages(next);
    } catch (err) { setError((err as Error).message); }
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const clear = text.trim();
    if (!clear) return;
    try {
      let saved: Message | null = null;
      // Retry once the server reports a key-version conflict. This can happen
      // when an owner adds/removes a member between our key refresh and POST.
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const latestRoom = await fetchLatestRoomWithCurrentKey();
        const encryptedName = latestRoom.type === "direct"
          ? ""
          : (await decryptRoomMetadata(
              roomId,
              latestRoom.encrypted_metadata,
              latestRoom.current_key_version,
            )).name;
        setRoom(latestRoom);
        setRoomName(getRoomDisplayName(latestRoom, encryptedName));
        setKeyVersion(latestRoom.current_key_version);

        const activeKeyVersion = latestRoom.current_key_version;
        const encrypted = await encryptRoomText(roomId, clear, activeKeyVersion);
        try {
          saved = await api<Message>(`/rooms/${roomId}/messages`, {
            method: "POST",
            body: JSON.stringify({
              roomId,
              encryptedContent: encrypted.ciphertext,
              encryptedIv: encrypted.iv,
              keyVersion: activeKeyVersion,
            }),
          });
          break;
        } catch (err) {
          const keyChanged = (err as Error).message.toLowerCase().includes("room encryption key changed");
          if (!keyChanged) throw err;
          if (attempt === 2) {
            throw new Error("The group encryption key is changing repeatedly. Wait a moment, then tap Send again.");
          }
        }
      }
      if (!saved) throw new Error("Your message could not be sent. Please try again.");
      const readable = await decryptMessage(roomId, saved, room?.type);
      const next = [...messagesRef.current.filter((message) => message.id !== readable.id), readable]
        .sort((a, b) => a.created_at.localeCompare(b.created_at));
      messagesRef.current = next;
      setMessages(next);
      setText("");
      setError("");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function addSelectedMembers() {
    if (!room || !selectedIds.length || savingMembers) return;
    setSavingMembers(true);
    setError("");
    try {
      // Refresh members and the current key before creating the rotation. The
      // owner/admin view may be behind another admin's recent membership change.
      const latestRoom = await fetchLatestRoomWithCurrentKey();
      const latestName = (await decryptRoomMetadata(
        roomId,
        latestRoom.encrypted_metadata,
        latestRoom.current_key_version,
      )).name;
      setRoom(latestRoom);
      setRoomName(latestName);

      // A fresh key is wrapped to every current and newly selected member.
      const resultingIds = [...new Set([...latestRoom.members.map((member) => member.user_id), ...selectedIds])];
      const publicKeys = await Promise.all(resultingIds.map(async (userId) => ({
        userId,
        publicKey: (await api<PublicKeyResponse>(`/users/${userId}/crypto-key`)).public_key,
      })));
      const { raw, key } = await createRoomKey();
      const encryptedMetadata = await encryptRoomMetadataWithKey(key, { name: latestName });
      const keyEnvelopes = await Promise.all(publicKeys.map(async (entry) => ({
        userId: entry.userId,
        wrappedKey: await wrapRoomKeyForUser(raw, entry.publicKey),
      })));
      raw.fill(0);
      const nextVersion = latestRoom.current_key_version + 1;
      const result = await api<{ addedIds: string[] }>(`/rooms/${roomId}/members`, {
        method: "POST",
        body: JSON.stringify({ userIds: selectedIds, encryptedMetadata, keyEnvelopes }),
      });
      if (!result.addedIds?.length) {
        throw new Error("No new members were added. They may already be in this group; refresh the group and try again.");
      }
      cacheRoomKey(roomId, nextVersion, key);
      setKeyVersion(nextVersion);
      setAddOpen(false);
      setInfoOpen(true);
      setSelectedIds([]);
      setMemberSearch("");
      await loadRoom();
    } catch (err) { setError((err as Error).message); }
    finally { setSavingMembers(false); }
  }

  const canManageMembers = room?.type === "group" && (room.my_role === "owner" || room.my_role === "admin");

  async function createInvitation() {
    if (!room || !canManageMembers || inviteBusy) return;
    setInviteBusy(true); setError("");
    try {
      const token = createInvitationToken();
      const encryptedLabel = await encryptInvitationLabel(token, roomName);
      const result = await api<{ token: string; invitationId: string }>("/invitations/rooms/" + roomId + "/invitations", {
        method: "POST", body: JSON.stringify({ mode: inviteMode, token, displayName: encryptedLabel }),
      });
      setInviteUrl(window.location.origin + "/invite/" + result.token);
      setInviteId(result.invitationId);
    } catch (err) { setError((err as Error).message); }
    finally { setInviteBusy(false); }
  }

  async function revokeInvitation() {
    if (!inviteId || inviteBusy) return;
    setInviteBusy(true);
    try { await api("/invitations/rooms/" + roomId + "/invitations/" + inviteId, { method: "DELETE" }); setInviteUrl(""); setInviteId(""); }
    catch (err) { setError((err as Error).message); }
    finally { setInviteBusy(false); }
  }

  async function loadJoinRequests() {
    if (!canManageMembers) return;
    try { setPendingRequests(await api("/invitations/rooms/" + roomId + "/requests")); }
    catch (err) { setError((err as Error).message); }
  }

  async function approveJoinRequest(userId: string) {
    if (!room || !canManageMembers || inviteBusy) return;
    setInviteBusy(true); setError("");
    try {
      // Base approval on the newest room revision so the joining member and
      // every currently active member receive envelopes for the same key.
      const latestRoom = await fetchLatestRoomWithCurrentKey();
      const latestName = (await decryptRoomMetadata(
        roomId,
        latestRoom.encrypted_metadata,
        latestRoom.current_key_version,
      )).name;
      setRoom(latestRoom);
      setRoomName(latestName);
      const recipientIds = [...new Set([...latestRoom.members.map((member) => member.user_id), userId])];
      const publicKeys = await Promise.all(recipientIds.map(async (id) => ({
        userId: id, publicKey: (await api<PublicKeyResponse>("/users/" + id + "/crypto-key")).public_key,
      })));
      const { raw, key } = await createRoomKey();
      try {
        const encryptedMetadata = await encryptRoomMetadataWithKey(key, { name: latestName });
        const keyEnvelopes = await Promise.all(publicKeys.map(async (entry) => ({ userId: entry.userId, wrappedKey: await wrapRoomKeyForUser(raw, entry.publicKey) })));
        const nextVersion = latestRoom.current_key_version + 1;
        await api("/invitations/rooms/" + roomId + "/requests/" + userId + "/approve", {
          method: "POST", body: JSON.stringify({ encryptedMetadata, keyEnvelopes }),
        });
        cacheRoomKey(roomId, nextVersion, key);
        setKeyVersion(nextVersion);
        await loadRoom();
        await loadJoinRequests();
      } finally { raw.fill(0); }
    } catch (err) { setError((err as Error).message); }
    finally { setInviteBusy(false); }
  }

  useEffect(() => { if (infoOpen && canManageMembers) void loadJoinRequests(); }, [infoOpen, canManageMembers, roomId]);


  const directPeer = room?.type === "direct"
    ? room.members.find((member) => member.user_id !== room.my_user_id)
    : undefined;
  const peerUserId = directPeer?.user_id ?? null;
  const peerName = directPeer?.username ?? room?.direct_peer_name ?? "Contact";

  function updateCallStatus(status: CallStatus) {
    callStatusRef.current = status;
    setCallStatus(status);
  }

  function waitForSocket(socket: ReturnType<typeof getSocket>): Promise<void> {
    if (socket.connected) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        window.clearTimeout(timeout);
        socket.off("connect", onConnect);
        socket.off("connect_error", onError);
      };
      const timeout = window.setTimeout(() => {
        cleanup();
        reject(new Error("The secure calling connection did not respond. Please try again."));
      }, 12_000);
      const onConnect = () => { cleanup(); resolve(); };
      const onError = () => {
        cleanup();
        reject(new Error("Could not connect to the secure calling service. Refresh the chat and try again."));
      };
      socket.once("connect", onConnect);
      socket.once("connect_error", onError);
      socket.connect();
    });
  }

  function sendCallSignal(
    kind: CallSignalPayload["kind"],
    callId: string,
    targetUserId: string,
    data?: Record<string, unknown>,
  ) {
    const socket = socketRef.current;
    if (!socket?.connected) return false;
    socket.emit("call:signal", { roomId, targetUserId, callId, kind, data });
    return true;
  }

  function cleanupCall(signalKind?: "hangup" | "reject") {
    const callId = activeCallIdRef.current;
    const targetUserId = peerUserIdRef.current;
    if (signalKind && callId && targetUserId) sendCallSignal(signalKind, callId, targetUserId);

    const connection = peerConnectionRef.current;
    if (connection) {
      connection.onicecandidate = null;
      connection.ontrack = null;
      connection.onconnectionstatechange = null;
      connection.close();
    }
    peerConnectionRef.current = null;
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    remoteStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    remoteStreamRef.current = null;
    activeCallIdRef.current = null;
    peerUserIdRef.current = null;
    pendingIceRef.current = [];
    setLocalStream(null);
    setRemoteStream(null);
    setIncomingCall(null);
    setMicMuted(false);
    setCameraOff(false);
    updateCallStatus("idle");
  }

  async function requestLocalMedia(): Promise<MediaStream> {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Video calling needs a secure browser connection and camera/microphone support.");
    }
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
    });
    localStreamRef.current = stream;
    setLocalStream(stream);
    setMicMuted(false);
    setCameraOff(false);
    return stream;
  }

  function createPeerConnection(callId: string, targetUserId: string) {
    const connection = new RTCPeerConnection({ iceServers: getCallIceServers() });
    peerConnectionRef.current = connection;
    connection.onicecandidate = (event) => {
      if (event.candidate) sendCallSignal("ice", callId, targetUserId, { candidate: event.candidate.toJSON() });
    };
    connection.ontrack = (event) => {
      const stream = event.streams[0] ?? new MediaStream([event.track]);
      remoteStreamRef.current = stream;
      setRemoteStream(stream);
    };
    connection.onconnectionstatechange = () => {
      if (connection.connectionState === "connected") {
        updateCallStatus("connected");
      } else if (connection.connectionState === "failed") {
        setError("The video connection could not be established. This network may require a TURN relay.");
        cleanupCall("hangup");
      }
    };
    return connection;
  }

  async function flushPendingIce(connection: RTCPeerConnection) {
    if (!connection.remoteDescription) return;
    const pending = pendingIceRef.current.splice(0);
    for (const candidate of pending) await connection.addIceCandidate(new RTCIceCandidate(candidate));
  }

  function handleCallSignal(payload: CallSignalPayload) {
    if (payload.roomId !== roomId || !peerUserId || payload.fromUserId !== peerUserId) return;
    if (payload.kind === "offer") {
      const sdp = payload.data?.sdp as RTCSessionDescriptionInit | undefined;
      if (!sdp || typeof sdp !== "object") return;
      if (callStatusRef.current !== "idle") {
        socketRef.current?.emit("call:signal", {
          roomId, targetUserId: payload.fromUserId, callId: payload.callId,
          kind: "reject", data: { reason: "busy" },
        });
        return;
      }
      activeCallIdRef.current = payload.callId;
      peerUserIdRef.current = payload.fromUserId;
      pendingIceRef.current = [];
      setIncomingCall({ callId: payload.callId, fromUserId: payload.fromUserId, sdp });
      updateCallStatus("incoming");
      return;
    }

    if (payload.callId !== activeCallIdRef.current) return;
    if (payload.kind === "answer") {
      const sdp = payload.data?.sdp as RTCSessionDescriptionInit | undefined;
      const connection = peerConnectionRef.current;
      if (!sdp || !connection) return;
      void (async () => {
        try {
          await connection.setRemoteDescription(new RTCSessionDescription(sdp));
          await flushPendingIce(connection);
          updateCallStatus("connecting");
        } catch {
          setError("The video call answer could not be applied. Please try again.");
          cleanupCall();
        }
      })();
    } else if (payload.kind === "ice") {
      const candidate = payload.data?.candidate as RTCIceCandidateInit | undefined;
      if (!candidate || typeof candidate !== "object") return;
      const connection = peerConnectionRef.current;
      if (connection?.remoteDescription) {
        void connection.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => undefined);
      } else {
        pendingIceRef.current.push(candidate);
      }
    } else if (payload.kind === "reject") {
      setError("The other person declined the video call.");
      cleanupCall();
    } else if (payload.kind === "hangup") {
      cleanupCall();
    }
  }

  async function startVideoCall() {
    if (!peerUserId || callStatusRef.current !== "idle") return;
    setError("");
    peerUserIdRef.current = peerUserId;
    try {
      const socket = getSocket();
      socketRef.current = socket;
      await waitForSocket(socket);
      const callId = crypto.randomUUID();
      activeCallIdRef.current = callId;
      pendingIceRef.current = [];
      updateCallStatus("calling");
      const stream = await requestLocalMedia();
      const connection = createPeerConnection(callId, peerUserId);
      stream.getTracks().forEach((track) => connection.addTrack(track, stream));
      const offer = await connection.createOffer();
      await connection.setLocalDescription(offer);
      if (!sendCallSignal("offer", callId, peerUserId, { sdp: connection.localDescription?.toJSON() })) {
        throw new Error("The calling connection was interrupted before the call could start.");
      }
    } catch (err) {
      setError((err as Error).message || "Could not start the video call. Check your camera and microphone permissions.");
      cleanupCall();
    }
  }

  async function acceptIncomingCall() {
    const pending = incomingCall;
    const targetUserId = pending?.fromUserId;
    if (!pending || !targetUserId || callStatusRef.current !== "incoming") return;
    try {
      const socket = socketRef.current ?? getSocket();
      socketRef.current = socket;
      await waitForSocket(socket);
      const stream = await requestLocalMedia();
      const connection = createPeerConnection(pending.callId, targetUserId);
      await connection.setRemoteDescription(new RTCSessionDescription(pending.sdp));
      await flushPendingIce(connection);
      stream.getTracks().forEach((track) => connection.addTrack(track, stream));
      const answer = await connection.createAnswer();
      await connection.setLocalDescription(answer);
      setIncomingCall(null);
      updateCallStatus("connecting");
      if (!sendCallSignal("answer", pending.callId, targetUserId, { sdp: connection.localDescription?.toJSON() })) {
        throw new Error("The calling connection was interrupted before the call could be answered.");
      }
    } catch (err) {
      setError((err as Error).message || "Could not answer the video call.");
      cleanupCall("reject");
    }
  }

  function toggleMicrophone() {
    const nextMuted = !micMuted;
    localStreamRef.current?.getAudioTracks().forEach((track) => { track.enabled = !nextMuted; });
    setMicMuted(nextMuted);
  }

  function toggleCamera() {
    const nextOff = !cameraOff;
    localStreamRef.current?.getVideoTracks().forEach((track) => { track.enabled = !nextOff; });
    setCameraOff(nextOff);
  }

  useEffect(() => {
    if (localVideoRef.current) localVideoRef.current.srcObject = localStream;
  }, [localStream, callStatus]);

  useEffect(() => {
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream;
  }, [remoteStream, callStatus]);

  useEffect(() => {
    if (room?.type !== "direct" || !peerUserId) return;
    let socket: ReturnType<typeof getSocket>;
    try {
      socket = getSocket();
      socketRef.current = socket;
      socket.on("call:signal", handleCallSignal);
      socket.connect();
    } catch (err) {
      setError((err as Error).message || "The realtime calling service is unavailable.");
      return;
    }
    return () => {
      socket.off("call:signal", handleCallSignal);
      const callId = activeCallIdRef.current;
      const targetUserId = peerUserIdRef.current;
      if (callId && targetUserId && socket.connected) {
        socket.emit("call:signal", { roomId, targetUserId, callId, kind: "hangup" });
      }
      peerConnectionRef.current?.close();
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      remoteStreamRef.current?.getTracks().forEach((track) => track.stop());
      peerConnectionRef.current = null;
      localStreamRef.current = null;
      remoteStreamRef.current = null;
      activeCallIdRef.current = null;
      peerUserIdRef.current = null;
      pendingIceRef.current = [];
      if (socketRef.current === socket) socketRef.current = null;
    };
  }, [roomId, room?.type, peerUserId]);

  
  return (
    <main className="screen chat">
      <header className="bar chat-room-bar">
        <Link to="/">←</Link>
        <div className="chat-room-heading">
          <strong>{roomName}</strong>
          <small className="muted"> · end-to-end encrypted</small>
        </div>
        {room?.type === "direct" && peerUserId && (
          <button type="button" className="video-call-button" onClick={() => void startVideoCall()} disabled={callStatus !== "idle"} aria-label={`Start video call with ${peerName}`}>
            <span aria-hidden="true">▣</span><span className="video-call-label">Video call</span>
          </button>
        )}
        {room?.type === "group" && <button type="button" className="group-info-trigger" onClick={() => setInfoOpen(true)}>Group info</button>}
      </header>
      {error && <p className="error" role="alert">{error}</p>}
      <section className="messages">
        <button className="link" onClick={loadOlder}>Load older messages</button>
        {messages.map((message) => (
          <MessageBubble
            key={message.id}
            message={message}
            isMine={Boolean(room?.my_user_id && message.sender_id === room.my_user_id)}
          />
        ))}
        <div ref={bottom} />
      </section>
      <form className="composer" onSubmit={send}>
        <input value={text} placeholder="Type a message" aria-label="Write an encrypted message" maxLength={8000} onChange={(e) => setText(e.target.value)} />
        <button type="submit" disabled={!text.trim()}>Send</button>
      </form>

      {callStatus !== "idle" && (
        <div className="video-call-overlay" role="dialog" aria-modal="true" aria-label="Video call">
          <section className="video-call-panel">
            <header className="video-call-heading">
              <div><p className="eyebrow">ALTA CHAT · PRIVATE CALL</p><h2>{peerName}</h2></div>
              <span className={`video-call-state ${callStatus}`} aria-live="polite">
                {callStatus === "incoming" ? "Incoming call" : callStatus === "calling" ? "Calling…" : callStatus === "connected" ? "Connected" : "Connecting…"}
              </span>
            </header>
            <div className="video-call-stage">
              <video ref={remoteVideoRef} className="video-call-remote" autoPlay playsInline />
              {!remoteStream && (
                <div className="video-call-placeholder">
                  <span>{peerName.slice(0, 2).toUpperCase()}</span>
                  <strong>{callStatus === "incoming" ? "Incoming video call" : callStatus === "calling" ? "Waiting for answer" : "Connecting video"}</strong>
                  <small>{callStatus === "incoming" ? "Accept to turn on your camera and microphone" : "Your video will appear here when the other person joins"}</small>
                </div>
              )}
              {localStream && <video ref={localVideoRef} className="video-call-local" autoPlay muted playsInline />}
            </div>
            <footer className="video-call-controls">
              {callStatus === "incoming" ? (
                <>
                  <button type="button" className="video-call-accept" onClick={() => void acceptIncomingCall()}>Accept video</button>
                  <button type="button" className="video-call-end" onClick={() => cleanupCall("reject")}>Decline</button>
                </>
              ) : (
                <>
                  <button type="button" className="video-call-control" onClick={toggleMicrophone} disabled={!localStream}>{micMuted ? "Unmute" : "Mute"}</button>
                  <button type="button" className="video-call-control" onClick={toggleCamera} disabled={!localStream}>{cameraOff ? "Turn camera on" : "Camera off"}</button>
                  <button type="button" className="video-call-end" onClick={() => cleanupCall("hangup")}>End call</button>
                </>
              )}
            </footer>
            <p className="video-call-footnote">Calls use a direct browser connection. Video and audio are not saved to Alta Chat.</p>
          </section>
        </div>
      )}

      {infoOpen && room?.type === "group" && (
        <div className="group-info-overlay" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setInfoOpen(false); }}>
          <section className="group-info-card" role="dialog" aria-modal="true" aria-labelledby="group-info-title">
            <div className="group-info-heading">
              <div><p className="eyebrow">GROUP DETAILS</p><h2 id="group-info-title">{roomName}</h2><p className="muted">{room.members.length} members · encrypted group</p></div>
              <button type="button" className="close-button" aria-label="Close group info" onClick={() => setInfoOpen(false)}>×</button>
            </div>
            {canManageMembers && <div className="group-admin-actions"><button type="button" className="full-button" onClick={() => { setInfoOpen(false); setAddOpen(true); }}>＋ Add members</button><button type="button" className="full-button" onClick={() => { setInviteOpen(true); setInviteUrl(""); }}>Invite with link</button></div>}

            {canManageMembers && pendingRequests.length > 0 && <section className="group-join-requests"><h3 className="group-members-title">Join requests ({pendingRequests.length})</h3>{pendingRequests.map((request) => <div className="group-member-row" key={request.user_id}><span className="avatar">{request.username.slice(0, 2).toUpperCase()}</span><span className="group-member-copy"><strong>{request.username}</strong><small>{request.status}</small></span><button type="button" className="text-action" disabled={inviteBusy} onClick={() => void approveJoinRequest(request.user_id)}>Approve</button></div>)}</section>}
            <h3 className="group-members-title">Members</h3>
            <div className="group-members-list">
              {room.members.map((member) => (
                <div className="group-member-row" key={member.user_id}>
                  <span className="avatar">{member.username.slice(0, 2).toUpperCase()}</span>
                  <span className="group-member-copy"><strong>{member.username}</strong><small>{member.status}</small></span>
                  <span className="member-role">{member.role}</span>
                </div>
              ))}
            </div>
            <p className="security-note">New members receive the current encryption key only. They cannot read messages sent before they joined.</p>
          </section>
        </div>
      )}


      {inviteOpen && (
        <div className="group-info-overlay" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget && !inviteBusy) setInviteOpen(false); }}>
          <section className="group-info-card" role="dialog" aria-modal="true" aria-labelledby="invite-group-title">
            <div className="group-info-heading"><div><p className="eyebrow">GROUP INVITATION</p><h2 id="invite-group-title">Invite people to {roomName}</h2><p className="muted">Links expire after 7 days.</p></div><button type="button" className="close-button" onClick={() => setInviteOpen(false)}>×</button></div>
            <label className="field-label">Who can join?</label>
            <select className="modal-input" value={inviteMode} onChange={(e) => { setInviteMode(e.target.value as "approval" | "instant"); setInviteUrl(""); }}>
              <option value="approval">Approval required — owner/admin approves</option>
              <option value="instant">Instant joining — valid link holders can join</option>
            </select>
            <button type="button" className="full-button" disabled={inviteBusy} onClick={() => void createInvitation()}>{inviteBusy ? "Creating secure link…" : "Generate invitation link"}</button>
            {inviteUrl && <div className="invite-link-box"><input className="modal-input" readOnly value={inviteUrl} aria-label="Invitation link" /><button type="button" className="full-button" onClick={() => void navigator.clipboard.writeText(inviteUrl)}>Copy invitation link</button><button type="button" className="text-action" disabled={inviteBusy} onClick={() => void revokeInvitation()}>Revoke this link</button></div>}
            <p className="security-note">The link contains no encryption key. A fresh group key is generated and wrapped for every current member and the joining member. New members cannot decrypt earlier messages.</p>
          </section>
        </div>
      )}

      {addOpen && (
        <div className="group-info-overlay" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget && !savingMembers) setAddOpen(false); }}>
          <section className="group-info-card" role="dialog" aria-modal="true" aria-labelledby="add-members-title">
            <div className="group-info-heading">
              <div><p className="eyebrow">GROUP MEMBERS</p><h2 id="add-members-title">Add people</h2><p className="muted">Search existing Alta Chat usernames</p></div>
              <button type="button" className="close-button" aria-label="Close add members" onClick={() => setAddOpen(false)}>×</button>
            </div>
            <input className="modal-input" value={memberSearch} onChange={(e) => setMemberSearch(e.target.value)} placeholder="Type at least 2 characters" autoFocus />
            <div className="group-search-results">
              {searching && <p className="muted">Searching…</p>}
              {!searching && memberSearch.trim().length >= 2 && searchResults.length === 0 && <p className="muted">No new people found.</p>}
              {searchResults.map((user) => (
                <label className="member-choice" key={user.id}>
                  <span className="avatar">{user.username.slice(0, 2).toUpperCase()}</span>
                  <span className="group-member-copy"><strong>{user.username}</strong><small>{user.status}</small></span>
                  <input type="checkbox" checked={selectedIds.includes(user.id)} onChange={() => setSelectedIds((ids) => ids.includes(user.id) ? ids.filter((id) => id !== user.id) : [...ids, user.id].slice(0, 50))} />
                </label>
              ))}
              {selectedIds.length > 0 && <p className="muted">{selectedIds.length} selected</p>}
            </div>
            <button type="button" className="full-button" disabled={!selectedIds.length || savingMembers} onClick={() => void addSelectedMembers()}>{savingMembers ? "Updating encryption…" : `Add ${selectedIds.length || ""} member${selectedIds.length === 1 ? "" : "s"}`}</button>
            <p className="security-note">The group key is rotated and securely shared with all current members and the people you add.</p>
          </section>
        </div>
      )}
    </main>
  );
}
