import type { FilePreview } from "@lunabot/contracts/ipc";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { describe, expect, it, vi } from "vitest";
import FilePreviewPanel, { joinLocalPath, parentLocalPath } from "./FilePreviewPanel";

const folder: FilePreview = {
  name: "relatorios",
  size: 0,
  mimeType: "inode/directory",
  previewKind: "directory",
  bytes: null,
  entries: [
    { name: "2025", kind: "directory" },
    { name: "resumo.md", kind: "file" },
  ],
};

function renderPanel(path: string, source: "shared" | "workspace") {
  const onOpenWorkspaceFile = vi.fn();
  const onOpenSharedFile = vi.fn();
  render(() => (
    <FilePreviewPanel
      preview={folder}
      source={source}
      path={path}
      bots={[]}
      defaultWidth={() => 400}
      maxWidth={() => 800}
      onWidthChange={() => undefined}
      onOpenLink={() => undefined}
      onOpenSharedFile={onOpenSharedFile}
      onOpenWorkspaceFile={onOpenWorkspaceFile}
      onOpenExternally={() => undefined}
      onClose={() => undefined}
    />
  ));
  return { onOpenWorkspaceFile, onOpenSharedFile };
}

describe("FilePreviewPanel folders", () => {
  it("lists the entries and opens one with the folder's own separator", async () => {
    const { onOpenWorkspaceFile, onOpenSharedFile } = renderPanel("C:\\Users\\ana\\relatorios", "workspace");

    await fireEvent.click(screen.getByRole("button", { name: "resumo.md" }));
    await fireEvent.click(screen.getByRole("button", { name: "2025" }));

    expect(onOpenWorkspaceFile).toHaveBeenNthCalledWith(1, "C:\\Users\\ana\\relatorios\\resumo.md");
    expect(onOpenWorkspaceFile).toHaveBeenNthCalledWith(2, "C:\\Users\\ana\\relatorios\\2025");
    expect(onOpenSharedFile).not.toHaveBeenCalled();
  });

  it("goes up to the parent folder through the shared handler for shared folders", async () => {
    const { onOpenSharedFile } = renderPanel("~/LunaBot/Shared/relatorios", "shared");

    await fireEvent.click(screen.getByRole("button", { name: "Go to the parent folder" }));

    expect(onOpenSharedFile).toHaveBeenCalledWith("~/LunaBot/Shared");
  });
});

describe("local path helpers", () => {
  it("joins and climbs paths without doubling separators", () => {
    expect(joinLocalPath("/home/ana/docs/", "a.md")).toBe("/home/ana/docs/a.md");
    expect(parentLocalPath("C:\\Users\\ana")).toBe("C:\\Users");
    expect(parentLocalPath("C:\\Users")).toBeNull();
    expect(parentLocalPath("~/LunaBot")).toBeNull();
    expect(parentLocalPath("relatorios")).toBeNull();
  });
});
