import { INPUT_LIMITS } from "@lunabot/contracts/input-limits";
import { type BotMemory, DEFAULT_AGENT_MEMORY_LIMIT } from "@lunabot/contracts/ipc";
import { createEffect, createSignal, For, onSettled, Show } from "solid-js";
import { locale, t } from "../../i18n";
import { Button, Dialog, IconButton, Plus, Textarea, Trash2, X } from "../ui";

interface AgentMemoriesModalProps {
  botId: string;
  botName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCountChange: (count: number) => void;
}

export function AgentMemoriesModal(props: AgentMemoriesModalProps) {
  const [memories, setMemories] = createSignal<BotMemory[]>([]);
  const [memoryLimit, setMemoryLimit] = createSignal<number>(DEFAULT_AGENT_MEMORY_LIMIT);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [addOpen, setAddOpen] = createSignal(false);
  const [newText, setNewText] = createSignal("");
  const [editingId, setEditingId] = createSignal<string | null>(null);
  const [editingText, setEditingText] = createSignal("");
  const [savingId, setSavingId] = createSignal<string | null>(null);
  const [clearConfirmation, setClearConfirmation] = createSignal(false);
  const [fadeAtTop, setFadeAtTop] = createSignal(false);
  const [fadeAtBottom, setFadeAtBottom] = createSignal(false);
  let modalContent: HTMLDivElement | undefined;
  let memoryList: HTMLUListElement | undefined;
  let memoryListResizeObserver: ResizeObserver | undefined;
  let newMemoryInput: HTMLTextAreaElement | undefined;
  let editingInput: HTMLTextAreaElement | undefined;
  let confirmationTrigger: HTMLButtonElement | undefined;

  function updateScrollFades(): void {
    if (!memoryList) return;
    const remaining = memoryList.scrollHeight - memoryList.scrollTop - memoryList.clientHeight;
    setFadeAtTop(memoryList.scrollTop > 2);
    setFadeAtBottom(remaining > 2);
  }

  function bindMemoryList(element: HTMLUListElement): void {
    memoryList = element;
    memoryListResizeObserver?.disconnect();
    memoryListResizeObserver = new ResizeObserver(updateScrollFades);
    memoryListResizeObserver.observe(element);
    window.requestAnimationFrame(updateScrollFades);
  }

  onSettled(() => () => memoryListResizeObserver?.disconnect());

  async function loadMemories(showLoading = true): Promise<void> {
    if (showLoading) setLoading(true);
    setError(null);
    try {
      const [next, limit] = await Promise.all([
        window.lunabot.agent.listMemories(props.botId),
        window.lunabot.agentPreferences.getMemoryLimit(),
      ]);
      setMemories(next);
      setMemoryLimit(limit);
      props.onCountChange(next.length);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("settings.memories.loadFailed"));
    } finally {
      if (showLoading) setLoading(false);
    }
  }

  createEffect(
    () => [props.open, props.botId] as const,
    ([open]) => {
      if (!open) return;
      setEditingId(null);
      setAddOpen(false);
      setNewText("");
      setClearConfirmation(false);
      void loadMemories();
    },
  );

  createEffect(
    () => [props.open, props.botId] as const,
    ([open, botId]) => {
      if (!open) return;
      return window.lunabot.agent.onEvent((event) => {
        if (event.type !== "memories-changed" || event.botId !== botId) return;
        void loadMemories(false);
      });
    },
  );

  async function createMemory(): Promise<void> {
    const text = newText().trim();
    if (!text || memories().length >= memoryLimit()) return;
    setSavingId("new");
    setError(null);
    try {
      await window.lunabot.agent.createMemory({ botId: props.botId, text });
      setNewText("");
      setAddOpen(false);
      await loadMemories(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("settings.memories.saveFailed"));
    } finally {
      setSavingId(null);
    }
  }

  function startEditing(memory: BotMemory): void {
    if (savingId()) return;
    setEditingId(memory.id);
    setEditingText(memory.text);
    setAddOpen(false);
    setError(null);
    queueMicrotask(() => {
      editingInput?.focus();
      editingInput?.setSelectionRange(memory.text.length, memory.text.length);
    });
  }

  function openAddComposer(): void {
    setEditingId(null);
    setAddOpen(true);
    setError(null);
    queueMicrotask(() => newMemoryInput?.focus());
  }

  function cancelAddComposer(): void {
    setAddOpen(false);
    setNewText("");
  }

  async function updateMemory(memory: BotMemory): Promise<void> {
    const text = editingText().trim();
    if (!text) return;
    if (text === memory.text) {
      setEditingId(null);
      return;
    }
    setSavingId(memory.id);
    setError(null);
    try {
      await window.lunabot.agent.updateMemory({ botId: props.botId, memoryId: memory.id, text });
      setEditingId(null);
      await loadMemories(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("settings.memories.updateFailed"));
    } finally {
      setSavingId(null);
    }
  }

  async function deleteMemory(memory: BotMemory): Promise<void> {
    setSavingId(memory.id);
    setError(null);
    try {
      await window.lunabot.agent.deleteMemory({ botId: props.botId, memoryId: memory.id });
      if (editingId() === memory.id) setEditingId(null);
      await loadMemories(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("settings.memories.deleteFailed"));
    } finally {
      setSavingId(null);
    }
  }

  async function clearMemories(): Promise<void> {
    setSavingId("clear");
    setError(null);
    try {
      await window.lunabot.agent.clearMemories(props.botId);
      setClearConfirmation(false);
      setEditingId(null);
      await loadMemories(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("settings.memories.clearFailed"));
    } finally {
      setSavingId(null);
    }
  }

  function cancelConfirmation(): void {
    setClearConfirmation(false);
    queueMicrotask(() => confirmationTrigger?.focus());
  }

  return (
    <>
      <Dialog.Root open={props.open} onOpenChange={props.onOpenChange}>
        <Dialog.Portal>
          <Dialog.Overlay class="ui-scrim agent-memories-overlay" />
          <Dialog.Content
            ref={(element) => (modalContent = element)}
            class="agent-memories-modal"
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              modalContent?.focus({ preventScroll: true });
            }}
          >
            <header class="agent-memories-header">
              <div class="agent-memories-heading">
                <Dialog.Title>{t("settings.memories.title")}</Dialog.Title>
                <Dialog.Description class="sr-only">
                  {t("settings.memories.savedFor", { name: props.botName })}
                </Dialog.Description>
              </div>
              <div class="agent-memories-header-actions">
                <IconButton
                  label={t("settings.memories.add")}
                  class="agent-memories-add-button"
                  variant="ghost"
                  disabled={loading() || memories().length >= memoryLimit()}
                  onClick={openAddComposer}
                >
                  <Plus />
                </IconButton>
                <IconButton
                  label={t("settings.memories.close")}
                  variant="ghost"
                  onClick={() => props.onOpenChange(false)}
                >
                  <X />
                </IconButton>
              </div>
            </header>

            <div class="agent-memories-body">
              <Show when={addOpen()}>
                <section class="agent-memory-composer" aria-label={t("settings.memories.add")}>
                  <Textarea
                    ref={(element) => (newMemoryInput = element)}
                    class="agent-memory-input"
                    rows="2"
                    maxlength={INPUT_LIMITS.agentMemoryText}
                    value={newText()}
                    placeholder={t("settings.memories.placeholder")}
                    aria-label={t("settings.memories.newMemory")}
                    onValueChange={setNewText}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        event.preventDefault();
                        event.stopPropagation();
                        cancelAddComposer();
                      }
                      if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                        event.preventDefault();
                        void createMemory();
                      }
                    }}
                  />
                  <div class="agent-memory-composer-actions">
                    <Button size="sm" variant="ghost" onClick={cancelAddComposer}>
                      {t("settings.common.cancel")}
                    </Button>
                    <Button
                      size="sm"
                      variant="default"
                      disabled={!newText().trim()}
                      loading={savingId() === "new"}
                      onClick={() => void createMemory()}
                    >
                      {t("settings.memories.saveMemory")}
                    </Button>
                  </div>
                </section>
              </Show>

              <Show when={memories().length >= memoryLimit()}>
                <p class="agent-memory-limit" role="status">
                  {t("settings.memories.limit", { limit: memoryLimit() })}
                </p>
              </Show>
              <Show when={!clearConfirmation() ? error() : null}>
                {(message) => (
                  <p class="agent-memory-error" role="alert">
                    {message()}
                  </p>
                )}
              </Show>

              <Show when={!loading()} fallback={<p class="agent-memory-state">{t("settings.memories.loading")}</p>}>
                <Show
                  when={memories().length > 0}
                  fallback={<p class="agent-memory-state">{t("settings.memories.empty")}</p>}
                >
                  <ul
                    ref={bindMemoryList}
                    class={[
                      "agent-memory-list",
                      {
                        "scroll-fade-top": fadeAtTop(),
                        "scroll-fade-bottom": fadeAtBottom(),
                      },
                    ]}
                    onScroll={updateScrollFades}
                  >
                    <For each={memories()}>
                      {(memory) => (
                        <li class="agent-memory-row">
                          <Show
                            when={editingId() === memory.id}
                            fallback={
                              <>
                                <Button
                                  type="button"
                                  class="agent-memory-row-main"
                                  variant="ghost"
                                  aria-label={t("settings.memories.editMemory", { text: memory.text })}
                                  onClick={() => startEditing(memory)}
                                >
                                  <span class="agent-memory-text">{memory.text}</span>
                                  <span class="agent-memory-meta">
                                    {memory.origin === "automatic"
                                      ? t("settings.memories.learned")
                                      : t("settings.memories.manual")}
                                    {" · "}
                                    {formatMemoryDate(memory.updatedAt)}
                                  </span>
                                </Button>
                                <IconButton
                                  label={t("settings.memories.delete")}
                                  class="agent-memory-delete-button"
                                  variant="destructive-ghost"
                                  disabled={savingId() === memory.id}
                                  onClick={() => void deleteMemory(memory)}
                                >
                                  <Trash2 />
                                </IconButton>
                              </>
                            }
                          >
                            <div class="agent-memory-editor">
                              <Textarea
                                ref={(element) => (editingInput = element)}
                                class="agent-memory-input"
                                rows="2"
                                maxlength={INPUT_LIMITS.agentMemoryText}
                                value={editingText()}
                                aria-label={t("settings.memories.editAria")}
                                onValueChange={setEditingText}
                                onKeyDown={(event) => {
                                  if (event.key !== "Escape") return;
                                  event.preventDefault();
                                  event.stopPropagation();
                                  setEditingId(null);
                                }}
                              />
                              <div class="agent-memory-editor-actions">
                                <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                                  {t("settings.common.cancel")}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="default"
                                  disabled={!editingText().trim()}
                                  loading={savingId() === memory.id}
                                  onClick={() => void updateMemory(memory)}
                                >
                                  {t("settings.common.save")}
                                </Button>
                              </div>
                            </div>
                          </Show>
                        </li>
                      )}
                    </For>
                  </ul>
                </Show>
              </Show>
            </div>
            <Show when={!loading() && memories().length > 0}>
              <footer class="agent-memories-footer">
                <Button
                  ref={(element) => (confirmationTrigger = element)}
                  size="sm"
                  variant="destructive"
                  onClick={() => setClearConfirmation(true)}
                >
                  {t("settings.memories.clearAll")}
                </Button>
              </footer>
            </Show>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root
        open={clearConfirmation()}
        onOpenChange={(open) => {
          if (!open && savingId() !== "clear") cancelConfirmation();
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay class="ui-scrim agent-memory-confirm-overlay" />
          <Dialog.Content class="agent-memory-confirm-dialog">
            <div class="agent-memory-confirm-content">
              <Dialog.Title>{t("settings.memories.clearTitle")}</Dialog.Title>
              <Dialog.Description>
                {t("settings.memories.clearDescription", { count: memories().length, name: props.botName })}
              </Dialog.Description>
              <Show when={error()}>
                {(message) => (
                  <p class="agent-memory-error" role="alert">
                    {message()}
                  </p>
                )}
              </Show>
              <div class="agent-memory-confirm-actions">
                <Button variant="ghost" disabled={savingId() === "clear"} onClick={cancelConfirmation}>
                  {t("settings.common.cancel")}
                </Button>
                <Button variant="destructive" loading={savingId() === "clear"} onClick={() => void clearMemories()}>
                  {t("settings.memories.clearAll")}
                </Button>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}

function formatMemoryDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return t("settings.memories.unknownDate");
  return new Intl.DateTimeFormat(locale(), { dateStyle: "medium" }).format(date);
}
