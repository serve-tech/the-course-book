import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { courseSchema } from "@coursebook/domain/catalog/course";
import { MemberRole } from "@coursebook/domain/curation/types";
import { ApiError } from "../../lib/api/client";
import type { PhotoUploadInput } from "../../lib/api/upload";
import { CurationTab } from "./curation";
import { CurationPage } from "./CurationPage";
import { UPLOADS_OFF, type UploadSettings } from "./photo-upload";

const pacific = courseSchema.parse({ id: "b", name: "Pacific Dunes", location: "Bandon, OR, USA", photo: null });
const on: UploadSettings = { enabled: true, maxBytes: 25 * 1024 * 1024, maxPixels: 50_000_000, minWidth: 500, contentTypes: ["image/jpeg", "image/png", "image/webp"] };

/** The picker for Pacific Dunes, opened from its course page, with a fake uploader the test drives. */
function show(uploads: UploadSettings) {
  let finish: { resolve: () => void; reject: (error: unknown) => void; input: PhotoUploadInput } | null = null;
  const upload = vi.fn(
    (input: PhotoUploadInput) =>
      new Promise<void>((resolve, reject) => {
        finish = { resolve, reject, input };
      }),
  );
  const notify = vi.fn<(message: string) => void>();
  const router = createMemoryRouter(
    [
      {
        path: "/curate",
        element: (
          <CurationPage
            view={{
              role: MemberRole.Curator,
              tab: CurationTab.Photos,
              source: null,
              courses: [],
              picking: { course: pacific, query: "Pacific Dunes", candidates: [], searchError: null, backToCourse: true, uploads },
            }}
            notify={notify}
            upload={upload}
          />
        ),
      },
      { path: "/courses/:courseId", element: <p>Course page</p> },
    ],
    { initialEntries: ["/curate?course=b&back=course"] },
  );
  render(<RouterProvider router={router} />);
  const pending = () => {
    if (!finish) throw new Error("nothing was uploaded");
    return finish;
  };
  return { upload, notify, router, pending };
}

const choose = (file: File) => {
  fireEvent.change(screen.getByLabelText("Photo file"), { target: { files: [file] } });
};
const jpeg = (size = 4 * 1024 * 1024) => new File([new Uint8Array(size)], "IMG_0001.jpg", { type: "image/jpeg" });
const fill = () => {
  fireEvent.change(screen.getByRole("textbox", { name: "Credit" }), { target: { value: "Cora Curator" } });
  fireEvent.change(screen.getByRole("combobox", { name: "License or permission" }), { target: { value: "Used with permission" } });
};

beforeEach(() => {
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:preview"), revokeObjectURL: vi.fn() }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("uploading a photo on the curator screen", () => {
  it("isn't offered while the API has no photo storage", () => {
    show(UPLOADS_OFF);
    expect(screen.queryByRole("heading", { name: "Upload a photo" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Photos on Wikimedia Commons" })).toBeInTheDocument();
  });

  it("asks for JPEG first, so iOS converts HEIC photos", () => {
    show(on);
    expect(screen.getByLabelText("Photo file")).toHaveAttribute("accept", "image/jpeg,image/png,image/webp");
  });

  it("previews the chosen photo, sends it with its credit and license, shows progress, then returns to the course", async () => {
    const { upload, notify, router, pending } = show(on);
    expect(screen.getByRole("button", { name: "Upload photo" })).toBeDisabled();
    choose(jpeg());
    expect(screen.getByRole("img", { name: "Chosen photo for Pacific Dunes" })).toHaveAttribute("src", "blob:preview");
    expect(screen.getByText("IMG_0001.jpg · 4.0 MB")).toBeInTheDocument();
    fill();
    fireEvent.click(screen.getByRole("button", { name: "Upload photo" }));

    await vi.waitFor(() => {
      expect(upload).toHaveBeenCalledTimes(1);
    });
    const { input, resolve } = pending();
    expect(input).toMatchObject({ courseId: "b", fields: { credit: "Cora Curator", license: "Used with permission", licenseUrl: "", sourceUrl: "" } });
    act(() => {
      input.onProgress?.({ sent: 1024 * 1024, total: 4 * 1024 * 1024 });
    });
    expect(screen.getByRole("status")).toHaveTextContent("Uploading 25% of 4.0 MB");
    act(() => {
      input.onProgress?.({ sent: 4 * 1024 * 1024, total: 4 * 1024 * 1024 });
    });
    expect(screen.getByRole("status")).toHaveTextContent("Resizing and saving…");
    expect(screen.getByRole("textbox", { name: "Credit" })).toBeDisabled();

    await act(async () => {
      resolve();
      await Promise.resolve();
    });
    expect(notify).toHaveBeenCalledWith("Photo uploaded for Pacific Dunes");
    await vi.waitFor(() => {
      expect(router.state.location.pathname).toBe("/courses/b");
    });
  });

  it("refuses a HEIC file before sending it", () => {
    const { upload } = show(on);
    choose(new File([new Uint8Array(10)], "IMG_0002.HEIC", { type: "image/heic" }));
    expect(screen.getByRole("alert")).toHaveTextContent("HEIC photos can't be used");
    expect(screen.getByRole("button", { name: "Upload photo" })).toBeDisabled();
    expect(upload).not.toHaveBeenCalled();
  });

  it("refuses a file over the limit before sending it", () => {
    show({ ...on, maxBytes: 1024 * 1024 });
    choose(jpeg(2 * 1024 * 1024));
    expect(screen.getByRole("alert")).toHaveTextContent("That photo is 2.0 MB; the most is 1.0 MB.");
  });

  it("shows the API's reason when an upload fails, and lets the curator try again", async () => {
    const { pending, router } = show(on);
    choose(jpeg());
    fill();
    fireEvent.click(screen.getByRole("button", { name: "Upload photo" }));
    await vi.waitFor(() => {
      pending();
    });
    await act(async () => {
      pending().reject(new ApiError(400, "photo_too_narrow", "That photo is narrower than 500 pixels and would look soft. Choose a larger one.", "req-1"));
      await Promise.resolve();
    });
    expect(screen.getByRole("alert")).toHaveTextContent("narrower than 500 pixels");
    expect(screen.getByRole("button", { name: "Upload photo" })).toBeEnabled();
    expect(router.state.location.pathname).toBe("/curate");
  });

  it("cancels an upload on its way", async () => {
    const { pending, notify } = show(on);
    choose(jpeg());
    fill();
    fireEvent.click(screen.getByRole("button", { name: "Upload photo" }));
    await vi.waitFor(() => {
      pending();
    });
    const { input, reject } = pending();
    input.signal?.addEventListener("abort", () => {
      reject(new DOMException("The upload was cancelled.", "AbortError"));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
      await Promise.resolve();
    });
    expect(input.signal?.aborted).toBe(true);
    expect(notify).toHaveBeenCalledWith("Upload cancelled");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
