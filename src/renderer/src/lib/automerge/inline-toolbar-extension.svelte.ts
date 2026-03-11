/**
 * Inline Floating Toolbar extension for CodeMirror 6 (mobile)
 *
 * Renders a compact toolbar on the line below the cursor that expands
 * into inline style buttons when the Aa button is tapped.
 *
 * Compact mode: [+] [Aa] — positioned centered under cursor
 * + button: opens the existing vertical InsertMenu via callback
 * Expanded Aa: inline style buttons (bold, italic, strikethrough, code, link, wikilink)
 */
import { EditorView } from '@codemirror/view';
import { StateField, StateEffect, type Extension } from '@codemirror/state';
import { showTooltip, type Tooltip } from '@codemirror/view';
import { toggleFormat } from './keyboard-shortcuts-extension.svelte';
import { startCompletion } from '@codemirror/autocomplete';
import { Transaction } from '@codemirror/state';
import type { GutterMenuHandler } from './gutter-plus-button.svelte';

type ToolbarMode = 'compact' | 'styles';

const setToolbarMode = StateEffect.define<ToolbarMode>();
const hideToolbar = StateEffect.define<null>();

/**
 * State field tracking toolbar mode
 */
const toolbarModeField = StateField.define<ToolbarMode>({
  create: () => 'compact',
  update(value, tr) {
    for (const e of tr.effects) {
      if (e.is(setToolbarMode)) return e.value;
      if (e.is(hideToolbar)) return 'compact';
    }
    // Reset to compact on doc changes (typing)
    if (tr.docChanged) return 'compact';
    return value;
  }
});

/**
 * Create an SVG element with the given attributes and children
 */
function createSvg(width: number, height: number, children: SVGElement[]): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  for (const child of children) {
    svg.appendChild(child);
  }
  return svg;
}

function createSvgLine(x1: number, y1: number, x2: number, y2: number): SVGLineElement {
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  line.setAttribute('x1', String(x1));
  line.setAttribute('y1', String(y1));
  line.setAttribute('x2', String(x2));
  line.setAttribute('y2', String(y2));
  return line;
}

function createSvgPolyline(points: string): SVGPolylineElement {
  const pl = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  pl.setAttribute('points', points);
  return pl;
}

function createSvgPath(d: string): SVGPathElement {
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', d);
  return path;
}

/**
 * Create a toolbar button with text content
 */
function createTextButton(
  label: string,
  textContent: string,
  className: string,
  onPointerDown: (e: PointerEvent) => void
): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.className = `inline-toolbar-btn ${className}`;
  btn.setAttribute('aria-label', label);
  btn.title = label;
  btn.textContent = textContent;
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    onPointerDown(e);
  });
  btn.addEventListener('mousedown', (e) => e.preventDefault());
  return btn;
}

/**
 * Create a toolbar button with styled text (bold/italic/strikethrough)
 */
function createStyledTextButton(
  label: string,
  text: string,
  textStyle: string,
  className: string,
  onPointerDown: (e: PointerEvent) => void
): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.className = `inline-toolbar-btn ${className}`;
  btn.setAttribute('aria-label', label);
  btn.title = label;
  const span = document.createElement('span');
  span.textContent = text;
  span.style.cssText = textStyle;
  btn.appendChild(span);
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    onPointerDown(e);
  });
  btn.addEventListener('mousedown', (e) => e.preventDefault());
  return btn;
}

/**
 * Create a toolbar button with an SVG icon
 */
function createIconButton(
  label: string,
  svgElement: SVGSVGElement,
  className: string,
  onPointerDown: (e: PointerEvent) => void
): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.className = `inline-toolbar-btn ${className}`;
  btn.setAttribute('aria-label', label);
  btn.title = label;
  btn.appendChild(svgElement);
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    onPointerDown(e);
  });
  btn.addEventListener('mousedown', (e) => e.preventDefault());
  return btn;
}

function createSeparator(): HTMLDivElement {
  const sep = document.createElement('div');
  sep.className = 'inline-toolbar-sep';
  return sep;
}

/**
 * Build the compact toolbar: [+] [Aa]
 */
