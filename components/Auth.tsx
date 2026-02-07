'use client'

import { useEffect, useState } from "react";
import { supabase } from "@/utils/supabase";
import Viewer from "@/components/Viewer";

const GOOGLE_CLIENT_ID =
  "793044353905-r0ahk1kn0ps2mu5vqgf7m47t6dm43eb3.apps.googleusercontent.com";

export default function Auth() {
  const [session, setSession] = useState<any>(null);

  useEffect(() => {
    let interval: number | null = null;

    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    document.body.appendChild(script);

    const waitForGoogle = () => {
      // @ts-ignore
      if (!window.google?.accounts?.id) return;
      if (interval) window.clearInterval(interval);

      // @ts-ignore
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        use_fedcm_for_prompt: true,
        callback: async (res: any) => {
          const { data, error } = await supabase.auth.signInWithIdToken({
            provider: "google",
            token: res.credential,
          });

          if (!error) setSession(data.session);
        },
      });

      const render = () => {
        const btn = document.getElementById("googleButton");
        if (!btn) {
          requestAnimationFrame(render);
          return;
        }

        btn.innerHTML = "";

        // @ts-ignore
        window.google.accounts.id.renderButton(btn, {
          theme: "outline",
          size: "large",
          width: 260,
        });
      };

      render();
    };

    interval = window.setInterval(waitForGoogle, 120);

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setSession(data.session);
    });

    const { data: authListener } =
      supabase.auth.onAuthStateChange((_e, s) => setSession(s));

    return () => {
      if (interval) window.clearInterval(interval);
      authListener.subscription.unsubscribe();
      script.remove();
    };
  }, []);

  if (!session) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-black z-[10000]">
        <div id="googleButton" />
      </div>
    );
  }

  return <Viewer session={session} />;
}

