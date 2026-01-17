export interface MarkerWidths {
  dash: number; // "- "
  star: number; // "* "
  plus: number; // "+ "
  num1: number; // "1. "
  num2: number; // "10. "
  num3: number; // "100. "
  baseIndent: number; // "  " (2 spaces)
  cmLinePadding: number; // CodeMirror's actual line padding
}

export function measureMarkerWidths(editorElement: Element): MarkerWidths {
  const measurer = document.createElement('div');
  measurer.style.cssText = `
    position: absolute;
    visibility: hidden;
    white-space: nowrap;
    font-family: inherit;
    font-size: inherit;
    font-weight: inherit;
    line-height: inherit;
    pointer-events: none;
  `;

  editorElement.appendChild(measurer);

  // Measure CodeMirror's actual line padding
  const cmLinePadding = measureCodeMirrorLinePadding(editorElement);

  const widths = {
    dash: measureText(measurer, '- '),
    star: measureText(measurer, '* '),
    plus: measureText(measurer, '+ '),
    num1: measureText(measurer, '1. '),
    num2: measureText(measurer, '10. '),
    num3: measureText(measurer, '100. '),
    baseIndent: measureText(measurer, '  '),
    cmLinePadding
  };

  editorElement.removeChild(measurer);
  return widths;
}

function measureCodeMirrorLinePadding(editorElement: Element): number {
  // Look for existing .cm-line element to measure its actual padding
  // Exclude list-styled lines which have inflated padding from list decorations
  const cmLine = editorElement.querySelector('.cm-line:not(.cm-list-marker-line)');

  if (cmLine) {
    const computedStyle = window.getComputedStyle(cmLine);
    const paddingLeft = computedStyle.getPropertyValue('padding-left');
    return parseFloat(paddingLeft) || 0;
  }

  // Fallback: create a temporary .cm-line element to measure
  const tempLine = document.createElement('div');
  tempLine.className = 'cm-line';
  tempLine.style.cssText = `
    position: absolute;
    visibility: hidden;
    pointer-events: none;
  `;

  editorElement.appendChild(tempLine);

  const computedStyle = window.getComputedStyle(tempLine);
  const paddingLeft = computedStyle.getPropertyValue('padding-left');
  const padding = parseFloat(paddingLeft) || 0;

  editorElement.removeChild(tempLine);
  return padding;
}

function measureText(element: HTMLElement, text: string): number {
  // Use innerHTML with &nbsp; to preserve spaces, or set white-space: pre
  element.style.whiteSpace = 'pre';
  element.textContent = text;
  const width = element.getBoundingClientRect().width;
  element.style.whiteSpace = '';
  return width;
}

export function updateCSSCustomProperties(widths: MarkerWidths): void {
  const root = document.documentElement;

  root.style.setProperty('--list-marker-dash-width', `${widths.dash}px`);
  root.style.setProperty('--list-marker-star-width', `${widths.star}px`);
  root.style.setProperty('--list-marker-plus-width', `${widths.plus}px`);
  root.style.setProperty('--list-marker-num1-width', `${widths.num1}px`);
  root.style.setProperty('--list-marker-num2-width', `${widths.num2}px`);
  root.style.setProperty('--list-marker-num3-width', `${widths.num3}px`);
  root.style.setProperty('--list-base-indent', `${widths.baseIndent}px`);
  root.style.setProperty('--cm-line-padding', `${widths.cmLinePadding}px`);
}
