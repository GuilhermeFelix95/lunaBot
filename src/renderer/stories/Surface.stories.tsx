import type { Meta, StoryObj } from "storybook-solidjs-vite";
import {
  Alert,
  AlertActions,
  AlertContent,
  AlertDescription,
  AlertIcon,
  AlertTitle,
  Button,
  Card,
  Check,
  Heading,
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
  Kbd,
  Separator,
  SettingsSection,
  ShieldCheck,
  Skeleton,
  Spinner,
  Text,
  UserRound,
} from "../src/components/ui";

const meta = {
  title: "Foundations/Surface",
  parameters: { layout: "fullscreen", a11y: { test: "error" } },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const Gallery: Story = {
  render: () => (
    <main class="foundation-story">
      <Heading as="h1" size="lg">
        Surfaces and feedback
      </Heading>
      <div class="foundation-surface-grid">
        <Card class="foundation-surface-card">
          <Heading as="h2" size="sm">
            Card
          </Heading>
          <Text tone="secondary">A neutral container for related information and actions.</Text>
          <Separator />
          <Text variant="caption" tone="muted">
            Press <Kbd>⌘K</Kbd> to search
          </Text>
        </Card>
        <Card class="foundation-surface-card">
          <Heading as="h2" size="sm">
            Loading
          </Heading>
          <div class="foundation-story-row">
            <Spinner label="Loading content" />
            <Text tone="secondary">Loading content…</Text>
          </div>
          <div class="foundation-skeleton-stack">
            <Skeleton class="foundation-skeleton-line" />
            <Skeleton class="foundation-skeleton-line foundation-skeleton-line-short" />
          </div>
        </Card>
      </div>

      <section class="foundation-story-section" aria-labelledby="item-primitives">
        <Heading id="item-primitives" as="h2" size="sm">
          Items
        </Heading>
        <ItemGroup>
          <Item>
            <ItemMedia>
              <UserRound aria-hidden="true" />
            </ItemMedia>
            <ItemContent>
              <ItemTitle>Research notes</ItemTitle>
              <ItemDescription>12 sources · updated today</ItemDescription>
            </ItemContent>
            <ItemActions>
              <Button size="sm" variant="ghost">
                Manage
              </Button>
            </ItemActions>
          </Item>
          <Item size="compact">
            <ItemContent>
              <ItemTitle>Draft reply</ItemTitle>
              <ItemDescription>Saved at 10:00</ItemDescription>
            </ItemContent>
          </Item>
        </ItemGroup>
      </section>

      <SettingsSection
        class="foundation-story-section"
        title="Preferences"
        description="Settings for this app."
        actions={
          <Button size="sm" variant="ghost">
            Manage
          </Button>
        }
      >
        <ItemGroup surface="subtle">
          <Item>
            <ItemContent>
              <ItemTitle>Restore recent conversation</ItemTitle>
              <ItemDescription>Return to the conversation from your previous session.</ItemDescription>
            </ItemContent>
            <ItemActions>
              <Button size="sm" variant="outline">
                Configure
              </Button>
            </ItemActions>
          </Item>
        </ItemGroup>
      </SettingsSection>

      <section class="foundation-story-section" aria-labelledby="alert-primitives">
        <Heading id="alert-primitives" as="h2" size="sm">
          Alerts
        </Heading>
        <div class="foundation-skeleton-stack">
          <Alert tone="neutral">
            <AlertIcon>
              <ShieldCheck />
            </AlertIcon>
            <AlertContent>
              <AlertTitle>Changes are local</AlertTitle>
              <AlertDescription>Nothing leaves this computer until you export it.</AlertDescription>
            </AlertContent>
          </Alert>
          <Alert tone="success">
            <AlertIcon>
              <Check />
            </AlertIcon>
            <AlertContent>
              <AlertTitle>Export ready</AlertTitle>
              <AlertDescription>The file can now be saved.</AlertDescription>
            </AlertContent>
            <AlertActions>
              <Button size="sm" variant="ghost">
                Copy path
              </Button>
            </AlertActions>
          </Alert>
          <Alert tone="warning">
            <AlertContent>
              <AlertTitle>Setup required</AlertTitle>
              <AlertDescription>Choose a folder before continuing.</AlertDescription>
            </AlertContent>
          </Alert>
          <Alert tone="danger" role="alert">
            <AlertContent>
              <AlertTitle>Update failed</AlertTitle>
              <AlertDescription>The agent did not respond.</AlertDescription>
            </AlertContent>
          </Alert>
        </div>
      </section>
    </main>
  ),
};
