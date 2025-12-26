import React from 'react';
import { useLocation } from 'wouter';
import { Home, Users, User, PlusCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import bgImage from '@assets/generated_images/abstract_vibrant_social_connection_nightlife_background.png';

interface LayoutProps {
  children: React.ReactNode;
  hideNav?: boolean;
}

export function Layout({ children, hideNav = false }: LayoutProps) {
  const [location, setLocation] = useLocation();

  const navItems = [
    { icon: Home, label: 'Home', path: '/' },
    { icon: Users, label: 'Groups', path: '/groups' },
    { icon: User, label: 'Profile', path: '/profile' },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground font-sans relative overflow-hidden flex flex-col">
      {/* Background with Overlay */}
      <div className="fixed inset-0 z-0">
        <img 
          src={bgImage} 
          alt="Background" 
          className="w-full h-full object-cover opacity-30 blur-2xl scale-110" 
        />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/80 to-background" />
      </div>

      {/* Main Content */}
      <main className="relative z-10 flex-1 flex flex-col max-w-md mx-auto w-full pb-20">
        {children}
      </main>

      {/* Bottom Navigation */}
      {!hideNav && (
        <div className="fixed bottom-0 left-0 right-0 z-50 flex justify-center pb-safe">
          <nav className="glass-panel mx-4 mb-4 px-6 py-3 rounded-2xl flex items-center justify-between w-full max-w-md backdrop-blur-xl bg-black/40 border-white/10">
            {navItems.map((item) => {
              const isActive = location === item.path;
              return (
                <button
                  key={item.path}
                  onClick={() => setLocation(item.path)}
                  className={cn(
                    "flex flex-col items-center gap-1 transition-all duration-200 p-2 rounded-lg",
                    isActive ? "text-primary scale-110" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <item.icon size={24} strokeWidth={isActive ? 2.5 : 2} />
                  <span className="text-[10px] font-medium tracking-wide">{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>
      )}
    </div>
  );
}
