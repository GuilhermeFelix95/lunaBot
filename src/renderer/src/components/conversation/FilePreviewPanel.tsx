import type { FilePreview } from "@lunabot/contracts/ipc";
import { createEffect, createMemo, createSignal, For, onCleanup, Show } from "solid-js";
import type { BotProfile } from "../../data";
import { t } from "../../i18n";
import { PanelResizer, readPanelWidth, savePanelWidth } from "../PanelResizer";
import { ArrowUp, Button, ExternalLink, File, Folder, X } from "../ui";
import { MarkdownMessageText } from "./MarkdownMessageText";

const PANEL_STORAGE_KEY = "lunabot:browser-panel-width";
const PANEL_MIN = 220;
const PANEL_MAX = 1600;
const TEXT_LIMIT = 1_000_000;

/** Joins a folder path and an entry name with the separator the folder path already uses. */
export function joinLocalPath(directory: string, name: string): string {
  const separator = directory.includes("\\") && !directory.includes("/") ? "\\" : "/";
  return `${directory.replace(/[/\\]+$/u, "")}${separator}${name}`;
}

/** The folder that holds `path`, or null when `path` has no parent to go up to. */
export function parentLocalPath(path: string): string | null {
  const trimmed = path.replace(/[/\\]+$/u, "");
  const cut = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  if (cut <= 0) return null;
  const parent = trimmed.slice(0, cut);
  return /^[A-Za-z]:$/u.test(parent) || parent === "~" ? null : parent;
}

interface FilePreviewPanelProps {
  preview: FilePreview;
  /** Where the previewed file or folder lives, so a folder's entries can be opened from it. */
  source: "shared" | "workspace";
  path: string;
  bots: BotProfile[];
  defaultWidth: () => number;
  maxWidth: () => number;
  onWidthChange: (width: number) => void;
  onOpenLink: (url: string) => void;
  onOpenSharedFile: (path: string) => void;
  onOpenWorkspaceFile: (path: string) => void;
  onOpenExternally: () => void;
  onClose: () => void;
}

