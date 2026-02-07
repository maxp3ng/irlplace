'use client'

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { supabase } from '@/utils/supabase';
import { ARButton } from "three/addons/webxr/ARButton.js";
import { ColorPicker, COLORS, PlacementControls } from '@/components/UIComponents';
import MainMenu from '@/components/MainMenu';

const METERS_PER_DEGREE = 111111;
const VOXEL_SNAP = 0.1;
const Z_OFFSET = -1.2;
const VIEW_RADIUS_METERS = 500;
const DEGREE_THRESHOLD = VIEW_RADIUS_METERS / METERS_PER_DEGREE;

export default function Viewer({ session }: { session: any }) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef(new THREE.Scene());
  const voxelsMap = useRef<Map<string, THREE.Mesh>>(new Map());
  const ghostRef = useRef<THREE.Mesh | null>(null);
  const originGps = useRef<{ lat: number, lng: number } | null>(null);
  const latestPos = useRef({ lat: 0, lng: 0 });
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const geoConstantsRef = useRef<{ lonScale: number } | null>(null);

  const isDraftingRef = useRef(false);
  const isInteractingWithUIRef = useRef(false);
  const selectedColorRef = useRef(COLORS[0]);

  const [isDrafting, setIsDrafting] = useState(false);
  const [selectedColor, setSelectedColor] = useState(COLORS[0]);
  const [position, setPosition] = useState({ lat: 0, lng: 0 });

  // --- Sync math refs (No changes to logic) ---
  useEffect(() => { isDraftingRef.current = isDrafting; }, [isDrafting]);
  useEffect(() => {
    selectedColorRef.current = selectedColor;
    if (ghostRef.current) (ghostRef.current.material as THREE.MeshPhongMaterial).color.set(selectedColor.hex);
  }, [selectedColor]);

  useEffect(() => {
    if (position.lat) {
      const lonScale = METERS_PER_DEGREE * Math.cos(position.lat * Math.PI / 180);
      geoConstantsRef.current = { lonScale };
    }
  }, [position.lat]);

  const addVoxelLocally = (voxel: any) => {
    if (voxelsMap.current.has(voxel.id)) return;
    if (!originGps.current) originGps.current = { lat: voxel.lat, lng: voxel.lon };
    const origin = originGps.current;
    const lonScale = METERS_PER_DEGREE * Math.cos(origin.lat * Math.PI / 180);
    const targetX = (voxel.lon - origin.lng) * lonScale;
    const targetZ = -(voxel.lat - origin.lat) * METERS_PER_DEGREE;

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
    const idx = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
    ghostRef.current.position.setComponent(idx, ghostRef.current.position.getComponent(idx) + (steps * VOXEL_SNAP));
  };

  const handleConfirm = async () => {
    if (!ghostRef.current || !session || !originGps.current || !geoConstantsRef.current) return;
    const localPos = ghostRef.current.position.clone();
    const origin = originGps.current;
    const { lonScale } = geoConstantsRef.current;

    let existingId: string | null = null;
    voxelsMap.current.forEach((mesh, id) => {
      if (mesh.position.distanceTo(localPos) < 0.05) existingId = id;
    });

    if (existingId) {
      const { error } = await supabase.from('voxels').delete().eq('id', existingId);
      if (!error) {
        sceneRef.current.remove(voxelsMap.current.get(existingId)!);
        voxelsMap.current.delete(existingId);
      }
    } else {
      const voxelData = {
        lat: origin.lat - (localPos.z / METERS_PER_DEGREE),
        lon: origin.lng + (localPos.x / lonScale),
        alt: localPos.y,
        color: selectedColorRef.current.hex,
        user_id: session.user.id
      };
      const { data } = await supabase.from('voxels').insert([voxelData]).select().single();
      if (data) addVoxelLocally(data);
    }
    setIsDrafting(false);
  };

  // --- AR and Geolocation Setup ---
  useEffect(() => {
    const watchId = navigator.geolocation.watchPosition(pos => {
      setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude });
    }, null, { enableHighAccuracy: true });
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  useEffect(() => {
    if (!mountRef.current || !session) return;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.xr.enabled = true;
    renderer.setSize(window.innerWidth, window.innerHeight);
    mountRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

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
    controller.addEventListener('select', () => { if (!isInteractingWithUIRef.current) setIsDrafting(true); });
    sceneRef.current.add(controller);

    renderer.setAnimationLoop(() => {
      if (!isDraftingRef.current && geoConstantsRef.current && originGps.current) {
        const worldTarget = new THREE.Vector3(0, 0, Z_OFFSET).applyMatrix4(camera.matrixWorld);
        const localTarget = sceneRef.current.worldToLocal(worldTarget.clone());
        ghostRef.current?.position.set(
          Math.round(localTarget.x / VOXEL_SNAP) * VOXEL_SNAP,
          Math.round(localTarget.y / VOXEL_SNAP) * VOXEL_SNAP,
          Math.round(localTarget.z / VOXEL_SNAP) * VOXEL_SNAP
        );
      }
      renderer.render(sceneRef.current, camera);
    });

    const overlay = document.getElementById('ar-overlay');
    if (overlay) {
      const button = ARButton.createButton(renderer, { 
        requiredFeatures: ['local-floor'], 
        optionalFeatures: ['dom-overlay'], 
        domOverlay: { root: overlay } 
      });
      document.body.appendChild(button);
      
      return () => {
        renderer.setAnimationLoop(null);
        renderer.dispose();
        if (document.body.contains(button)) document.body.removeChild(button);
      };
    }
  }, [!!session]);

  useEffect(() => {
    if (position.lat === 0 || !session) return;
    supabase.from('voxels').select('*')
      .gte('lat', position.lat - DEGREE_THRESHOLD)
      .lte('lat', position.lat + DEGREE_THRESHOLD)
      .then(({ data }) => data?.forEach(addVoxelLocally));
  }, [position.lat, !!session]);

  // Touch handlers for interaction blocking
  const blockUI = () => { isInteractingWithUIRef.current = true; };
  const unblockUI = () => { setTimeout(() => { isInteractingWithUIRef.current = false; }, 150); };

  return (
    <>
      {/* This ID is targeted by globals.css :xr-overlay.
        It must be at the root of the body (returned here).
      */}
      <div id="ar-overlay" className="pointer-events-none">
        {/* Inner container to provide a relative context for iOS absolute positioning
        */}
        <div className="relative w-full h-full pointer-events-none">
          
          <div 
            className="pointer-events-auto" 
            onTouchStart={blockUI} 
            onTouchEnd={unblockUI} 
            onMouseDown={blockUI} 
            onMouseUp={unblockUI}
          >
            <MainMenu session={session} rendererRef={rendererRef} />
          </div>

          <div 
            className="absolute inset-x-0 bottom-12 flex flex-col items-center gap-8 pointer-events-auto" 
            onTouchStart={blockUI} 
            onTouchEnd={unblockUI} 
            onMouseDown={blockUI} 
            onMouseUp={unblockUI}
          >
            {isDrafting ? (
              <PlacementControls onMove={handleMove} onCancel={() => setIsDrafting(false)} onConfirm={handleConfirm} />
            ) : (
              <ColorPicker selected={selectedColor} onChange={setSelectedColor} />
            )}
          </div>
          
        </div>
      </div>

      <div ref={mountRef} className="fixed inset-0" />
    </>
  );
}