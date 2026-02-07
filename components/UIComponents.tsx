'use client'

import { useEffect, useRef, useState, useMemo } from "react";
import * as THREE from "three";
import { supabase } from '@/utils/supabase';
import { ARButton } from "three/addons/webxr/ARButton.js";
import { ColorPicker, COLORS, PlacementControls } from '@/components/UIComponents';

const METERS_PER_DEGREE = 111111;
const VOXEL_SNAP = 0.1;
const Z_OFFSET = -1.2;
const VIEW_RADIUS_METERS = 50;
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
  const mountRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef(new THREE.Scene());
  const voxelsMap = useRef<Map<string, THREE.Mesh>>(new Map());
  const ghostRef = useRef<THREE.Mesh | null>(null);
  const originGps = useRef<{ lat: number, lng: number } | null>(null);
  const latestPos = useRef({ lat: 0, lng: 0 });
  
  const selectedColorRef = useRef(COLORS[0]);
  const sessionRef = useRef<any>(null);
  const isInteractingWithUI = useRef(false);

  // --- NEW: PLACEMENT STATE ---
  const [isDrafting, setIsDrafting] = useState(false);
  const [selectedColor, setSelectedColor] = useState(COLORS[0]);
  const [session, setSession] = useState<any>(null);
  const [position, setPosition] = useState({ lat: 0, lng: 0 });
  const [aligned, setAligned] = useState(false);

  const geoConstants = useMemo(() => {
    if (!position.lat) return null;
    const lonScale = METERS_PER_DEGREE * Math.cos(position.lat * Math.PI / 180);
    return { lonScale, latRatio: METERS_PER_DEGREE / VOXEL_SNAP, lonRatio: lonScale / VOXEL_SNAP };
  }, [!!position.lat]);

  useEffect(() => {
    selectedColorRef.current = selectedColor;
    if (ghostRef.current) (ghostRef.current.material as THREE.MeshPhongMaterial).color.set(selectedColor.hex);
  }, [selectedColor]);

  useEffect(() => { sessionRef.current = session; }, [session]);

  const addVoxelLocally = (voxel: Voxel) => {
    if (voxelsMap.current.has(voxel.id)) return;
    const origin = originGps.current!;
    const lonScale = METERS_PER_DEGREE * Math.cos(origin.lat * Math.PI / 180);

    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(VOXEL_SNAP, VOXEL_SNAP, VOXEL_SNAP),
      new THREE.MeshPhongMaterial({ color: voxel.color })
    );
    mesh.position.set((voxel.lon - origin.lng) * lonScale, voxel.alt, -(voxel.lat - origin.lat) * METERS_PER_DEGREE);
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

    const { data } = await supabase.from('voxels').insert([voxelData]).select().single();
    if (data) addVoxelLocally(data as Voxel);
    setIsDrafting(false);
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
      new THREE.BoxGeometry(VOXEL_SNAP, VOXEL_SNAP, VOXEL_SNAP),
      new THREE.MeshPhongMaterial({ color: selectedColorRef.current.hex, transparent: true, opacity: 0.5 })
    );
    scene.add(ghost);
    ghostRef.current = ghost;

    const onSelect = () => {
      if (isInteractingWithUI.current) return;
      // If we aren't drafting, start drafting at the current reticle position
      setIsDrafting(true);
    };

    const controller = renderer.xr.getController(0);
    controller.addEventListener('select', onSelect);
    scene.add(controller);

    renderer.setAnimationLoop(() => {
      if (!geoConstants || !originGps.current) {
        renderer.render(scene, camera);
        return;
      }

      // ONLY track the camera gaze if we are NOT currently using the D-Pad to nudge
      if (!isDrafting) {
        camera.updateMatrixWorld();
        const targetPos = new THREE.Vector3(0, 0, Z_OFFSET).applyMatrix4(camera.matrixWorld);
        scene.worldToLocal(targetPos);

        const { lonScale, latRatio, lonRatio } = geoConstants;
        const snapLat = Math.round((-targetPos.z / METERS_PER_DEGREE) * latRatio) / latRatio;
        const snapLon = Math.round((targetPos.x / lonScale) * lonRatio) / lonRatio;

        ghostRef.current?.position.set(
          snapLon * lonScale,
          Math.round(targetPos.y / VOXEL_SNAP) * VOXEL_SNAP,
          -snapLat * METERS_PER_DEGREE
        );
      }
      
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
    };
  }, [session, !!geoConstants, isDrafting]); // Note: isDrafting dependency pauses the reticle tracking

  // (Auth and Geolocation effects remain the same as previous implementation)
  // ... (keeping implementation brief to focus on the PlacementControls hookup)

  return (
    <>
      <div id="ar-overlay" className="fixed inset-0 pointer-events-none z-[9999]" onPointerDown={() => { isInteractingWithUI.current = true; }}>
        
        {/* HUD Top Left */}
        {!isDrafting && (
          <div className="fixed top-6 left-6 flex flex-col gap-3 pointer-events-auto">
             {/* Compass/GPS UI */}
          </div>
        )}

        {/* BOTTOM UI AREA */}
        <div className="absolute inset-x-0 bottom-12 flex flex-col items-center gap-8 pointer-events-auto" 
             onPointerDown={(e) => { e.stopPropagation(); isInteractingWithUI.current = true; }}>
          
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