'use client'

import { useState } from "react";
import Leaderboard from "./Leaderboard";
import Gallery from "./Gallery";
import Settings from "./Settings";

interface Props {
  session: any;
  onCaptureScreenshot: () => void;
}

type Tab = 'leaderboard' | 'gallery' | 'settings';

export default function MainMenu({ session, onCaptureScreenshot }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('leaderboard');

  return (
    <div className="fixed top-4 right-4 w-[300px] bg-black/70 backdrop-blur-md text-white rounded-xl shadow-xl p-4 z-[10000]">
      {/* Tab buttons */}
      <div className="flex justify-between mb-2">
        {(['leaderboard', 'gallery', 'settings'] as Tab[]).map(tab => (
          <button 
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-2 py-1 rounded-full text-[12px] font-bold transition ${
              activeTab === tab ? 'bg-white text-black' : 'bg-black/30'
            }`}
          >
            {tab.toUpperCase()}
          </button>
        ))}
      </div>

      <div className="max-h-[400px] overflow-y-auto">
        {activeTab === 'leaderboard' && <Leaderboard />}
        {activeTab === 'gallery' && <Gallery session={session} onCaptureScreenshot={onCaptureScreenshot} />}
        {activeTab === 'settings' && <Settings session={session} />}
      </div>
    </div>
  );
}
