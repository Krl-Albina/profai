import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { ReactNode } from "react";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Header from "./components/Header";
import Home from "./pages/Home";
import Onboarding from "./pages/Onboarding";
import Dashboard from "./pages/Dashboard";
import Jobs from "./pages/Jobs";
import Interview from "./pages/Interview";
import Resume from "./pages/Resume";
import RoleGuard from "./components/routing/RoleGuard";
import { I18nProvider } from "./contexts/I18nContext";
import { useStore } from "./store/useStore";

function AppHydrationGate({ children }: { children: ReactNode }) {
  const hasHydrated = useStore((state) => state.hasHydrated);

  if (!hasHydrated) {
    return <div className="min-h-screen bg-background" aria-hidden="true" />;
  }

  return children;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/onboarding">
        <RoleGuard allowedRoles={["seeker"]} redirectTo="/">
          <Onboarding />
        </RoleGuard>
      </Route>
      <Route path="/dashboard">
        <RoleGuard allowedRoles={["seeker"]} redirectTo="/">
          <Dashboard />
        </RoleGuard>
      </Route>
      <Route path="/jobs">
        <RoleGuard allowedRoles={["seeker"]} redirectTo="/">
          <Jobs />
        </RoleGuard>
      </Route>
      <Route path="/interview">
        <RoleGuard allowedRoles={["seeker"]} redirectTo="/">
          <Interview />
        </RoleGuard>
      </Route>
      <Route path="/resume">
        <RoleGuard allowedRoles={["seeker"]} redirectTo="/">
          <Resume />
        </RoleGuard>
      </Route>
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <I18nProvider>
          <TooltipProvider>
            <AppHydrationGate>
              <Toaster />
              <Header />
              <Router />
            </AppHydrationGate>
          </TooltipProvider>
        </I18nProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
