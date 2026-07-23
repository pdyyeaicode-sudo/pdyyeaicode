import { Card } from "@astryxdesign/core/Card";
import { Stack } from "@astryxdesign/core/Layout";
import { Text } from "@astryxdesign/core/Text";

/** Displays a safe, explicit blocking state until Clerk is configured. */
export default function AuthenticationConfigurationPage(): JSX.Element {
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "2rem" }}>
      <Card padding={6} maxWidth="40rem">
        <Stack gap={3}>
          <Text type="display-2" as="h1">Connect authentication</Text>
          <Text type="large">Dreamer needs Clerk before a workspace or editor can be opened.</Text>
          <Text type="supporting">
            Add VITE_CLERK_PUBLISHABLE_KEY to frontend/.env.local, then restart the Vite server.
          </Text>
        </Stack>
      </Card>
    </main>
  );
}
