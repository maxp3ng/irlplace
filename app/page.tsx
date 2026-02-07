"use client";
  
import React, { useState, useEffect } from 'react';
import Viewer from "@/components/Viewer"
import Icons from "@/components/Icons";
import { supabase } from '@/utils/supabase'
import { 
  WelcomeScreen, 
  PermissionScreen, 
  PlacementControls, 
  ColorPicker,
  COLORS 
} from '@/components/UIComponents';


// --- Types ---
interface Voxel { id: string; lon: number; alt: number; lat: number; color: string; }

// --- Main App Entry ---
export default function App() {
  
  const [step, setStep] = useState<'welcome' | 'permissions' | 'main'>('welcome');
  const [voxels, setVoxels] = useState<Voxel[]>([]);
  const [isPlacing, setIsPlacing] = useState(false);
  const [selectedColor, setSelectedColor] = useState(COLORS[0]);
  const [pixelPos, setPixelPos] = useState({ x: 0, y: 0, z: -2 });
  const [permissionStatus, setPermissionStatus] = useState({ camera: false, location: false });

  useEffect(() => {
    if (step !== 'main') return;
    const fetch = async () => {
      const { data } = await supabase.from('voxels').select('*');
      if (data) setVoxels(data);
    };
    fetch();
  }, [step]);

  const requestPermissions = () => {
    setPermissionStatus({ camera: true, location: true });
    setTimeout(() => setStep('main'), 800);
  };

  const confirmPlacement = async () => {
    const newVoxel = { lon: pixelPos.x, alt: pixelPos.y, lat: pixelPos.z, color: selectedColor.hex };
    setIsPlacing(false);
    setPixelPos({ x: 0, y: 0, z: -2 });
    setVoxels(prev => [...prev, { ...newVoxel, id: Math.random().toString() }]);
  };

  const movePixel = (axis: 'x' | 'y' | 'z', dir: number) => {
    setPixelPos(prev => ({ ...prev, [axis]: prev[axis] + dir }));
  };

  if (step === 'welcome') return <WelcomeScreen onStart={() => setStep('permissions')} />;
  if (step === 'permissions') return <PermissionScreen status={permissionStatus} onGrant={requestPermissions} />;

  return (
    <>
      {/* 3D AR Layer */}
      <div className="fixed inset-0 z-0 bg-black">
        <Viewer 
          selectedColor={selectedColor}
        />
      </div>

      {/* UI Layer */}
      <div className="relative z-10 h-screen w-full bg-transparent overflow-hidden select-none font-sans pointer-events-none">
        
        {/* Top HUD */}
        <div className="absolute top-0 w-full pt-14 px-6 flex justify-between">
          <div className="bg-black/60 backdrop-blur-xl px-4 py-2 rounded-full border border-white/10 flex items-center gap-2 shadow-lg">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-[10px] font-black text-white uppercase tracking-widest">Nodes Online: {voxels.length}</span>
          </div>
        </div>

        {/* Color Picker */}
        {isPlacing && (
          <div className="pointer-events-auto">
            <ColorPicker selected={selectedColor} onChange={setSelectedColor} />
          </div>
        )}

        {/* Bottom Console */}
        <div className="absolute bottom-0 w-full pb-10 space-y-4 flex flex-col items-center">
          <div className="pointer-events-auto w-full max-w-md mx-auto px-4">
            {isPlacing ? (
              <PlacementControls 
                onMove={movePixel}
                onCancel={() => setIsPlacing(false)} 
                onConfirm={confirmPlacement}
              />
            ) : (
              <button onClick={() => setIsPlacing(true)} className="w-full py-5 bg-white text-black rounded-[2.5rem] font-black text-xl flex items-center justify-center gap-3 shadow-[0_20px_50px_rgba(0,0,0,0.5)] active:scale-95 transition-all tracking-tighter hover:scale-[1.02]">
                <Icons.Plus /> ADD NEW UNIT
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}