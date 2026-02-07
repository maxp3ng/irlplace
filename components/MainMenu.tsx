'use client'

import { useState, useEffect } from 'react';
import { supabase } from '@/utils/supabase';
import * as THREE from "three";

interface MainMenuProps {
  session: any;
  rendererRef: React.RefObject<THREE.WebGLRenderer | null>;
}

export default function MainMenu({ session, rendererRef }: MainMenuProps) {
  const [activeTab, setActiveTab] = useState<'leaderboard' | 'gallery' | 'settings'>('leaderboard');
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [gallery, setGallery] = useState<any[]>([]);
  const [username, setUsername] = useState<string>(session?.user?.user_metadata?.username || '');
  const [capturing, setCapturing] = useState(false);

  useEffect(() => {
    const fetchLB = async () => {
      const { data: voxels } = await supabase.from('voxels').select('user_id');
      const { data: profiles } = await supabase.from('profiles').select('id, username');
      if (!voxels) return;

      const counts: Record<string, number> = {};
      voxels.forEach((v: any) => counts[v.user_id] = (counts[v.user_id] || 0) + 1);
      const profileMap: Record<string, string> = {};
      profiles?.forEach(p => profileMap[p.id] = p.username);

      const lb = Object.entries(counts).map(([id, count]) => ({
        username: profileMap[id] || 'Anonymous',
        blocks: count
      })).sort((a, b) => b.blocks - a.blocks);
      setLeaderboard(lb);
    };
    fetchLB();
  }, [activeTab]);

  const capture = async () => {
    if (!rendererRef.current) return;
    setCapturing(true);
    const overlay = document.getElementById('ar-overlay');
    if (overlay) overlay.style.opacity = '0';

    setTimeout(async () => {
      const canvas = rendererRef.current!.domElement;
      canvas.toBlob(async (blob) => {
        if (overlay) overlay.style.opacity = '1';
        if (!blob) return setCapturing(false);

        const path = `${session.user.id}/${Date.now()}.png`;
        const { error } = await supabase.storage.from('gallery').upload(path, blob);
        if (!error) {
          const { data: { publicUrl } } = supabase.storage.from('gallery').getPublicUrl(path);
          await supabase.from('gallery').insert([{ user_id: session.user.id, image_url: publicUrl }]);
          setActiveTab('gallery');
        }
        setCapturing(false);
      });
    }, 200);
  };

  return (
    <div className="fixed top-4 right-4 bg-black/80 backdrop-blur-xl text-white p-4 rounded-3xl w-72 border border-white/10 shadow-2xl">
      <div className="flex gap-1 mb-4 bg-white/5 p-1 rounded-2xl">
        {['leaderboard', 'gallery', 'settings'].map((t: any) => (
          <button key={t} onClick={() => setActiveTab(t)} className={`flex-1 py-2 rounded-xl text-[10px] font-bold uppercase transition-all ${activeTab === t ? 'bg-white text-black' : 'text-white/40'}`}>{t}</button>
        ))}
      </div>

      <div className="max-h-80 overflow-y-auto custom-scrollbar">
        {activeTab === 'leaderboard' && leaderboard.map((l, i) => (
          <div key={i} className="flex justify-between p-3 bg-white/5 rounded-2xl mb-2">
            <span className="text-xs">{l.username}</span>
            <span className="text-xs font-black">{l.blocks}</span>
          </div>
        ))}

        {activeTab === 'gallery' && (
          <div className="flex flex-col gap-3">
            <button onClick={capture} className="bg-blue-600 py-3 rounded-2xl text-[10px] font-black">{capturing ? 'CAPTURING...' : '📸 TAKE PHOTO'}</button>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="flex flex-col gap-3">
             <input value={username} onChange={e => setUsername(e.target.value)} className="bg-white/5 border border-white/10 p-3 rounded-2xl text-sm" placeholder="Username" />
             <button onClick={() => supabase.from('profiles').upsert({ id: session.user.id, username })} className="bg-white text-black py-3 rounded-2xl font-black text-[10px]">SAVE</button>
             <button onClick={() => supabase.auth.signOut()} className="text-red-500 text-[9px] font-bold mt-2">DISCONNECT</button>
          </div>
        )}
      </div>
    </div>
  );
}