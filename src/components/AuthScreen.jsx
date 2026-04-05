import { useState } from 'react';
import { supabase } from '../supabaseClient';

export default function AuthScreen() {
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);
    if (mode === 'signin') {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message);
    } else {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) setError(error.message);
      else setSuccess('Account created! Check your email to confirm before signing in.');
    }
    setLoading(false);
  };

  const handleGoogle = async () => {
    await supabase.auth.signInWithOAuth({ provider: 'google' });
  };

  const inputStyle = {
    width: '100%', padding: '11px 14px', borderRadius: 8,
    border: '1px solid #e0e3ea', background: '#f0f2f7',
    color: '#0d1117', fontSize: 13,
    fontFamily: "'DM Mono', monospace",
    outline: 'none', boxSizing: 'border-box',
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f8f9fc', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Syne', sans-serif", padding: 20 }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500&family=DM+Mono:wght@300;400&display=swap');* { box-sizing: border-box; margin: 0; padding: 0; }`}</style>

      <div style={{ width: '100%', maxWidth: 400 }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ width: 60, height: 60, borderRadius: 16, background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30, margin: '0 auto 14px' }}>🎯</div>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: '#0d1117', marginBottom: 6 }}>
            Radar <span style={{ color: '#3b82f6' }}>AI</span>
          </h1>
          <p style={{ color: '#6b7280', fontSize: 12, fontFamily: "'DM Mono', monospace" }}>
            AI-powered job monitoring & applications
          </p>
        </div>

        {/* Card */}
        <div style={{ background: '#ffffff', border: '1px solid #e0e3ea', borderRadius: 16, padding: 28 }}>
          {/* Mode toggle */}
          <div style={{ display: 'flex', background: '#f0f2f7', borderRadius: 10, padding: 4, marginBottom: 24, gap: 4 }}>
            {[['signin', 'Sign in'], ['signup', 'Sign up']].map(([m, label]) => (
              <button key={m} onClick={() => { setMode(m); setError(null); setSuccess(null); }} style={{
                flex: 1, padding: '8px', borderRadius: 8, border: 'none', cursor: 'pointer',
                background: mode === m ? 'rgba(27,78,243,.1)' : 'transparent',
                color: mode === m ? '#1b4ef3' : '#6b7280',
                fontSize: 12, fontFamily: "'DM Mono', monospace",
                fontWeight: mode === m ? 700 : 400, transition: 'all 0.15s',
              }}>{label}</button>
            ))}
          </div>

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 12 }}>
              <input
                value={email}
                onChange={e => setEmail(e.target.value)}
                type="email"
                placeholder="Email address"
                required
                style={inputStyle}
              />
            </div>
            <div style={{ marginBottom: 20 }}>
              <input
                value={password}
                onChange={e => setPassword(e.target.value)}
                type="password"
                placeholder="Password"
                required
                style={inputStyle}
              />
            </div>

            {error && (
              <div style={{ background: 'rgba(239,68,68,.06)', border: '1px solid #ef444444', borderRadius: 8, padding: '8px 12px', color: '#ef4444', fontSize: 11, fontFamily: "'DM Mono', monospace", marginBottom: 14 }}>
                {error}
              </div>
            )}
            {success && (
              <div style={{ background: 'rgba(16,185,129,.06)', border: '1px solid #10b98144', borderRadius: 8, padding: '8px 12px', color: '#0a8a5c', fontSize: 11, fontFamily: "'DM Mono', monospace", marginBottom: 14 }}>
                {success}
              </div>
            )}

            <button type="submit" disabled={loading} style={{
              width: '100%', padding: '12px', borderRadius: 8, border: 'none',
              cursor: loading ? 'wait' : 'pointer',
              background: loading ? '#e0e3ea' : 'linear-gradient(135deg, rgba(27,78,243,.1), rgba(124,58,237,.1))',
              color: loading ? '#6b7280' : '#1b4ef3',
              fontSize: 13, fontFamily: "'DM Mono', monospace",
              fontWeight: 700, marginBottom: 16,
            }}>
              {loading ? '⏳ Loading...' : mode === 'signin' ? '→ Sign in' : '→ Create account'}
            </button>
          </form>

          {/* Divider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <div style={{ flex: 1, height: 1, background: '#e0e3ea' }} />
            <span style={{ color: '#6b7280', fontSize: 11, fontFamily: "'DM Mono', monospace" }}>or</span>
            <div style={{ flex: 1, height: 1, background: '#e0e3ea' }} />
          </div>

          <button onClick={handleGoogle} style={{
            width: '100%', padding: '12px', borderRadius: 8,
            border: '1px solid #e0e3ea', background: '#f0f2f7',
            color: '#4b5563', cursor: 'pointer',
            fontSize: 13, fontFamily: "'DM Mono', monospace",
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continue with Google
          </button>
        </div>

        <p style={{ textAlign: 'center', color: '#9ca3af', fontSize: 11, fontFamily: "'DM Mono', monospace", marginTop: 20 }}>
          Your data is private and only visible to you.
        </p>
      </div>
    </div>
  );
}
