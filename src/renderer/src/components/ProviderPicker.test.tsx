import { fireEvent, render } from "@solidjs/testing-library";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProviderPicker, type ProviderPickerOption } from "./ProviderPicker";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const claudeChecking: ProviderPickerOption[] = [{ id: "claude", name: "Claude", state: "checking" }];

describe("ProviderPicker", () => {
  it("offers a retry when a provider status never arrives", async () => {
    vi.useFakeTimers();
    const onRefreshProviders = vi.fn();
    const view = render(() => (
      <ProviderPicker
        value={null}
        options={claudeChecking}
        ariaLabel="Default provider"
        onChange={vi.fn()}
        onRefreshProviders={onRefreshProviders}
      />
    ));

    expect(view.getByText("Checking…")).toBeInTheDocument();
    expect(view.queryByRole("button", { name: "Try Claude again" })).toBeNull();

    await vi.advanceTimersByTimeAsync(10_000);

    expect(view.getByText("Couldn't verify")).toBeInTheDocument();
    expect(view.queryByText("Checking…")).toBeNull();
    await fireEvent.click(view.getByRole("button", { name: "Try Claude again" }));
    expect(onRefreshProviders).toHaveBeenCalledOnce();
  });

  it("reconnects an available provider from its reconnect control", async () => {
    const onConnectProvider = vi.fn();
    const view = render(() => (
      <ProviderPicker
        value="claude"
        options={[{ id: "claude", name: "Claude", state: "available" }]}
        ariaLabel="Default provider"
        onChange={vi.fn()}
        onConnectProvider={onConnectProvider}
      />
    ));

    expect(view.getByRole("radio", { name: /Claude/ })).toBeChecked();
    expect(view.getByText("Connected")).toBeInTheDocument();
    await fireEvent.click(view.getByRole("button", { name: "Reconnect Claude" }));
    expect(onConnectProvider).toHaveBeenCalledWith("claude");
  });
});
