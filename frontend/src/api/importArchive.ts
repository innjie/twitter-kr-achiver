export interface ImportSummary {
  tweetsImported: number;
  tweetsSkipped: number;
  likesImported: number;
  likesSkipped: number;
  filesProcessed: string[];
}

export class ImportApiError extends Error {}

/**
 * 아카이브 zip을 업로드한다. fetch는 업로드 진행률을 알 수 없어 XMLHttpRequest를 사용한다.
 */
export function importArchive(
  ownUsername: string,
  file: File,
  onProgress: (percent: number) => void,
): Promise<ImportSummary> {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append("ownUsername", ownUsername);
    formData.append("archive", file);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/import/archive");

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    });

    xhr.onload = () => {
      let body: { summary?: ImportSummary; error?: string } | null = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        reject(new ImportApiError("서버 응답을 해석할 수 없습니다."));
        return;
      }

      if (xhr.status >= 200 && xhr.status < 300 && body?.summary) {
        resolve(body.summary);
      } else {
        reject(new ImportApiError(body?.error ?? "임포트에 실패했습니다"));
      }
    };

    xhr.onerror = () => reject(new ImportApiError("네트워크 오류로 업로드에 실패했습니다."));

    xhr.send(formData);
  });
}
