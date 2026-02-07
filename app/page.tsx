'use client'

import React, { useState } from 'react';
import Auth from "@/components/Auth";
import { WelcomeScreen, PermissionScreen } from '@/components/UIComponents';

export default function Page() {
  const [step, setStep] = useState<'welcome' | 'permissions' | 'main'>('welcome');
  const [permissionStatus, setPermissionStatus] = useState({ camera: false, location: false });

  const requestPermissions = async () => {
    // Basic check for Geolocation
    if ("geolocation" in navigator) {
      setPermissionStatus({ camera: true, location: true });
      // Short delay for visual feedback
      setTimeout(() => setStep('main'), 800);
    } else {
      alert("This app requires GPS to work.");
    }
  };

  // Step 1: Welcome Splash
  if (step === 'welcome') {
    return <WelcomeScreen onStart={() => setStep('permissions')} />;
  }

  // Step 2: Permission Bridge
  if (step === 'permissions') {
    return <PermissionScreen status={permissionStatus} onGrant={requestPermissions} />;
  }

  // Step 3: Auth Gate -> Viewer
  return (
    <main className="min-h-screen bg-black overflow-hidden">
      <Auth />
    </main>
  );
}