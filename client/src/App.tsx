import { Switch, Route, useLocation } from "wouter";
import { AppProvider, useApp } from "./lib/context";
import { Toaster } from "@/components/ui/toaster";
import { Onboarding } from "@/pages/onboarding";
import { Home } from "@/pages/home";
import { Session } from "@/pages/session";
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

function Router() {
  const { user } = useApp();
  
  return (
    <Switch>
      <Route path="/onboarding" component={Onboarding} />
      
      {/* Groups and Profile just redirect to Home for MVP since we focused on Session flow */}
      <Route path="/groups">
        <PrivateRoute component={Home} />
      </Route>
      <Route path="/profile">
        <PrivateRoute component={Home} />
      </Route>
      
      {/* New Session Creation Mock */}
      <Route path="/new-session">
        {() => {
            const { startSession, user } = useApp();
            const [_, setLocation] = useLocation();
            useEffect(() => {
                // Auto-create a session for demo purposes
                const id = startSession('g1', {
                    timeWindow: 'Fri-Night',
                    locationScope: user?.city || 'NYC',
                    category: ['Drinks'],
                    energy: 'Social',
                    budget: '$$'
                });
                setLocation(`/session/${id}`);
            }, []);
            return <div className="flex items-center justify-center h-screen">Initializing Planner...</div>
        }}
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
