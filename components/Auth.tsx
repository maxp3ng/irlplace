'use client'

import { useEffect, useState } from "react";
import { supabase } from "@/utils/supabase";
import Viewer from "@/components/Viewer";

export default function Auth() {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    // Initial session check
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setSession(data.session);
      setLoading(false);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    
    const { data, error } = isSignUp 
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setErrorMsg(error.message);
    } else if (isSignUp && !data.session) {
      setErrorMsg("Check your email for a confirmation link!");
    }
  };

  if (loading) return <div className="fixed inset-0 bg-black flex items-center justify-center text-white font-mono tracking-tighter">LOADING_SYSTEM...</div>;

  if (!session) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-black z-[10000] p-6">
        <div className="w-full max-w-sm space-y-8">
          <div className="text-center">
            <h1 className="text-white text-2xl font-black tracking-tighter uppercase">Voxel_Login</h1>
            <p className="text-white/40 text-[10px] uppercase tracking-widest mt-2">Enter credentials to proceed</p>
          </div>

          <form onSubmit={handleAuth} className="space-y-4">
            <input
              type="email"
              placeholder="EMAIL"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-white placeholder:text-white/20 focus:outline-none focus:border-white/40 transition-colors"
              required
            />
            <input
              type="password"
              placeholder="PASSWORD"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-white placeholder:text-white/20 focus:outline-none focus:border-white/40 transition-colors"
              required
            />
            
            {errorMsg && <p className="text-red-500 text-[10px] font-bold text-center uppercase tracking-tight">{errorMsg}</p>}

            <button type="submit" className="w-full bg-white text-black font-black py-4 rounded-2xl active:scale-95 transition-transform uppercase tracking-widest text-xs">
              {isSignUp ? "Create Account" : "Initialize Session"}
            </button>
          </form>

          <button 
            onClick={() => setIsSignUp(!isSignUp)}
            className="w-full text-white/40 text-[10px] uppercase tracking-widest hover:text-white transition-colors"
          >
            {isSignUp ? "Already have a login? Sign In" : "Need an account? Sign Up"}
          </button>
        </div>
      </div>
    );
  }

  return <Viewer session={session} />;
}