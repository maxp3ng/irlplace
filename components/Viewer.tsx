'use client'

import { useEffect, useRef, useState, useMemo } from "react";
import * as THREE from "three";
import { supabase } from '@/utils/supabase';
import { ARButton } from "three/addons/webxr/ARButton.js";
import { 
  ColorPicker, 
  COLORS, 
  PlacementControls
} from '@/components/UIComponents';

const METERS_PER_DEGREE = 111111;
const VOXEL_SNAP = 0.1;
const Z_OFFSET = -1.2;
const VIEW_RADIUS_METERS = 500;
const DEGREE_THRESHOLD = VIEW_RADIUS_METERS / METERS_PER_DEGREE; 
const GOOGLE_CLIENT_ID = "793044353905-r0ahk1kn0ps2mu5vqgf7m47t6dm43eb3.apps.googleusercontent.com";

interface Voxel {
  id: string;
  lat: number;
  lon: number;
  alt: number;
  color: string;
  user_id: string;
}

export default function Viewer() {
  // --- REFS ---
  const mountRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef(new THREE.Scene());
  const voxelsMap = useRef<Map<string, THREE.Mesh>>(new Map());
  const ghostRef = useRef<THREE.Mesh | null>(null);
  const originGps = useRef<{ lat: number, lng: number } | null>(null);
  const latestPos = useRef({ lat: 0, lng: 0 });

  const isDraftingRef = useRef(false);
  const isInteractingWithUIRef = useRef(false);
  const selectedColorRef = useRef(COLORS[0]);
  const sessionRef = useRef<any>(null);

  // --- STATE ---
  const [isDrafting, setIsDrafting] = useState(false);
  const [selectedColor, setSelectedColor] = useState(COLORS[0]);
  const [position, setPosition] = useState({ lat: 0, lng: 0 });
  const [aligned, setAligned] = useState(false);
  const [session, setSession] = useState<any>(null);

  // --- Sync state to refs ---
  useEffect(() => { isDraftingRef.current = isDrafting; }, [isDrafting]);
  useEffect(() => { selectedColorRef.current = selectedColor; }, [selectedColor]);
  useEffect(() => { sessionRef.current = session; }, [session]);

  // --- GEO CONSTANTS ---
  const geoConstants = useMemo(() => {
    if (!position.lat) return null;
    const lonScale = METERS_PER_DEGREE * Math.cos(position.lat * Math.PI / 180);
    return { lonScale, latRatio: METERS_PER_DEGREE / VOXEL_SNAP, lonRatio: lonScale / VOXEL_SNAP };
  }, [!!position.lat]);

  // --- VOXEL MANAGEMENT ---
  const addVoxelLocally = (voxel: Voxel) => {
    if (voxelsMap.current.has(voxel.id)) return;

    const distLat = Math.abs(voxel.lat - latestPos.current.lat);
    const distLon = Math.abs(voxel.lon - latestPos.current.lng);
    if (distLat > DEGREE_THRESHOLD || distLon > DEGREE_THRESHOLD) return;

    const origin = originGps.current || { lat: voxel.lat, lng: voxel.lon };
    const lonScale = METERS_PER_DEGREE * Math.cos(origin.lat * Math.PI / 180);

    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(VOXEL_SNAP, VOXEL_SNAP, VOXEL_SNAP),
      new THREE.MeshPhongMaterial({ color: voxel.color })
    );

    mesh.position.set(
      (voxel.lon - origin.lng) * lonScale,
      voxel.alt,
      -(voxel.lat - origin.lat) * METERS_PER_DEGREE
    );

    (mesh as any).user_id = voxel.user_id;
    sceneRef.current.add(mesh);
    voxelsMap.current.set(voxel.id, mesh);
  };

  // --- PLACEMENT HANDLERS ---
  const handleMove = (axis: 'x' | 'y' | 'z', steps: number) => {
    if (!ghostRef.current) return;
    ghostRef.current.position[axis] += (steps * VOXEL_SNAP);
  };

  const handleConfirm = async () => {
    const currentSession = sessionRef.current;
    if (!ghostRef.current || !currentSession || !originGps.current) return;

    const localPos = ghostRef.current.position;
    const origin = originGps.current;
    const lonScale = METERS_PER_DEGREE * Math.cos(origin.lat * Math.PI / 180);

    const voxelData = {
      lat: origin.lat - (localPos.z / METERS_PER_DEGREE),
      lon: origin.lng + (localPos.x / lonScale),
      alt: localPos.y,
      color: selectedColorRef.current.hex,
      user_id: currentSession.user.id
    };

    const tempId = `temp-${Date.now()}`;
    addVoxelLocally({ ...voxelData, id: tempId, user_id: currentSession.user.id });

    await supabase.from('voxels').insert([voxelData]);
    setIsDrafting(false);
  };

  // --- AUTH & GEOLOCATION ---
  useEffect(() => {
    // Load Google sign-in
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    document.body.appendChild(script);

    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: authListener } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));

    // Geolocation
    const watchId = navigator.geolocation.watchPosition(pos => {
      latestPos.current = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      setPosition(latestPos.current);
      if (!originGps.current) originGps.current = { ...latestPos.current };
    }, null, { enableHighAccuracy: true });

    return () => {
      navigator.geolocation.clearWatch(watchId);
      authListener.subscription.unsubscribe();
      script.remove();
    };
  }, []);

  // --- ANONYMOUS SIGN-IN ---
  const signInAnonymously = async () => {
    const { data, error } = await supabase.auth.signInAnonymously();
    if (error) console.error(error);
    else setSession(data.session);
  };

  const requestCompass = async () => {
    const handleOrientation = (event: DeviceOrientationEvent) => {
      const heading = (event as any).webkitCompassHeading || (360 - (event.alpha || 0));
      if (heading !== undefined) {
        sceneRef.current.rotation.y = -THREE.MathUtils.degToRad(heading);
        setAligned(true);
      }
    };
    if (typeof (DeviceOrientationEvent as any).requestPermission === "function") {
      const perm = await (DeviceOrientationEvent as any).requestPermission();
      if (perm === "granted") window.addEventListener('deviceorientationabsolute', handleOrientation, true);
    } else window.addEventListener('deviceorientationabsolute', handleOrientation, true);
  };

  // --- AR ENGINE ---
  useEffect(() => {
    if (!mountRef.current || !session) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.xr.enabled = true;
    renderer.setSize(window.innerWidth, window.innerHeight);
    mountRef.current.appendChild(renderer.domElement);

    const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 20);
    sceneRef.current.add(new THREE.HemisphereLight(0xffffff, 0xbbbbff, 3));

    const ghost = new THREE.Mesh(
      new THREE.BoxGeometry(VOXEL_SNAP, VOXEL_SNAP, VOXEL_SNAP),
      new THREE.MeshPhongMaterial({ color: selectedColorRef.current.hex, transparent: true, opacity: 0.5 })
    );
    sceneRef.current.add(ghost);
    ghostRef.current = ghost;

    const controller = renderer.xr.getController(0);
    controller.addEventListener('select', () => {
      if (isInteractingWithUIRef.current) return;
      setIsDrafting(true);
    });
    sceneRef.current.add(controller);

    renderer.setAnimationLoop(() => {
      if (!isDraftingRef.current && geoConstants && originGps.current) {
        camera.updateMatrixWorld();
        const targetPos = new THREE.Vector3(0, 0, Z_OFFSET).applyMatrix4(camera.matrixWorld);
        sceneRef.current.worldToLocal(targetPos);

        const { lonScale, latRatio, lonRatio } = geoConstants;
        const snapLat = Math.round((-targetPos.z / METERS_PER_DEGREE) * latRatio) / latRatio;
        const snapLon = Math.round((targetPos.x / lonScale) * lonRatio) / lonRatio;

        ghostRef.current?.position.set(
          snapLon * lonScale,
          Math.round(targetPos.y / VOXEL_SNAP) * VOXEL_SNAP,
          -snapLat * METERS_PER_DEGREE
        );
      }
      renderer.render(sceneRef.current, camera);
    });

    const overlay = document.getElementById('ar-overlay');
    const button = ARButton.createButton(renderer, {
      requiredFeatures: ['local-floor'],
      optionalFeatures: ['dom-overlay'],
      domOverlay: { root: overlay! }
    });
    document.body.appendChild(button);

    return () => {
      renderer.setAnimationLoop(null);
      renderer.dispose();
      if (document.body.contains(button)) document.body.removeChild(button);
    };
  }, [session, !!geoConstants]);

  // --- REALTIME VOXELS ---
  useEffect(() => {
    if (position.lat === 0 || !session) return;

    const fetchRadius = async () => {
      const { data } = await supabase.from('voxels').select('*')
        .gte('lat', position.lat - DEGREE_THRESHOLD)
        .lte('lat', position.lat + DEGREE_THRESHOLD)
        .gte('lon', position.lng - DEGREE_THRESHOLD)
        .lte('lon', position.lng + DEGREE_THRESHOLD);

      if (data) data.forEach((v: Voxel) => addVoxelLocally(v));
    };

    const channel = supabase.channel('voxels_realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'voxels' }, p => addVoxelLocally(p.new as Voxel))
      .subscribe();

    fetchRadius();
    return () => { supabase.removeChannel(channel); };
  }, [position.lat, session]);

  // --- RENDER ---
  if (!session) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-black text-white gap-4">
        <button onClick={signInAnonymously} className="px-6 py-3 bg-blue-500 rounded-lg shadow-lg">Sign In Anonymously</button>
        <div>Or sign in with Google...</div>
      </div>
    );
  }

  return (
    <>
      <div 
        id="ar-overlay" 
        className="fixed inset-0 pointer-events-none z-[9999]"
        onPointerDown={() => { isInteractingWithUIRef.current = true; }}
        onPointerUp={() => { setTimeout(() => isInteractingWithUIRef.current = false, 100); }}
      >
        {!isDrafting && (
          <div className="fixed top-6 left-6 flex flex-col gap-3 pointer-events-auto">
            <div className="bg-black/60 backdrop-blur-md px-4 py-2 text-white text-[10px] rounded-full border border-white/10 shadow-2xl">
              GPS: {position.lat.toFixed(5)}, {position.lng.toFixed(5)}
            </div>
            <button 
              onClick={(e) => { e.stopPropagation(); requestCompass(); }}
              className={`px-4 py-2 rounded-full text-[10px] font-bold shadow-xl border transition-all ${
                aligned ? "bg-green-500/20 border-green-500/50 text-green-400" : "bg-white text-black border-white"
              }`}
            >
              {aligned ? "NORTH LOCKED 🧭" : "ALIGN COMPASS"}
            </button>
          </div>
        )}

        <div className="absolute inset-x-0 bottom-12 flex flex-col items-center gap-8 pointer-events-auto">
          {isDrafting ? (
            <PlacementControls 
              onMove={handleMove} 
              onCancel={() => setIsDrafting(false)} 
              onConfirm={handleConfirm} 
            />
          ) : (
            <ColorPicker selected={selectedColor} onChange={setSelectedColor} />
          )}
        </div>
      </div>

      <div ref={mountRef} className="fixed inset-0" />
    </>
  );
}
