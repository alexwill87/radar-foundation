import { createContext, useContext, useEffect, useState } from 'react';
import { supabase, DEMO_MODE } from '../supabaseClient';

const AuthContext = createContext(null);

const DEMO_USER = {
  id: 'demo-user-001',
  email: 'demo@radar-app.com',
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(DEMO_MODE ? DEMO_USER : null);
  const [loading, setLoading] = useState(!DEMO_MODE);

  useEffect(() => {
    if (DEMO_MODE) return;
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, demoMode: DEMO_MODE }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
