'use client'

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { supabase } from '@/utils/supabase';
import { ARButton } from "three/addons/webxr/ARButton.js";

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

export default function Viewer({ selectedColor }: { selectedColor: { hex: string } }) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef(new THREE.Scene());
  const voxelsMap = useRef<Map<string, THREE.Mesh>>(new Map());
  const ghostRef = useRef<THREE.Mesh | null>(null);
  const originGps = useRef<{ lat: number, lng: number } | null>(null);
  const latestPos = useRef({ lat: 0, lng: 0 });

  const [session, setSession] = useState<any>(null);
  const [authReady, setAuthReady] = useState(false);
  const [position, setPosition] = useState({ lat: 0, lng: 0 });
  const [aligned, setAligned] = useState(false);
  const [voxels, setVoxels] = useState<Voxel[]>([]);

  // ---------------- HELPERS ----------------
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
    (mesh as any).dbId = voxel.id;

    sceneRef.current.add(mesh);
    voxelsMap.current.set(voxel.id, mesh);
  };

  // ---------------- GOOGLE SIGN-IN ----------------
  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = () => {
      // @ts-ignore
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: async (res: any) => {
          try {
            const { data, error } = await supabase.auth.signInWithIdToken({
              provider: "google",
              token: res.credential,
            });
            if (error) console.error("Supabase sign-in error:", error);
            else setSession(data.session);
          } catch (e) {
            console.error("Sign-in callback failed:", e);
          }
        },
        use_fedcm_for_prompt: true,
      });

      const renderButton = () => {
        const btn = document.getElementById("googleButton");
        if (!btn) return requestAnimationFrame(renderButton);
        // @ts-ignore
        window.google.accounts.id.renderButton(btn, { theme: "outline", size: "large", text: "signin_with" });
      };
      renderButton();
      setAuthReady(true);
    };
    document.body.appendChild(script);

    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => listener.subscription.unsubscribe();
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

  // ---------------- COMPASS ----------------
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

    // Ghost cube
    const ghost = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.1, 0.1),
      new THREE.MeshPhongMaterial({ color: 0x00ff00, transparent: true, opacity: 0.4 })
    );
    scene.add(ghost);
    ghostRef.current = ghost;

    // Controller (placement + deletion)
    const controller = renderer.xr.getController(0);
    controller.addEventListener('select', async () => {
      if (!ghostRef.current) return;

      const worldPos = new THREE.Vector3();
      ghostRef.current.getWorldPosition(worldPos);

      let existingVoxelId: string | null = null;
      voxelsMap.current.forEach((mesh, id) => {
        if (mesh.position.distanceTo(ghostRef.current!.position) < 0.05 && (mesh as any).user_id === session.user.id) {
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
          color: "#" + new THREE.Color(Math.random() * 0xffffff).getHexString(),
          user_id: session.user.id
        }]).select().single();

        if (data) addVoxelLocally(data);
      }
    });
    scene.add(controller);

    // Animation loop
    renderer.setAnimationLoop(() => {
      camera.updateMatrixWorld();
      const targetPos = new THREE.Vector3(0, 0, Z_OFFSET).applyMatrix4(camera.matrixWorld);
      ghostRef.current?.position.set(
        Math.round(targetPos.x / VOXEL_SNAP) * VOXEL_SNAP,
        Math.round(targetPos.y / VOXEL_SNAP) * VOXEL_SNAP,
        Math.round(targetPos.z / VOXEL_SNAP) * VOXEL_SNAP
      );
      renderer.render(scene, camera);
    });

    // AR Button
    const button = ARButton.createButton(renderer, { requiredFeatures: ['local-floor'] });
    document.body.appendChild(button);

    // Resize
    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', onResize);
    return () => { window.removeEventListener('resize', onResize); renderer.dispose(); button.remove(); };
  }, [session]);

  // ---------------- REALTIME VOXELS ----------------
  useEffect(() => {
    if (position.lat === 0 || !session) return;

    const fetchInitial = async () => {
      const { data } = await supabase.from('voxels').select('*');
      data?.forEach(addVoxelLocally);
    };

    const channel = supabase.channel('voxels_realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'voxels' }, p => addVoxelLocally(p.new))
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'voxels' }, p => {
        const deletedId = p.old.id;
        const mesh = voxelsMap.current.get(deletedId);
        if (mesh) {
          sceneRef.current.remove(mesh);
          voxelsMap.current.delete(deletedId);
        }
      })
      .subscribe();

    fetchInitial();
    return () => supabase.removeChannel(channel);
  }, [position.lat, session]);

  // ---------------- LOGIN UI ----------------
  if (!session) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-black text-white z-[10000]">
        <div className="flex flex-col items-center">
          <div id="googleButton" className="mb-4" />
          {!authReady && <p className="text-sm opacity-70">Loading Google Sign-In…</p>}
        </div>
      </div>
    );
  }

  // ---------------- MAIN UI ----------------
  return (
    <>
      <div className="fixed top-4 left-4 z-50 flex flex-col gap-2">
        <div className="bg-black/60 p-2 text-white text-[10px] rounded backdrop-blur-md border border-white/10">
          GPS: {position.lat.toFixed(6)}, {position.lng.toFixed(6)}
        </div>
        <button 
          onClick={requestCompass}
          className="bg-white text-black text-[10px] font-bold px-3 py-2 rounded-full shadow-lg active:scale-95 transition-transform"
        >
          {aligned ? "NORTH LOCKED 🧭" : "ALIGN COMPASS"}
        </button>
      </div>
      <div ref={mountRef} className="fixed inset-0" />
    </>
  );
}
