# Contributing to Flint

Thank you for your interest in contributing to Flint! We welcome contributions from the community and are grateful for any help you can provide.

## Philosophy

Flint is built around the principle that AI should assist human thinking, not replace it. When contributing, keep these core values in mind:

- **Agent Assistance, Not Replacement** - AI helps with structural tasks while humans remain responsible for thinking
- **Frictionless Capture** - No barriers to writing things down
- **Plain Text First** - Data portability and user control
- **Local-First** - Privacy and ownership
- **Open Source** - No vendor lock-in, community-driven development

Read [docs/FLINT-OVERVIEW.md](docs/FLINT-OVERVIEW.md) for a deeper understanding of Flint's philosophy.

## Ways to Contribute

### 🐛 Report Bugs

Found a bug? Please report it on GitHub Issues with:

- Clear description of the problem
- Steps to reproduce
- Expected vs actual behavior
- Your environment (OS, Flint version)
- Screenshots if applicable

### 💡 Suggest Features

Have an idea? We'd love to hear it! Open a GitHub Discussion or Issue with:

- Clear description of the feature
- Use cases and examples
- How it aligns with Flint's philosophy
- Any implementation ideas (optional)

### 📝 Improve Documentation

Documentation improvements are always welcome:

- Fix typos or unclear explanations
- Add examples or clarifications
- Write guides or tutorials
- Improve code comments

### 🔧 Code Contributions

Ready to contribute code? Great! See the sections below for guidelines.

## Getting Started for Developers

### Prerequisites

- Node.js 20 or later
- npm
- Git

### Setup

1. Fork the repository on GitHub
2. Clone your fork locally:
   ```bash
   git clone https://github.com/YOUR-USERNAME/flint.git
   cd flint
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Create a feature branch:
   ```bash
   git checkout -b feature/your-feature-name
   ```

### Development Workflow

1. Make your changes following our coding guidelines (see below)
2. Test your changes thoroughly:
   ```bash
   npm run test
   npm run dev  # Manual testing
   ```
3. Run formatting and checks:
   ```bash
   npm run format
   npm run check
   ```
4. Commit your changes with clear messages
5. Push to your fork
6. Open a pull request

## Coding Guidelines

### Modern Svelte 5 Syntax

- Use runes: `$state`, `$props`, `$derived`, `$derived.by`
- Use `onclick` etc. instead of `on:click`
- Events should be via props - do not use `createEventDispatcher`
- When creating new TypeScript files in the renderer, prefer `.svelte.ts` files so they can use runes

### TypeScript Standards

- **Avoid `any` type** - Use proper typing whenever possible
- Prefer explicit types over inference for function parameters
- Use TypeScript strict mode

### Code Style

- Run `npm run format` before committing - this uses Prettier
- Follow existing code patterns and structure
- Use clear, descriptive variable and function names
- Add comments for complex logic, not obvious code

### File Organization

- When creating summaries of work, put them in the `docs/` directory
- Tests go in `tests/` directory, mirroring the `src/` structure
- Keep components small and focused

## Testing

### Test Organization

- Tests are located in `tests/` directory
- Test files follow naming convention: `*.test.ts` or `*.spec.ts`
- Structure mirrors source code: `tests/server/api/`, `tests/server/core/`, etc.

### Writing Tests

- Use Vitest framework
- Global test functions available: `describe`, `it`, `expect`, `beforeEach`, `afterEach`
- Create isolated test environments with temporary directories and databases
- Use `TestApiSetup` class for integration tests

### Running Tests

```bash
npm run test          # Interactive watch mode
npm run test:run      # Single run with coverage
```

### Test Quality

- Test files have relaxed ESLint rules for flexibility
- Write tests for new features and bug fixes
- Aim for meaningful coverage, not just high percentages

## Important Technical Notes

### Svelte + Electron IPC

**CRITICAL:** Always use `$state.snapshot()` when sending Svelte reactive objects through IPC

```typescript
// ❌ WRONG - Direct state serialization fails
await window.api?.saveData(this.reactiveState);

// ✅ CORRECT - Use $state.snapshot for IPC
const serializable = $state.snapshot(this.reactiveState);
await window.api?.saveData(serializable);
```

### Backward Compatibility

- Use the migration system for breaking database changes (see `src/server/database/migration-manager.ts`)
- Don't break existing workflows without migration paths

## Pull Request Process

1. **Before submitting:**
   - Run `npm run format` to format code
   - Run `npm run check` to validate (lint + typecheck)
   - Run `npm run test:run` to ensure tests pass
   - Test manually if UI changes are involved

2. **Pull request description should include:**
   - What problem does this solve?
   - How does it work?
   - Any breaking changes?
   - Screenshots for UI changes
   - Testing performed

3. **Review process:**
   - Maintainers will review your PR
   - Address feedback and update as needed
   - Once approved, your PR will be merged

## Project Structure

```
flint-note/
├── src/
│   ├── main/                   # Electron main process
│   ├── preload/                # Electron preload scripts
│   ├── renderer/               # Svelte UI application
│   └── server/                 # Integrated note server
├── docs/                       # Internal project documentation
├── docs-src/                   # VitePress documentation source
├── website/                    # Static website
├── tests/                      # Vitest test suite
└── build/                      # Build configuration
```

### Documentation Structure

- `docs/` - Internal project documentation
- `docs-src/` - VitePress documentation source (user-facing)
- `website/` - Static website (deployed to Cloudflare Pages)

To build documentation:

```bash
npm run docs:dev      # Development server
npm run docs:build    # Build documentation
```

## Style Guide

### Commit Messages

- Use clear, descriptive commit messages
- Start with a verb (Add, Fix, Update, Remove, etc.)
- Reference issue numbers when applicable

Examples:

```
Add spaced repetition review system
Fix wikilink parsing for special characters
Update documentation for custom functions
Remove deprecated API endpoints (#123)
```

### Code Comments

- Explain **why**, not **what**
- Add JSDoc comments for public APIs
- Use TODO comments sparingly and link to issues when possible

## Getting Help

- **Questions?** Ask in GitHub Discussions
- **Stuck?** Join our Discord community
- **Found an issue?** Report it on GitHub Issues

## Code of Conduct

We are committed to providing a welcoming and inclusive environment. Please be respectful and considerate in all interactions.

Expected behavior:

- Be respectful and constructive
- Focus on what's best for the project and community
- Show empathy towards others
- Accept constructive criticism gracefully

Unacceptable behavior:

- Harassment or discrimination
- Trolling or inflammatory comments
- Personal attacks
- Publishing others' private information

## License

By contributing to Flint, you agree that your contributions will be licensed under the GNU General Public License v3.0.

---

**Thank you for contributing to Flint!** Your efforts help build better tools for people who think deeply.
