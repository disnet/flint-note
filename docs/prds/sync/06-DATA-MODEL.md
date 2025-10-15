# Data Model & Automerge Schema

[← Back to Backend Service](./05-BACKEND-SERVICE.md) | [Next: Implementation Phases →](./07-IMPLEMENTATION-PHASES.md)

---

## FlintNote Document Schema

Each note is represented as an Automerge document with **separated metadata and content** for better conflict resolution.

```typescript
import { next as Automerge } from '@automerge/automerge';

interface FlintNote {
  // Immutable identifier
  id: string;

  // Structured metadata (from frontmatter)
  metadata: {
    title: string;
    filename: string;
    type: string;
    created: string; // ISO 8601 timestamp
    updated: string; // ISO 8601 timestamp
    tags: string[];
    [key: string]: any; // Custom frontmatter fields
  };

  // Markdown content (CRDT for conflict-free merging)
  content: Automerge.Text;

  // Deletion flag (for soft deletes)
  deleted: boolean;
}
```

---

## Why Separate Metadata from Content?

### Better Conflict Resolution

**Problem:** If metadata and content are in the same field, concurrent edits cause unnecessary conflicts.

**Solution:** Separate fields allow independent updates:

- User A renames note (metadata change)
- User B edits content (content change)
- Both changes merge cleanly without conflict

### Easier Frontmatter Management

**Benefit:** Frontmatter can be updated independently without touching content.

```typescript
// Update only title
handle.change((doc) => {
  doc.metadata.title = 'New Title';
  doc.metadata.updated = new Date().toISOString();
});
// Content unchanged
```

### Cleaner Mapping to Filesystem

**Benefit:** Direct correspondence to markdown file structure:

```markdown
---
title: My Note
filename: my-note
type: note
created: 2024-01-01T00:00:00Z
updated: 2024-01-02T00:00:00Z
tags:
  - important
---

# My Note

Content here...
```

---

## Creating Documents

### New Note

```typescript
async function createNote(
  title: string,
  content: string,
  typeName: string
): Promise<string> {
  // Create new Automerge document
  const noteId = generateNoteId(); // e.g., "n-abc12345"
  const handle = repo.create<FlintNote>();

  handle.change((doc) => {
    doc.id = noteId;
    doc.metadata = {
      title,
      filename: generateFilename(title),
      type: typeName,
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      tags: []
    };
    doc.content = new Automerge.Text(content);
    doc.deleted = false;
  });

  return noteId;
}
```

### From Existing File

```typescript
async function importFromFile(filePath: string): Promise<string> {
  // Read file
  const fileContent = await fs.readFile(filePath, 'utf-8');

  // Parse frontmatter and content
  const parsed = parseNoteContent(fileContent);

  // Create Automerge document
  const noteId = parsed.metadata.id || generateNoteId();
  const handle = repo.find<FlintNote>(noteId);

  handle.change((doc) => {
    doc.id = noteId;
    doc.metadata = {
      title: parsed.metadata.title || 'Untitled',
      filename: path.basename(filePath, '.md'),
      type: parsed.metadata.type || 'note',
      created: parsed.metadata.created || new Date().toISOString(),
      updated: parsed.metadata.updated || new Date().toISOString(),
      tags: parsed.metadata.tags || [],
      ...parsed.metadata // Include custom fields
    };
    doc.content = new Automerge.Text(parsed.content);
    doc.deleted = false;
  });

  return noteId;
}
```

---

## Updating Documents

### Content Edit

```typescript
async function updateNoteContent(noteId: string, newContent: string): Promise<void> {
  const handle = repo.find<FlintNote>(noteId);
  await handle.whenReady();

  handle.change((doc) => {
    // Replace entire content
    doc.content = new Automerge.Text(newContent);
    doc.metadata.updated = new Date().toISOString();
  });
}
```

### Incremental Content Edit (Better for Sync)

```typescript
async function editNoteContentIncremental(
  noteId: string,
  startPos: number,
  deleteCount: number,
  insertText: string
): Promise<void> {
  const handle = repo.find<FlintNote>(noteId);
  await handle.whenReady();

  handle.change((doc) => {
    // Delete characters
    if (deleteCount > 0) {
      doc.content.deleteAt(startPos, deleteCount);
    }

    // Insert new text
    if (insertText.length > 0) {
      doc.content.insertAt(startPos, ...insertText.split(''));
    }

    doc.metadata.updated = new Date().toISOString();
  });
}
```

