'use client'

import { useEffect, useState } from "react";
import { supabase } from "@/utils/supabase";
import Viewer from "@/components/Viewer";

export default function Auth() {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState(""); // Swapped email for username
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setSession(data.session);
      setLoading(false);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => authListener.subscription.unsubscribe();
  }, []);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    
    // We create a dummy email since Supabase Auth requires it for standard auth
    const dummyEmail = `${username.toLowerCase()}@voxels.app`;

    if (isSignUp) {
      // 1. Sign up the user in Supabase Auth
      const { data, error: authError } = await supabase.auth.signUp({ 
        email: dummyEmail, 
        password 
      });

      if (authError) return setErrorMsg(authError.message);

      if (data.user) {
        // 2. Immediately create the profile mapping
        const { error: profileError } = await supabase
          .from('profiles')
          .insert([{ id: data.user.id, username: username }]);

        if (profileError) {
          setErrorMsg("Username taken or invalid.");
          // Optional: delete auth user if profile fails
        }
      }
    } else {
      // Sign In logic
      const { error } = await supabase.auth.signInWithPassword({ 
        email: dummyEmail, 
        password 
      });
      if (error) setErrorMsg(error.message === "Invalid login credentials" ? "USER_NOT_FOUND OR WRONG_PASS" : error.message);
    }
  };

  if (loading) return <div className="fixed inset-0 bg-black flex items-center justify-center text-white font-mono tracking-tighter uppercase">LOADING_VOXEL_SYSTEM...</div>;

  if (!session) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-black z-[10000] p-6">
        <div className="w-full max-w-sm space-y-8">
          <div className="text-center">
            <h1 className="text-white text-2xl font-black tracking-tighter uppercase">Voxel_Identity</h1>
            <p className="text-white/40 text-[10px] uppercase tracking-widest mt-2">Access Grid via Username</p>
          </div>

          <form onSubmit={handleAuth} className="space-y-4">
            <input
              type="text"
              placeholder="USERNAME"
              value={username}
              onChange={(e) => setUsername(e.target.value.trim())}
              className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-white placeholder:text-white/20 focus:outline-none focus:border-white/40 transition-colors uppercase text-sm"
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
              {isSignUp ? "Register User" : "Sync Session"}
            </button>
          </form>

          <button 
            onClick={() => { setIsSignUp(!isSignUp); setErrorMsg(""); }}
            className="w-full text-white/40 text-[10px] uppercase tracking-widest hover:text-white transition-colors"
          >
            {isSignUp ? "Existing User? Sign In" : "New User? Create Profile"}
          </button>
        </div>
      </div>
    );
  }

  return <Viewer session={session} />;
}