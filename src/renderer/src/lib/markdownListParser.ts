export interface ListLineInfo {
  isListLine: boolean;
  isMarkerLine: boolean;
  isContinuationLine: boolean;
  level: number;
  markerType: 'dash' | 'star' | 'plus' | 'num1' | 'num2' | 'num3' | null;
  leadingSpaces: number;
  markerText: string;
}

const LIST_MARKER_REGEX = /^(\s*)([-*+]|\d{1,3}\.) /;
const INDENT_SIZE = 2; // Assume 2-space indentation

export function parseListLine(lineText: string): ListLineInfo {
  const match = LIST_MARKER_REGEX.exec(lineText);

  if (match) {
    const leadingSpaces = match[1].length;
    const markerText = match[2];
    const level = Math.floor(leadingSpaces / INDENT_SIZE);

    return {
      isListLine: true,
      isMarkerLine: true,
      isContinuationLine: false,
      level,
      markerType: getMarkerType(markerText),
      leadingSpaces,
      markerText
    };
  }

  // Not a marker line - could be a continuation line
  return {
    isListLine: false,
    isMarkerLine: false,
    isContinuationLine: false,
    level: 0,
    markerType: null,
    leadingSpaces: 0,
    markerText: ''
  };
}

function getMarkerType(
  marker: string
): 'dash' | 'star' | 'plus' | 'num1' | 'num2' | 'num3' | null {
  if (marker === '-') return 'dash';
  if (marker === '*') return 'star';
  if (marker === '+') return 'plus';

  if (marker.endsWith('.')) {
    const num = marker.slice(0, -1);
    if (num.length === 1) return 'num1';
    if (num.length === 2) return 'num2';
    if (num.length === 3) return 'num3';
  }

  return null;
}

export interface ListContext {
  currentLevel: number;
  currentMarkerType: 'dash' | 'star' | 'plus' | 'num1' | 'num2' | 'num3' | null;
  inList: boolean;
}

export function analyzeListContext(lines: string[], lineIndex: number): ListContext {
  const context: ListContext = {
    currentLevel: 0,
    currentMarkerType: null,
    inList: false
  };

  // Look backwards to find the most recent list marker
  for (let i = lineIndex; i >= 0; i--) {
    const lineInfo = parseListLine(lines[i]);

    if (lineInfo.isMarkerLine) {
      context.currentLevel = lineInfo.level;
      context.currentMarkerType = lineInfo.markerType;
      context.inList = true;
      break;
    }

    // If we hit a non-empty line that's not a list line, we're not in a list
    if (lines[i].trim() && !lineInfo.isListLine) {
      break;
    }
  }

  return context;
}

export function isListContinuation(lineText: string, context: ListContext): boolean {
  if (!context.inList) return false;

  const lineInfo = parseListLine(lineText);

  // It's a continuation if:
  // 1. It's not a marker line itself
  // 2. It has content (not empty)
  // 3. It has appropriate indentation for the current list level
  if (!lineInfo.isMarkerLine && lineText.trim()) {
    const leadingSpaces = lineText.length - lineText.trimStart().length;
    const expectedIndent = context.currentLevel * INDENT_SIZE;

    // Allow some flexibility in indentation
    return leadingSpaces >= expectedIndent;
  }

  return false;
}
