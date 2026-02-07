"use client";

import React, { useState } from 'react';
import Icons from './Icons';

export const COLORS = [
  { name: 'Siren Red', hex: '#ef4444' }, 
  { name: 'Cobalt Pulse', hex: '#3b82f6' },
  { name: 'Acid Neon', hex: '#22c55e' }, 
  { name: 'Amber Glow', hex: '#eab308' },
  { name: 'Vanta Purple', hex: '#a855f7' }, 
  { name: 'Magma Core', hex: '#f97316' },
  { name: 'Titanium', hex: '#ffffff' },
  { name: 'Void Black', hex: '#18181b' },
];

export const ColorPicker = ({ selected, onChange }: { selected: any, onChange: (c: any) => void }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="fixed right-6 bottom-40 z-50 flex items-center flex-row-reverse gap-3">
      {/* Trigger Button */}
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className={`w-14 h-14 rounded-full shadow-2xl flex items-center justify-center transition-transform active:scale-90 border-4 border-white/20 backdrop-blur-sm ${isOpen ? 'scale-110 ring-4 ring-white/10' : ''}`}
        style={{ backgroundColor: selected.hex }}
      >
        {!isOpen && <div className="absolute inset-0 rounded-full border border-black/10" />}
        {isOpen && <Icons.X />}
      </button>

      {/* Expandable List */}
      <div 
        className={`flex items-center gap-2 pr-2 overflow-hidden transition-all duration-300 ease-out origin-right ${
          isOpen ? 'w-auto opacity-100 translate-x-0' : 'w-0 opacity-0 translate-x-10 pointer-events-none'
        }`}
      >
        <div className="flex gap-2 bg-black/60 backdrop-blur-xl p-2 rounded-full border border-white/10">
          {COLORS.map(c => (
            <button 
              key={c.hex} 
              onClick={() => { onChange(c); setIsOpen(false); }}
              className={`w-10 h-10 rounded-full border-2 transition-transform hover:scale-110 active:scale-95 shrink-0 ${
                selected.hex === c.hex ? 'border-white scale-110 shadow-lg' : 'border-transparent opacity-80 hover:opacity-100'
              }`}
              style={{ backgroundColor: c.hex }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

export const WelcomeScreen = ({ onStart }: { onStart: () => void }) => (
  <div className="fixed inset-0 bg-black flex flex-col items-center justify-center p-8 z-[100] text-center">
    <h1 className="text-5xl font-black text-white mb-4 italic tracking-tighter uppercase">Voxel AR</h1>
    <p className="text-zinc-400 mb-12 max-w-xs uppercase text-[10px] tracking-[0.2em] leading-relaxed">Collaborative Real-World Spatial Construction</p>
    <button onClick={onStart} className="px-12 py-4 bg-white text-black font-black rounded-full hover:scale-105 transition-transform active:scale-95 shadow-2xl shadow-white/20">START INITIALIZATION</button>
  </div>
);

export const PermissionScreen = ({ status, onGrant }: { status: any, onGrant: () => void }) => (
  <div className="fixed inset-0 bg-zinc-950 flex flex-col items-center justify-center p-8 z-[100]">
    <div className="space-y-6 w-full max-w-xs">
      <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/10">
        <span className="text-white font-bold text-sm tracking-tight uppercase">Camera Access</span>
        <div className={`w-3 h-3 rounded-full ${status.camera ? 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]' : 'bg-zinc-700'}`} />
      </div>
      <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/10">
        <span className="text-white font-bold text-sm tracking-tight uppercase">Spatial Location</span>
        <div className={`w-3 h-3 rounded-full ${status.location ? 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]' : 'bg-zinc-700'}`} />
      </div>
      <button onClick={onGrant} className="w-full py-5 bg-white text-black font-black rounded-2xl text-lg uppercase tracking-widest active:scale-95 transition-transform mt-4">GRANT ALL PERMISSIONS</button>
    </div>
  </div>
);

export const PlacementControls = ({ onMove, onCancel, onConfirm }: any) => (
  <div className="flex flex-col items-center gap-6 w-full">
    {/* Floating D-Pad */}
    <div className="grid grid-cols-3 gap-2 max-w-[180px]">
      <div />
      <button onClick={() => onMove('z', -1)} className="w-12 h-12 bg-black/60 backdrop-blur-md rounded-2xl flex items-center justify-center text-white border border-white/10 active:bg-white active:text-black transition-colors shadow-lg"><Icons.ChevronUp /></button>
      <div />
      <button onClick={() => onMove('x', -1)} className="w-12 h-12 bg-black/60 backdrop-blur-md rounded-2xl flex items-center justify-center text-white border border-white/10 active:bg-white active:text-black transition-colors shadow-lg"><Icons.ChevronLeft /></button>
      <div className="w-12 h-12 flex flex-col gap-1">
         <button onClick={() => onMove('y', 1)} className="flex-1 bg-black/60 backdrop-blur-md rounded-t-xl flex items-center justify-center text-[10px] font-black text-white border border-white/10 border-b-0 active:bg-white active:text-black hover:bg-white/10">UP</button>
         <button onClick={() => onMove('y', -1)} className="flex-1 bg-black/60 backdrop-blur-md rounded-b-xl flex items-center justify-center text-[10px] font-black text-white border border-white/10 border-t-0 active:bg-white active:text-black hover:bg-white/10">DN</button>
      </div>
      <button onClick={() => onMove('x', 1)} className="w-12 h-12 bg-black/60 backdrop-blur-md rounded-2xl flex items-center justify-center text-white border border-white/10 active:bg-white active:text-black transition-colors shadow-lg"><Icons.ChevronRight /></button>
        <div />
      <button onClick={() => onMove('z', 1)} className="w-12 h-12 bg-black/60 backdrop-blur-md rounded-2xl flex items-center justify-center text-white border border-white/10 active:bg-white active:text-black transition-colors shadow-lg"><Icons.ChevronDown /></button>
        <div />
    </div>

    {/* Floating Action Buttons */}
    <div className="flex gap-4 w-full max-w-sm px-4">
      <button onClick={onCancel} className="flex-1 py-4 bg-black/60 backdrop-blur-xl text-white rounded-[2rem] font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform text-xs tracking-widest border border-white/10 shadow-lg hover:bg-black/80">
        <Icons.X /> CANCEL
      </button>
      <button onClick={onConfirm} className="flex-[2] py-4 bg-white text-black rounded-[2rem] font-black flex items-center justify-center gap-2 active:scale-95 transition-transform shadow-xl text-xs tracking-widest hover:bg-gray-100">
        <Icons.Check /> CONFIRM
      </button>
    </div>
  </div>
);