import { Switch, Route, useLocation, useRoute } from "wouter";
import { AppProvider, useApp } from "./lib/context";
import { Toaster } from "@/components/ui/toaster";
import { Onboarding } from "@/pages/onboarding";
import { Home } from "@/pages/home";
import { Session } from "@/pages/session";
import { NewPlan } from "@/pages/new-plan";
import { GroupDetails } from "@/pages/group-details";
import { Groups } from "@/pages/groups";
import { Profile } from "@/pages/profile";
import { History } from "@/pages/history";
import { useEffect } from "react";

function PrivateRoute({ component: Component }: { component: React.ComponentType }) {
  const { user } = useApp();
  const [_, setLocation] = useLocation();

  useEffect(() => {
    if (!user) {
      setLocation('/onboarding');
    }
  }, [user, setLocation]);

  if (!user) return null;
  return <Component />;
}

function JoinRoute() {
    const [match, params] = useRoute('/join/:code');
    const { joinGroupByCode, user, isLoading } = useApp();
    const [_, setLocation] = useLocation();
    
    useEffect(() => {
        const joinGroup = async () => {
            if (params?.code && user && !isLoading) {
                try {
                    await joinGroupByCode(params.code);
                    // Group has been joined, find it and redirect
                    setLocation('/');
                } catch (error) {
                    console.error("Failed to join group:", error);
                    setLocation('/');
                }
            } else if (!user && !isLoading) {
                // Force onboarding if not logged in, preserve return path
                const returnPath = encodeURIComponent(window.location.pathname);
                setLocation(`/onboarding?returnTo=${returnPath}`);
            }
        };
        joinGroup();
    }, [params, user, isLoading, setLocation]);

    return <div className="flex items-center justify-center h-screen">Joining group...</div>;
}

function JoinPlanRoute() {
    const [match, params] = useRoute('/join-plan/:code');
    const { user, isLoading } = useApp();
    const [_, setLocation] = useLocation();
    
    useEffect(() => {
        // For session invite links, we'll implement this after MVP
        // For now, just redirect to home
        if (!user && !isLoading) {
            const returnPath = encodeURIComponent(window.location.pathname);
            setLocation(`/onboarding?returnTo=${returnPath}`);
        } else if (user) {
            setLocation('/');
        }
    }, [params, user, isLoading, setLocation]);

    return (
        <div className="flex flex-col items-center justify-center h-screen bg-background text-foreground gap-4">
            <div className="w-12 h-12 rounded-full border-4 border-primary border-t-transparent animate-spin" />
            <div className="text-center">
                <h2 className="text-xl font-bold">Joining Plan...</h2>
            </div>
        </div>
    );
}

function Router() {
  const { user } = useApp();
  
  return (
    <Switch>
      <Route path="/onboarding" component={Onboarding} />
      
      <Route path="/groups">
        <PrivateRoute component={Home} />
      </Route>
      <Route path="/group/:id">
        <PrivateRoute component={Home} />
      </Route>
      <Route path="/join/:code" component={JoinRoute} />
      <Route path="/join-plan/:code" component={JoinPlanRoute} />

      <Route path="/profile">
        <PrivateRoute component={Profile} />
      </Route>
      
      <Route path="/history">
        <PrivateRoute component={History} />
      </Route>
      
      {/* New Session Creation Mock */}
      <Route path="/new-session">
        <PrivateRoute component={NewPlan} />
      </Route>

      <Route path="/session/:id" component={Session} />
      
      <Route path="/" component={user ? Home : Onboarding} />
      
      <Route>404 Not Found</Route>
    </Switch>
  );
}

function App() {
  return (
    <AppProvider>
      <Toaster />
      <Router />
    </AppProvider>
  );
}

export default App;