function buildCompactToolbar(
  container: HTMLElement,
  view: EditorView,
  onInsertMenu?: GutterMenuHandler
): void {
  container.textContent = '';
  container.classList.remove('expanded');
  container.classList.add('cm-inline-toolbar', 'compact');

  // + button — opens the vertical InsertMenu via callback
  const plusSvg = createSvg(18, 18, [
    createSvgLine(12, 5, 12, 19),
    createSvgLine(5, 12, 19, 12)
  ]);
  plusSvg.setAttribute('stroke-width', '2.5');
  const plusBtn = createIconButton('Insert block', plusSvg, 'plus-btn', () => {
    if (onInsertMenu) {
      const pos = view.state.selection.main.head;
      const coords = view.coordsAtPos(pos);
      if (coords) {
        onInsertMenu({
          x: coords.left,
          y: coords.bottom + 4,
          linePos: view.state.doc.lineAt(pos).from
        });
      }
    }
  });

  // [[ button — insert wikilink and trigger autocomplete
  const wikilinkBtn = createTextButton('Wikilink', '[[', 'style-btn mono', () => {
    const pos = view.state.selection.main.head;
    view.dispatch({
      changes: { from: pos, to: pos, insert: '[[' },
      selection: { anchor: pos + 2 },
      annotations: Transaction.userEvent.of('input')
    });
    startCompletion(view);
  });

  // Aa button (inline styles)
  const styleBtn = createTextButton('Style', 'Aa', 'style-btn', () => {
    view.dispatch({ effects: setToolbarMode.of('styles') });
  });

  container.appendChild(plusBtn);
  container.appendChild(styleBtn);
  container.appendChild(wikilinkBtn);
}

/**
 * Create a back chevron SVG
 */
function createBackChevron(): SVGSVGElement {
  const svg = createSvg(16, 16, [createSvgPolyline('15 18 9 12 15 6')]);
  return svg;
}

/**
 * Build the expanded styles menu
 */
function buildStylesToolbar(container: HTMLElement, view: EditorView): void {
  container.textContent = '';
  container.classList.remove('compact');
  container.classList.add('cm-inline-toolbar', 'expanded');

  // Back button
  const backBtn = createIconButton('Back', createBackChevron(), 'back-btn', () => {
    view.dispatch({ effects: setToolbarMode.of('compact') });
  });
  container.appendChild(backBtn);
  container.appendChild(createSeparator());

  // Bold
  container.appendChild(
    createStyledTextButton('Bold', 'B', 'font-weight:700', 'format-btn', () => {
      toggleFormat(view, '**', '**');
      view.dispatch({ effects: setToolbarMode.of('compact') });
    })
  );

  // Italic
  container.appendChild(
    createStyledTextButton('Italic', 'I', 'font-style:italic', 'format-btn', () => {
      toggleFormat(view, '*', '*');
      view.dispatch({ effects: setToolbarMode.of('compact') });
    })
  );

  // Strikethrough
  container.appendChild(
    createStyledTextButton(
      'Strikethrough',
      'S',
      'text-decoration:line-through',
      'format-btn',
      () => {
        toggleFormat(view, '~~', '~~');
        view.dispatch({ effects: setToolbarMode.of('compact') });
      }
    )
  );

  // Code
  const codeSvg = createSvg(16, 16, [
    createSvgPolyline('16 18 22 12 16 6'),
    createSvgPolyline('8 6 2 12 8 18')
  ]);
  container.appendChild(
    createIconButton('Code', codeSvg, 'format-btn', () => {
      toggleFormat(view, '`', '`');
      view.dispatch({ effects: setToolbarMode.of('compact') });
    })
  );

  // Wikilink [[
  container.appendChild(
    createTextButton('Wikilink', '[[', 'format-btn mono', () => {
      const pos = view.state.selection.main.head;
      view.dispatch({
        changes: { from: pos, to: pos, insert: '[[' },
        selection: { anchor: pos + 2 },
        annotations: Transaction.userEvent.of('input')
      });
      startCompletion(view);
      view.dispatch({ effects: setToolbarMode.of('compact') });
    })
  );

  // Markdown link
  const linkSvg = createSvg(16, 16, [
    createSvgPath('M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71'),
    createSvgPath('M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71')
  ]);
  container.appendChild(
    createIconButton('Link', linkSvg, 'format-btn', () => {
      const pos = view.state.selection.main.head;
      view.dispatch({
        changes: { from: pos, to: pos, insert: '[]()' },
        selection: { anchor: pos + 1 }
      });
      view.dispatch({ effects: setToolbarMode.of('compact') });
    })
  );
}