### Metadata Update

```typescript
async function updateNoteMetadata(
  noteId: string,
  updates: Partial<FlintNote['metadata']>
): Promise<void> {
  const handle = repo.find<FlintNote>(noteId);
  await handle.whenReady();

  handle.change((doc) => {
    Object.assign(doc.metadata, updates);
    doc.metadata.updated = new Date().toISOString();
  });
}
```

### Rename

```typescript
async function renameNote(noteId: string, newTitle: string): Promise<void> {
  const handle = repo.find<FlintNote>(noteId);
  await handle.whenReady();

  handle.change((doc) => {
    doc.metadata.title = newTitle;
    doc.metadata.filename = generateFilename(newTitle);
    doc.metadata.updated = new Date().toISOString();
  });
}
```

---

## Deleting Documents

### Soft Delete

```typescript
async function deleteNote(noteId: string): Promise<void> {
  const handle = repo.find<FlintNote>(noteId);
  await handle.whenReady();

  handle.change((doc) => {
    doc.deleted = true;
    doc.metadata.updated = new Date().toISOString();
  });
}
```

### Restore

```typescript
async function restoreNote(noteId: string): Promise<void> {
  const handle = repo.find<FlintNote>(noteId);
  await handle.whenReady();

  handle.change((doc) => {
    doc.deleted = false;
    doc.metadata.updated = new Date().toISOString();
  });
}
```

---

## Reading Documents

### Get Document

```typescript
async function getNote(noteId: string): Promise<FlintNote | null> {
  const handle = repo.find<FlintNote>(noteId);
  await handle.whenReady();

  if (!handle.doc) return null;

  return handle.doc;
}
```

### Get Content as String

```typescript
async function getNoteContent(noteId: string): Promise<string> {
  const handle = repo.find<FlintNote>(noteId);
  await handle.whenReady();

  return handle.doc.content.toString();
}
```

### List All Notes

```typescript
async function listAllNotes(): Promise<FlintNote[]> {
  const notes: FlintNote[] = [];

  for (const [docId, handle] of repo.handles) {
    await handle.whenReady();

    const doc = handle.doc as FlintNote;

    // Skip deleted notes
    if (doc.deleted) continue;

    notes.push(doc);
  }

  return notes;
}
```

---

## Conflict Resolution

### Content Conflicts (Automatic)

Automerge Text CRDT handles concurrent edits automatically:

```typescript
// Device A: Insert "Hello" at position 0
handleA.change((doc) => {
  doc.content.insertAt(0, ...'Hello'.split(''));
});

// Device B: Insert "World" at position 0 (concurrently)
handleB.change((doc) => {
  doc.content.insertAt(0, ...'World'.split(''));
});

// After sync: Both devices converge to same result
// Result depends on Automerge's operation ordering
// e.g., "HelloWorld" or "WorldHello" (deterministic)
```

### Metadata Conflicts (Last-Write-Wins)

For metadata fields, last write wins based on timestamp:

```typescript
// Device A: Rename to "Alpha"
handleA.change((doc) => {
  doc.metadata.title = 'Alpha';
  doc.metadata.updated = '2024-01-01T10:00:00Z';
});

// Device B: Rename to "Beta" (later timestamp)
handleB.change((doc) => {
  doc.metadata.title = 'Beta';
  doc.metadata.updated = '2024-01-01T10:01:00Z';
});

// After sync: "Beta" wins (later timestamp)
```

### Deletion Conflicts

```typescript
async function handleDeletionConflict(
  noteId: string,
  hasLocalEdits: boolean
): Promise<void> {
  const handle = repo.find<FlintNote>(noteId);
  await handle.whenReady();

  if (handle.doc.deleted && hasLocalEdits) {
    // Ask user what to do
    const action = await askUser({
      title: 'Note Deleted Remotely',
      message: `The note was deleted on another device, but you have local changes.`,
      options: ['Keep Local Changes', 'Discard Local Changes']
    });

    if (action === 'Keep Local Changes') {
      // Undelete
      handle.change((doc) => {
        doc.deleted = false;
        doc.metadata.updated = new Date().toISOString();
      });
    } else {
      // Delete local file
      await fs.unlink(getNotePath(noteId));
    }
  }
}
```

