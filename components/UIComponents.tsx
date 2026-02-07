"use client";

import React, { useState } from 'react';
import Icons from './Icons';
import { HexColorPicker } from "react-colorful"; // Lightweight color picker

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
  const [showCustom, setShowCustom] = useState(false);

  return (
    <div className="fixed right-6 bottom-40 z-50 flex items-center flex-col-reverse gap-3">
      {/* 1. Custom Picker Popover */}
      {isOpen && showCustom && (
        <div className="absolute right-full top-1/2 -translate-y-1/2 mr-4 z-50">
        <div className="bg-black/80 backdrop-blur-xl p-4 rounded-2xl border border-white/20 shadow-2xl mb-2 animate-in fade-in zoom-in duration-200 origin-bottom">
          <HexColorPicker color={selected.hex} onChange={(hex) => onChange({ name: 'Custom', hex })} />
          <div className="mt-3 flex items-center gap-2">
            <input 
              type="text"
              value={selected.hex}
              onChange={(e) => onChange({ name: 'Custom', hex: e.target.value })}
              className="bg-white/10 border border-white/20 rounded px-2 py-1 text-white text-sm font-mono w-full uppercase"
            />
                </div>
          </div>
        </div>
      )}

      <div className="flex items-center flex-col-reverse gap-3 max-w-[90vw]">
       
        {/* Main Trigger Button */}
        <button 
          onClick={() => { setIsOpen(!isOpen); if (isOpen) setShowCustom(false); }}
            className={`
                group relative w-14 h-14 rounded-full shadow-[0_0_20px_rgba(0,0,0,0.3)]
                flex flex-col items-center justify-center transition-all duration-300
                border border-white/20 backdrop-blur-xl
                ${isOpen ? 'scale-110 bg-white text-black' : 'hover:scale-105 active:scale-95'}
            `}
           // style={!isOpen ? { backgroundColor: selected.hex } : {}}
          style={{ backgroundColor: selected.hex }}
        >
            {!isOpen && (
                <div className="absolute inset-0 rounded-full ring-1 ring-inset ring-white/20" />
            )}
            <span className={`text-xl transition-transform duration-300 ${isOpen ? 'rotate-90 scale-100' : 'scale-0'}`}>
                ✕
            </span>
        </button>


        {/* 3. SCROLLABLE TRAY */}
        <div 
          //className={`transition-all duration-300 ease-out origin-right overflow-hidden ${
           // isOpen ? 'w-auto opacity-100 translate-x-0' : 'w-0 opacity-0 translate-x-10 pointer-events-none'
            className={`flex flex-col items-center gap-3 transition-all duration-300 ease-out origin-bottom ${
              isOpen ? 'opacity-100 translate-y-0 scale-100 pointer-events-auto' : 'opacity-0 translate-y-4 scale-90 pointer-events-none'
          }`}
        >
          <div 
            className="flex flex-col-reverse gap-2 bg-black/60 backdrop-blur-xl p-2 rounded-full border border-white/10 
                       overflow-y-auto overflow-x-hidden no-scrollbar overscroll-contain touch-pan-y"
            style={{ 
              maxWidth: 'calc(100vw - 120px)', // Ensures it doesn't push off screen
              WebkitOverflowScrolling: 'touch' 
            }}
          >
            {/* Preset Colors */}
            {COLORS.map(c => (
              <button 
                key={c.hex} 
                onClick={() => { onChange(c); setShowCustom(false); }}
                className={`w-10 h-10 rounded-full border-2 transition-transform shrink-0 ${
                  selected.hex === c.hex && !showCustom ? 'border-white scale-110' : 'border-transparent opacity-80'
                }`}
                style={{ backgroundColor: c.hex }}
              />
            ))}

            {/* Custom Mode Switcher */}
            <button 
              onClick={() => setShowCustom(!showCustom)}
              className={`w-10 h-10 rounded-full border-2 flex items-center justify-center bg-gradient-to-tr from-indigo-500 to-pink-500 shrink-0 transition-transform overflow-hidden${
                showCustom || selected.name === 'Custom' ? 'border-white scale-110' : 'border-transparent opacity-80'
              }`}
            >
              <span className="text-white text-[10px] font-bold tracking-tighter">HEX</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};


