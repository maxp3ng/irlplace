'use client'

import { useEffect, useRef, useState, useMemo } from "react";
import * as THREE from "three";
import { supabase } from '@/utils/supabase';
import { ARButton } from "three/addons/webxr/ARButton.js";
import { ColorPicker, COLORS, PlacementControls} from '@/components/UIComponents';

const METERS_PER_DEGREE = 111111;
const VOXEL_SNAP = 0.1;
const Z_OFFSET = -1.2;
const VIEW_RADIUS_METERS = 500;
const DEGREE_THRESHOLD = VIEW_RADIUS_METERS / METERS_PER_DEGREE; 

export default function Viewer() {
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

  const [isDrafting, setIsDrafting] = useState(false);
  const [selectedColor, setSelectedColor] = useState(COLORS[0]);
  const [position, setPosition] = useState({ lat: 0, lng: 0 });
  const [aligned, setAligned] = useState(false);
  const [session, setSession] = useState<any>(null);

  useEffect(() => { isDraftingRef.current = isDrafting; }, [isDrafting]);
  useEffect(() => { selectedColorRef.current = selectedColor; }, [selectedColor]);
  useEffect(() => { sessionRef.current = session; }, [session]);
  useEffect(() => {
    selectedColorRef.current = selectedColor;
    if (ghostRef.current) (ghostRef.current.material as THREE.MeshPhongMaterial).color.set(selectedColor.hex);
  }, [selectedColor]);

  const geoConstants = useMemo(() => {
    if (!position.lat) return null;
    const lonScale = METERS_PER_DEGREE * Math.cos(position.lat * Math.PI / 180);
    return { lonScale, latRatio: METERS_PER_DEGREE / VOXEL_SNAP, lonRatio: lonScale / VOXEL_SNAP };
  }, [!!position.lat]);

  // Helper to convert GPS to Local Meters
  const getLocalPos = (lat: number, lon: number) => {
    const origin = originGps.current;
    if (!origin) return new THREE.Vector3(0,0,0);
    const lonScale = METERS_PER_DEGREE * Math.cos(origin.lat * Math.PI / 180);
    return new THREE.Vector3(
      (lon - origin.lng) * lonScale,
      0, // Alt handled separately
      -(lat - origin.lat) * METERS_PER_DEGREE
    );
  };

  const addVoxelLocally = (voxel: any) => {
    if (voxelsMap.current.has(voxel.id)) return;

    const distLat = Math.abs(voxel.lat - latestPos.current.lat);
    const distLon = Math.abs(voxel.lon - latestPos.current.lng);
    if (distLat > DEGREE_THRESHOLD || distLon > DEGREE_THRESHOLD) return;

    const origin = originGps.current || { lat: voxel.lat, lng: voxel.lon };
    const lonScale = METERS_PER_DEGREE * Math.cos(origin.lat * Math.PI / 180);
    const targetX = (voxel.lon - origin.lng) * lonScale;
    const targetZ = -(voxel.lat - origin.lat) * METERS_PER_DEGREE;
    
    let exists = false;
    voxelsMap.current.forEach((m) => {
      if (Math.abs(m.position.x - targetX) < 0.05 && 
          Math.abs(m.position.z - targetZ) < 0.05 && 
          Math.abs(m.position.y - voxel.alt) < 0.05) {
        exists = true;
      }
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
    const currentSession = sessionRef.current;
    if (!ghostRef.current || !currentSession || !originGps.current) return;

    const localPos = ghostRef.current.position.clone();
    const origin = originGps.current;
    const lonScale = METERS_PER_DEGREE * Math.cos(origin.lat * Math.PI / 180);

    const tempId = `temp-${Date.now()}`;
    const voxelData = {
      lat: origin.lat - (localPos.z / METERS_PER_DEGREE),
      lon: origin.lng + (localPos.x / lonScale),
      alt: localPos.y,
      color: selectedColorRef.current.hex,
      user_id: currentSession.user.id
    };

    // 1. Add locally with temp ID (Instant feedback)
    addVoxelLocally({ ...voxelData, id: tempId });

    // 2. Persist
    const { data } = await supabase.from('voxels').insert([voxelData]).select().single();
    
    // 3. Swap temp ID for real ID to avoid future duplicates
    if (data) {
      const mesh = voxelsMap.current.get(tempId);
      if (mesh) {
        voxelsMap.current.delete(tempId);
        voxelsMap.current.set(data.id, mesh);
      }
    }
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

    const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 1000);
    sceneRef.current.add(new THREE.HemisphereLight(0xffffff, 0xbbbbff, 3));

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

    return () => { renderer.setAnimationLoop(null); renderer.dispose(); };
  }, [session, !!geoConstants]);

  useEffect(() => {
    if (position.lat === 0 || !session) return;
    const loadAndListen = async () => {
      const { data } = await supabase.from('voxels').select('*')
        .gte('lat', position.lat - DEGREE_THRESHOLD).lte('lat', position.lat + DEGREE_THRESHOLD)
        .gte('lon', position.lng - DEGREE_THRESHOLD).lte('lon', position.lng + DEGREE_THRESHOLD);
      if (data) data.forEach(v => addVoxelLocally(v));

      supabase.channel('voxels_realtime').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'voxels' }, 
        payload => addVoxelLocally(payload.new)).subscribe();
    };
    loadAndListen();
  }, [position.lat, session]);
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
