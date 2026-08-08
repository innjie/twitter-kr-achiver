import { useState, type FormEvent } from "react";
import { importArchive, ImportApiError, type ImportSummary } from "../api/importArchive";

const USERNAME_PATTERN = /^[A-Za-z0-9_]{1,15}$/;

interface Status {
  kind: "info" | "success" | "error";
  text: string;
}

/** 기존 backend/public/import.html을 흡수한 아카이브 업로드 화면 */
export function ImportPanel() {
  const [ownUsername, setOwnUsername] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    if (!file) {
      setStatus({ kind: "error", text: "파일을 선택하세요." });
      return;
    }
    if (!USERNAME_PATTERN.test(ownUsername)) {
      setStatus({ kind: "error", text: "본인 X 아이디를 영문/숫자/밑줄(_)로 입력하세요 (최대 15자)" });
      return;
    }

    setUploading(true);
    setProgress(0);
    setStatus({ kind: "info", text: "업로드 중..." });

    try {
      const summary: ImportSummary = await importArchive(ownUsername, file, (pct) => {
        setProgress(pct);
        if (pct >= 100) {
          setStatus({
            kind: "info",
            text: "업로드 완료. 서버에서 처리 중입니다 (트윗 수에 따라 수 분 소요될 수 있어요)...",
          });
        }
      });
      setStatus({
        kind: "success",
        text:
          `임포트 완료\n` +
          `트윗/리트윗: ${summary.tweetsImported}건 (스킵 ${summary.tweetsSkipped}건)\n` +
          `좋아요: ${summary.likesImported}건 (스킵 ${summary.likesSkipped}건)`,
      });
    } catch (err) {
      setStatus({
        kind: "error",
        text: err instanceof ImportApiError ? err.message : "임포트 중 오류가 발생했습니다",
      });
    } finally {
      setUploading(false);
    }
  }

  const statusColor =
    status?.kind === "error"
      ? "text-red-600"
      : status?.kind === "success"
        ? "text-green-600"
        : "text-neutral-600";

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-lg border border-neutral-300 p-4">
      <p className="text-sm text-neutral-500">
        X(트위터) 설정 &gt; 데이터 다운로드에서 받은 zip 파일을 업로드하면 tweet.js / like.js를 읽어 로컬
        DB에 저장합니다. 업로드된 파일은 처리 후 서버에서 즉시 삭제됩니다.
      </p>

      <label className="text-sm font-semibold" htmlFor="ownUsername">
        본인 X 아이디 (@ 제외, 영문/숫자/밑줄)
      </label>
      <input
        id="ownUsername"
        type="text"
        value={ownUsername}
        onChange={(e) => setOwnUsername(e.target.value)}
        placeholder="hongildong"
        pattern="[A-Za-z0-9_]{1,15}"
        required
        className="rounded border border-neutral-300 px-3 py-2 text-neutral-800"
      />

      <label className="text-sm font-semibold" htmlFor="archive">
        아카이브 zip 파일
      </label>
      <input
        id="archive"
        type="file"
        accept=".zip,application/zip"
        required
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        className="rounded border border-neutral-300 px-3 py-2"
      />

      <button
        type="submit"
        disabled={uploading}
        className="rounded bg-neutral-800 px-4 py-2 text-white disabled:opacity-60"
      >
        업로드 및 임포트 시작
      </button>

      {uploading && (
        <div className="h-1.5 overflow-hidden rounded bg-neutral-200">
          <div className="h-full bg-neutral-800 transition-[width] duration-150" style={{ width: `${progress}%` }} />
        </div>
      )}

      {status && <p className={`whitespace-pre-wrap text-sm ${statusColor}`}>{status.text}</p>}
    </form>
  );
}