/*
export const WelcomeScreen = ({ onStart }: { onStart: () => void }) => (
  <div className="fixed inset-0 bg-black flex flex-col items-center justify-center p-8 z-[100] text-center">
    <h1 className="text-5xl font-black text-white mb-4 italic tracking-tighter uppercase">Voxel AR</h1>
    <p className="text-zinc-400 mb-12 max-w-xs uppercase text-[10px] tracking-[0.2em] leading-relaxed">Collaborative Real-World Spatial Construction</p>
    <button onClick={onStart} className="px-12 py-4 bg-white text-black font-black rounded-full hover:scale-105 transition-transform active:scale-95 shadow-2xl shadow-white/20">START INITIALIZATION</button>
  </div>
);*/
export const WelcomeScreen = ({ onStart }: { onStart: () => void }) => (
  <div className="fixed inset-0 bg-black flex flex-col items-center justify-center p-8 z-[100] text-center overflow-hidden">
    {/* 1. 动态网格背景 */}
    <div className="absolute inset-0 opacity-20 pointer-events-none"
         style={{
           backgroundImage: `linear-gradient(#333 1px, transparent 1px), linear-gradient(90deg, #333 1px, transparent 1px)`,
           backgroundSize: '40px 40px',
           maskImage: 'radial-gradient(circle at center, black 0%, transparent 80%)'
         }}
    />
   
    <div className="relative z-10 flex flex-col items-center animate-in fade-in zoom-in duration-700">
      {/* 2. 发光 Logo 容器 */}
      <div className="w-24 h-24 bg-white/5 border border-white/10 rounded-3xl flex items-center justify-center mb-8 shadow-[0_0_40px_rgba(255,255,255,0.1)] backdrop-blur-md overflow-hidden p-4">
        {/* 使用 favicon 作为 Logo，并确保不会被裁剪 */}
        <img
          src="/favicon.ico"
          alt="Voxel AR Logo"
          className="w-full h-full object-contain drop-shadow-[0_0_15px_rgba(255,255,255,0.5)]"
        />
      </div>
     
      {/* 3. 更有设计感的标题 - 增加 pr-4 防止斜体 R 被裁切 */}
      <h1 className="text-6xl font-black text-white mb-2 tracking-tighter uppercase italic items-center">
        <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500">IRL</span>Place
      </h1>
      <p className="text-zinc-400 text-sm tracking-[0.2em] font-medium mb-12 uppercase">
        By Blue Robot
      </p>
     
      {/* 4. 升级版按钮 */}
      <button
        onClick={onStart}
        className="group relative px-10 py-4 bg-white text-black font-black rounded-full overflow-hidden transition-all hover:scale-105 active:scale-95 shadow-[0_0_20px_rgba(255,255,255,0.3)]"
      >
        <span className="relative z-10 flex items-center gap-2 tracking-widest text-sm">
          INITIALIZE SYSTEM
        </span>
        <div className="absolute inset-0 bg-gradient-to-r from-gray-100 to-white opacity-0 group-hover:opacity-100 transition-opacity" />
      </button>
    </div>
  </div>
);


export const PermissionScreen = ({ status, onGrant }: { status: any, onGrant: () => void }) => (
  <div className="fixed inset-0 bg-black/90 backdrop-blur-xl flex flex-col items-center justify-center p-8 z-[100]">
    <div className="w-full max-w-sm bg-zinc-900/50 border border-white/10 rounded-3xl p-8 backdrop-blur-md shadow-2xl animate-in slide-in-from-bottom-10 fade-in duration-300">
      <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
        <span className="w-2 h-6 bg-white rounded-full"/>
        System Check
      </h2>
     
      <div className="space-y-3 mb-8">
        <PermissionRow label="Camera Access" active={status.camera} icon={<Icons.Camera />} />
        <PermissionRow label="Spatial Location" active={status.location} icon={<Icons.MapPin />} />
      </div>
     
      <button
        onClick={onGrant}
        className="w-full py-4 bg-white hover:scale-105 text-black font-bold rounded-xl transition-all active:scale-95 shadow-lg shadow-blue-900/20 flex items-center justify-center gap-2"
      >
        <Icons.Check /> AUTHORIZE
      </button>
    </div>
  </div>
);
const PermissionRow = ({ label, active, icon }: any) => (
  <div className={`
    flex items-center justify-between p-4 rounded-xl border transition-all duration-500
    ${active
      ? 'bg-blue-500/10 border-blue-500/30 text-blue-400'
      : 'bg-white/5 border-white/5 text-zinc-500'}
  `}>
    <div className="flex items-center gap-3">
      {icon} <span className="font-mono text-xs uppercase tracking-wide">{label}</span>
    </div>
    <div className={`w-2 h-2 rounded-full ${active ? 'bg-blue-400 shadow-[0_0_8px_#34d399]' : 'bg-zinc-700'}`} />
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