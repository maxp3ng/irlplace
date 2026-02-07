'use client'

import { useEffect, useState } from 'react';
import { supabase } from '@/utils/supabase';

interface Leader {
  username: string;
  count: number;
}

// Explicitly defining the accumulator shape for TypeScript safety
interface LeaderAccumulator {
  [key: string]: Leader;
}

export default function LeaderboardMenu({ session }: { session: any }) {
  const [leaders, setLeaders] = useState<Leader[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const fetchLeaderboard = async () => {
  // Now we just ask for profiles(username) 
  // because the foreign keys match perfectly.
  const { data, error } = await supabase
    .from('voxels')
    .select(`
      user_id,
      profiles (
        username
      )
    `);

  if (error) {
    console.error("Fetch error:", error);
    return;
  }

  if (data) {
    const counts: LeaderAccumulator = {};
    
    data.forEach((item: any) => {
      const uid = item.user_id;
      // profiles will be a single object because it's a 1-to-1 or 1-to-many join
      const name = item.profiles?.display_name;

      if (name) {
        if (!counts[uid]) {
          counts[uid] = { username: name, count: 0 };
        }
        counts[uid].count++;
      }
    });

    const sortedLeaders = Object.values(counts)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    setLeaders(sortedLeaders);
  }
};

    fetchLeaderboard();
    
    // Auto-update leaderboard when voxels table changes
    const channel = supabase.channel('leaderboard_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'voxels' }, fetchLeaderboard)
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  return (
    <div className="flex flex-col items-start gap-2 max-w-[200px]">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="bg-black/60 backdrop-blur-md border border-white/10 px-4 py-2 rounded-2xl text-white text-[10px] font-black uppercase tracking-widest active:scale-95 transition-all shadow-xl pointer-events-auto"
      >
        {isOpen ? 'CLOSE_RANKINGS' : 'VIEW_LEADERBOARD'}
      </button>

      {isOpen && (
        <div className="w-full bg-black/80 backdrop-blur-xl border border-white/10 rounded-2xl p-4 space-y-3 animate-in fade-in slide-in-from-top-2 pointer-events-auto">
          <h3 className="text-white/40 text-[9px] font-bold uppercase tracking-[0.2em] border-b border-white/5 pb-2">Top_Architects</h3>
          <div className="space-y-2">
            {leaders.length > 0 ? (
              leaders.map((leader, i) => (
                <div key={i} className="flex justify-between items-center">
                  <span className="text-white text-[11px] font-mono tracking-tighter truncate pr-2">
                    {i + 1}. {leader.username}
                  </span>
                  <span className="text-white font-black text-[10px] bg-white/10 px-2 py-0.5 rounded-md">
                    {leader.count}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-white/20 text-[9px] uppercase italic">No data yet...</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}