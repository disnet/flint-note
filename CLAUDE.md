# Flint UI Project

## Project Overview

This is a Svelte-based electron UI application for Flint (a note taking app).

## Development Commands

- `npm run build` - Build for production
- `npm run lint` - Run linter
- `npm run typecheck` - Run TypeScript type checking
- `npm run check` - Run all checks
- `npm run dev` - Start development server -- avoid running using because you can't see the server

## Coding guidlines

- use modern svelte 5 syntax
  - `$state`, `$props`, `$derived`, `$derived.by`
  - use `onclick` etc. -- avoid `on:click`
  - events should be via props -- do not use `createEventDispatcher`
