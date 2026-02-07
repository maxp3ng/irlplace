'use client'

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { supabase } from '@/utils/supabase';
import { ARButton } from "three/addons/webxr/ARButton.js";
import { 
  ColorPicker,
  COLORS 
} from '@/components/UIComponents';

const GRID_SIZE = 0.001;
const METERS_PER_DEGREE = 111111;
const VOXEL_SNAP = 0.1;
const Z_OFFSET = -1.2;
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
  const mountRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef(new THREE.Scene());
  const voxelsMap = useRef<Map<string, THREE.Mesh>>(new Map());
  const ghostRef = useRef<THREE.Mesh | null>(null);
  const originGps = useRef<{ lat: number, lng: number } | null>(null);
  const latestPos = useRef({ lat: 0, lng: 0 });

  // --- REFS FOR PERSISTENCE & LOCKS ---
  const selectedColorRef = useRef(COLORS[0]);
  const sessionRef = useRef<any>(null);
  const isInteractingWithUI = useRef(false); // The lock to prevent accidental placement

  const [selectedColor, setSelectedColor] = useState(COLORS[0]);
  const [session, setSession] = useState<any>(null);
  const [authReady, setAuthReady] = useState(false);
  const [position, setPosition] = useState({ lat: 0, lng: 0 });
  const [aligned, setAligned] = useState(false);

  // Sync state to Ref and update Ghost Cube color preview
  useEffect(() => {
    selectedColorRef.current = selectedColor;
    if (ghostRef.current) {
      (ghostRef.current.material as THREE.MeshPhongMaterial).color.set(selectedColor.hex);
    }
  }, [selectedColor]);

  useEffect(() => { sessionRef.current = session; }, [session]);

  const getGlobalOrigin = (lat: number, lng: number) => ({
    lat: Math.floor(lat / GRID_SIZE) * GRID_SIZE,
    lng: Math.floor(lng / GRID_SIZE) * GRID_SIZE,
  });

  const addVoxelLocally = (voxel: Voxel) => {
    if (voxelsMap.current.has(voxel.id)) return;
    const origin = originGps.current || getGlobalOrigin(latestPos.current.lat, latestPos.current.lng);
    const lonScale = METERS_PER_DEGREE * Math.cos(origin.lat * Math.PI / 180);

    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.1, 0.1),
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

  // ---------------- GOOGLE SIGN-IN ----------------
	// ---------------- GOOGLE SIGN-IN (STABLE VERSION) ----------------
