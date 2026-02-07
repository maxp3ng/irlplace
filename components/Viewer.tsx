'use client'

import { useEffect, useRef, useState, useMemo } from "react";
import * as THREE from "three";
import { supabase } from '@/utils/supabase';
// Change: Import our CustomARButton instead of the default one
import { CustomARButton } from "@/utils/CustomARButton"; 
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
  const originGps = useRef<{ lat: number; lng: number } | null>(null);
  const latestPos = useRef({ lat: 0, lng: 0 });
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);

  const isDraftingRef = useRef(false);
  const isInteractingWithUIRef = useRef(false);
  const selectedColorRef = useRef(COLORS[0]);
  const sessionRef = useRef(session);

  const [isDrafting, setIsDrafting] = useState(false);
  const [selectedColor, setSelectedColor] = useState(COLORS[0]);
  const [position, setPosition] = useState({ lat: 0, lng: 0 });

  useEffect(() => { isDraftingRef.current = isDrafting; }, [isDrafting]);
  useEffect(() => { sessionRef.current = session; }, [session]);
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
    if (!originGps.current) originGps.current = { lat: voxel.lat, lng: voxel.lon };
    const origin = originGps.current;
    const lonScale = METERS_PER_DEGREE * Math.cos(origin.lat * Math.PI / 180);
    const x = (voxel.lon - origin.lng) * lonScale;
    const z = -(voxel.lat - origin.lat) * METERS_PER_DEGREE;

    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(VOXEL_SNAP, VOXEL_SNAP, VOXEL_SNAP),
      new THREE.MeshPhongMaterial({ color: voxel.color })
    );
    mesh.position.set(x, voxel.alt, z);
    sceneRef.current.add(mesh);
    voxelsMap.current.set(voxel.id, mesh);
  };

  const handleMove = (axis: 'x' | 'y' | 'z', steps: number) => {
    if (!ghostRef.current) return;
    ghostRef.current.position[axis] += VOXEL_SNAP * steps;
  };

  const handleConfirm = async () => {
    if (!ghostRef.current || !sessionRef.current || !originGps.current) return;
    const localPos = ghostRef.current.position.clone();
    const origin = originGps.current;
    const lonScale = METERS_PER_DEGREE * Math.cos(origin.lat * Math.PI / 180);

    let existingId: string | null = null;
    let existingMesh: THREE.Mesh | null = null;
    voxelsMap.current.forEach((mesh, id) => {
      if (
        Math.abs(mesh.position.x - localPos.x) < 0.05 &&
        Math.abs(mesh.position.z - localPos.z) < 0.05 &&
        Math.abs(mesh.position.y - localPos.y) < 0.05
      ) {
        existingId = id;
        existingMesh = mesh;
      }
    });

    if (existingId && existingMesh) {
      const { error } = await supabase.from('voxels').delete().eq('id', existingId);
      if (!error) {
        sceneRef.current.remove(existingMesh);
        voxelsMap.current.delete(existingId);
      }
      setIsDrafting(false);
      return;
    }

    const voxelData = {
      lat: origin.lat - localPos.z / METERS_PER_DEGREE,
      lon: origin.lng + localPos.x / lonScale,
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
    const watchId = navigator.geolocation.watchPosition(
      pos => {
        latestPos.current = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setPosition(latestPos.current);
        if (!originGps.current) originGps.current = { ...latestPos.current };
      },
      null,
      { enableHighAccuracy: true }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  useEffect(() => {
    if (!mountRef.current || !session) return;

    const renderer = new THREE.WebGLRenderer({ 
      antialias: true, 
      alpha: true, 
      preserveDrawingBuffer: true 
    });
    // Set alpha to 0 and transparent background for iOS
    renderer.setClearColor(0x000000, 0); 
    renderer.xr.enabled = true;
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    
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
    // iOS Select Event fix: ensure UI block is checked
    const triggerDrafting = () => { 
      if (!isInteractingWithUIRef.current) {
        setIsDrafting(true); 
      }
    };
    controller.addEventListener('select', triggerDrafting);
    sceneRef.current.add(controller);

    const overlay = document.getElementById('ar-overlay');

    renderer.setAnimationLoop(() => {
      if (!isDraftingRef.current && geoConstants && originGps.current) {
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

    // Use CustomARButton with dom-overlay as a REQUIRED feature
    if (overlay) {
      const button = CustomARButton.createButton(renderer, { 
        requiredFeatures: ['local-floor', 'dom-overlay'], 
        domOverlay: { root: overlay } 
      });
      document.body.appendChild(button);

      return () => {
        sceneRef.current.remove(ghost, light, controller);
        renderer.setAnimationLoop(null);
        renderer.dispose();
        if (document.body.contains(button)) document.body.removeChild(button);
      };
    }
  }, [!!session, !!geoConstants]);

  useEffect(() => {
    if (position.lat === 0 || !session) return;
    const loadAndListen = async () => {
      const { data } = await supabase.from('voxels').select('*')
        .gte('lat', position.lat - DEGREE_THRESHOLD)
        .lte('lat', position.lat + DEGREE_THRESHOLD)
        .gte('lon', position.lng - DEGREE_THRESHOLD)
        .lte('lon', position.lng + DEGREE_THRESHOLD);
      if (data) data.forEach(v => addVoxelLocally(v));

      const channel = supabase.channel('voxels_realtime')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'voxels' }, payload => addVoxelLocally(payload.new))
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'voxels' }, payload => {
          const id = payload.old.id;
          const mesh = voxelsMap.current.get(id);
          if (mesh) { sceneRef.current.remove(mesh); voxelsMap.current.delete(id); }
        })
        .subscribe();
      return () => { supabase.removeChannel(channel); };
    };
    loadAndListen();
  }, [position.lat, !!session]);

  // Enhanced block handlers for iOS pointer events
  const blockUI = (e: any) => { 
    isInteractingWithUIRef.current = true;
    e.stopPropagation();
  };
  const unblockUI = () => { 
    setTimeout(() => { isInteractingWithUIRef.current = false; }, 250); 
  };

  return (
    <>
      {/* UI LAYER: Controlled by CustomARButton + data-xr-active */}
      <div 
        id="ar-overlay" 
        style={{ display: 'none' }} 
        className="pointer-events-none"
      >
        <div className="relative w-full h-full pointer-events-none">
          <div 
            className="absolute top-10 left-6 pointer-events-auto"
            onPointerDown={blockUI} onPointerUp={unblockUI}
            onTouchStart={blockUI} onTouchEnd={unblockUI}
          >
            <MainMenu session={session} rendererRef={rendererRef} />
          </div>

          <div 
            className="absolute inset-x-0 bottom-24 flex flex-col items-center gap-8 pointer-events-auto"
            onPointerDown={blockUI} onPointerUp={unblockUI}
            onTouchStart={blockUI} onTouchEnd={unblockUI}
          >
            {isDrafting ? (
              <PlacementControls onMove={handleMove} onCancel={() => setIsDrafting(false)} onConfirm={handleConfirm} />
            ) : (
              <ColorPicker selected={selectedColor} onChange={setSelectedColor} />
            )}
          </div>
        </div>
      </div>

      {/* CANVAS CONTAINER */}
      <div ref={mountRef} className="fixed inset-0 z-0" />
    </>
  );
}
