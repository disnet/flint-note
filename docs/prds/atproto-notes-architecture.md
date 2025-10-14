# Architecture Document: Note-Taking App with AT Protocol Identity

## Executive Summary

This document outlines the architecture for a note-taking application that leverages AT Protocol (atproto) for decentralized identity and authentication while storing private note data on a centralized service. This approach mirrors Bluesky's temporary chat/DM implementation and provides a pragmatic solution for building private data applications on atproto today, before native protocol-level private data support is available.

**Key Benefits:**
- Users authenticate with their atproto identity (handle/DID)
- No need to manage user passwords or create separate accounts
- Private data remains on a centralized, secure server
- Leverages existing PDS infrastructure for authentication proxying
- Clear migration path when atproto adds native private data support

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [System Components](#system-components)
3. [Authentication Flow](#authentication-flow)
4. [Service Proxying Mechanism](#service-proxying-mechanism)
5. [API Design with Lexicons](#api-design-with-lexicons)
6. [Implementation Details](#implementation-details)
7. [Security Considerations](#security-considerations)
8. [Deployment Architecture](#deployment-architecture)
9. [Future Migration Path](#future-migration-path)
10. [References](#references)

---

## Architecture Overview

### High-Level Architecture

```
┌─────────────────┐
│  Client App     │
│  (Web/Mobile)   │
└────────┬────────┘
         │ 1. OAuth Login
         │ 2. API Requests (with atproto-proxy header)
         ▼
┌─────────────────┐
│  User's PDS     │
│  (Personal Data │ ← User's identity and repo storage
│   Server)       │
└────────┬────────┘
         │ 3. Service Auth JWT
         │ 4. Proxied Request
         ▼
┌─────────────────┐
│  Notes Service  │
│  (Your Backend) │ ← Centralized private note storage
└─────────────────┘
```

### Request Flow

1. **User Authentication**: Client authenticates user via OAuth with their PDS
2. **API Request**: Client makes request to PDS with `atproto-proxy` header pointing to your notes service
3. **Service Authentication**: PDS generates short-lived JWT signed with user's atproto key
4. **Proxied Request**: PDS forwards request to your notes service with service auth JWT
5. **JWT Verification**: Your service validates JWT using user's public key from DID document
6. **Response**: Your service processes request and returns response through PDS to client

**Why This Architecture?**

As noted in the [atproto GitHub discussion](https://github.com/bluesky-social/atproto/discussions/3049), the atproto team recommends this approach for private data:

> "If folks want to implement less-visible content in atproto projects today, we recommend doing what we did for the temporary Bluesky Chat DMs system: implement a centralized server and talk to it over Lexicon APIs using service proxying."

This avoids the problems with encrypting private data and storing it in public repositories while still leveraging atproto's identity system.

---

## System Components

### 1. Client Application

**Responsibilities:**
- User interface for note-taking functionality
- OAuth authentication flow
- Making authenticated API requests via service proxying
- Managing session state

**Key Technologies:**
- OAuth Client Library: [`@atproto/oauth-client`](https://www.npmjs.com/package/@atproto/oauth-client)
- For browsers: [`@atproto/oauth-client-browser`](https://www.npmjs.com/package/@atproto/oauth-client-browser)
- For Node.js: [`@atproto/oauth-client-node`](https://www.npmjs.com/package/@atproto/oauth-client-node)

**Documentation:**
- [OAuth for AT Protocol Specification](https://atproto.com/specs/oauth)
- [OAuth Client Implementation Guide](https://docs.bsky.app/docs/advanced-guides/oauth-client)

### 2. Notes Service (Backend)

**Responsibilities:**
- Store and manage private note data
- Validate service authentication JWTs
- Implement XRPC endpoints defined by your Lexicons
- Provide DID document at well-known endpoint

**Key Technologies:**
- Any web framework (Express, FastAPI, etc.)
- Database for note storage (PostgreSQL, MongoDB, etc.)
- JWT validation library
- DID resolution library

**Documentation:**
- [HTTP API (XRPC) Specification](https://atproto.com/specs/xrpc)
- [Service Authentication](https://atproto.com/specs/xrpc#service-authentication)

### 3. Personal Data Server (PDS)

**Responsibilities:**
- User identity and authentication
- Repository storage for public data
- Proxying requests to your notes service
- Generating service authentication JWTs

**Note:** Users bring their own PDS - you don't need to operate one. The PDS handles authentication proxying automatically.

**Documentation:**
- [API Hosts and Auth](https://docs.bsky.app/docs/advanced-guides/api-directory)
- [Protocol Overview](https://atproto.com/guides/overview)

### 4. Decentralized Identifier (DID)

**For Your Service:**
- Must have a resolvable DID (recommend `did:web`)
- DID document must include service endpoint
- Published at `/.well-known/did.json`

**For Users:**
- Users have their own DIDs managed by their PDS
- Contains cryptographic keys for signing and verification

**Documentation:**
- [Identity Specification](https://atproto.com/specs/did)
- [DID Web Method](https://w3c-ccg.github.io/did-method-web/)

---

## Authentication Flow

### OAuth Authentication Sequence

```
┌────────┐         ┌─────────┐         ┌───────────┐
│ Client │         │   PDS   │         │Auth Server│
└───┬────┘         └────┬────┘         └─────┬─────┘
    │                   │                    │
    │ 1. Start Auth     │                    │
    │  (handle)         │                    │
    ├──────────────────►│                    │
    │                   │ 2. Discover Auth   │
    │                   │    Server          │
    │                   ├───────────────────►│
    │                   │                    │
    │                   │ 3. Auth Metadata   │
    │                   │◄───────────────────┤
    │                   │                    │
    │ 4. Redirect to    │                    │
    │    Auth UI        │                    │
    │◄──────────────────┤                    │
    │                   │                    │
    │ 5. User Authorizes│                    │
    ├────────────────────────────────────────►│
    │                   │                    │
    │ 6. Auth Code      │                    │
    │◄────────────────────────────────────────┤
    │                   │                    │
    │ 7. Exchange Code  │                    │
    │    for Tokens     │                    │
    ├────────────────────────────────────────►│
    │                   │                    │
    │ 8. Access Token + │                    │
    │    Refresh Token  │                    │
    │◄────────────────────────────────────────┤
    │                   │                    │
```

**Key Steps:**

1. **Initiate Authentication**: Client calls OAuth client library with user's handle
2. **Discovery**: OAuth client resolves handle to DID, then discovers authorization server from DID document
3. **Authorization Request**: Using Pushed Authorization Request (PAR), client sends auth request to server
4. **User Consent**: User is redirected to authorization server UI to approve access
5. **Authorization Code**: Server returns authorization code via redirect
6. **Token Exchange**: Client exchanges code for access and refresh tokens using DPoP
7. **Authenticated Session**: Client now has tokens to make authenticated requests

**OAuth Scopes:**

For this application, request the following scopes:
- `atproto` - Required base scope
- `transition:generic` - Provides standard account permissions

**Documentation:**
- [OAuth for AT Protocol](https://docs.bsky.app/blog/oauth-atproto)
- [OAuth Specification](https://atproto.com/specs/oauth)

---

## Service Proxying Mechanism

### How Service Proxying Works

Service proxying is the mechanism that allows your centralized service to receive authenticated requests without users needing to authenticate directly with your service.

**Process:**

1. **Client Request**: Client makes XRPC request to user's PDS with special header:
   ```
   atproto-proxy: did:web:notes.yourapp.com#atproto_notes
   ```

2. **PDS Resolution**: PDS resolves the service DID to find service endpoint URL

3. **Service Auth JWT Generation**: PDS creates short-lived JWT with:
   - `iss`: User's DID (issuer - who the request is on behalf of)
   - `aud`: Service DID (audience - your notes service)
   - `exp`: Expiration timestamp (typically 60 seconds)
   - `iat`: Issued at timestamp
   - `lxm`: (optional) Specific method being called

4. **JWT Signing**: JWT is signed with user's atproto signing key

5. **Request Forwarding**: PDS forwards request to your service with JWT in Authorization header

6. **JWT Verification**: Your service:
   - Resolves user's DID to get DID document
   - Extracts signing public key from DID document
   - Verifies JWT signature
   - Validates claims (audience matches, not expired, etc.)

7. **Process & Respond**: Your service processes the request and responds

**Requirements for Service Proxying:**

Per the [XRPC specification](https://atproto.com/specs/xrpc#service-proxying):

- Target service must have resolvable DID with well-formed DID document
- DID document must have corresponding service entry with matching identifier
- Only atproto endpoint paths supported (must have `/xrpc/` prefix + valid NSID)
- Request must be from authenticated user with active account on PDS

**Service Auth JWT Structure:**

```json
{
  "iss": "did:plc:abc123...",  // User's DID
  "aud": "did:web:notes.yourapp.com",  // Your service DID
  "exp": 1698765432,  // Expiration (60s from issue)
  "iat": 1698765372,  // Issued at
  "lxm": "com.yourapp.note.create"  // Optional: method binding
}
```

**Documentation:**
- [XRPC Service Proxying](https://atproto.com/specs/xrpc#service-proxying)
- [Service Authentication](https://atproto.com/specs/xrpc#service-authentication)
- [Service Auth Token Discussion](https://github.com/bluesky-social/atproto/discussions/2687)

---

## API Design with Lexicons

### What are Lexicons?

[Lexicon](https://atproto.com/guides/lexicon) is atproto's schema system for defining RPC methods and record types. It provides:

- Standardized API contracts
- Type safety and validation
- Interoperability between services
- Self-documenting APIs

### Lexicon Schema Design

Lexicons are JSON documents that define:
- **Queries** (HTTP GET): Read-only operations
- **Procedures** (HTTP POST): State-changing operations
- **Records**: Data structures stored in repositories (not used in this architecture)

### Example Lexicon Schemas

#### 1. Create Note Procedure

**File**: `lexicons/com/yourapp/note/create.json`

```json
{
  "lexicon": 1,
  "id": "com.yourapp.note.create",
  "defs": {
    "main": {
      "type": "procedure",
      "description": "Create a new private note",
      "input": {
        "encoding": "application/json",
        "schema": {
          "type": "object",
          "required": ["title", "content"],
          "properties": {
            "title": {
              "type": "string",
              "maxLength": 300,
              "description": "Note title"
            },
            "content": {
              "type": "string",
              "maxLength": 100000,
              "description": "Note content (supports markdown)"
            },
            "tags": {
              "type": "array",
              "items": {"type": "string"},
              "maxLength": 20,
              "description": "Optional tags for categorization"
            }
          }
        }
      },
      "output": {
        "encoding": "application/json",
        "schema": {
          "type": "object",
          "required": ["uri", "createdAt"],
          "properties": {
            "uri": {
              "type": "string",
              "format": "at-uri",
              "description": "AT URI for the created note"
            },
            "cid": {
              "type": "string",
              "format": "cid",
              "description": "Content identifier"
            },
            "createdAt": {
              "type": "string",
              "format": "datetime"
            }
          }
        }
      },
      "errors": [
        {"name": "InvalidContent"},
        {"name": "RateLimitExceeded"}
      ]
    }
  }
}
```

#### 2. List Notes Query

**File**: `lexicons/com/yourapp/note/list.json`

```json
{
  "lexicon": 1,
  "id": "com.yourapp.note.list",
  "defs": {
    "main": {
      "type": "query",
      "description": "List user's notes with pagination",
      "parameters": {
        "type": "params",
        "properties": {
          "limit": {
            "type": "integer",
            "minimum": 1,
            "maximum": 100,
            "default": 50,
            "description": "Number of notes to return"
          },
          "cursor": {
            "type": "string",
            "description": "Pagination cursor"
          },
          "tag": {
            "type": "string",
            "description": "Filter by tag"
          }
        }
      },
      "output": {
        "encoding": "application/json",
        "schema": {
          "type": "object",
          "required": ["notes"],
          "properties": {
            "notes": {
              "type": "array",
              "items": {"type": "ref", "ref": "#noteView"}
            },
            "cursor": {"type": "string"}
          }
        }
      }
    },
    "noteView": {
      "type": "object",
      "required": ["uri", "cid", "title", "createdAt", "updatedAt"],
      "properties": {
        "uri": {"type": "string", "format": "at-uri"},
        "cid": {"type": "string", "format": "cid"},
        "title": {"type": "string"},
        "content": {"type": "string"},
        "tags": {
          "type": "array",
          "items": {"type": "string"}
        },
        "createdAt": {"type": "string", "format": "datetime"},
        "updatedAt": {"type": "string", "format": "datetime"}
      }
    }
  }
}
```

#### 3. Update Note Procedure

**File**: `lexicons/com/yourapp/note/update.json`

```json
{
  "lexicon": 1,
  "id": "com.yourapp.note.update",
  "defs": {
    "main": {
      "type": "procedure",
      "description": "Update an existing note",
      "input": {
        "encoding": "application/json",
        "schema": {
          "type": "object",
          "required": ["uri"],
          "properties": {
            "uri": {
              "type": "string",
              "format": "at-uri",
              "description": "Note URI to update"
            },
            "title": {
              "type": "string",
              "maxLength": 300
            },
            "content": {
              "type": "string",
              "maxLength": 100000
            },
            "tags": {
              "type": "array",
              "items": {"type": "string"},
              "maxLength": 20
            }
          }
        }
      },
      "output": {
        "encoding": "application/json",
        "schema": {
          "type": "object",
          "required": ["uri", "cid", "updatedAt"],
          "properties": {
            "uri": {"type": "string", "format": "at-uri"},
            "cid": {"type": "string", "format": "cid"},
            "updatedAt": {"type": "string", "format": "datetime"}
          }
        }
      },
      "errors": [
        {"name": "NoteNotFound"},
        {"name": "Unauthorized"}
      ]
    }
  }
}
```

#### 4. Delete Note Procedure

**File**: `lexicons/com/yourapp/note/delete.json`

```json
{
  "lexicon": 1,
  "id": "com.yourapp.note.delete",
  "defs": {
    "main": {
      "type": "procedure",
      "description": "Delete a note",
      "input": {
        "encoding": "application/json",
        "schema": {
          "type": "object",
          "required": ["uri"],
          "properties": {
            "uri": {
              "type": "string",
              "format": "at-uri"
            }
          }
        }
      },
      "errors": [
        {"name": "NoteNotFound"}
      ]
    }
  }
}
```

#### 5. Get Note Query

**File**: `lexicons/com/yourapp/note/get.json`

```json
{
  "lexicon": 1,
  "id": "com.yourapp.note.get",
  "defs": {
    "main": {
      "type": "query",
      "description": "Get a specific note by URI",
      "parameters": {
        "type": "params",
        "required": ["uri"],
        "properties": {
          "uri": {
            "type": "string",
            "format": "at-uri"
          }
        }
      },
      "output": {
        "encoding": "application/json",
        "schema": {
          "type": "ref",
          "ref": "com.yourapp.note.list#noteView"
        }
      },
      "errors": [
        {"name": "NoteNotFound"}
      ]
    }
  }
}
```

### NSID Naming Convention

NSIDs (Namespaced Identifiers) use reverse-DNS format:

- `com.yourapp.note.*` - Your notes API
- `com.atproto.*` - Core atproto APIs
- `app.bsky.*` - Bluesky application APIs
- `chat.bsky.*` - Bluesky chat APIs (example of this pattern)

**Best Practices:**

1. Use your domain name in reverse (e.g., `com.yourapp`)
2. Group related operations (e.g., all note operations under `com.yourapp.note`)
3. Use descriptive action names (create, list, update, delete, get)
4. Keep NSIDs concise but clear

**Documentation:**
- [Lexicon Guide](https://atproto.com/guides/lexicon)
- [Lexicon Specification](https://atproto.com/specs/lexicon)

---

## Implementation Details

### 1. Service DID Setup

Your notes service needs a DID document published at a well-known location.

**Recommended: `did:web` Method**

For `did:web:notes.yourapp.com`, publish at:
```
https://notes.yourapp.com/.well-known/did.json
```

**DID Document Structure:**

```json
{
  "@context": [
    "https://www.w3.org/ns/did/v1",
    "https://w3id.org/security/multikey/v1"
  ],
  "id": "did:web:notes.yourapp.com",
  "alsoKnownAs": [
    "at://notes.yourapp.com"
  ],
  "verificationMethod": [
    {
      "id": "did:web:notes.yourapp.com#atproto",
      "type": "Multikey",
      "controller": "did:web:notes.yourapp.com",
      "publicKeyMultibase": "zQ3s..."
    }
  ],
  "service": [
    {
      "id": "#atproto_notes",
      "type": "AtprotoNotesService",
      "serviceEndpoint": "https://notes.yourapp.com"
    }
  ]
}
```

**Key Elements:**

- `id`: Your service's DID
- `service`: Array with service endpoint(s)
- `service[].id`: Fragment identifier used in `atproto-proxy` header (e.g., `#atproto_notes`)
- `service[].serviceEndpoint`: Base URL for your XRPC endpoints

**Documentation:**
- [DID Specification](https://atproto.com/specs/did)
- [DID Web Method Spec](https://w3c-ccg.github.io/did-method-web/)

### 2. Backend Implementation

#### Node.js / Express Example

```javascript
const express = require('express');
const jwt = require('jsonwebtoken');
const { Resolver } = require('@atproto/identity');

const app = express();
app.use(express.json());

const resolver = new Resolver();

// Middleware to verify service auth JWT
async function verifyServiceAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'AuthenticationRequired',
        message: 'Bearer token required'
      });
    }

    const token = authHeader.substring(7);
    
    // Decode without verification first to get claims
    const decoded = jwt.decode(token, { complete: true });
    if (!decoded) {
      return res.status(401).json({
        error: 'InvalidToken',
        message: 'Malformed JWT'
      });
    }

    const { iss: userDid, aud: audience, exp, lxm } = decoded.payload;

    // Verify audience matches our service DID
    if (audience !== 'did:web:notes.yourapp.com') {
      return res.status(403).json({
        error: 'InvalidAudience',
        message: 'Token not intended for this service'
      });
    }

    // Check expiration
    if (exp && Date.now() >= exp * 1000) {
      return res.status(401).json({
        error: 'ExpiredToken',
        message: 'Service auth token expired'
      });
    }

    // Resolve user's DID document to get signing key
    const didDoc = await resolver.resolveDid(userDid);
    
    // Find the atproto signing key
    const signingKey = didDoc.verificationMethod?.find(
      vm => vm.id === `${userDid}#atproto`
    );

    if (!signingKey) {
      return res.status(401).json({
        error: 'InvalidDID',
        message: 'No atproto signing key found'
      });
    }

    // Verify JWT signature
    // Note: You'll need to convert the multibase key to the format
    // expected by your JWT library
    jwt.verify(token, getPublicKey(signingKey), {
      algorithms: ['ES256K']
    });

    // If lxm claim present, verify it matches the endpoint
    if (lxm) {
      const requestedMethod = req.path.replace('/xrpc/', '');
      if (lxm !== requestedMethod) {
        return res.status(403).json({
          error: 'MethodMismatch',
          message: 'Token not authorized for this method'
        });
      }
    }

    // Authentication successful
    req.userDid = userDid;
    next();

  } catch (error) {
    console.error('Auth verification failed:', error);
    return res.status(401).json({
      error: 'AuthenticationFailed',
      message: error.message
    });
  }
}

// Serve DID document
app.get('/.well-known/did.json', (req, res) => {
  res.json({
    "@context": ["https://www.w3.org/ns/did/v1"],
    "id": "did:web:notes.yourapp.com",
    "service": [{
      "id": "#atproto_notes",
      "type": "AtprotoNotesService",
      "serviceEndpoint": "https://notes.yourapp.com"
    }]
  });
});

// XRPC Endpoints

// Create note
app.post('/xrpc/com.yourapp.note.create', 
  verifyServiceAuth,
  async (req, res) => {
    try {
      const { title, content, tags } = req.body;
      const userDid = req.userDid;

      // Validate input
      if (!title || !content) {
        return res.status(400).json({
          error: 'InvalidRequest',
          message: 'Title and content required'
        });
      }

      // Store in database
      const note = await db.notes.create({
        userDid,
        title,
        content,
        tags: tags || [],
        createdAt: new Date(),
        updatedAt: new Date()
      });

      // Generate AT URI and CID
      const uri = `at://${userDid}/com.yourapp.note/${note.id}`;
      const cid = generateCID(note); // Implement CID generation

      res.json({
        uri,
        cid,
        createdAt: note.createdAt.toISOString()
      });

    } catch (error) {
      console.error('Create note error:', error);
      res.status(500).json({
        error: 'InternalError',
        message: 'Failed to create note'
      });
    }
  }
);

// List notes
app.get('/xrpc/com.yourapp.note.list',
  verifyServiceAuth,
  async (req, res) => {
    try {
      const userDid = req.userDid;
      const { limit = 50, cursor, tag } = req.query;

      const query = { userDid };
      if (tag) query.tags = tag;
      if (cursor) query._id = { $gt: cursor };

      const notes = await db.notes
        .find(query)
        .limit(parseInt(limit))
        .sort({ createdAt: -1 });

      const notesView = notes.map(note => ({
        uri: `at://${userDid}/com.yourapp.note/${note.id}`,
        cid: note.cid,
        title: note.title,
        content: note.content,
        tags: note.tags,
        createdAt: note.createdAt.toISOString(),
        updatedAt: note.updatedAt.toISOString()
      }));

      res.json({
        notes: notesView,
        cursor: notes.length > 0 ? notes[notes.length - 1].id : undefined
      });

    } catch (error) {
      console.error('List notes error:', error);
      res.status(500).json({
        error: 'InternalError',
        message: 'Failed to list notes'
      });
    }
  }
);

// Get specific note
app.get('/xrpc/com.yourapp.note.get',
  verifyServiceAuth,
  async (req, res) => {
    try {
      const { uri } = req.query;
      const userDid = req.userDid;

      // Parse note ID from URI
      const noteId = parseNoteIdFromUri(uri);

      const note = await db.notes.findOne({
        id: noteId,
        userDid
      });

      if (!note) {
        return res.status(404).json({
          error: 'NoteNotFound',
          message: 'Note does not exist'
        });
      }

      res.json({
        uri,
        cid: note.cid,
        title: note.title,
        content: note.content,
        tags: note.tags,
        createdAt: note.createdAt.toISOString(),
        updatedAt: note.updatedAt.toISOString()
      });

    } catch (error) {
      console.error('Get note error:', error);
      res.status(500).json({
        error: 'InternalError',
        message: 'Failed to get note'
      });
    }
  }
);

// Update note
app.post('/xrpc/com.yourapp.note.update',
  verifyServiceAuth,
  async (req, res) => {
    try {
      const { uri, title, content, tags } = req.body;
      const userDid = req.userDid;

      const noteId = parseNoteIdFromUri(uri);

      const updateData = { updatedAt: new Date() };
      if (title) updateData.title = title;
      if (content) updateData.content = content;
      if (tags !== undefined) updateData.tags = tags;

      const note = await db.notes.findOneAndUpdate(
        { id: noteId, userDid },
        updateData,
        { new: true }
      );

      if (!note) {
        return res.status(404).json({
          error: 'NoteNotFound',
          message: 'Note does not exist'
        });
      }

      res.json({
        uri,
        cid: generateCID(note),
        updatedAt: note.updatedAt.toISOString()
      });

    } catch (error) {
      console.error('Update note error:', error);
      res.status(500).json({
        error: 'InternalError',
        message: 'Failed to update note'
      });
    }
  }
);

// Delete note
app.post('/xrpc/com.yourapp.note.delete',
  verifyServiceAuth,
  async (req, res) => {
    try {
      const { uri } = req.body;
      const userDid = req.userDid;

      const noteId = parseNoteIdFromUri(uri);

      const result = await db.notes.deleteOne({
        id: noteId,
        userDid
      });

      if (result.deletedCount === 0) {
        return res.status(404).json({
          error: 'NoteNotFound',
          message: 'Note does not exist'
        });
      }

      res.json({ success: true });

    } catch (error) {
      console.error('Delete note error:', error);
      res.status(500).json({
        error: 'InternalError',
        message: 'Failed to delete note'
      });
    }
  }
);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Notes service running on port ${PORT}`);
});
```

#### Python / FastAPI Example

```python
from fastapi import FastAPI, Header, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List
import jwt
from datetime import datetime
import httpx

app = FastAPI()

# Service DID
SERVICE_DID = "did:web:notes.yourapp.com"

# Models
class CreateNoteInput(BaseModel):
    title: str
    content: str
    tags: Optional[List[str]] = []

class NoteView(BaseModel):
    uri: str
    cid: str
    title: str
    content: str
    tags: List[str]
    createdAt: str
    updatedAt: str

# DID Resolution
async def resolve_did(did: str):
    """Resolve DID to get DID document"""
    if did.startswith("did:web:"):
        domain = did.replace("did:web:", "")
        url = f"https://{domain}/.well-known/did.json"
        async with httpx.AsyncClient() as client:
            response = await client.get(url)
            return response.json()
    # Handle other DID methods (did:plc, etc.)
    # ...

# Authentication dependency
async def verify_service_auth(authorization: str = Header(None)) -> str:
    """Verify service authentication JWT and return user DID"""
    
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=401,
            detail={"error": "AuthenticationRequired", "message": "Bearer token required"}
        )
    
    token = authorization[7:]
    
    try:
        # Decode without verification to get claims
        unverified = jwt.decode(token, options={"verify_signature": False})
        
        user_did = unverified["iss"]
        audience = unverified["aud"]
        exp = unverified.get("exp")
        
        # Verify audience
        if audience != SERVICE_DID:
            raise HTTPException(
                status_code=403,
                detail={"error": "InvalidAudience"}
            )
        
        # Check expiration
        if exp and datetime.now().timestamp() >= exp:
            raise HTTPException(
                status_code=401,
                detail={"error": "ExpiredToken"}
            )
        
        # Resolve user's DID to get public key
        did_doc = await resolve_did(user_did)
        
        # Extract signing key
        signing_key = next(
            (vm for vm in did_doc.get("verificationMethod", [])
             if vm["id"] == f"{user_did}#atproto"),
            None
        )
        
        if not signing_key:
            raise HTTPException(
                status_code=401,
                detail={"error": "InvalidDID"}
            )
        
        # Verify signature (simplified - use proper key conversion)
        public_key = convert_multibase_to_pem(signing_key["publicKeyMultibase"])
        jwt.decode(
            token,
            public_key,
            algorithms=["ES256K"],
            audience=SERVICE_DID
        )
        
        return user_did
        
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=401,
            detail={"error": "ExpiredToken"}
        )
    except jwt.InvalidTokenError as e:
        raise HTTPException(
            status_code=401,
            detail={"error": "InvalidToken", "message": str(e)}
        )

# DID Document endpoint
@app.get("/.well-known/did.json")
async def get_did_document():
    return {
        "@context": ["https://www.w3.org/ns/did/v1"],
        "id": SERVICE_DID,
        "service": [{
            "id": "#atproto_notes",
            "type": "AtprotoNotesService",
            "serviceEndpoint": "https://notes.yourapp.com"
        }]
    }

# XRPC Endpoints
@app.post("/xrpc/com.yourapp.note.create")
async def create_note(
    input: CreateNoteInput,
    user_did: str = Depends(verify_service_auth)
):
    # Create note in database
    note = await db.notes.create({
        "user_did": user_did,
        "title": input.title,
        "content": input.content,
        "tags": input.tags,
        "created_at": datetime.now(),
        "updated_at": datetime.now()
    })
    
    uri = f"at://{user_did}/com.yourapp.note/{note.id}"
    
    return {
        "uri": uri,
        "cid": generate_cid(note),
        "createdAt": note.created_at.isoformat()
    }

@app.get("/xrpc/com.yourapp.note.list")
async def list_notes(
    limit: int = 50,
    cursor: Optional[str] = None,
    tag: Optional[str] = None,
    user_did: str = Depends(verify_service_auth)
):
    # Query notes from database
    query = {"user_did": user_did}
    if tag:
        query["tags"] = tag
    
    notes = await db.notes.find(query).limit(limit).to_list()
    
    return {
        "notes": [
            NoteView(
                uri=f"at://{user_did}/com.yourapp.note/{n.id}",
                cid=n.cid,
                title=n.title,
                content=n.content,
                tags=n.tags,
                createdAt=n.created_at.isoformat(),
                updatedAt=n.updated_at.isoformat()
            )
            for n in notes
        ],
        "cursor": notes[-1].id if notes else None
    }
```

### 3. Client Implementation

#### Web Client (TypeScript/React)

```typescript
import { OAuthClient } from '@atproto/oauth-client-browser';
import { BrowserOAuthDatabase } from '@atproto/oauth-client-browser';

// Service DID for your notes service
const NOTES_SERVICE_DID = 'did:web:notes.yourapp.com#atproto_notes';

// Initialize OAuth client
const oauthDb = new BrowserOAuthDatabase('notes-app');
const oauthClient = new OAuthClient({
  clientMetadata: {
    client_id: 'https://yourapp.com/client-metadata.json',
    application_type: 'web',
    grant_types: ['authorization_code', 'refresh_token'],
    redirect_uris: ['https://yourapp.com/oauth/callback'],
    scope: 'atproto transition:generic',
    token_endpoint_auth_method: 'none',
  },
  stateStore: oauthDb,
  sessionStore: oauthDb,
});

// Login function
export async function login(handle: string) {
  try {
    await oauthClient.authorize(handle, {
      scope: 'atproto transition:generic',
    });
  } catch (error) {
    console.error('Login failed:', error);
    throw error;
  }
}

// Get authenticated session
async function getSession(did: string) {
  return await oauthClient.restore(did);
}

// Make proxied request
async function makeProxiedRequest(
  session: any,
  method: string,
  nsid: string,
  data?: any
) {
  const url = `${session.pdsUrl}/xrpc/${nsid}`;
  
  const options: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.accessToken}`,
      'atproto-proxy': NOTES_SERVICE_DID,
    },
  };
  
  if (data) {
    options.body = JSON.stringify(data);
  }
  
  const response = await fetch(url, options);
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Request failed');
  }
  
  return response.json();
}

// API Functions

export async function createNote(
  session: any,
  title: string,
  content: string,
  tags?: string[]
) {
  return makeProxiedRequest(
    session,
    'POST',
    'com.yourapp.note.create',
    { title, content, tags }
  );
}

export async function listNotes(
  session: any,
  limit?: number,
  cursor?: string,
  tag?: string
) {
  const params = new URLSearchParams();
  if (limit) params.append('limit', limit.toString());
  if (cursor) params.append('cursor', cursor);
  if (tag) params.append('tag', tag);
  
  const url = `${session.pdsUrl}/xrpc/com.yourapp.note.list?${params}`;
  
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${session.accessToken}`,
      'atproto-proxy': NOTES_SERVICE_DID,
    },
  });
  
  return response.json();
}

export async function getNote(session: any, uri: string) {
  const params = new URLSearchParams({ uri });
  const url = `${session.pdsUrl}/xrpc/com.yourapp.note.get?${params}`;
  
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${session.accessToken}`,
      'atproto-proxy': NOTES_SERVICE_DID,
    },
  });
  
  return response.json();
}

export async function updateNote(
  session: any,
  uri: string,
  updates: {
    title?: string;
    content?: string;
    tags?: string[];
  }
) {
  return makeProxiedRequest(
    session,
    'POST',
    'com.yourapp.note.update',
    { uri, ...updates }
  );
}

export async function deleteNote(session: any, uri: string) {
  return makeProxiedRequest(
    session,
    'POST',
    'com.yourapp.note.delete',
    { uri }
  );
}

// React component example
function NotesApp() {
  const [session, setSession] = useState(null);
  const [notes, setNotes] = useState([]);

  useEffect(() => {
    // Try to restore session
    const did = localStorage.getItem('userDid');
    if (did) {
      getSession(did).then(setSession);
    }
  }, []);

  const handleLogin = async (handle: string) => {
    await login(handle);
    // After OAuth redirect, session will be available
  };

  const handleCreateNote = async (title: string, content: string) => {
    if (!session) return;
    
    const result = await createNote(session, title, content);
    console.log('Created note:', result);
    
    // Refresh notes list
    const notesList = await listNotes(session);
    setNotes(notesList.notes);
  };

  return (
    <div>
      {!session ? (
        <LoginForm onLogin={handleLogin} />
      ) : (
        <NotesInterface
          notes={notes}
          onCreate={handleCreateNote}
        />
      )}
    </div>
  );
}
```

#### Client Metadata Document

Publish at `https://yourapp.com/client-metadata.json`:

```json
{
  "client_id": "https://yourapp.com/client-metadata.json",
  "client_name": "Notes App",
  "client_uri": "https://yourapp.com",
  "logo_uri": "https://yourapp.com/logo.png",
  "tos_uri": "https://yourapp.com/terms",
  "policy_uri": "https://yourapp.com/privacy",
  "redirect_uris": [
    "https://yourapp.com/oauth/callback"
  ],
  "scope": "atproto transition:generic",
  "grant_types": [
    "authorization_code",
    "refresh_token"
  ],
  "response_types": [
    "code"
  ],
  "application_type": "web",
  "token_endpoint_auth_method": "none",
  "dpop_bound_access_tokens": true
}
```

**Documentation:**
- [OAuth Client Implementation](https://docs.bsky.app/docs/advanced-guides/oauth-client)
- [@atproto/oauth-client Documentation](https://www.npmjs.com/package/@atproto/oauth-client)

---

## Security Considerations

### 1. Service Authentication JWT Validation

**Critical Security Checks:**

- ✅ **Verify JWT signature** using user's public key from DID document
- ✅ **Validate audience** (`aud` claim must match your service DID)
- ✅ **Check expiration** (`exp` claim, typically 60 seconds)
- ✅ **Validate issuer** (`iss` claim contains valid user DID)
- ✅ **Method binding** (if `lxm` claim present, verify it matches endpoint)
- ✅ **Prevent replay attacks** (use `jti` nonce if implemented)

### 2. DID Resolution Security

**Considerations:**

- Cache DID documents but implement reasonable TTL
- Validate DID document structure
- Handle DID resolution failures gracefully
- Be aware of DID method security properties (did:web vs did:plc)
- Implement timeouts for DID resolution requests

### 3. Data Storage Security

**Best Practices:**

- Encrypt data at rest in your database
- Implement proper access controls (user can only access their own notes)
- Use secure connections (TLS) for all communications
- Implement rate limiting to prevent abuse
- Audit log access to sensitive operations
- Regular security audits and penetration testing

### 4. CORS and API Security

```javascript
// Example CORS configuration
app.use(cors({
  origin: function(origin, callback) {
    // Allow requests from any origin since PDSs can be anywhere
    callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'atproto-proxy',
    'atproto-accept-labelers'
  ]
}));
```

### 5. Rate Limiting

Implement rate limiting per user DID:

```javascript
const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each user to 100 requests per windowMs
  keyGenerator: (req) => req.userDid,
  handler: (req, res) => {
    res.status(429).json({
      error: 'RateLimitExceeded',
      message: 'Too many requests'
    });
  }
});

app.use('/xrpc/', limiter);
```

### 6. Input Validation

Always validate and sanitize inputs:

```javascript
const { body, query, validationResult } = require('express-validator');

app.post('/xrpc/com.yourapp.note.create',
  verifyServiceAuth,
  body('title').isString().trim().isLength({ min: 1, max: 300 }),
  body('content').isString().isLength({ min: 1, max: 100000 }),
  body('tags').optional().isArray().custom(tags => 
    tags.every(t => typeof t === 'string' && t.length <= 50)
  ),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'InvalidRequest',
        message: 'Validation failed',
        details: errors.array()
      });
    }
    next();
  },
  async (req, res) => {
    // Handler implementation
  }
);
```

**Documentation:**
- [Security Best Practices](https://atproto.com/specs/xrpc#security-considerations)

---

## Deployment Architecture

### Recommended Infrastructure

```
┌──────────────────────────────────────────────────────┐
│                   CDN / Edge Network                 │
│           (CloudFlare, Fastly, AWS CloudFront)       │
└────────────────────┬─────────────────────────────────┘
                     │
┌────────────────────▼─────────────────────────────────┐
│                 Load Balancer                        │
│           (AWS ALB, NGINX, HAProxy)                  │
└────────────────────┬─────────────────────────────────┘
                     │
      ┌──────────────┼──────────────┐
      │              │              │
┌─────▼─────┐  ┌────▼──────┐  ┌───▼──────┐
│  Notes    │  │  Notes    │  │  Notes   │
│  Service  │  │  Service  │  │  Service │
│  Instance │  │  Instance │  │  Instance│
└─────┬─────┘  └────┬──────┘  └───┬──────┘
      │             │              │
      └─────────────┼──────────────┘
                    │
         ┌──────────▼───────────┐
         │   Database Cluster   │
         │  (PostgreSQL/MongoDB) │
         └──────────────────────┘
         
         ┌──────────────────────┐
         │   Cache Layer        │
         │  (Redis/Memcached)   │
         └──────────────────────┘
```

### Component Deployment

#### 1. Application Servers

**Containerized Deployment (Docker/Kubernetes):**

```dockerfile
# Dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --production

COPY . .

EXPOSE 3000

CMD ["node", "server.js"]
```

**Kubernetes Deployment:**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: notes-service
spec:
  replicas: 3
  selector:
    matchLabels:
      app: notes-service
  template:
    metadata:
      labels:
        app: notes-service
    spec:
      containers:
      - name: notes-service
        image: yourapp/notes-service:latest
        ports:
        - containerPort: 3000
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: notes-secrets
              key: database-url
        - name: SERVICE_DID
          value: "did:web:notes.yourapp.com"
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /ready
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5
---
apiVersion: v1
kind: Service
metadata:
  name: notes-service
spec:
  selector:
    app: notes-service
  ports:
  - port: 80
    targetPort: 3000
  type: LoadBalancer
```

#### 2. Database

**PostgreSQL Schema:**

```sql
CREATE TABLE notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_did TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  tags TEXT[] DEFAULT '{}',
  cid TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  
  -- Indexes
  INDEX idx_user_did (user_did),
  INDEX idx_created_at (created_at DESC),
  INDEX idx_tags (tags) USING GIN
);

-- Full text search index
CREATE INDEX idx_notes_fts ON notes 
  USING GIN (to_tsvector('english', title || ' ' || content));
```

#### 3. Caching Strategy

```javascript
const Redis = require('ioredis');
const redis = new Redis(process.env.REDIS_URL);

// Cache DID documents
async function getCachedDidDocument(did) {
  const cached = await redis.get(`did:${did}`);
  if (cached) {
    return JSON.parse(cached);
  }
  
  const didDoc = await resolveDid(did);
  await redis.setex(`did:${did}`, 3600, JSON.stringify(didDoc)); // 1 hour TTL
  
  return didDoc;
}
```

### Scaling Considerations

**Horizontal Scaling:**
- Run multiple instances behind load balancer
- Stateless application design (no local state)
- Use shared cache (Redis) for DID document caching
- Database connection pooling

**Performance Optimization:**
- Cache DID documents aggressively (they rarely change)
- Use database indexes on user_did and created_at
- Implement pagination for list operations
- Consider read replicas for database

**Monitoring:**
- Application metrics (request rate, error rate, latency)
- JWT verification metrics
- Database performance metrics
- DID resolution success/failure rates

---

## Future Migration Path

### When Native Private Data Support Arrives

The atproto team is working on native protocol support for private data. When this becomes available, you'll want to migrate users from your centralized service to the native protocol features.

### Migration Strategy

1. **Dual-Write Period:**
   - Continue writing to your centralized service
   - Also write to new protocol-native private storage
   - Allows rollback if issues arise

2. **Data Migration:**
   - Batch migrate existing notes to protocol-native storage
   - Verify data integrity after migration
   - Maintain mapping between old and new URIs

3. **Read Transition:**
   - Update client to read from protocol-native storage
   - Fall back to centralized service for unmigrated data
   - Monitor migration progress

4. **Sunset Centralized Service:**
   - After full migration, deprecate old API endpoints
   - Maintain read-only access for grace period
   - Eventually decommission centralized service

### Preparing for Migration

**Design Considerations:**

- Use AT URIs that can transition (e.g., `at://{did}/com.yourapp.note/{id}`)
- Keep data structures compatible with atproto record schemas
- Don't create dependencies on centralized-only features
- Document your data model thoroughly

**Stay Informed:**

Monitor atproto developments:
- [AT Protocol GitHub Discussions](https://github.com/bluesky-social/atproto/discussions)
- [Bluesky Blog](https://docs.bsky.app/blog)
- [atproto Specification Updates](https://atproto.com/specs)

---

## References

### AT Protocol Core Documentation

- **Protocol Overview**: https://atproto.com/guides/overview
- **HTTP API (XRPC) Specification**: https://atproto.com/specs/xrpc
- **Lexicon Schema System**: https://atproto.com/guides/lexicon
- **Lexicon Specification**: https://atproto.com/specs/lexicon
- **Identity (DID) Specification**: https://atproto.com/specs/did
- **OAuth for AT Protocol**: https://atproto.com/specs/oauth

### Implementation Guides

- **Application Quick Start**: https://atproto.com/guides/applications
- **OAuth Client Implementation**: https://docs.bsky.app/docs/advanced-guides/oauth-client
- **API Hosts and Auth**: https://docs.bsky.app/docs/advanced-guides/api-directory
- **HTTP Reference**: https://docs.bsky.app/docs/category/http-reference

### Key GitHub Discussions

- **Private Data in Public Repos**: https://github.com/bluesky-social/atproto/discussions/3049
- **Service Auth Token Security**: https://github.com/bluesky-social/atproto/discussions/2687
- **Private Service Proxying**: https://github.com/bluesky-social/atproto/discussions/2333

### SDK and Libraries

- **TypeScript OAuth Client**: https://www.npmjs.com/package/@atproto/oauth-client
- **Browser OAuth Client**: https://www.npmjs.com/package/@atproto/oauth-client-browser
- **Node OAuth Client**: https://www.npmjs.com/package/@atproto/oauth-client-node
- **Python SDK**: https://atproto.blue/

### Blog Posts and Updates

- **OAuth for AT Protocol Release**: https://docs.bsky.app/blog/oauth-atproto
- **OAuth Improvements**: https://docs.bsky.app/blog/oauth-improvements
- **Bluesky Blog**: https://docs.bsky.app/blog

### Standards and Specifications

- **DID Web Method**: https://w3c-ccg.github.io/did-method-web/
- **OAuth 2.1 (Draft)**: https://datatracker.ietf.org/doc/html/draft-ietf-oauth-v2-1
- **PKCE (RFC 7636)**: https://datatracker.ietf.org/doc/html/rfc7636
- **DPoP (Draft)**: https://datatracker.ietf.org/doc/html/draft-ietf-oauth-dpop

### Community Resources

- **AT Protocol GitHub**: https://github.com/bluesky-social/atproto
- **Bluesky Discord**: https://discord.gg/bluesky
- **AT Protocol Discussions**: https://github.com/bluesky-social/atproto/discussions

---

## Appendix: Complete Example Project Structure

```
notes-app/
├── backend/
│   ├── src/
│   │   ├── auth/
│   │   │   ├── verify-jwt.ts
│   │   │   └── did-resolver.ts
│   │   ├── api/
│   │   │   ├── notes.ts
│   │   │   └── did-document.ts
│   │   ├── db/
│   │   │   ├── models.ts
│   │   │   └── connection.ts
│   │   ├── utils/
│   │   │   ├── cid.ts
│   │   │   └── uri.ts
│   │   └── server.ts
│   ├── lexicons/
│   │   └── com/
│   │       └── yourapp/
│   │           └── note/
│   │               ├── create.json
│   │               ├── list.json
│   │               ├── get.json
│   │               ├── update.json
│   │               └── delete.json
│   ├── .well-known/
│   │   └── did.json
│   ├── package.json
│   ├── tsconfig.json
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── auth/
│   │   │   └── oauth.ts
│   │   ├── api/
│   │   │   └── notes.ts
│   │   ├── components/
│   │   │   ├── LoginForm.tsx
│   │   │   ├── NoteList.tsx
│   │   │   ├── NoteEditor.tsx
│   │   │   └── NoteView.tsx
│   │   ├── App.tsx
│   │   └── index.tsx
│   ├── public/
│   │   ├── client-metadata.json
│   │   └── index.html
│   ├── package.json
│   └── tsconfig.json
├── infrastructure/
│   ├── kubernetes/
│   │   ├── deployment.yaml
│   │   ├── service.yaml
│   │   └── ingress.yaml
│   └── terraform/
│       ├── main.tf
│       ├── database.tf
│       └── variables.tf
└── README.md
```

---

## Conclusion

This architecture provides a practical path to building private data applications on AT Protocol today, while maintaining compatibility with the protocol's identity system and preparing for future native private data support. By following this pattern, you can:

- Leverage atproto's decentralized identity
- Provide secure private data storage
- Maintain user ownership and portability
- Position yourself for seamless migration when protocol-level private data support arrives

The approach mirrors Bluesky's successful implementation of their chat/DM system and follows best practices recommended by the atproto team.

For questions and support, engage with the community through GitHub Discussions and the Bluesky Discord server.
