'use client'

import { useEffect, useRef, useState, useMemo } from "react";
import * as THREE from "three";
import { supabase } from '@/utils/supabase';
import { ARButton } from "three/addons/webxr/ARButton.js";
import { ColorPicker, COLORS, PlacementControls } from '@/components/UIComponents';
import LeaderboardMenu from '@/components/LeaderboardMenu';

const METERS_PER_DEGREE = 111111;
const VOXEL_SNAP = 0.1;
const Z_OFFSET = -1.2; // Negative is IN FRONT of camera
const VIEW_RADIUS_METERS = 500;
const DEGREE_THRESHOLD = VIEW_RADIUS_METERS / METERS_PER_DEGREE; 

export default function Viewer({ session }: { session: any }) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef(new THREE.Scene());
  const voxelsMap = useRef<Map<string, THREE.Mesh>>(new Map());
  const ghostRef = useRef<THREE.Mesh | null>(null);
  const originGps = useRef<{ lat: number, lng: number } | null>(null);
  const latestPos = useRef({ lat: 0, lng: 0 });

  const isDraftingRef = useRef(false);
  const isInteractingWithUIRef = useRef(false);
  const selectedColorRef = useRef(COLORS[0]);
  const sessionRef = useRef<any>(session);

  const [isDrafting, setIsDrafting] = useState(false);
  const [selectedColor, setSelectedColor] = useState(COLORS[0]);
  const [position, setPosition] = useState({ lat: 0, lng: 0 });
  const [aligned, setAligned] = useState(false);

  // Sync Refs
  useEffect(() => { isDraftingRef.current = isDrafting; }, [isDrafting]);
  useEffect(() => {
    selectedColorRef.current = selectedColor;
    if (ghostRef.current) (ghostRef.current.material as THREE.MeshPhongMaterial).color.set(selectedColor.hex);
  }, [selectedColor]);

  const geoConstants = useMemo(() => {
    if (!position.lat) return null;
    const lonScale = METERS_PER_DEGREE * Math.cos(position.lat * Math.PI / 180);
    return { lonScale, latRatio: METERS_PER_DEGREE / VOXEL_SNAP, lonRatio: lonScale / VOXEL_SNAP };
  }, [position.lat]);

  const addVoxelLocally = (voxel: any) => {
    if (voxelsMap.current.has(voxel.id)) return;
    const origin = originGps.current || { lat: voxel.lat, lng: voxel.lon };
    const lonScale = METERS_PER_DEGREE * Math.cos(origin.lat * Math.PI / 180);
    
    // Calculate world position relative to our session origin
    const targetX = (voxel.lon - origin.lng) * lonScale;
    const targetZ = -(voxel.lat - origin.lat) * METERS_PER_DEGREE;
    // Proximity shield (5cm)
    let exists = false;
    voxelsMap.current.forEach((m) => {
      if (Math.abs(m.position.x - targetX) < 0.05 &&
          Math.abs(m.position.z - targetZ) < 0.05 &&
          Math.abs(m.position.y - voxel.alt) < 0.05) exists = true;
    });
    if (exists) return;

    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(VOXEL_SNAP, VOXEL_SNAP, VOXEL_SNAP),
      new THREE.MeshPhongMaterial({ color: voxel.color })
    );
    mesh.position.set(targetX, voxel.alt, targetZ);
    sceneRef.current.add(mesh);
    voxelsMap.current.set(voxel.id, mesh);
  };

  const handleMove = (axis: 'x' | 'y' | 'z', steps: number) => {
    if (!ghostRef.current) return;
    ghostRef.current.position[axis] += (steps * VOXEL_SNAP);
  };

  const handleConfirm = async () => {
    if (!ghostRef.current || !sessionRef.current || !originGps.current) return;
    const localPos = ghostRef.current.position.clone();
    const origin = originGps.current;
    const lonScale = METERS_PER_DEGREE * Math.cos(origin.lat * Math.PI / 180);

    const voxelData = {
      lat: origin.lat - (localPos.z / METERS_PER_DEGREE),
      lon: origin.lng + (localPos.x / lonScale),
      alt: localPos.y,
      color: selectedColorRef.current.hex,
      user_id: sessionRef.current.user.id
    };

    const tempId = `temp-${Date.now()}`;
    addVoxelLocally({ ...voxelData, id: tempId });
    
    const { data } = await supabase.from('voxels').insert([voxelData]).select().single();
    if (data) {
      const mesh = voxelsMap.current.get(tempId);
      if (mesh) {
        voxelsMap.current.delete(tempId);
        voxelsMap.current.set(data.id, mesh);
      }
    }
    setIsDrafting(false);
  };

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
        // Rotate the scene so 0,0,0 Z-axis points North
        sceneRef.current.rotation.y = -THREE.MathUtils.degToRad(heading);
        setAligned(true);
      }
    };
    if (typeof (DeviceOrientationEvent as any).requestPermission === "function") {
      const perm = await (DeviceOrientationEvent as any).requestPermission();
      if (perm === "granted") window.addEventListener('deviceorientationabsolute', handleOrientation, true);
    } else window.addEventListener('deviceorientationabsolute', handleOrientation, true);
  };

  useEffect(() => {
    if (!mountRef.current || !session) return;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.xr.enabled = true;
    renderer.setSize(window.innerWidth, window.innerHeight);
    mountRef.current.appendChild(renderer.domElement);

    const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 1000);
    const light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 3);
    sceneRef.current.add(light);

    const ghost = new THREE.Mesh(
      new THREE.BoxGeometry(VOXEL_SNAP, VOXEL_SNAP, VOXEL_SNAP),
      new THREE.MeshPhongMaterial({ color: selectedColorRef.current.hex, transparent: true, opacity: 0.5 })
    );
    sceneRef.current.add(ghost);
    ghostRef.current = ghost;

    const controller = renderer.xr.getController(0);
    controller.addEventListener('select', () => {
        if (!isInteractingWithUIRef.current) setIsDrafting(true);
    });
    sceneRef.current.add(controller);

    renderer.setAnimationLoop(() => {
      if (!isDraftingRef.current && geoConstants && originGps.current) {
        // 1. Get position 1.2m in front of camera in WORLD space
        const worldTarget = new THREE.Vector3(0, 0, Z_OFFSET);
        worldTarget.applyMatrix4(camera.matrixWorld);

        // 2. Convert that world position to our aligned SCENE space
        const localTarget = sceneRef.current.worldToLocal(worldTarget.clone());

        const { lonScale, latRatio, lonRatio } = geoConstants;
        // 3. Snap the local scene coordinates to the GPS grid
        const snapX = Math.round(localTarget.x / VOXEL_SNAP) * VOXEL_SNAP;
        const snapY = Math.round(localTarget.y / VOXEL_SNAP) * VOXEL_SNAP;
        const snapZ = Math.round(localTarget.z / VOXEL_SNAP) * VOXEL_SNAP;

        ghostRef.current?.position.set(snapX, snapY, snapZ);
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
        sceneRef.current.remove(ghost, light, controller);
        renderer.setAnimationLoop(null);
        renderer.dispose();
        if (document.body.contains(button)) document.body.removeChild(button);
        if (mountRef.current?.contains(renderer.domElement)) mountRef.current.removeChild(renderer.domElement);
    };
  }, [!!session, !!geoConstants]);

  useEffect(() => {
    if (position.lat === 0 || !session) return;
    const loadAndListen = async () => {
      const { data } = await supabase.from('voxels').select('*')
        .gte('lat', position.lat - DEGREE_THRESHOLD).lte('lat', position.lat + DEGREE_THRESHOLD)
        .gte('lon', position.lng - DEGREE_THRESHOLD).lte('lon', position.lng + DEGREE_THRESHOLD);
      if (data) data.forEach(v => addVoxelLocally(v));

      const channel = supabase.channel('voxels_realtime')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'voxels' }, 
        payload => addVoxelLocally(payload.new))
        .subscribe();
        
      return () => { supabase.removeChannel(channel); };
    };
    loadAndListen();
  }, [position.lat, !!session]);

  return (
    <>
      <div id="ar-overlay" className="fixed inset-0 pointer-events-none z-[9999]" 
           onPointerDown={() => { isInteractingWithUIRef.current = true; }} 
           onPointerUp={() => { setTimeout(() => isInteractingWithUIRef.current = false, 100); }}>
        
        <div className="fixed top-6 left-6 flex flex-col gap-3 pointer-events-auto">
          <button onClick={requestCompass} className={`px-4 py-2 rounded-full text-[10px] font-bold border transition-colors ${aligned ? "bg-green-500/20 text-green-400 border-green-500/50" : "bg-white text-black border-white"}`}>
            {aligned ? "NORTH LOCKED" : "ALIGN COMPASS"}
          </button>
        </div>

        <LeaderboardMenu session={session} />

        <div className="absolute inset-x-0 bottom-12 flex flex-col items-center gap-8 pointer-events-auto">
          {isDrafting ? (
            <PlacementControls onMove={handleMove} onCancel={() => setIsDrafting(false)} onConfirm={handleConfirm} />
          ) : (
            <ColorPicker selected={selectedColor} onChange={setSelectedColor} />
          )}
        </div>
      </div>

      <div ref={mountRef} className="fixed inset-0" />
    </>
  );
}