const CURSOR_X_KEY = '__inlineToolbarCursorX';

/**
 * Center the tooltip on the cursor and clamp to viewport edges.
 *
 * Reads the cached cursor x from the DOM element (set during CM's read phase
 * via getCoords) so each editor instance tracks its own value.
 *
 * cursorX is in viewport coordinates (from coordsAtPos), but the tooltip's
 * `left` style is relative to its offset parent. We convert viewport bounds
 * to parent-relative coords so clamping works correctly even when the editor
 * is inside a transformed container (e.g. mobile drawer layout).
 */
function clampTooltipHorizontally(dom: HTMLElement): void {
  const cursorX = (dom as unknown as Record<string, unknown>)[CURSOR_X_KEY] as
    | number
    | undefined;
  if (cursorX == null) return;

  const w = dom.offsetWidth;
  const padding = 8;

  // The tooltip is positioned relative to its offset parent, so we need
  // to convert viewport coordinates to parent-relative coordinates.
  const parent = dom.offsetParent as HTMLElement | null;
  const parentLeft = parent?.getBoundingClientRect().left ?? 0;

  // Convert cursor position from viewport to parent-relative coords
  const cursorRelX = cursorX - parentLeft;

  // Viewport edges in parent-relative coords
  const minLeft = padding - parentLeft;
  const maxLeft = window.innerWidth - w - padding - parentLeft;

  let targetLeft = cursorRelX - w / 2;
  targetLeft = Math.max(minLeft, Math.min(targetLeft, maxLeft));

  dom.style.left = `${targetLeft}px`;
}

/**
 * Create the tooltip that hosts the toolbar
 */
function createToolbarTooltip(
  pos: number,
  mode: ToolbarMode,
  onInsertMenu?: GutterMenuHandler
): Tooltip {
  return {
    pos,
    above: false,
    strictSide: true,
    arrow: false,
    create: (viewArg) => {
      let view = viewArg;
      const dom = document.createElement('div');

      if (mode === 'styles') {
        buildStylesToolbar(dom, view);
      } else {
        buildCompactToolbar(dom, view, onInsertMenu);
      }

      return {
        dom,
        getCoords: (pos: number) => {
          // Called during CM's read phase — safe to call coordsAtPos
          const coords = view.coordsAtPos(pos);
          if (coords)
            (dom as unknown as Record<string, unknown>)[CURSOR_X_KEY] = coords.left;
          // Shift down a bit so the toolbar doesn't sit right against the cursor line
          const offset = 4;
          return coords
            ? { ...coords, bottom: coords.bottom + offset }
            : { left: 0, right: 0, top: 0, bottom: 0 };
        },
        update: (update) => {
          // Keep view ref current for getCoords
          view = update.view;
          const newMode = update.state.field(toolbarModeField);
          const oldMode = update.startState.field(toolbarModeField);
          if (newMode !== oldMode) {
            if (newMode === 'styles') {
              buildStylesToolbar(dom, update.view);
            } else {
              buildCompactToolbar(dom, update.view, onInsertMenu);
            }
            update.view.requestMeasure();
          }
        },
        positioned: () => {
          clampTooltipHorizontally(dom);
        }
      };
    }
  };
}

/**
 * Inject global CSS to strip CM tooltip chrome for our toolbar.
 * Tooltips render outside the editor DOM so EditorView.theme/baseTheme can't target the parent.
 */
function injectGlobalStyle(): void {
  const existing = document.getElementById('cm-inline-toolbar-style');
  if (existing) existing.remove();
  const style = document.createElement('style');
  style.id = 'cm-inline-toolbar-style';
  style.textContent = `
    .cm-tooltip.cm-inline-toolbar {
      background: color-mix(in srgb, #ffffff 45%, transparent) !important;
      backdrop-filter: blur(12px) !important;
      -webkit-backdrop-filter: blur(12px) !important;
      border: 1px solid var(--border-light) !important;
      border-radius: 22px !important;
      box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08) !important;
      padding: 2px 4px !important;
    }
    @media (prefers-color-scheme: dark) {
      .cm-tooltip.cm-inline-toolbar {
        background: color-mix(in srgb, var(--bg-elevated) 45%, transparent) !important;
      }
    }
  `;
  document.head.appendChild(style);
}

