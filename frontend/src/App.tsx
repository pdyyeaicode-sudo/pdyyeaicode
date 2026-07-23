import { Spinner } from "@astryxdesign/core/Spinner";
import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { ReactLenis } from "lenis/react";
import { AnimatePresence, motion } from "framer-motion";

import DashboardPage from "./pages/DashboardPage";
import WelcomePage from "./pages/WelcomePage";
import LoginPage from "./pages/login-split/page";
import PricingPage from "./pages/PricingPage";
import AboutPage from "./pages/AboutPage";

const PydreeStudio = lazy(() => import("./pydree/PydreeStudio"));

/**
 * App — Main application router
 * 
 * Routes:
 * /          Landing page (home)
 * /login     Clerk Split Login page
 * /pricing   India Pricing & Razorpay checkout
 * /about     About Pdyee AI company & product
 * /editor    Canvas editor
 */
interface AppProps {
  isAuthenticationConfigured: boolean;
}

function ProtectedRoute({ children }: { children: JSX.Element }): JSX.Element {
  return children;
}

function HomeRoute(): JSX.Element {
  return <WelcomePage />;
}

const pageVariants = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -10 }
};

function PageWrapper({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial="initial"
      animate="animate"
      exit="exit"
      variants={pageVariants}
      transition={{ duration: 0.3, ease: "easeInOut" }}
      style={{ width: "100%", height: "100%" }}
    >
      {children}
    </motion.div>
  );
}

function SmoothScroller({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const isEditor = location.pathname.includes("/editor");
  
  if (isEditor) {
    return <>{children}</>;
  }
  
  return <ReactLenis root>{children}</ReactLenis>;
}

function AnimatedRoutes({ isAuthenticationConfigured }: { isAuthenticationConfigured: boolean }) {
  const location = useLocation();
  return (
    <SmoothScroller>
      <AnimatePresence mode="wait">
        <Routes location={location} key={location.pathname}>
          <Route path="/" element={<PageWrapper><HomeRoute /></PageWrapper>} />
          <Route path="/login" element={<PageWrapper><LoginPage /></PageWrapper>} />
          <Route path="/pricing" element={<PageWrapper><PricingPage /></PageWrapper>} />
          <Route path="/about" element={<PageWrapper><AboutPage /></PageWrapper>} />
          <Route path="/dashboard" element={<ProtectedRoute><PageWrapper><DashboardPage /></PageWrapper></ProtectedRoute>} />
          <Route path="/editor" element={<PageWrapper><EditorRoute /></PageWrapper>} />
          <Route path="/settings" element={<Navigate to="/dashboard" replace />} />
          <Route path="/templates" element={<Navigate to="/dashboard" replace />} />
          <Route path="/help" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AnimatePresence>
    </SmoothScroller>
  );
}

function AuthLoading(): JSX.Element {
  return <Spinner label="Loading your workspace" size="lg" />;
}

function EditorRoute(): JSX.Element {
  return (
    <ProtectedRoute>
      <Suspense fallback={<AuthLoading />}>
        <PydreeStudio />
      </Suspense>
    </ProtectedRoute>
  );
}

function App({ isAuthenticationConfigured }: AppProps): JSX.Element {
  return (
    <BrowserRouter>
      <AnimatedRoutes isAuthenticationConfigured={isAuthenticationConfigured} />
    </BrowserRouter>
  );
}

export default App;
