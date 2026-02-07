'use client'

import { useEffect, useState } from "react";
import { supabase } from "@/utils/supabase";

interface Props {}

export default function Leaderboard(props: Props) {
  const [leaderboard, setLeaderboard] = useState<any[]>([]);

  useEffect(() => {
    const loadLeaderboard = async () => {
      const { data } = await supabase.from('voxels').select('user_id');
      if (!data) return;

      // Count voxels per user
      const counts: Record<string, number> = {};
      data.forEach(v => counts[v.user_id] = (counts[v.user_id] || 0) + 1);

      // Fetch display names
      const users = await Promise.all(Object.keys(counts).map(async id => {
        const { data } = await supabase.from('profiles').select('display_name').eq('id', id).single();
        return { id, name: data?.display_name || 'Anonymous', count: counts[id] };
      }));

      setLeaderboard(users.sort((a, b) => b.count - a.count));
    };

    loadLeaderboard();
  }, []);

  return (
    <div className="flex flex-col gap-2 max-h-[300px] overflow-y-auto text-[12px]">
      {leaderboard.map((u, i) => (
        <div key={u.id} className="flex justify-between font-mono">
          <span>{i+1}. {u.name}</span>
          <span>{u.count}</span>
        </div>
      ))}
    </div>
  );
}