---

## Filesystem Synchronization

### Automerge → Filesystem

```typescript
// Watch for Automerge changes and write to files
handle.on('change', async ({ doc }) => {
  if (doc.deleted) {
    // Delete file
    const notePath = getNotePath(doc.id);
    if (await fs.exists(notePath)) {
      await fs.unlink(notePath);
    }
    return;
  }

  // Format content with frontmatter
  const fileContent = formatNoteFile(doc.metadata, doc.content.toString());

  // Write to filesystem
  const notePath = getNotePath(doc.id);
  await changeProcessor.trackWrite(notePath);
  await fs.writeFile(notePath, fileContent, 'utf-8');
  const stats = await fs.stat(notePath);
  await changeProcessor.completeWrite(notePath, stats);
});

function formatNoteFile(metadata: FlintNote['metadata'], content: string): string {
  const frontmatter = yaml.dump(metadata);
  return `---\n${frontmatter}---\n\n${content}`;
}
```

### Filesystem → Automerge

```typescript
// Watch for file changes and update Automerge
async function onExternalFileChange(filePath: string): Promise<void> {
  const fileContent = await fs.readFile(filePath, 'utf-8');
  const parsed = parseNoteContent(fileContent);
  const noteId = parsed.metadata.id;

  const handle = repo.find<FlintNote>(noteId);
  await handle.whenReady();

  handle.change((doc) => {
    doc.metadata = parsed.metadata;
    doc.content = new Automerge.Text(parsed.content);
  });
}

function parseNoteContent(fileContent: string): {
  metadata: Record<string, any>;
  content: string;
} {
  // Split frontmatter and content
  const match = fileContent.match(/^---\n([\s\S]*?)\n---\n\n([\s\S]*)$/);

  if (!match) {
    return {
      metadata: {},
      content: fileContent
    };
  }

  const [, frontmatter, content] = match;
  const metadata = yaml.load(frontmatter);

  return { metadata, content };
}
```

---

## Binary Serialization

### Save to Storage

```typescript
async function saveToStorage(noteId: string): Promise<void> {
  const handle = repo.find<FlintNote>(noteId);
  await handle.whenReady();

  // Serialize to binary
  const binary = Automerge.save(handle.doc);

  // Encrypt
  const encrypted = await encryption.encrypt(binary);

  // Upload to R2
  await storageAdapter.save(noteId, encrypted);
}
```

### Load from Storage

```typescript
async function loadFromStorage(noteId: string): Promise<FlintNote | null> {
  // Download from R2
  const encrypted = await storageAdapter.load(noteId);
  if (!encrypted) return null;

  // Decrypt
  const binary = await encryption.decrypt(encrypted);

  // Deserialize from binary
  const doc = Automerge.load<FlintNote>(binary);

  return doc;
}
```

---

## History and Versioning

### Get History

```typescript
function getNoteHistory(noteId: string): Automerge.Change[] {
  const handle = repo.find<FlintNote>(noteId);
  return Automerge.getHistory(handle.doc);
}
```

### View Specific Version

```typescript
function getNoteAtVersion(noteId: string, version: Automerge.Heads): FlintNote {
  const handle = repo.find<FlintNote>(noteId);
  const allChanges = Automerge.getHistory(handle.doc);

  // Filter changes up to version
  const changesUpToVersion = allChanges.filter((change) => version.includes(change.hash));

  // Reconstruct document at that version
  let doc = Automerge.init<FlintNote>();
  for (const change of changesUpToVersion) {
    doc = Automerge.applyChanges(doc, [change])[0];
  }

  return doc;
}
```

---

## Performance Considerations

### Document Size

**Problem:** Large documents can be slow to serialize/deserialize.

**Solution:**

- Compress binaries before encryption
- Split very large notes (10,000+ lines) into linked notes
- Use incremental sync (sync changes, not full documents)

### History Size

**Problem:** Long history increases document size.

**Solution:**

- Compact history periodically (Automerge supports this)
- Archive old versions to separate storage
- Prune history older than N days (user configurable)

### Memory Usage

**Problem:** Loading all documents into memory is expensive.

**Solution:**

- Lazy loading: only load documents when accessed
- Unload inactive documents after timeout
- Keep only metadata in memory, load content on demand

---

**Next:** [Implementation Phases →](./07-IMPLEMENTATION-PHASES.md)
