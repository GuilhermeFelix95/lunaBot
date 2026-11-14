import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { QrCode } from "../src/components/ui";

const meta = {
  title: "Foundation/QrCode",
  component: QrCode,
  args: {
    value: "https://example.com/?ticket=storybook-ticket_1234567890abcdef",
    label: "Example QR code",
  },
  parameters: { layout: "centered", a11y: { test: "error" } },
} satisfies Meta<typeof QrCode>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