/**
 * Theme for the inline toolbar inner elements
 */
const inlineToolbarBaseTheme = EditorView.baseTheme({
  '.cm-inline-toolbar': {
    display: 'flex',
    alignItems: 'center',
    gap: '0px',
    whiteSpace: 'nowrap'
  },
  '.cm-inline-toolbar.expanded': {
    flexWrap: 'nowrap',
    overflowX: 'auto',
    maxWidth: '85vw'
  },
  '.inline-toolbar-sep': {
    width: '1px',
    height: '18px',
    background: 'var(--border-light)',
    margin: '0 2px',
    flexShrink: '0'
  },
  '.inline-toolbar-btn': {
    minWidth: '40px',
    height: '40px',
    borderRadius: '50%',
    border: 'none',
    background: 'transparent',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    WebkitTapHighlightColor: 'transparent',
    touchAction: 'manipulation',
    fontFamily: 'var(--font-editor), serif',
    fontSize: '14px',
    fontWeight: '600',
    padding: '0',
    flexShrink: '0'
  },
  '.inline-toolbar-btn:active': {
    color: 'var(--text-primary)',
    background: 'var(--bg-hover)'
  },
  '.inline-toolbar-btn.plus-btn': {
    color: 'var(--accent-primary, #6366f1)'
  },
  '.inline-toolbar-btn.style-btn': {
    fontSize: '15px',
    fontWeight: '700',
    letterSpacing: '-0.5px'
  },
  '.inline-toolbar-btn.back-btn': {
    color: 'var(--text-muted)'
  },
  '.inline-toolbar-btn.format-btn': {
    fontSize: '15px'
  },
  '.inline-toolbar-btn.mono': {
    fontFamily: 'var(--font-mono, monospace)',
    fontSize: '13px'
  }
});

const showToolbarEffect = StateEffect.define<null>();

/**
 * Track whether toolbar is visible (editor focused)
 */
const toolbarVisibleField = StateField.define<boolean>({
  create: () => false,
  update(value, tr) {
    for (const e of tr.effects) {
      if (e.is(hideToolbar)) return false;
      if (e.is(showToolbarEffect)) return true;
    }
    return value;
  }
});

/**
 * Creates the inline floating toolbar extension for mobile.
 * @param onInsertMenu - Callback to open the vertical InsertMenu when + is tapped
 */
export function inlineToolbarExtension(onInsertMenu?: GutterMenuHandler): Extension {
  injectGlobalStyle();
  // Tooltip field needs closure over onInsertMenu
  const tooltipField = StateField.define<Tooltip | null>({
    create: () => null,
    update(value, tr) {
      for (const e of tr.effects) {
        if (e.is(hideToolbar)) return null;
      }

      const visible = tr.state.field(toolbarVisibleField);
      if (!visible) return null;

      const mode = tr.state.field(toolbarModeField);
      const pos = tr.state.selection.main.head;

      // Recreate tooltip if position or mode changed, or if becoming visible
      if (
        value === null ||
        value.pos !== pos ||
        tr.docChanged ||
        tr.effects.some((e) => e.is(setToolbarMode) || e.is(showToolbarEffect))
      ) {
        return createToolbarTooltip(pos, mode, onInsertMenu);
      }

      return value;
    },
    provide: (f) => showTooltip.from(f)
  });

  return [
    toolbarModeField,
    toolbarVisibleField,
    tooltipField,
    inlineToolbarBaseTheme,
    // Show toolbar on focus, hide on blur
    EditorView.domEventHandlers({
      focus: (_event, view) => {
        view.dispatch({ effects: showToolbarEffect.of(null) });
        return false;
      },
      blur: (_event, view) => {
        // Small delay to allow button clicks to register
        setTimeout(() => {
          if (!view.hasFocus) {
            view.dispatch({ effects: hideToolbar.of(null) });
          }
        }, 200);
        return false;
      }
    })
  ];
}