useEffect(() => {
  let interval: number | null = null;

  const script = document.createElement("script");
  script.src = "https://accounts.google.com/gsi/client";
  script.async = true;
  document.body.appendChild(script);

  const waitForGoogle = () => {
    // @ts-ignore
    if (!window.google?.accounts?.id) return;

    if (interval) window.clearInterval(interval);

    // @ts-ignore
    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      use_fedcm_for_prompt: true,
      callback: async (res: any) => {
        try {
          const { data, error } = await supabase.auth.signInWithIdToken({
            provider: "google",
            token: res.credential,
          });
          if (!error) setSession(data.session);
        } catch (e) {
          console.error("Supabase sign-in error:", e);
        }
      },
    });

    const render = () => {
      const btn = document.getElementById("googleButton");
      if (!btn) {
        requestAnimationFrame(render);
        return;
      }

      // clear previous content so it doesn't vanish randomly
      btn.innerHTML = "";

      // @ts-ignore
      window.google.accounts.id.renderButton(btn, {
        theme: "outline",
        size: "large",
        text: "signin_with",
        shape: "rectangular",
        width: 260,
      });

      setAuthReady(true);
    };

    render();
  };

  // Poll until GIS is ready (MOST STABLE across devices)
  interval = window.setInterval(waitForGoogle, 120);

  // Restore existing session if already logged in
  supabase.auth.getSession().then(({ data }) => {
    if (data.session) setSession(data.session);
  });

  const { data: listener } = supabase.auth.onAuthStateChange((_e, s) => {
    setSession(s);
  });

  return () => {
    if (interval) window.clearInterval(interval);
    listener.subscription.unsubscribe();
    script.remove();
  };
}, []);

  // ---------------- GEOLOCATION ----------------
  useEffect(() => {
    const watchId = navigator.geolocation.watchPosition(pos => {
      latestPos.current = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      setPosition(latestPos.current);
      if (!originGps.current) originGps.current = { ...latestPos.current };
    }, null, { enableHighAccuracy: true });
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

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

  // ---------------- AR ENGINE ----------------
  useEffect(() => {
    if (!mountRef.current || !session) return;

    const scene = sceneRef.current;
    const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 20);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.xr.enabled = true;
    renderer.setSize(window.innerWidth, window.innerHeight);
    mountRef.current.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xffffff, 0xbbbbff, 3));

    const ghost = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.1, 0.1),
      new THREE.MeshPhongMaterial({ 
        color: selectedColorRef.current.hex, 
        transparent: true, 
        opacity: 0.5 
      })
    );
    scene.add(ghost);
    ghostRef.current = ghost;

    const controller = renderer.xr.getController(0);
    
    const onSelect = async () => {
      // SHIELD: Check if we are touching UI
      if (isInteractingWithUI.current) {
        setTimeout(() => { isInteractingWithUI.current = false; }, 100);
        return;
      }

      const currentSession = sessionRef.current;
      if (!ghostRef.current || !currentSession) return;

      const worldPos = new THREE.Vector3();
      ghostRef.current.getWorldPosition(worldPos);

      let existingVoxelId: string | null = null;
      voxelsMap.current.forEach((mesh, id) => {
        if (mesh.position.distanceTo(ghostRef.current!.position) < 0.05 && (mesh as any).user_id === currentSession.user.id) {
          existingVoxelId = id;
        }
      });

      if (existingVoxelId) {
        const meshToDelete = voxelsMap.current.get(existingVoxelId);
        if (meshToDelete) scene.remove(meshToDelete);
        voxelsMap.current.delete(existingVoxelId);
        await supabase.from('voxels').delete().eq('id', existingVoxelId);
      } else {
        const origin = originGps.current!;
        const lonScale = METERS_PER_DEGREE * Math.cos(origin.lat * Math.PI / 180);

        const { data } = await supabase.from('voxels').insert([{
          lat: origin.lat - (worldPos.z / METERS_PER_DEGREE),
          lon: origin.lng + (worldPos.x / lonScale),
          alt: worldPos.y,
          color: selectedColorRef.current.hex,
          user_id: currentSession.user.id
        }]).select().single();

        if (data) addVoxelLocally(data as Voxel);
      }
    };

    controller.addEventListener('select', onSelect);
    scene.add(controller);

    renderer.setAnimationLoop(() => {
      camera.updateMatrixWorld();
      const targetPos = new THREE.Vector3(0, 0, Z_OFFSET).applyMatrix4(camera.matrixWorld);
      ghostRef.current?.position.set(
        Math.round(targetPos.x / VOXEL_SNAP) * VOXEL_SNAP,
        Math.round(targetPos.y / VOXEL_SNAP) * VOXEL_SNAP,
        Math.round(targetPos.z / VOXEL_SNAP) * VOXEL_SNAP
      );
      camera.getWorldPosition(camPos);

      const MAX_VISIBLE_DISTANCE = 10; 
      voxelsMap.current.forEach(mesh => {
        const dist = mesh.position.distanceTo(camPos);

        // hide/show instead of deleting
        mesh.visible = dist <= MAX_VISIBLE_DISTANCE;
      });
      renderer.render(scene, camera);
    });

    const overlay = document.getElementById('ar-overlay');
    const button = ARButton.createButton(renderer, { 
        requiredFeatures: ['local-floor'],
        optionalFeatures: ['dom-overlay'],
        domOverlay: { root: overlay! }
    });
    document.body.appendChild(button);

    return () => { 
        controller.removeEventListener('select', onSelect);
        renderer.setAnimationLoop(null);
        renderer.dispose(); 
        if (document.body.contains(button)) document.body.removeChild(button); 
    };
  }, [session]);

  // ---------------- REALTIME VOXELS ----------------
  useEffect(() => {
    if (position.lat === 0 || !session) return;
    const fetchInitial = async () => {
      const { data } = await supabase.from('voxels').select('*');
      if (data) data.forEach((v: Voxel) => addVoxelLocally(v));
    };
    const channel = supabase.channel('voxels_realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'voxels' }, p => addVoxelLocally(p.new as Voxel))
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'voxels' }, p => {
          const mesh = voxelsMap.current.get((p.old as any).id);
          if (mesh) { sceneRef.current.remove(mesh); voxelsMap.current.delete((p.old as any).id); }
      }).subscribe();
    fetchInitial();
    return () => { supabase.removeChannel(channel); };
  }, [position.lat, session]);

  if (!session) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-black z-[10000]">
        <div id="googleButton" />
      </div>
    );
  }

  return (
    <>
      <div 
        id="ar-overlay" 
        className="fixed inset-0 pointer-events-none z-[9999]"
        onPointerDown={() => { isInteractingWithUI.current = true; }}
      >
        <div className="fixed top-4 left-4 flex flex-col gap-2 pointer-events-auto">
          <div className="bg-black/60 p-2 text-white text-[10px] rounded backdrop-blur-md border border-white/10">
            GPS: {position.lat.toFixed(6)}, {position.lng.toFixed(6)}
          </div>
          <button 
            onClick={(e) => { e.stopPropagation(); requestCompass(); }}
            className="bg-white text-black text-[10px] font-bold px-3 py-2 rounded-full shadow-lg"
          >
            {aligned ? "NORTH LOCKED 🧭" : "ALIGN COMPASS"}
          </button>
        </div>
        
        <div 
          className="absolute bottom-12 left-0 right-0 flex justify-center pointer-events-auto"
          onPointerDown={(e) => { e.stopPropagation(); isInteractingWithUI.current = true; }}
        >
          <ColorPicker selected={selectedColor} onChange={setSelectedColor} />
        </div>
      </div>
      <div ref={mountRef} className="fixed inset-0" />
    </>
  );
}
