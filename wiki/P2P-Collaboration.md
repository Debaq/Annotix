# P2P Collaboration

Annotix enables real-time collaborative annotation with no central server, powered by [Iroh](https://iroh.computer/) (QUIC protocol). Peers connect directly using session codes and synchronize via CRDTs (Conflict-free Replicated Data Types).

## Overview

- **No server required** — all communication is peer-to-peer.
- **CRDT-based sync** — conflict-free, eventual consistency.
- **Role-based permissions** — control who can do what.
- **Image locking** — prevents concurrent editing conflicts.
- **Work distribution** — assign image batches to team members.

---

## Creating a Session

The host creates a session and shares the code with collaborators.

### Step by Step (Host)

1. **Verify project** — project must exist with at least one class.
2. **Initialize Iroh node** — creates a P2P networking node.
3. **Create CRDT document** — the shared document that holds all synchronized state.
4. **Export project metadata** — writes project info, classes, images, and annotations to the document.
5. **Generate session codes** — a connection ticket for collaborators.
6. **Activate session** — start listening for peers.

### Step by Step (Collaborator)

1. **Decode ticket** — parse the session code received from the host.
2. **Initialize Iroh node** — creates a local P2P node.
3. **Import and subscribe** — import the shared document and subscribe to changes.
4. **Read metadata** — extract project name, type, classes from the document.
5. **Reconstruct project** — create a local project from the synced data (2-phase: metadata first, then images).
6. **Discover peers** — register in the peer list.
7. **Start watcher** — begin listening for real-time changes.
8. **Activate** — ready to annotate.

---

## Roles and Permissions

### Roles

| Role | Description |
|------|-------------|
| **LeadResearcher** | Host. Full control over everything. |
| **Annotator** | Can annotate images. Limited by session rules. |
| **DataCurator** | Can upload data and export. Limited by session rules. |

### Permission Matrix

| Permission | LeadResearcher | Annotator | DataCurator |
|------------|:-:|:-:|:-:|
| Annotate | Yes | Yes | No |
| UploadData | Yes | No | Configurable |
| Export | Yes | No | Configurable |
| EditClasses | Yes | No | No |
| Delete | Yes | No | No |
| Manage | Yes | No | No |

### Session Rules

The host configures session-level overrides:

| Rule | Description | Default |
|------|-------------|---------|
| `can_upload` | Allow data upload | false |
| `can_edit_classes` | Allow class editing | false |
| `can_delete` | Allow deletion | false |
| `can_export` | Allow export | false |
| `require_data_approval` | Uploads require host approval | true |

These rules override role defaults and are stored in the shared document.

---

## Image Locking

To prevent two people from annotating the same image simultaneously, Annotix uses image-level locking with automatic expiration.

| Parameter | Value |
|-----------|-------|
| **TTL** | 3 minutes (180,000 ms) |
| **Renewal interval** | 60 seconds (automatic) |
| **Conflict resolution** | First-come, first-served with expiration fallback |

### How It Works

1. When you open an image, a lock is acquired.
2. The lock is automatically renewed every 60 seconds while you're viewing it.
3. When you close the image or navigate away, the lock is released.
4. If a lock expires (e.g. the peer disconnects), any other peer can acquire it.

### Lock Modes

- **Individual** — lock one image at a time (default).
- **Batch** — when a batch is assigned, all images in the batch are implicitly "owned" by the assigned peer.

---

## Work Distribution

The host can assign batches of images to collaborators.

### Distribution Algorithm

1. **Collect items** — gather all videos (indivisible units) and standalone images.
2. **Detect existing assignments** — check what's already assigned.
3. **Handle peer changes** — reassign orphaned items from disconnected peers.
4. **Assign new items** — round-robin distribution among active peers.
5. **Update document** — write assignments to the CRDT document.

### Key Details

- **Videos are indivisible** — a video is assigned as a whole, not frame by frame.
- **Standalone images** are assigned individually.
- **Version tracking** — each distribution update increments a version number for conflict detection.
- **Orphan handling** — items from disconnected peers can be manually reassigned by the host.
- **Progress tracking** — per-peer statistics (videos: completed when all frames annotated; images: completed when at least 1 annotation).

Only the **LeadResearcher** can create and modify work distributions.

---

## CRDT Synchronization

### What's Synced

| Data | Synced | Path in Document |
|------|:------:|-----------------|
| Project metadata | Yes | `meta/project` |
| Session rules | Yes | `meta/rules` |
| Peer list | Yes | `meta/peers/{node_id}` |
| Work distribution | Yes | `meta/work_distribution` |
| Pending approvals | Yes | `meta/pending_approvals` |
| Classes | Yes | `classes/{id}` |
| Image metadata | Yes | `images/{id}/meta` |
| Annotations | Yes | `images/{id}/annots` |
| Image blobs | Yes | `images/{id}/blob` (content-addressed) |
| Image locks | Yes | `images/{id}/lock` |

### What's NOT Synced

- Video files
- Frame extraction status
- Tracks and keyframes
- Download progress/status

### Conflict Resolution

Iroh uses Atom-based CRDTs with **last-write-wins per author**. This means:

- If two peers edit the same image's annotations simultaneously, the last write wins.
- In practice, image locking prevents this scenario — only the lock holder can save annotations.
- Class definitions and metadata conflicts are resolved by timestamp.

### Real-Time Updates

A **watcher task** subscribes to the CRDT document and emits Tauri events for all changes:

| Document Change | Tauri Event |
|----------------|-------------|
| Image annotations updated | `p2p:annotations-changed` |
| New image added | `p2p:image-added` |
| Class added/updated | `p2p:class-changed` |
| Peer joined/left | `p2p:peers-changed` |
| Lock acquired/released | `p2p:lock-changed` |
| Work distribution updated | `p2p:distribution-changed` |

---

## Gossip Protocol

Beyond CRDT document sync, peers communicate via gossip messages for real-time notifications:

| Message | Trigger |
|---------|---------|
| `PeerJoined` | A new peer connects |
| `PeerLeft` | A peer disconnects |
| `ImageLocked` | A peer locks an image |
| `ImageUnlocked` | A peer releases a lock |
| `AnnotationsSaved` | A peer saves annotations |
| `BatchAssigned` | Host assigns a work batch |
| `PeerRoleChanged` | Host changes a peer's role |
| `DataSubmitted` | A peer submits data for approval |
| `DataApproved` | Host approves submitted data |
| `DataRejected` | Host rejects submitted data |

Gossip messages provide immediate UI feedback. The CRDT document is the source of truth.

---

## Pending Approvals

When `require_data_approval` is enabled, certain actions require host approval:

### Workflow

1. Collaborator performs a restricted action (e.g. uploads images).
2. An approval entry is created: `{item_id, item_type, submitted_by, timestamp, status: "Pending"}`.
3. Host sees the pending approval in the UI.
4. Host approves or rejects.
5. Status updates to `"Approved"` or `"Rejected"`.
6. Gossip messages notify all peers of the decision.

---

## Disconnect & Reconnect

### Graceful Disconnect

- Peer calls **pause** (suspend, save state for resume) or **leave** (full cleanup and shutdown).
- Peer is marked as "left" in the document.

### Ungraceful Disconnect (Network Failure)

- **Frontend timeout:** 90 seconds of no response → peer marked offline in UI.
- **Lock expiration:** 3 minutes → other peers can acquire the lock.
- **Work assignment:** Persists until the host manually reassigns.

### Reconnection

- **Resume** from saved state: re-subscribe to document, resume blob downloads.
- Peer re-appears in the peer list.
- Locks can be re-acquired for previously assigned images.

---

## Frontend Components

| Component | Purpose |
|-----------|---------|
| `P2pDialog` | Create/join session UI |
| `P2pStatusIndicator` | Connection status badge |
| `PeerList` | Online peers with roles |
| `WorkDistributionPanel` | Assign and view work batches |
| `PendingApprovalsPanel` | Approve/reject submissions |

### Hooks

| Hook | Purpose |
|------|---------|
| `useP2pSession` | Manages event listeners, 90s peer timeout |
| `useP2pCanEdit` | Checks if current user has permission for an action |
| `useImagePresence` | Checks lock status of current image |