export default function FilePreviewPanel(props: FilePreviewPanelProps) {
  const defaultPanelWidth = () => Math.round(Math.min(PANEL_MAX, Math.max(PANEL_MIN, props.defaultWidth())));
  const [panelWidth, setPanelWidth] = createSignal(
    readPanelWidth(PANEL_STORAGE_KEY, defaultPanelWidth(), PANEL_MIN, PANEL_MAX),
  );
  const [previewUrl, setPreviewUrl] = createSignal<string | null>(null);
  let currentPreviewUrl: string | null = null;
  const text = createMemo(() => {
    if (!props.preview.bytes || (props.preview.previewKind !== "text" && props.preview.previewKind !== "markdown")) {
      return { value: "", truncated: false };
    }
    const value = new TextDecoder().decode(props.preview.bytes);
    return { value: value.slice(0, TEXT_LIMIT), truncated: value.length > TEXT_LIMIT };
  });

  createEffect(
    () => panelWidth(),
    (width) => {
      props.onWidthChange(width);
    },
  );
  createEffect(
    () => props.preview,
    (preview) => {
      if (currentPreviewUrl) URL.revokeObjectURL(currentPreviewUrl);
      currentPreviewUrl = null;
      if (
        !preview.bytes ||
        (preview.previewKind !== "image" && preview.previewKind !== "pdf" && preview.previewKind !== "video")
      ) {
        setPreviewUrl(null);
        return;
      }
      const url = URL.createObjectURL(new Blob([new Uint8Array(preview.bytes).buffer], { type: preview.mimeType }));
      currentPreviewUrl = url;
      setPreviewUrl(url);
    },
  );
  onCleanup(() => {
    if (currentPreviewUrl) URL.revokeObjectURL(currentPreviewUrl);
  });

  const openEntry = (path: string) => {
    if (props.source === "shared") props.onOpenSharedFile(path);
    else props.onOpenWorkspaceFile(path);
  };
  const parentPath = () => parentLocalPath(props.path);

  const resizeDefaultPanel = () => {
    setPanelWidth(Math.round(Math.min(props.maxWidth(), Math.max(PANEL_MIN, defaultPanelWidth()))));
  };

  return (
    <aside
      id="file-preview-panel"
      class="browser-panel file-preview-panel"
      aria-label={t("conversation.file.previewRegion")}
    >
      <PanelResizer
        class="right-panel-resizer"
        label={t("conversation.file.resize")}
        controls="file-preview-panel"
        direction="right"
        value={panelWidth()}
        defaultValue={defaultPanelWidth()}
        min={PANEL_MIN}
        max={props.maxWidth}
        onResize={setPanelWidth}
        onResizeEnd={(width) => savePanelWidth(PANEL_STORAGE_KEY, width)}
        onParentResize={resizeDefaultPanel}
        onReset={() => {
          window.localStorage.removeItem(PANEL_STORAGE_KEY);
          setPanelWidth(defaultPanelWidth());
        }}
      />
      <header class="file-preview-header">
        <Show when={props.preview.previewKind === "directory"} fallback={<File class="file-preview-file-icon" />}>
          <Folder class="file-preview-file-icon" />
        </Show>
        <h2 title={props.path}>{props.preview.name}</h2>
        <Show when={parentPath()}>
          {(parent) => (
            <Button
              variant="ghost"
              type="button"
              class="browser-toolbar-button"
              aria-label={t("conversation.file.parentFolder")}
              onClick={() => openEntry(parent())}
            >
              <ArrowUp class="browser-toolbar-icon" />
            </Button>
          )}
        </Show>
        <Button
          variant="ghost"
          type="button"
          class="browser-toolbar-button"
          aria-label={t("conversation.file.openFileExternally")}
          onClick={props.onOpenExternally}
        >
          <ExternalLink class="browser-toolbar-icon" />
        </Button>
        <Button
          variant="ghost"
          type="button"
          class="browser-toolbar-button"
          aria-label={t("conversation.file.close")}
          onClick={props.onClose}
        >
          <X class="browser-toolbar-icon" />
        </Button>
      </header>
      <div class="file-preview-content">
        <Show when={props.preview.previewKind === "markdown"}>
          <article class="file-preview-markdown message-markdown">
            <MarkdownMessageText
              body={text().value}
              bots={props.bots}
              attachments={[]}
              citations={[]}
              showCitationFooter={false}
              onSelectAgent={() => undefined}
              onOpenLink={props.onOpenLink}
              onOpenSharedFile={props.onOpenSharedFile}
              onOpenWorkspaceFile={props.onOpenWorkspaceFile}
            />
          </article>
        </Show>
        <Show when={props.preview.previewKind === "text"}>
          <pre class="file-preview-text">{text().value}</pre>
        </Show>
        <Show when={props.preview.previewKind === "image" && previewUrl()}>
          <div class="file-preview-image-wrap">
            <img class="file-preview-image" src={previewUrl() ?? ""} alt={props.preview.name} />
          </div>
        </Show>
        <Show when={props.preview.previewKind === "pdf" && previewUrl()}>
          <iframe class="file-preview-pdf" title={props.preview.name} src={previewUrl() ?? ""} />
        </Show>
        <Show when={props.preview.previewKind === "video" && previewUrl()}>
          <div class="file-preview-image-wrap">
            {/* biome-ignore lint/a11y/useMediaCaption: a local file the user opened has no caption track to offer. */}
            <video class="file-preview-video" src={previewUrl() ?? ""} controls />
          </div>
        </Show>
        <Show when={props.preview.previewKind === "directory"}>
          <Show
            when={(props.preview.entries ?? []).length > 0}
            fallback={<p class="file-preview-truncated">{t("conversation.file.emptyFolder")}</p>}
          >
            <ul class="file-preview-entries">
              <For each={props.preview.entries ?? []}>
                {(entry) => (
                  <li>
                    <Button
                      variant="ghost"
                      type="button"
                      class="file-preview-entry"
                      data-entry-kind={entry.kind}
                      onClick={() => openEntry(joinLocalPath(props.path, entry.name))}
                    >
                      <Show when={entry.kind === "directory"} fallback={<File class="file-preview-entry-icon" />}>
                        <Folder class="file-preview-entry-icon" />
                      </Show>
                      <span>{entry.name}</span>
                    </Button>
                  </li>
                )}
              </For>
            </ul>
          </Show>
          <Show when={props.preview.entriesTruncated}>
            <p class="file-preview-truncated">{t("conversation.file.foldersTruncated")}</p>
          </Show>
        </Show>
        <Show when={props.preview.previewKind === "none"}>
          <div class="file-preview-unsupported">
            <File />
            <strong>{t("conversation.file.unavailable")}</strong>
            <span>{t("conversation.file.unavailableHint")}</span>
            <Button variant="outline" type="button" onClick={props.onOpenExternally}>
              {t("conversation.file.openExternally")}
            </Button>
          </div>
        </Show>
        <Show when={text().truncated}>
          <p class="file-preview-truncated">{t("conversation.file.truncated")}</p>
        </Show>
      </div>
    </aside>
  );
}
