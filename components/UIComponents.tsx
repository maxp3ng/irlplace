import React from 'react';
import Icons from './Icons';

/**
 * Common color palette
 */
const COLORS = [
  { name: 'Red', hex: '#ef4444' },
  { name: 'Blue', hex: '#3b82f6' },
  { name: 'Green', hex: '#22c55e' },
  { name: 'Yellow', hex: '#eab308' },
  { name: 'Purple', hex: '#a855f7' },
  { name: 'Orange', hex: '#f97316' },
  { name: 'White', hex: '#ffffff' },
];

/**
 * 1. Welcome Screen Component
 */
export const WelcomeScreen = ({ onStart }: { onStart: () => void }) => (
  <div className="flex flex-col items-center justify-between min-h-screen bg-slate-900 text-white p-8 text-center">
    <div className="flex-1 flex flex-col items-center justify-center">
      <div className="w-20 h-20 bg-blue-600 rounded-3xl flex items-center justify-center mb-6 shadow-2xl">
        <Icons.Layers size={40} />
      </div>
      <h1 className="text-4xl font-black mb-2 uppercase italic tracking-tighter">Voxel World</h1>
      <p className="text-slate-400 font-medium">Collaborative Spatial Computing</p>
    </div>
    <button onClick={onStart} className="w-full py-5 bg-blue-600 rounded-2xl font-bold text-xl active:scale-95 transition-all shadow-lg shadow-blue-500/20">
      Initialize System
    </button>
  </div>
);

/**
 * 2. Permission Item Helper
 */
export const PermissionItem = ({ label, active, icon }: any) => (
  <div className={`flex items-center justify-between p-5 rounded-2xl border-2 transition-all duration-300 ${active ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-400' : 'bg-white/5 border-white/10 text-slate-500'}`}>
    <div className="flex items-center gap-4">
      {icon} <span className="font-bold text-lg">{label}</span>
    </div>
    {active && <Icons.Check />}
  </div>
);

/**
 * 3. Protocol / Permission Screen Component
 */
export const PermissionScreen = ({ status, onGrant }: { status: any, onGrant: () => void }) => (
  <div className="flex flex-col items-center justify-between min-h-screen bg-slate-900 text-white p-8">
    <div className="w-full pt-12">
      <h2 className="text-2xl font-black mb-2">Protocol Access</h2>
      <p className="text-slate-400 mb-8 text-sm">Required for spatial orientation and visual tracking.</p>
      <div className="space-y-4">
        <PermissionItem label="Vision Sensor" active={status.camera} icon={<Icons.Camera />} />
        <PermissionItem label="Geo Location" active={status.location} icon={<Icons.MapPin />} />
      </div>
    </div>
    <button onClick={onGrant} className="w-full py-5 bg-white text-black rounded-2xl font-black text-lg active:scale-95 transition-all">
      Authorize Access
    </button>
  </div>
);

/**
 * 4. Placement HUD Controls
 */
export const PlacementControls = ({ pixelPos, selectedColor, onMove, onColorSelect, onCancel, onConfirm }: any) => (
  <div className="flex flex-col gap-4 animate-in slide-in-from-bottom-5">
    <div className="flex justify-between items-end">
      <div className="flex flex-col gap-2 bg-black/60 backdrop-blur-xl p-2 rounded-2xl border border-white/10">
        <button onPointerDown={() => onMove('y', 1)} className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center text-white active:bg-blue-600 active:scale-90 transition-all"><Icons.ChevronUp /></button>
        <button onPointerDown={() => onMove('y', -1)} className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center text-white active:bg-blue-600 active:scale-90 transition-all"><Icons.ChevronDown /></button>
      </div>
      <div className="grid grid-cols-3 gap-2 bg-black/60 backdrop-blur-xl p-2 rounded-[2rem] border border-white/10">
        <div />
        <button onPointerDown={() => onMove('z', -1)} className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center text-white active:bg-blue-600 active:scale-90 transition-all"><Icons.ChevronUp /></button>
        <div />
        <button onPointerDown={() => onMove('x', -1)} className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center text-white active:bg-blue-600 active:scale-90 transition-all"><Icons.ChevronLeft /></button>
        <div className="flex items-center justify-center text-white/20"><Icons.Navigation /></div>
        <button onPointerDown={() => onMove('x', 1)} className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center text-white active:bg-blue-600 active:scale-90 transition-all"><Icons.ChevronRight /></button>
        <div />
        <button onPointerDown={() => onMove('z', 1)} className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center text-white active:bg-blue-600 active:scale-90 transition-all"><Icons.ChevronDown /></button>
      </div>
    </div>
    <div className="bg-black/60 backdrop-blur-xl py-3 rounded-2xl border border-white/10 flex gap-4 px-4 overflow-x-auto no-scrollbar shadow-inner">
      {COLORS.map(c => (
        <button 
          key={c.name}
          onClick={() => onColorSelect(c)}
          className={`w-8 h-8 rounded-full shrink-0 transition-all duration-300 ${selectedColor.name === c.name ? 'ring-2 ring-white scale-125 shadow-[0_0_15px_rgba(255,255,255,0.4)]' : 'opacity-30'}`}
          style={{ backgroundColor: c.hex }}
        />
      ))}
    </div>
    <div className="flex gap-2">
      <button onClick={onCancel} className="flex-1 py-4 bg-slate-900 text-white rounded-2xl font-bold border border-white/5 uppercase text-xs tracking-widest">Abort</button>
      <button onClick={onConfirm} className="flex-[3] py-4 bg-blue-600 text-white rounded-2xl font-black flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20">
        <Icons.Check /> Confirm Data
      </button>
    </div>
  </div>
);