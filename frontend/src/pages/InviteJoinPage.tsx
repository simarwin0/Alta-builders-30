import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { cacheRoomKey, createRoomKey, decryptInvitationLabel, encryptRoomMetadataWithKey, getCurrentUserId, wrapRoomKeyForUser } from "../crypto";

type InviteInfo = {
  roomId: string;
  displayName: string;
  mode: "approval" | "instant";
  memberIds: string[];
  currentKeyVersion: number;
  alreadyMember: boolean;
  requested: boolean;
};
type PublicKeyResponse = { public_key: JsonWebKey };

export default function InviteJoinPage() {
  const { token = "" } = useParams();
  const navigate = useNavigate();
  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    let active = true;
    let initialLoad = true;
    const refreshInvite = async () => {
      try {
        const data = await api<InviteInfo>(`/invitations/${encodeURIComponent(token)}`);
        const displayName = await decryptInvitationLabel(token, data.displayName);
        if (!active) return;
        setInvite({ ...data, displayName });
        setError("");
        if (data.alreadyMember) setStatus("You are now a member of this group.");
        else if (data.requested) setStatus("Your request is waiting for an owner or admin to approve it.");
        else setStatus("");
      } catch (err) {
        if (active && initialLoad) setError((err as Error).message);
      } finally {
        initialLoad = false;
      }
    };
    void refreshInvite();
    // Keep a pending invitation in sync so an approved member can open the
    // group without reloading the page or submitting another join request.
    const poll = window.setInterval(() => {
      if (document.visibilityState === "visible") void refreshInvite();
    }, 3500);
    return () => {
      active = false;
      window.clearInterval(poll);
    };
  }, [token]);

  async function join() {
    if (!invite || busy) return;
    setBusy(true);
    setError("");
    try {
      // Refresh membership and key-version data immediately before joining.
      // This prevents a stale invitation page from building envelopes for an
      // out-of-date member list when the group changed after the link opened.
      const latest = await api<Omit<InviteInfo, "displayName"> & { displayName: string }>(
        `/invitations/${encodeURIComponent(token)}`,
      );
      const latestDisplayName = await decryptInvitationLabel(token, latest.displayName);
      const currentInvite: InviteInfo = { ...latest, displayName: latestDisplayName };
      setInvite(currentInvite);

      if (currentInvite.alreadyMember) {
        navigate(`/rooms/${currentInvite.roomId}`);
        return;
      }
      if (currentInvite.mode === "approval") {
        const result = await api<{ status: string }>(
          `/invitations/${encodeURIComponent(token)}/join`,
          { method: "POST", body: JSON.stringify({}) },
        );
        setStatus(result.status === "member"
          ? "You are already a member."
          : "Request sent. You'll be able to open the group after an admin approves you.");
        return;
      }

      const userId = getCurrentUserId();
      if (!userId) throw new Error("Your account encryption is locked. Log in again before joining.");
      const recipients = [...new Set([...currentInvite.memberIds, userId])];
      const keys = await Promise.all(recipients.map(async (id) => ({
        userId: id,
        publicKey: (await api<PublicKeyResponse>(`/users/${id}/crypto-key`)).public_key,
      })));
      const { raw, key } = await createRoomKey();
      try {
        const encryptedMetadata = await encryptRoomMetadataWithKey(key, { name: currentInvite.displayName });
        const keyEnvelopes = await Promise.all(keys.map(async (entry) => ({
          userId: entry.userId,
          wrappedKey: await wrapRoomKeyForUser(raw, entry.publicKey),
        })));
        const result = await api<{ status?: string; keyVersion?: number }>(
          `/invitations/${encodeURIComponent(token)}/join`,
          {
            method: "POST",
            body: JSON.stringify({ encryptedMetadata, keyEnvelopes }),
          },
        );
        if (result.status === "member") {
          navigate(`/rooms/${currentInvite.roomId}`);
          return;
        }
        cacheRoomKey(currentInvite.roomId, result.keyVersion ?? currentInvite.currentKeyVersion + 1, key);
        navigate(`/rooms/${currentInvite.roomId}`);
      } finally {
        raw.fill(0);
      }
    } catch (err) {
      const message = (err as Error).message;
      setError(message.includes("Group membership changed")
        ? "This group changed while you were joining. Please tap Join again to refresh its member list and retry."
        : message);
    } finally {
      setBusy(false);
    }
  }

  if (!invite && !error) return <main className="screen"><p className="muted">Checking invitation…</p></main>;
  return (
    <main className="screen auth-screen">
      <section className="auth-card">
        <p className="eyebrow">ALTA CHAT · GROUP INVITATION</p>
        <h1>{invite?.displayName ?? "Invitation unavailable"}</h1>
        {invite && <p className="muted">{invite.mode === "approval" ? "This group requires approval from an owner or admin." : "This invitation allows instant joining. Your browser will securely rotate the group encryption key."}</p>}
        {error && <p className="error-banner" role="alert">{error}</p>}
        {status && <p className="security-note" role="status">{status}</p>}
        {invite?.alreadyMember ? <Link className="full-button" to={`/rooms/${invite.roomId}`}>Open group</Link>
          : invite?.requested ? <Link className="full-button" to="/">Back to Alta Chat</Link>
          : invite && <button className="full-button" type="button" onClick={() => void join()} disabled={busy}>{busy ? "Joining securely…" : invite.mode === "approval" ? "Request to join" : "Join group now"}</button>}
        <p className="security-note">The invitation never contains a group encryption key. New members receive a fresh key version, not access to earlier messages.</p>
        <Link to="/">Return to Alta Chat</Link>
      </section>
    </main>
  );
}
