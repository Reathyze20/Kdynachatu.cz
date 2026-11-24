import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { appendStagingFeedback, isStagingFeedbackEnabled, stagingFeedbackFilePath } from "./stagingFeedbackStore";
import type { StagingFeedbackRecord } from "../../types";

const STAGING_ENV = {
  DEPLOY_TARGET: "staging",
  DATABASE_URL: "postgresql://u:p@localhost:5432/kdynachatu_staging",
  STAGING_SEED_ADMIN_PASSWORD: "admin-heslo-1234",
  STAGING_SEED_MEMBER_PASSWORD: "clen-heslo-12345",
};

const record = (id: string): StagingFeedbackRecord => ({
  id,
  createdAt: "2026-11-24T10:00:00.000Z",
  cabinId: "cabin-1",
  userId: "user-1",
  username: "demo-jana",
  taskId: "general",
  screen: "/dashboard",
  viewportWidth: 1280,
  text: "Řádek\nse zalomením",
});

describe("isStagingFeedbackEnabled – same gate as demo accounts", () => {
  test("on staging", () => {
    assert.equal(isStagingFeedbackEnabled(STAGING_ENV), true);
  });

  test("not on production or without seed passwords", () => {
    assert.equal(isStagingFeedbackEnabled({ ...STAGING_ENV, DEPLOY_TARGET: "production" }), false);
    assert.equal(isStagingFeedbackEnabled({ ...STAGING_ENV, DATABASE_URL: "postgresql://u:p@h/cabin_reservation" }), false);
    assert.equal(isStagingFeedbackEnabled({ ...STAGING_ENV, STAGING_SEED_MEMBER_PASSWORD: "" }), false);
  });
});

describe("stagingFeedbackFilePath", () => {
  test("lies next to the uploads, not inside the publicly served uploads directory", () => {
    const uploads = path.join("srv", "chata-staging", "data", "uploads");
    const file = stagingFeedbackFilePath(uploads);
    assert.equal(path.dirname(file), path.resolve("srv", "chata-staging", "data"));
    assert.ok(!file.startsWith(path.resolve(uploads) + path.sep));
  });
});

describe("appendStagingFeedback", () => {
  test("appends one JSON line per record and creates the directory", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "staging-feedback-"));
    const file = path.join(dir, "nested", "feedback.jsonl");
    try {
      await appendStagingFeedback(file, record("a"));
      await Promise.all([appendStagingFeedback(file, record("b")), appendStagingFeedback(file, record("c"))]);
      const lines = fs.readFileSync(file, "utf8").split("\n").filter(Boolean);
      assert.equal(lines.length, 3);
      const parsed = lines.map((line) => JSON.parse(line) as StagingFeedbackRecord);
      assert.deepEqual(parsed.map((r) => r.id).sort(), ["a", "b", "c"]);
      assert.equal(parsed[0].text, "Řádek\nse zalomením");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
