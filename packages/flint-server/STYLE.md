# Flint Note Style Guide

## Code Style Principles

### Private Members
- **Use JavaScript private fields (`#private`) instead of TypeScript `private` keyword**
- This provides true runtime privacy and aligns with modern JavaScript standards
- Example:
  ```typescript
  class Example {
    #privateField: string;  // ✅ Preferred
    private oldStyle: string;  // ❌ Avoid
  }
  ```

### General Guidelines
- Use single quotes for strings
- Include semicolons
- Prefer `const` over `let` when possible
- No unused variables (prefix with `_` if intentionally unused)
- prefer empty catch bindings when unused (`catch {}` vs `catch (error) {}`)

### Linting
- ESLint configured with modern flat config
- All errors must be fixed before committing
- Warnings are acceptable for intentional `any` usage in dynamic parsing
