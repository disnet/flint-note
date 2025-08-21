# Sidebar Animation Improvements

## Current Issues

The sidebar show/hide animations currently have several problems that create a janky user experience:

1. **Asymmetric animation behavior** - Hide transitions work (width 300px → 0), but show feels instant since content appears immediately at target width
2. **Layout reflow jank** - Width changes cause the entire flexbox layout to recompute and reflow other elements
3. **Slow timing** - 0.3s feels sluggish for modern UI standards
4. **Content visibility during transition** - Content can be partially cut off during width animation

### Current Implementation

**Files affected:**

- `src/renderer/src/components/LeftSidebar.svelte:34`
- `src/renderer/src/components/RightSidebar.svelte:59`

**Current CSS approach:**

```css
.sidebar {
  transition: width 0.3s ease;
  width: 300px; /* or 450px for right sidebar */
}
.sidebar:not(.visible) {
  width: 0;
  min-width: 0;
}
```

## Alternative Animation Approaches

### Option 1: Transform-Based (Recommended)

**Approach:** Keep fixed width, use `transform: translateX()` to slide sidebars

**Pros:**

- No layout reflow - transforms are composited separately
- Smooth bidirectional animation
- Better performance (GPU-accelerated)
- Content doesn't get cut off during animation
- Easy to add easing curves

**Cons:**

- Sidebars still take up layout space when hidden (need `pointer-events: none`)
- May need to adjust main content margin/padding

**Implementation:**

```css
.left-sidebar {
  width: 300px;
  transform: translateX(0);
  transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}
.left-sidebar:not(.visible) {
  transform: translateX(-100%);
  pointer-events: none;
}

.right-sidebar {
  width: 450px;
  transform: translateX(0);
  transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}
.right-sidebar:not(.visible) {
  transform: translateX(100%);
  pointer-events: none;
}
```

### Option 2: CSS Grid with Column Transitions

**Approach:** Use CSS Grid `grid-template-columns` with fr units

**Pros:**

- Clean declarative approach
- Automatic content reflow
- Better semantic layout
- Can animate between different sidebar configurations

**Cons:**

- Limited browser support for animating grid properties
- Still causes layout reflow
- More complex to implement with current flexbox structure

### Option 3: Slide + Fade Combination

**Approach:** Combine transform with opacity for polished feel

**Pros:**

- Very smooth visual transition
- Feels premium/polished
- Good for both show/hide directions
- Can stagger content fade vs container slide

**Cons:**

- More complex animation choreography
- May need to coordinate multiple elements

**Implementation:**

```css
.sidebar {
  transform: translateX(0);
  opacity: 1;
  transition:
    transform 0.2s ease-out,
    opacity 0.15s ease-out;
}
.sidebar:not(.visible) {
  transform: translateX(-100%); /* or 100% for right sidebar */
  opacity: 0;
  transition:
    transform 0.2s ease-in,
    opacity 0.1s ease-in;
}
```

### Option 4: Container Query Approach

**Approach:** Use modern CSS container queries for responsive animations

**Pros:**

- Future-forward approach
- Self-contained responsive behavior
- Can optimize animations based on container size

**Cons:**

- Cutting-edge browser support required
- Overkill for this use case
- Added complexity

### Option 5: Off-Canvas with Overlay

**Approach:** Position sidebars absolutely with backdrop overlay

**Pros:**

- No layout impact on main content
- Mobile-friendly pattern
- Can add backdrop blur/dim effects

**Cons:**

- Changes current layout paradigm significantly
- May not fit desktop application feel
- More complex z-index management

## Recommended Implementation Plan

### Primary Recommendation: Transform-Based Animation (Option 1)

This approach will fix all current issues with minimal layout changes.

#### Phase 1: CSS Updates

1. **Update sidebar CSS transitions**
   - Change from `width` to `transform` transitions
   - Set faster timing (0.2s vs 0.3s)
   - Use better easing curve: `cubic-bezier(0.4, 0, 0.2, 1)`

2. **Modify visibility logic**
   - Keep fixed width always
   - Use `translateX()` for positioning
   - Add `pointer-events: none` when hidden

#### Phase 2: Layout Adjustments

3. **Adjust main content positioning**
   - May need negative margins or padding adjustments
   - Ensure no overlap with hidden but positioned sidebars

4. **Update container overflow handling**
   - Ensure parent containers clip sidebar overflows appropriately

#### Phase 3: Enhanced Polish (Optional)

5. **Add content fade-in effects**
   - Stagger sidebar content appearance slightly after slide
   - Use CSS animation delays for smooth content reveal

### Alternative: Slide + Fade Combination (Option 3)

For a more premium feel with coordinated slide and fade effects.

#### Phase 1: Dual Animation Setup

1. **Create coordinated transform + opacity transitions**
   - Different timing for slide vs fade
   - Different easing curves for in vs out

2. **Content choreography**
   - Fade out content before slide out
   - Slide in container before fading in content

#### Phase 2: Timing Optimization

3. **Fine-tune animation timing**
   - Slide: 200ms, Fade: 150ms
   - Stagger effects by 50ms
   - Different curves for show vs hide

## Technical Implementation Details

### Files to Modify

- `src/renderer/src/components/LeftSidebar.svelte` (lines 28-45)
- `src/renderer/src/components/RightSidebar.svelte` (lines 52-70)
- `src/renderer/src/App.svelte` (lines 948-952 - main layout)

### CSS Changes Needed

- Replace width transitions with transform transitions
- Add pointer-events management
- Update timing and easing functions
- Possibly adjust layout overflow handling

### Testing Considerations

- Verify no content overflow during animations
- Test performance with multiple rapid toggles
- Ensure accessibility (reduced motion preferences)
- Test on different screen sizes

### Performance Benefits

The transform-based approach will provide:

- **60fps animations** (GPU composited)
- **No layout thrashing** (main content stays stable)
- **Consistent timing** (bidirectional animations)
- **Modern feel** (faster, smoother transitions)

## Next Steps

1. Choose preferred animation approach
2. Implement CSS changes in sidebar components
3. Test across different screen sizes and usage patterns
4. Fine-tune timing and easing curves
5. Add accessibility considerations (prefers-reduced-motion)
