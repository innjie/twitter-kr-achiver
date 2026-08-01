import type { Readable } from "node:stream";
import { Transform, type TransformCallback } from "node:stream";
import { parser } from "stream-json";
import { streamArray } from "stream-json/streamers/StreamArray";

const BRACKET_OPEN = 0x5b; // [
const BRACKET_CLOSE = 0x5d; // ]
const BRACE_OPEN = 0x7b; // {
const BRACE_CLOSE = 0x7d; // }
const QUOTE = 0x22; // "
const BACKSLASH = 0x5c; // \

/**
 * X 공식 아카이브의 tweet.js/like.js는 순수 JSON이 아니라
 * `window.YTD.tweet.part0 = [ ... ];` 형태의 JS 할당문이다.
 * 이 Transform은 첫 `[`부터 그와 짝이 맞는 최상위 `]`까지만 통과시키고,
 * 앞의 변수 할당 프리픽스와 뒤의 `;` 등 트레일링 바이트는 모두 버려서
 * 순수한 JSON 배열 바이트 스트림으로 만든다.
 *
 * 문자열 리터럴 내부의 대괄호는 무시해야 하므로 `"`/`\` 이스케이프 상태를 함께 추적한다.
 * 구조 문자(`[`,`]`,`{`,`}`,`"`,`\`)는 모두 UTF-8에서 1바이트로 고정되어 있어
 * 멀티바이트 문자가 청크 경계에서 잘려도 바이트 단위 스캔은 안전하다.
 */
class ExtractJsonArray extends Transform {
  private started = false;
  private prefixBuffer = Buffer.alloc(0);
  private depth = 0;
  private inString = false;
  private escapeNext = false;
  private done = false;

  private static readonly MAX_PREFIX_SEARCH_BYTES = 4096;

  _transform(chunk: Buffer, _encoding: string, callback: TransformCallback) {
    if (this.done) {
      callback();
      return;
    }

    let buf = chunk;
    if (!this.started) {
      this.prefixBuffer = Buffer.concat([this.prefixBuffer, chunk]);
      const bracketIndex = this.prefixBuffer.indexOf(BRACKET_OPEN);
      if (bracketIndex === -1) {
        if (this.prefixBuffer.length > ExtractJsonArray.MAX_PREFIX_SEARCH_BYTES) {
          callback(new Error("아카이브 파일에서 JSON 배열 시작(`[`)을 찾지 못했습니다 (형식이 예상과 다름)"));
          return;
        }
        callback();
        return;
      }
      this.started = true;
      buf = this.prefixBuffer.subarray(bracketIndex);
      this.prefixBuffer = Buffer.alloc(0);
    }

    let endIndex = -1;
    for (let i = 0; i < buf.length; i++) {
      const byte = buf[i];

      if (this.inString) {
        if (this.escapeNext) {
          this.escapeNext = false;
        } else if (byte === BACKSLASH) {
          this.escapeNext = true;
        } else if (byte === QUOTE) {
          this.inString = false;
        }
        continue;
      }

      if (byte === QUOTE) {
        this.inString = true;
      } else if (byte === BRACKET_OPEN || byte === BRACE_OPEN) {
        this.depth++;
      } else if (byte === BRACKET_CLOSE || byte === BRACE_CLOSE) {
        this.depth--;
        if (this.depth === 0) {
          endIndex = i;
          break;
        }
      }
    }

    if (endIndex === -1) {
      callback(null, buf);
    } else {
      this.done = true;
      callback(null, buf.subarray(0, endIndex + 1));
    }
  }
}

/**
 * 아카이브의 `window.YTD.*.partN = [...]` 파일 스트림을 받아, 배열 원소를 하나씩 비동기로 산출한다.
 * 전체를 메모리에 올리지 않기 위해 stream-json으로 파싱한다 (docs/06_개발가이드.md §5-2).
 */
export async function* streamArchiveJsonArray(source: Readable): AsyncGenerator<unknown> {
  const arrayStream = source.pipe(new ExtractJsonArray()).pipe(parser()).pipe(streamArray());

  for await (const { value } of arrayStream as AsyncIterable<{ value: unknown }>) {
    yield value;
  }
}
