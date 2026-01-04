<p align="center">
<img style="align:center;" src="./resources/icon.png" alt="Flint Logo" width="100" />
</p>
<h1 align="center">Flint</h1>
<h4 align="center">Ignite Deep Knowledge</h4>

Flint is a note-taking app that helps you capture ideas, connect them together, and make them part of how you think.

<div align="center">
  <a href="https://flintnote.com@#download">Download</a> | <a href="https://discord.gg/GbpYCfzE3y">Community</a>
</div>

![Flint Screenshot](./website/main-light.png)

## Status

Flint is currently in **beta**. Expect some bugs and unfinished polish as development continues. We welcome feedback and contributions!

## The Deep Knowledge Cycle

**Flint aim is to build deep knowledge by supporting the complete learning cycle of externalizing (getting ideas out), internalizing (making them yours), and resurfacing (bringing them back repeatedly over time to ground memory).**

Most tools optimize for one part of this cycle. Flint optimizes for the entire process.

### 1. Externalize

Getting ideas out of your head without barriers. The system handles organization so you can focus on thinking.

### 2. Internalize

Making ideas yours through connection and reflection. This is where notes become knowledge.

### 3. Resurface

Active recall brings past ideas back at optimal intervals, grounding them in memory.

## Core Principles

- **Notes as thinking units** - Think in ideas and connections, not files and folders
- **Agent assistance, not replacement** - AI helps with structural tasks while you think
- **Frictionless capture** - No barriers to writing things down
- **Plain text first** - Markdown files you own, no proprietary formats
- **Local-first** - Your data stays on your machine
- **Open source** - No vendor lock-in, community-driven development

Read [docs/FLINT-OVERVIEW.md](docs/FLINT-OVERVIEW.md) for a deeper understanding of Flint's philosophy.

## Quick start

Flint is built with Electron, Svelte 5, and TypeScript.

## Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Run linter and TypeScript checks
npm run check

# Run tests
npm run test:run
```

## Command Line Arguments

Flint supports command line arguments for automation and scripting:

```bash
# Open a specific vault by name
flint --vault "My Notes"
flint -v "My Notes"

# Open a vault by ID
flint --vault-id vault-abc12345

# Import a directory of markdown files as a new vault
flint --import /path/to/markdown/folder
flint -i /path/to/folder

# Import with a custom vault name
flint --import /path/to/folder --vault-name "Custom Name"
flint -i /path/to/folder -n "Custom Name"
```

## Documentation

- **[Getting Started](docs/GETTING-STARTED.md)** - Step-by-step setup guide
- **[Flint Overview](docs/FLINT-OVERVIEW.md)** - Philosophy and core beliefs
- **[Core Concepts](docs/architecture/CORE-CONCEPTS.md)** - Fundamental concepts
- **[Architecture](docs/architecture/ARCHITECTURE.md)** - System architecture
- **[Design](docs/architecture/DESIGN.md)** - UI design and components

## Contributing

Flint is open source and welcomes contributions! Whether you want to fix bugs, add features, or improve documentation, we'd love your help.

See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed guidelines.

## License

Flint is licensed under the [GNU General Public License v3.0](LICENSE).

## Community & Support

- **GitHub** - [github.com/disnet/flint-note](https://github.com/disnet/flint-note)
- **Website** - [flintnote.com](https://flintnote.com)
- **Web App** - [app.flintnote.com](https://app.flintnote.com)
- **Discord** - [Join the community](https://discord.gg/GbpYCfzE3y)
- **Issues** - Report bugs and request features on [GitHub Issues](https://github.com/disnet/flint-note/issues)
- **Discussions** - Ask questions and share ideas on [GitHub Discussions](https://github.com/disnet/flint-note/discussions)
