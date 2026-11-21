import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { cacheRoomKey, clearRoomKeyCache, createRoomKey, decryptRoomMetadata, encryptRoomMetadataWithKey, getCurrentUserId, unwrapRoomKey, wrapRoomKeyForUser } from "../crypto";
import type { Room } from "../types";
import NotificationBell from "../components/NotificationBell";

type PublicKeyResponse = { public_key: JsonWebKey };
type UserLite = { id: string; username: string; status: "online" | "away" | "offline" };

export default function RoomsPage() {
  const navigate = useNavigate();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [filter, setFilter] = useState<"all" | "direct" | "group">("all");
  const [error, setError] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [search, setSearch] = useState("");
  const [users, setUsers] = useState<UserLite[]>([]);
  const [searching, setSearching] = useState(false);
  const [groupOpen, setGroupOpen] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const loadInFlight = useRef(false);
  const roomsRef = useRef<Room[]>([]);

  const load = async () => {
    if (loadInFlight.current) return;
    loadInFlight.current = true;
    try {
      const records = await api<Room[]>("/rooms");
      const previousById = new Map(roomsRef.current.map((room) => [room.id, room]));
      const unlocked = await Promise.all(records.map(async (room) => {
        const previous = previousById.get(room.id);
        try {
          for (const envelope of room.key_envelopes) await unwrapRoomKey(room.id, envelope.wrapped_key, envelope.key_version);
          if (room.type === "direct" && room.direct_peer_name) {
            return previous?.name === room.direct_peer_name ? { ...room, name: previous.name } : { ...room, name: room.direct_peer_name };
          }
          const metadataUnchanged = previous
            && previous.current_key_version === room.current_key_version
            && previous.encrypted_metadata.iv === room.encrypted_metadata.iv
            && previous.encrypted_metadata.ciphertext === room.encrypted_metadata.ciphertext;
          if (metadataUnchanged && previous.name) return { ...room, name: previous.name };
          const meta = await decryptRoomMetadata(room.id, room.encrypted_metadata, room.current_key_version);
          return { ...room, name: meta.name };
        } catch {
          return { ...room, name: previous?.name ?? "Locked encrypted room" };
        }
      }));
      const changed = unlocked.length !== roomsRef.current.length || unlocked.some((room, index) => {
        const previous = roomsRef.current[index];
        if (!previous) return true;
        const sameEnvelopes = previous.key_envelopes.length === room.key_envelopes.length
          && previous.key_envelopes.every((envelope, i) =>
            envelope.key_version === room.key_envelopes[i]?.key_version
            && envelope.wrapped_key === room.key_envelopes[i]?.wrapped_key);
        return previous.id !== room.id
          || previous.name !== room.name
          || previous.type !== room.type
          || previous.current_key_version !== room.current_key_version
          || previous.encrypted_metadata.iv !== room.encrypted_metadata.iv
          || previous.encrypted_metadata.ciphertext !== room.encrypted_metadata.ciphertext
          || !sameEnvelopes
          || previous.role !== room.role
          || previous.is_muted !== room.is_muted
          || previous.last_content !== room.last_content
          || previous.last_sender !== room.last_sender
          || previous.last_at !== room.last_at
          || previous.unread !== room.unread;
      });
      if (changed) {
        roomsRef.current = unlocked;
        setRooms(unlocked);
      }
      setError("");
    } catch (err) { setError((err as Error).message); }
    finally { loadInFlight.current = false; }
  };

  useEffect(() => {
    void load();
    void api<{ role: string }>("/users/me").then((me) => setIsAdmin(me.role === "admin")).catch(() => setIsAdmin(false));

    // Keep the inbox in sync over the same-origin authenticated HTTP API.
    // This avoids a second, cross-site Socket.IO session that can fail when
    // browsers block third-party cookies.
    // Reduce background API traffic and catch up immediately when the user returns.
    const refresh = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 30000);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(refresh);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  useEffect(() => {
    const query = search.trim();
    if (query.length < 2) { setUsers([]); setSearching(false); return; }
    let active = true;
    setSearching(true);
    const timer = window.setTimeout(() => {
      void api<UserLite[]>(`/users?q=${encodeURIComponent(query)}`)
        .then((result) => { if (active) setUsers(result); })
        .catch((err) => { if (active) setError((err as Error).message); })
        .finally(() => { if (active) setSearching(false); });
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [search]);

  async function startDirectChat(user: UserLite) {
    const myId = getCurrentUserId();
    if (!myId || saving) return;
    setSaving(true); setError("");
    try {
      const [mine, theirs] = await Promise.all([
        api<PublicKeyResponse>(`/users/${myId}/crypto-key`),
        api<PublicKeyResponse>(`/users/${user.id}/crypto-key`),
      ]);
      const { raw, key } = await createRoomKey();
      const encryptedMetadata = await encryptRoomMetadataWithKey(key, { name: user.username });
      const keyEnvelopes = await Promise.all([
        wrapRoomKeyForUser(raw, mine.public_key).then((wrappedKey) => ({ userId: myId, wrappedKey })),
        wrapRoomKeyForUser(raw, theirs.public_key).then((wrappedKey) => ({ userId: user.id, wrappedKey })),
      ]);
      raw.fill(0);
      const created = await api<{ id: string; created?: boolean }>("/rooms/dm", {
        method: "POST",
        body: JSON.stringify({ userId: user.id, encryptedMetadata, keyEnvelopes }),
      });
      if (created.created) {
        // Only cache the key we generated when the server actually created
        // the DM. Existing rooms already have a different persisted key.
        cacheRoomKey(created.id, 1, key);
      } else {
        // A previous build could have cached a throwaway key over the real
        // DM key. Force the room page to unwrap the server's real envelope.
        clearRoomKeyCache(created.id);
      }
      navigate(`/rooms/${created.id}`);
    } catch (err) { setError((err as Error).message); }
    finally { setSaving(false); }
  }

  async function createGroup(e: React.FormEvent) {
    e.preventDefault();
    const myId = getCurrentUserId();
    if (!myId || !groupName.trim() || saving) return;
    setSaving(true); setError("");
    try {
      const ids = [myId, ...selectedIds];
      const publicKeys = await Promise.all(ids.map(async (id) => ({
        userId: id,
        publicKey: (await api<PublicKeyResponse>(`/users/${id}/crypto-key`)).public_key,
      })));
      const { raw, key } = await createRoomKey();
      const encryptedMetadata = await encryptRoomMetadataWithKey(key, { name: groupName.trim() });
      const keyEnvelopes = await Promise.all(publicKeys.map(async (entry) => ({
        userId: entry.userId,
        wrappedKey: await wrapRoomKeyForUser(raw, entry.publicKey),
      })));
      raw.fill(0);
      const created = await api<{ id: string }>("/rooms", {
        method: "POST",
        body: JSON.stringify({ memberIds: selectedIds, encryptedMetadata, keyEnvelopes }),
      });
      cacheRoomKey(created.id, 1, key);
      setGroupOpen(false); setGroupName(""); setSelectedIds([]); setSearch("");
      await load();
    } catch (err) { setError((err as Error).message); }
    finally { setSaving(false); }
  }

  const visible = rooms.filter((r) => filter === "all" || r.type === filter);
  const toggleMember = (id: string) => setSelectedIds((current) =>
    current.includes(id) ? current.filter((value) => value !== id) : [...current, id].slice(0, 49));

  return (
    <main className="screen inbox-screen">
      <aside className="desktop-rail" aria-label="Main navigation">
        <Link className="rail-brand" to="/" aria-label="Alta Chat home">A</Link>
        <Link className="rail-link active" to="/" title="Chats" aria-label="Chats">▤</Link>
        {isAdmin && <Link className="rail-link" to="/admin" title="Admin" aria-label="Admin">▦</Link>}
        <Link className="rail-link rail-profile" to="/profile" title="My profile" aria-label="My profile">◉</Link>
      </aside>
      <section className="desktop-inbox-panel">
      <header className="inbox-topbar">
        <div><p className="eyebrow">ALTA CHAT</p><h1>Messages</h1></div>
        <div className="top-actions">
          <NotificationBell />
          <button className="icon-button" title="Create group" onClick={() => setGroupOpen(true)}>＋</button>
          <Link className="profile-chip" to="/profile">My profile</Link>
        </div>
      </header>

      <section className="inbox-search">
        <span aria-hidden="true">⌕</span>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search people or start a chat" aria-label="Search people" />
        {search && <button className="clear-search" onClick={() => setSearch("")} type="button">×</button>}
      </section>

      {search.trim().length >= 2 && (
        <section className="people-results">
          <p className="section-label">PEOPLE</p>
          {searching && <p className="muted">Searching…</p>}
          {!searching && users.length === 0 && <p className="muted">No matching users found.</p>}
          {users.map((user) => (
            <button className="person-result" key={user.id} onClick={() => void startDirectChat(user)} disabled={saving}>
              <span className={`avatar ${user.status === "online" ? "online" : ""}`}>{user.username.slice(0, 2).toUpperCase()}</span>
              <span className="person-copy"><strong>{user.username}</strong><small>{user.status}</small></span>
              <span className="person-action">Message ↗</span>
            </button>
          ))}
        </section>
      )}

      <div className="inbox-section-head">
        <span className="section-label">YOUR CONVERSATIONS</span>
        <button className="text-action" onClick={() => void load()}>Refresh</button>
      </div>
      <nav className="filter-tabs" aria-label="Filter conversations">
        {(["all", "direct", "group"] as const).map((f) => <button key={f} className={filter === f ? "active" : ""} onClick={() => setFilter(f)}>{f === "all" ? "All" : f === "direct" ? "Personal" : "Groups"}</button>)}
      </nav>

      {error && <p className="error-banner" role="alert">{error}</p>}
      {visible.length === 0 ? (
        <section className="empty-state">
          <div className="empty-icon">✳</div>
          <h2>No conversations yet</h2>
          <p>Search for someone to start a private chat, or create an encrypted group.</p>
          <button onClick={() => setGroupOpen(true)}>Create your first group</button>
        </section>
      ) : (
        <ul className="conversation-list">
          {visible.map((room) => (
            <li key={room.id}>
              <Link className="conversation-row" to={`/rooms/${room.id}`}>
                <span className={`conversation-avatar ${room.type === "group" ? "group-avatar" : ""}`}>{(room.name ?? "E2E").slice(0, 2).toUpperCase()}</span>
                <span className="conversation-copy">
                  <span className="conversation-title">{room.name ?? "Encrypted room"}{room.type === "group" && <small className="kind-label">GROUP</small>}</span>
                  <span className="conversation-preview">{room.last_sender ? `${room.last_sender}: ` : ""}{room.last_content ?? "Start the conversation"}</span>
                </span>
                <span className="conversation-meta">
                  <time>{room.last_at ? new Date(room.last_at).toLocaleDateString() : ""}</time>
                  {room.unread > 0 && <b className="unread-count">{room.unread > 99 ? "99+" : room.unread}</b>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <footer className="app-nav">
        <Link className="selected" to="/">◉<span>Chats</span></Link>
        {isAdmin && <Link to="/admin">▦<span>Admin</span></Link>}
        <Link to="/profile">◌<span>Profile</span></Link>
      </footer>
      </section>
      <section className="desktop-workspace" aria-label="Conversation workspace">
        <div className="workspace-topline">
          <div><p className="eyebrow">WORKSPACE</p><h2>Messages</h2></div>
          <span className="workspace-secure"><span className="secure-dot" /> End-to-end encrypted</span>
        </div>
        <div className="workspace-welcome">
          <div className="workspace-empty-icon" aria-hidden="true">▤</div>
          <p className="eyebrow">ALTA CHAT</p>
          <h2>Select a conversation</h2>
          <p>Choose a thread from your inbox to view messages and continue the conversation.</p>
        </div>
      </section>

      {groupOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget && !saving) setGroupOpen(false); }}>
          <form className="group-modal" onSubmit={createGroup}>
            <div className="modal-heading"><div><p className="eyebrow">COMMUNITY</p><h2>New encrypted group</h2></div><button type="button" className="close-button" onClick={() => setGroupOpen(false)}>×</button></div>
            <label className="field-label">Group name</label>
            <input className="modal-input" value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder="e.g. Project team" required maxLength={60} />
            <label className="field-label">Add people <span className="muted">({selectedIds.length} selected)</span></label>
            <input className="modal-input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search usernames (2+ characters)" />
            <div className="member-picker">
              {users.map((user) => (
                <label className="member-choice" key={user.id}>
                  <span className="avatar">{user.username.slice(0, 2).toUpperCase()}</span>
                  <span><strong>{user.username}</strong><small>{user.status}</small></span>
                  <input type="checkbox" checked={selectedIds.includes(user.id)} onChange={() => toggleMember(user.id)} />
                </label>
              ))}
              {search.trim().length >= 2 && !searching && users.length === 0 && <p className="muted">No people found for this search.</p>}
              {selectedIds.length === 0 && <p className="muted">You can create a group now and invite people later.</p>}
            </div>
            <button className="full-button" type="submit" disabled={saving || !groupName.trim()}>{saving ? "Encrypting group…" : "Create encrypted group"}</button>
            <p className="security-note">A fresh encryption key is shared only with the members you select.</p>
          </form>
        </div>
      )}
    </main>
  );
}
