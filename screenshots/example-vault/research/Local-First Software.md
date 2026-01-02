# Local-First Software

Understanding the principles and benefits of local-first architecture.

## What is Local-First?

Local-first software keeps the primary copy of data on the user's device, with cloud sync as a secondary feature. This inverts the traditional SaaS model.

## Core Principles

1. **No spinners** - Data is always available locally
2. **Works offline** - Full functionality without internet
3. **User owns data** - Export anytime, no lock-in
4. **Fast** - No network latency for basic operations
5. **Collaborative** - Sync happens in background

## Technical Foundation

### CRDTs (Conflict-free Replicated Data Types)

CRDTs allow multiple devices to edit simultaneously without coordination:

```
Device A: "Hello"  →  "Hello World"
Device B: "Hello"  →  "Hello!"

Result:  "Hello World!" (automatic merge)
```

### Storage Layer

- IndexedDB for web apps
- SQLite for desktop/mobile
- File system for document-based apps

## Benefits for Users

| Traditional Cloud | Local-First      |
| ----------------- | ---------------- |
| Requires internet | Works anywhere   |
| Data on servers   | Data on device   |
| Vendor dependent  | User controlled  |
| Latency for edits | Instant response |

## Challenges

- Initial sync can be slow
- Conflict resolution complexity
- Storage limits on devices
- Backup responsibility on user

## Why Flint is Local-First

We believe your notes are too important to depend on our servers. Your thoughts should be:

- Always accessible
- Under your control
- Private by default

See also: [[AI in Note-Taking]] for privacy implications
