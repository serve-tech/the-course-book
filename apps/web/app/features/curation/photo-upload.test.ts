import { describe, expect, it } from "vitest";
import { fileProblem, fileSize, progressText, stageFor, UploadStage, type UploadSettings } from "./photo-upload";

const settings: UploadSettings = {
  enabled: true,
  maxBytes: 25 * 1024 * 1024,
  maxPixels: 50_000_000,
  minWidth: 500,
  contentTypes: ["image/jpeg", "image/png", "image/webp"],
};
const MB = 1024 * 1024;

describe("fileProblem", () => {
  it.each([
    { name: "a phone JPEG", file: { name: "IMG_0001.jpg", type: "image/jpeg", size: 4 * MB }, problem: null },
    { name: "a PNG", file: { name: "course.png", type: "image/png", size: 2 * MB }, problem: null },
    { name: "a file whose type the browser doesn't know", file: { name: "photo", type: "", size: 2 * MB }, problem: null },
    { name: "a HEIC photo", file: { name: "IMG_0001.HEIC", type: "image/heic", size: 2 * MB }, problem: expect.stringContaining("HEIC") as unknown },
    { name: "a HEIC photo the browser can't type", file: { name: "IMG_0001.heic", type: "", size: 2 * MB }, problem: expect.stringContaining("HEIC") as unknown },
    { name: "a GIF", file: { name: "a.gif", type: "image/gif", size: MB }, problem: "Choose a JPEG, PNG or WebP photo." },
    { name: "an empty file", file: { name: "a.jpg", type: "image/jpeg", size: 0 }, problem: "That file is empty." },
    {
      name: "a file over the limit",
      file: { name: "big.jpg", type: "image/jpeg", size: 31 * MB },
      problem: "That photo is 31.0 MB; the most is 25.0 MB. Choose a smaller copy.",
    },
  ])("judges $name", ({ file, problem }) => {
    expect(fileProblem(file, settings)).toEqual(problem);
  });
});

describe("upload progress", () => {
  it.each([
    { sent: 0, total: 8 * MB, stage: UploadStage.Sending, text: "Uploading 0% of 8.0 MB" },
    { sent: 3 * MB, total: 8 * MB, stage: UploadStage.Sending, text: "Uploading 37% of 8.0 MB" },
    { sent: 8 * MB, total: 8 * MB, stage: UploadStage.Saving, text: "Resizing and saving…" },
    { sent: 0, total: 0, stage: UploadStage.Sending, text: "Uploading…" },
  ])("reads $sent of $total bytes as “$text”", ({ sent, total, stage, text }) => {
    expect(stageFor(sent, total)).toBe(stage);
    expect(progressText(stage, sent, total)).toBe(text);
  });

  it("shows sizes in megabytes", () => {
    expect(fileSize(12.44 * MB)).toBe("12.4 MB");
  });
});
