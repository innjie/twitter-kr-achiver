import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Router } from "express";
import multer from "multer";
import type { DbAdapter } from "../db/DbAdapter";
import { importArchive } from "../archive/importArchive";

// X 사용자명 규칙(영문/숫자/밑줄, 최대 15자)만 허용해 업로드 폼 입력값을 통한 주입/XSS 여지를 차단
const USERNAME_PATTERN = /^[A-Za-z0-9_]{1,15}$/;

const UPLOAD_DIR = path.join(process.cwd(), "data", "uploads");
const MAX_ARCHIVE_SIZE_BYTES = 2 * 1024 * 1024 * 1024; // 2GB

function ensureUploadDir() {
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => {
      ensureUploadDir();
      callback(null, UPLOAD_DIR);
    },
    // 원본 파일명을 그대로 쓰지 않고 무작위 이름 사용 (경로 조작/충돌 방지)
    filename: (_req, _file, callback) => {
      callback(null, `${crypto.randomUUID()}.zip`);
    },
  }),
  limits: { fileSize: MAX_ARCHIVE_SIZE_BYTES },
  fileFilter: (_req, file, callback) => {
    const isZip =
      file.mimetype === "application/zip" ||
      file.mimetype === "application/x-zip-compressed" ||
      file.originalname.toLowerCase().endsWith(".zip");
    if (!isZip) {
      callback(new Error("zip 파일만 업로드할 수 있습니다"));
      return;
    }
    callback(null, true);
  },
});

export function createImportRouter(db: DbAdapter): Router {
  const router = Router();

  router.post("/api/import/archive", upload.single("archive"), async (req, res) => {
    const uploadedPath = req.file?.path ?? null;

    try {
      if (!req.file) {
        res.status(400).json({ error: "archive 파일이 필요합니다" });
        return;
      }

      const ownUsername = (req.body.ownUsername ?? "").trim();
      if (!USERNAME_PATTERN.test(ownUsername)) {
        res.status(400).json({ error: "본인 X 아이디를 영문/숫자/밑줄(_)로 입력하세요 (최대 15자)" });
        return;
      }

      const summary = await importArchive(db, req.file.path, ownUsername);
      res.json({ status: "ok", summary });
    } catch (err) {
      console.error("[import] 아카이브 임포트 실패:", err);
      const message = err instanceof Error ? err.message : "알 수 없는 오류로 임포트에 실패했습니다";
      res.status(500).json({ error: message });
    } finally {
      // 원본 zip은 DB에 이미 반영되었으므로 디스크에 남겨둘 필요 없음 (민감 데이터 보관 최소화)
      if (uploadedPath) {
        fs.unlink(uploadedPath, () => {});
      }
    }
  });

  return router;
}
