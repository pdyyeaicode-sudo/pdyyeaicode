import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Theme } from "@astryxdesign/core/theme";
import { neutralTheme } from "@astryxdesign/theme-neutral/built";
import { ClerkProvider } from "@clerk/react";

import "@astryxdesign/core/reset.css";
import "@astryxdesign/core/astryx.css";
import "@astryxdesign/theme-neutral/theme.css";

import App from "./App";
import { AppErrorBoundary } from "./components/AppErrorBoundary";

import { ReactLenis } from 'lenis/react';

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element #root was not found.");
}

// Default fallback key if environment variable is not yet supplied by user
const PUBLISHABLE_KEY =
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ||
  "pk_test_c2FjcmVkLWJ1ZmZhbG8tNDEuY2xlcmsuYWNjb3VudHMuZGV2JA";

createRoot(rootElement).render(
  <StrictMode>
    <AppErrorBoundary>
      <ClerkProvider publishableKey={PUBLISHABLE_KEY}>
        <Theme theme={neutralTheme}>
          <ReactLenis root options={{ lerp: 0.1, duration: 1.5, smoothWheel: true }}>
            <App isAuthenticationConfigured={true} />
          </ReactLenis>
        </Theme>
      </ClerkProvider>
    </AppErrorBoundary>
  </StrictMode>,
);
