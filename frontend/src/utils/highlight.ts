export interface HighlightSegment {
  text: string;
  highlighted: boolean;
}

const MARK_PATTERN = /<mark>(.*?)<\/mark>/gs;

/**
 * 백엔드가 내려주는 하이라이트 텍스트(<mark>...</mark>만 포함, 다른 HTML 태그 없음)를
 * 일반/강조 구간으로 나눈다. dangerouslySetInnerHTML을 쓰지 않고 React 엘리먼트로
 * 안전하게 렌더링하기 위한 전처리 (XSS 방지).
 */
export function parseHighlightedText(highlightedText: string): HighlightSegment[] {
  const segments: HighlightSegment[] = [];
  let lastIndex = 0;

  for (const match of highlightedText.matchAll(MARK_PATTERN)) {
    const matchStart = match.index ?? 0;
    if (matchStart > lastIndex) {
      segments.push({ text: highlightedText.slice(lastIndex, matchStart), highlighted: false });
    }
    segments.push({ text: match[1], highlighted: true });
    lastIndex = matchStart + match[0].length;
  }

  if (lastIndex < highlightedText.length) {
    segments.push({ text: highlightedText.slice(lastIndex), highlighted: false });
  }

  return segments;
}
