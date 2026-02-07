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
  const [leaderboard, setLeaderboard] = useState<{ user_id: string, blocks: number, display_name?: string }[]>([]);
  const [gallery, setGallery] = useState<{ id: string, image_url: string, user_id: string }[]>([]);
  const [displayName, setDisplayName] = useState<string>(session?.user?.user_metadata?.display_name || '');
  const [capturing, setCapturing] = useState(false);

  // --- Leaderboard ---
  useEffect(() => {
    const fetchLeaderboard = async () => {
      const { data: voxels } = await supabase.from('voxels').select('user_id');
      if (!voxels) return;

      const counts: Record<string, number> = {};
      voxels.forEach(v => counts[v.user_id] = (counts[v.user_id] || 0) + 1);

      const lb = Object.entries(counts)
        .map(([user_id, blocks]) => ({ user_id, blocks }))
        .sort((a, b) => b.blocks - a.blocks);

      // Fetch display names
      const userIds = lb.map(l => l.user_id);
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, display_name')
        .in('id', userIds);

      const profileMap: Record<string, string> = {};
      profiles?.forEach(p => profileMap[p.id] = p.display_name || '');
      setLeaderboard(lb.map(l => ({ ...l, display_name: profileMap[l.user_id] || '' })));
    };
    fetchLeaderboard();
  }, []);

  // --- Gallery ---
  useEffect(() => {
    const fetchGallery = async () => {
      const { data } = await supabase.from('gallery').select('*').order('created_at', { ascending: false });
      if (data) setGallery(data);
    };
    fetchGallery();
  }, []);

  // --- Capture Screenshot ---
  const captureScreenshot = async () => {
    if (!rendererRef.current || !session?.user?.id) return;
    setCapturing(true);

    const overlay = document.getElementById('ar-overlay');
    if (overlay) overlay.style.display = 'none';

    requestAnimationFrame(async () => {
      try {
        const canvas = rendererRef.current!.domElement;
        const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve));
        if (!blob) return;

        const userId = session.user.id;
        const path = `${userId}/screenshot-${Date.now()}.png`;

        // --- Upload to Storage ---
        const { error: uploadError } = await supabase.storage
          .from('gallery')
          .upload(path, blob, { upsert: true });
        if (uploadError) {
          console.error('Storage upload error:', uploadError);
          return;
        }

        // --- Get Public URL ---
        const { data: publicData } = supabase.storage.from('gallery').getPublicUrl(path);
        const publicUrl = publicData.publicUrl;

        // --- Insert row into gallery table (must satisfy RLS) ---
        const { error: tableError } = await supabase.from('gallery').insert([{
          user_id: userId,
          image_url: publicUrl
        }]);
        if (tableError) {
          console.error('Gallery table insert failed:', tableError);
          return;
        }

        setGallery([{ id: path, image_url: publicUrl, user_id }, ...gallery]);
      } finally {
        setCapturing(false);
        if (overlay) overlay.style.display = '';
      }
    });
  };

  // --- Update Display Name ---
  const updateDisplayName = async () => {
    if (!session?.user?.id) return;
    await supabase.from('profiles').upsert({ id: session.user.id, display_name: displayName });
    session.user.user_metadata = { ...session.user.user_metadata, displayName };
  };

  return (
    <div className="fixed top-4 right-4 bg-black/70 text-white p-4 rounded-xl w-72 pointer-events-auto z-[10000]">
      {/* Tabs */}
      <div className="flex justify-between mb-2">
        <button className={`px-2 py-1 rounded ${activeTab==='leaderboard'?'bg-white/30':''}`} onClick={() => setActiveTab('leaderboard')}>Leaderboard</button>
        <button className={`px-2 py-1 rounded ${activeTab==='gallery'?'bg-white/30':''}`} onClick={() => setActiveTab('gallery')}>Gallery</button>
        <button className={`px-2 py-1 rounded ${activeTab==='settings'?'bg-white/30':''}`} onClick={() => setActiveTab('settings')}>Settings</button>
      </div>

      {/* Tab Content */}
      <div className="max-h-80 overflow-y-auto">
        {activeTab === 'leaderboard' && (
          <div className="flex flex-col gap-2">
            {leaderboard.map((l, i) => (
              <div key={i} className="flex justify-between border-b border-white/20 pb-1">
                <span>{l.display_name || l.user_id.slice(0,6)}</span>
                <span>{l.blocks} blocks</span>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'gallery' && (
          <div className="flex flex-col gap-2">
            <button onClick={captureScreenshot} className="bg-green-500 px-3 py-1 rounded mb-2">
              {capturing ? 'Capturing...' : 'Capture Screenshot'}
            </button>
            {gallery.map(g => (
              <img key={g.id} src={g.image_url} className="w-full rounded-md border border-white/20" />
            ))}
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="flex flex-col gap-2">
            <label className="text-[12px]">Display Name</label>
            <input
              type="text"
              value={displayName}
              placeholder="bob"
              onChange={e => setDisplayName(e.target.value)}
              className="text-white px-2 py-1 rounded"
            />
            <button onClick={updateDisplayName} className="bg-blue-500 px-3 py-1 rounded mt-2">Save</button>
          </div>
        )}
      </div>
    </div>
  );
}
