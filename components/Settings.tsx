'use client'

import { useEffect, useState } from "react";
import { supabase } from "@/utils/supabase";

interface Props {
  session: any;
}

export default function Settings({ session }: Props) {
  const [displayName, setDisplayName] = useState<string>('');
  const [newName, setNewName] = useState<string>('');

  const userId = session?.user?.id;

  useEffect(() => {
    if (!userId) return;
    supabase.from('profiles').select('display_name').eq('id', userId).single().then(res => {
      if (res.data?.display_name) setDisplayName(res.data.display_name);
    });
  }, [userId]);

  const saveDisplayName = async () => {
    if (!userId) return;
    await supabase.from('profiles').upsert({ id: userId, display_name: newName });
    setDisplayName(newName);
    setNewName('');
  };

  return (
    <div className="flex flex-col gap-2 text-[12px]">
      <span>Current Name: {displayName || 'Anonymous'}</span>
      <input 
        type="text"
        value={newName}
        onChange={e => setNewName(e.target.value)}
        placeholder="Enter display name"
        className="px-2 py-1 rounded bg-black/30 text-white placeholder-white"
      />
      <button 
        onClick={saveDisplayName}
        className="px-2 py-1 rounded-full bg-green-500 text-white font-bold"
      >
        Save
      </button>
    </div>
  );
}

