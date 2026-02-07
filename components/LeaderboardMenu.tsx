'use client'

import { useState } from 'react';
import { supabase } from '@/utils/supabase';

interface LeaderboardMenuProps {
  session: any;
}

interface LeaderboardEntry {
  user_id: string;
  count: number;
}

export default function LeaderboardMenu({ session }: LeaderboardMenuProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);

  const fetchLeaderboard = async () => {
    const { data } = await supabase
      .from('voxels')
      .select('user_id');

    if (!data) return;

    const counts: Record<string, number> = {};
    data.forEach((v: any) => {
      counts[v.user_id] = (counts[v.user_id] || 0) + 1;
    });

    const leaderboardData = Object.entries(counts)
      .map(([user_id, count]) => ({ user_id, count }))
      .sort((a, b) => b.count - a.count);

    setLeaderboard(leaderboardData);
  };

  return (
    <>
      {/* Menu Button Top Right */}
      <div className="fixed top-6 right-6 pointer-events-auto">
        <button
          className="px-4 py-2 rounded-full text-[10px] font-bold shadow-xl border bg-white text-black border-white transition-all"
          onClick={() => { 
            setShowMenu(!showMenu);
            if (!showMenu) fetchLeaderboard();
          }}
        >
          ☰ Menu
        </button>
      </div>

      {/* Leaderboard Modal */}
      {showMenu && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[10000] pointer-events-auto">
          <div className="bg-white rounded-2xl p-6 w-[260px] max-h-[400px] overflow-y-auto flex flex-col gap-4 shadow-2xl">
            <h2 className="text-lg font-bold text-center">Leaderboard</h2>
            {leaderboard.length === 0 && <p className="text-center text-gray-500">No blocks placed yet</p>}
            <ul className="flex flex-col gap-2">
              {leaderboard.map((entry, idx) => (
                <li key={entry.user_id} className="flex justify-between border-b border-gray-200 pb-1">
                  <span>{idx+1}. {entry.user_id === session.user.id ? "You" : entry.user_id}</span>
                  <span>{entry.count}</span>
                </li>
              ))}
            </ul>
            <button
              className="mt-4 px-4 py-2 rounded-full bg-black text-white text-[12px] font-bold shadow-xl"
              onClick={() => setShowMenu(false)}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
}
