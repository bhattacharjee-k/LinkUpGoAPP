import { Switch, Route, useLocation, useRoute } from "wouter";
import { AppProvider, useApp } from "./lib/context";
import { Toaster } from "@/components/ui/toaster";
import { Onboarding } from "@/pages/onboarding";
import { Home } from "@/pages/home";
import { Session } from "@/pages/session";
import { NewPlan } from "@/pages/new-plan";
import { GroupDetails } from "@/pages/group-details";
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
    const { groups, addMemberToGroup, user } = useApp();
    const [_, setLocation] = useLocation();
    
    useEffect(() => {
        if (params?.code && user) {
            const group = groups.find(g => g.inviteCode === params.code);
            if (group) {
                addMemberToGroup(group.id, user.id);
                setLocation(`/group/${group.id}`);
            } else {
                // Invalid code
                setLocation('/');
            }
        } else if (!user) {
            // Force onboarding if not logged in
            setLocation('/onboarding');
        }
    }, [params, user, groups]);

    return <div className="flex items-center justify-center h-screen">Joining group...</div>;
}

function JoinPlanRoute() {
    const [match, params] = useRoute('/join-plan/:code');
    const { sessions, addParticipantToSession, addMemberToGroup, user } = useApp();
    const [_, setLocation] = useLocation();
    
    useEffect(() => {
        if (params?.code && user) {
            const session = sessions.find(s => s.inviteCode === params.code);
            if (session) {
                // Add to session
                addParticipantToSession(session.id, user.id);
                // Also implicit add to group if not already
                addMemberToGroup(session.groupId, user.id);
                setLocation(`/session/${session.id}`);
            } else {
                setLocation('/');
            }
        } else if (!user) {
            setLocation('/onboarding');
        }
    }, [params, user, sessions]);

    return <div className="flex items-center justify-center h-screen">Joining plan...</div>;
}

function Router() {
  const { user } = useApp();
  
  return (
    <Switch>
      <Route path="/onboarding" component={Onboarding} />
      
      {/* Groups and Profile just redirect to Home for MVP since we focused on Session flow */}
      <Route path="/groups">
        <PrivateRoute component={Home} />
      </Route>
      <Route path="/group/:id">
        <PrivateRoute component={GroupDetails} />
      </Route>
      <Route path="/join/:code" component={JoinRoute} />
      <Route path="/join-plan/:code" component={JoinPlanRoute} />

      <Route path="/profile">
        <PrivateRoute component={Home} />
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
