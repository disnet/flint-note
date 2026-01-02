# Markdown Best Practices

A guide to writing clean, readable markdown that works everywhere.

## Headings

Use headings to create structure:

```markdown
# H1 - Document Title (one per file)

## H2 - Major Sections

### H3 - Subsections
```

**Tip**: Don't skip levels. Go from H2 to H3, not H2 to H4.

## Lists

### Unordered Lists

- Use `-` or `*` consistently
- Indent with 2 spaces for nested items
  - Like this nested item

### Ordered Lists

1. Numbers auto-increment
2. So you can use `1.` for all items
3. Makes reordering easier

### Task Lists

- [x] Completed task
- [ ] Pending task
- [ ] Another pending task

## Emphasis

- **Bold** for strong emphasis: `**text**`
- _Italic_ for subtle emphasis: `*text*`
- ~~Strikethrough~~ for removed content: `~~text~~`
- `Code` for technical terms: `` `code` ``

## Links

### External Links

`[Link text](https://example.com)`

### Wikilinks (Flint-specific)

`[[Note Name]]` - Links to another note

## Code Blocks

Use fenced code blocks with language hints:

```javascript
function greet(name) {
  return `Hello, ${name}!`;
}
```

## Tables

| Column 1 | Column 2 | Column 3 |
| -------- | -------- | -------- |
| Data     | Data     | Data     |
| More     | More     | More     |

## Best Practices Summary

1. One sentence per line (better diffs)
2. Use reference links for repeated URLs
3. Add alt text to images
4. Preview before publishing

See [[Getting Started]] for Flint-specific markdown features.
