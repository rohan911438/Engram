/// Engram commit anchors.
///
/// Each Engram commit (a signed snapshot of an agent's beliefs) is anchored by
/// emitting one `Anchored` event. The Merkle root and commit ID are public in
/// the event, so anyone can check a commit against the chain — no object is
/// created, so anchoring costs only gas.
module engram_anchor::anchor;

use sui::clock::Clock;
use sui::event;

/// The commit ID and Merkle root are sha256 hashes.
const EBadHashLength: u64 = 0;

public struct Anchored has copy, drop {
    /// Address that sent the anchor transaction (the agent's operator).
    sender: address,
    /// Agent's Ed25519 public key (32 bytes) — who signed the manifest.
    agent_pubkey: vector<u8>,
    /// sha256 of the canonical commit manifest.
    commit_id: vector<u8>,
    /// Merkle root over the commit's active beliefs and tombstones.
    merkle_root: vector<u8>,
    /// Parent commit ID, empty for the first commit.
    parent: vector<u8>,
    /// Walrus blob ID of the stored manifest (base64url, as text bytes).
    manifest_blob: vector<u8>,
    timestamp_ms: u64,
}

public fun anchor(
    agent_pubkey: vector<u8>,
    commit_id: vector<u8>,
    merkle_root: vector<u8>,
    parent: vector<u8>,
    manifest_blob: vector<u8>,
    clock: &Clock,
    ctx: &TxContext,
) {
    assert!(commit_id.length() == 32, EBadHashLength);
    assert!(merkle_root.length() == 32, EBadHashLength);
    assert!(parent.length() == 0 || parent.length() == 32, EBadHashLength);
    event::emit(Anchored {
        sender: ctx.sender(),
        agent_pubkey,
        commit_id,
        merkle_root,
        parent,
        manifest_blob,
        timestamp_ms: clock.timestamp_ms(),
    });
}
