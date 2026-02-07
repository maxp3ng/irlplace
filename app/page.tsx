"use client";
  
import React, { useState, useEffect } from 'react';
import { VoxelWorld } from "@/components/VoxelWorld";
import Viewer from "../components/Viewer"
import Icons from "@/components/Icons";
import { WelcomeScreen, PermissionScreen, PlacementControls } from "@/components/UIComponents";
import { supabase } from '@/utils/supabase'

interface Voxel { id: string; lon: number; alt: number; lat: number; color: string; }

const COLORS = [
  { name: 'Red', hex: '#ef4444' }, { name: 'Blue', hex: '#3b82f6' },
  { name: 'Green', hex: '#22c55e' }, { name: 'Yellow', hex: '#eab308' },
  { name: 'Purple', hex: '#a855f7' }, { name: 'Orange', hex: '#f97316' },
  { name: 'White', hex: '#ffffff' },
];

export default function App() {
  const [step, setStep] = useState<'welcome' | 'permissions' | 'main'>('welcome');
  const [voxels, setVoxels] = useState<Voxel[]>([]);
  const [isPlacing, setIsPlacing] = useState(false);
  const [selectedColor, setSelectedColor] = useState(COLORS[0]);
  const [pixelPos, setPixelPos] = useState({ x: 0, y: 0, z: 0 });
  const [permissionStatus, setPermissionStatus] = useState({ camera: false, location: false });

  // --- Realtime & Initial Fetch ---
  useEffect(() => {
    if (step !== 'main') return;

    const channel = supabase
      .channel('realtime_voxels')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'voxels' }, (p) => {
        setVoxels((prev) => [...prev, p.new as Voxel]);
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'voxels' }, (p) => {
        setVoxels((prev) => prev.filter(v => v.id !== p.old.id));
      })
      .subscribe();

    supabase.from('voxels').select('*').then(({ data }) => {
      if (data) setVoxels(data);
    });

    return () => { supabase.removeChannel(channel); };
  }, [step]);

  const requestPermissions = () => {
    setPermissionStatus({ camera: true, location: true });
    setTimeout(() => setStep('main'), 800);
  };

  const confirmPlacement = async () => {
    const newVoxel = { lon: pixelPos.x, alt: pixelPos.y, lat: pixelPos.z, color: selectedColor.hex };
    const { error } = await supabase.from('voxels').insert([newVoxel]);
    if (!error) setIsPlacing(false); // Let Realtime update the list
  };

  const removeVoxel = async (id: string) => {
    await supabase.from('voxels').delete().eq('id', id);
  };
  const movePixel = (axis: 'x' | 'y' | 'z', dir: number) => {
    setPixelPos(prev => ({ ...prev, [axis]: prev[axis] + dir }));
  };

  if (step === 'welcome') return <WelcomeScreen onStart={() => setStep('permissions')} />;
  if (step === 'permissions') return <PermissionScreen status={permissionStatus} onGrant={requestPermissions} />;

  return (
    <>
      <div className="fixed inset-0 z-0">
        <Viewer 
          // voxels={voxels}
          // isPlacing={isPlacing}
          // pixelPos={pixelPos}
          // selectedColor={selectedColor}
        />
      </div>
{/* 
      <div className="relative z-10 h-screen w-full bg-transparent overflow-hidden select-none font-sans">
        <div className="absolute inset-0 pointer-events-none">
          <VoxelWorld 
            voxels={voxels} isPlacing={isPlacing} pixelPos={pixelPos}
            selectedColor={selectedColor} onRemoveVoxel={removeVoxel}
          />
        </div>

        <div className="absolute top-0 w-full pt-14 px-6 flex justify-between pointer-events-none">
          <div className="bg-black/60 backdrop-blur-xl px-4 py-2 rounded-full pointer-events-auto border border-white/10 flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-[10px] font-black text-white uppercase tracking-widest">Nodes Online: {voxels.length}</span>
          </div>
        </div>

        <div className="absolute bottom-0 w-full px-4 pb-10 space-y-4 pointer-events-none">
          <div className="pointer-events-auto">
            {isPlacing ? (
              <PlacementControls 
                pixelPos={pixelPos} selectedColor={selectedColor}
                onMove={movePixel}
                onColorSelect={setSelectedColor} onCancel={() => setIsPlacing(false)} onConfirm={confirmPlacement}
              />
            ) : (
              <button onClick={() => setIsPlacing(true)} className="w-full py-5 bg-white text-black rounded-[2rem] font-black text-xl flex items-center justify-center gap-3 shadow-2xl active:scale-[0.98]">
                <Icons.Plus /> Place Voxel
              </button>
            )}
          </div>
        </div>
      </div> */}
    </>
  );
}