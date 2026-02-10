import { Switch, Route, useLocation, useRoute } from "wouter";
import { AppProvider, useApp } from "./lib/context";
import { Toaster } from "@/components/ui/toaster";
import { Onboarding } from "@/pages/onboarding";
import { Home } from "@/pages/home";
import { Session } from "@/pages/session";
import { SessionComplete } from "@/pages/session-complete";
import { NewPlan } from "@/pages/new-plan";
import { GroupDetails } from "@/pages/group-details";
import { Groups } from "@/pages/groups";
import { Profile } from "@/pages/profile";
import { History } from "@/pages/history";
import { UpdatesPage } from "@/pages/updates";
import { useEffect, useState } from "react";
import { api } from "./lib/api";
import { ErrorBoundary } from "@/components/error-boundary";

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
    const { joinGroupByCode, user, isLoading, refreshGroups, refreshSessions, sessions } = useApp();
    const [_, setLocation] = useLocation();
    const [joining, setJoining] = useState(false);
    const [joinedGroupId, setJoinedGroupId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    
    useEffect(() => {
        const joinGroup = async () => {
            if (params?.code && user && !isLoading && !joining) {
                setJoining(true);
                try {
                    const group = await joinGroupByCode(params.code);
                    await refreshGroups();
                    await refreshSessions();
                    setJoinedGroupId(group.id);
                } catch (err: any) {
                    console.error("Failed to join group:", err);
                    setError(err.message || "Failed to join group. The invite code may be invalid or expired.");
                }
            } else if (!user && !isLoading) {
                const returnPath = encodeURIComponent(window.location.pathname);
                setLocation(`/onboarding?returnTo=${returnPath}`);
            }
        };
        joinGroup();
    }, [params, user, isLoading, setLocation, joining]);

    useEffect(() => {
        if (joinedGroupId && sessions.length > 0) {
            const activeSession = sessions.find(s => s.groupId === joinedGroupId && s.status !== 'locked');
            if (activeSession) {
                setLocation(`/session/${activeSession.id}`);
            } else {
                setLocation('/');
            }
        }
    }, [joinedGroupId, sessions, setLocation]);

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center h-screen bg-background text-foreground gap-4">
                <div className="text-center">
                    <h2 className="text-xl font-bold text-red-500">Unable to Join</h2>
                    <p className="text-muted-foreground mt-2">{error}</p>
                    <button 
                        onClick={() => setLocation('/')}
                        className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-lg"
                        data-testid="button-go-home-join"
                    >
                        Go Home
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col items-center justify-center h-screen bg-background text-foreground gap-4">
            <div className="w-12 h-12 rounded-full border-4 border-primary border-t-transparent animate-spin" />
            <div className="text-center">
                <h2 className="text-xl font-bold">Joining group...</h2>
            </div>
        </div>
    );
}

function JoinPlanRoute() {
    const [match, params] = useRoute('/join-plan/:code');
    const { user, isLoading, refreshGroups, refreshSessions } = useApp();
    const [_, setLocation] = useLocation();
    const [error, setError] = useState<string | null>(null);
    
    useEffect(() => {
        const joinSession = async () => {
            if (!user && !isLoading) {
                const returnPath = encodeURIComponent(window.location.pathname);
                setLocation(`/onboarding?returnTo=${returnPath}`);
                return;
            }
            
            if (params?.code && user && !isLoading) {
                try {
                    const result = await api.sessions.join(params.code);
                    await refreshGroups();
                    await refreshSessions();
                    setLocation(`/session/${result.session.id}`);
                } catch (err: any) {
                    console.error("Failed to join session:", err);
                    setError(err.message || "Failed to join plan");
                }
            }
        };
        joinSession();
    }, [params, user, isLoading, setLocation, refreshGroups, refreshSessions]);

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center h-screen bg-background text-foreground gap-4">
                <div className="text-center">
                    <h2 className="text-xl font-bold text-red-500">Unable to Join</h2>
                    <p className="text-muted-foreground mt-2">{error}</p>
                    <button 
                        onClick={() => setLocation('/')}
                        className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-lg"
                        data-testid="button-go-home"
                    >
                        Go Home
                    </button>
                </div>
            </div>
        );
    }

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
      
      <Route path="/updates">
        <PrivateRoute component={UpdatesPage} />
      </Route>
      
      {/* New Session Creation Mock */}
      <Route path="/new-session">
        <PrivateRoute component={NewPlan} />
      </Route>

      <Route path="/session/:id/complete" component={SessionComplete} />
      <Route path="/session/:id" component={Session} />
      
      <Route path="/" component={user ? Home : Onboarding} />
      
      <Route>404 Not Found</Route>
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <AppProvider>
        <Toaster />
        <Router />
      </AppProvider>
    </ErrorBoundary>
  );
}

export default App;
