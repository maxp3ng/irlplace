'use client'

import { useEffect, useRef, useState, useMemo } from "react";
import * as THREE from "three";
import { supabase } from '@/utils/supabase';
import { ARButton } from "three/addons/webxr/ARButton.js";
import { ColorPicker, COLORS } from '@/components/UIComponents';

const GRID_SIZE = 0.001;
const METERS_PER_DEGREE = 111111;
const VOXEL_SNAP = 0.1;
const Z_OFFSET = -1.2;
const VIEW_RADIUS_METERS = 500;
// Roughly 50m in degrees
const DEGREE_THRESHOLD = VIEW_RADIUS_METERS / METERS_PER_DEGREE; 

interface Voxel {
  id: string;
  lat: number;
  lon: number;
  alt: number;
  color: string;
  user_id: string;
}

export default function Viewer({ session }: { session: any }) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef(new THREE.Scene());
  const voxelsMap = useRef<Map<string, THREE.Mesh>>(new Map());
  const ghostRef = useRef<THREE.Mesh | null>(null);
  const originGps = useRef<{ lat: number, lng: number } | null>(null);
  const latestPos = useRef({ lat: 0, lng: 0 });

  const selectedColorRef = useRef(COLORS[0]);
  const sessionRef = useRef<any>(session);
  const isInteractingWithUI = useRef(false);

  const [selectedColor, setSelectedColor] = useState(COLORS[0]);
  const [position, setPosition] = useState({ lat: 0, lng: 0 });
  const [aligned, setAligned] = useState(false);

  useEffect(() => { sessionRef.current = session; }, [session]);

  // Optimization: only compute geo ratios when we have GPS
  const geoConstants = useMemo(() => {
    if (!position.lat) return null;
    const lonScale = METERS_PER_DEGREE * Math.cos(position.lat * Math.PI / 180);
    return {
      lonScale,
      latRatio: METERS_PER_DEGREE / VOXEL_SNAP,
      lonRatio: lonScale / VOXEL_SNAP
    };
  }, [!!position.lat]);

  useEffect(() => {
    selectedColorRef.current = selectedColor;
    if (ghostRef.current) {
      (ghostRef.current.material as THREE.MeshPhongMaterial).color.set(selectedColor.hex);
    }
  }, [selectedColor]);

  // ---------------- VOXEL ADD ----------------
  const addVoxelLocally = (voxel: Voxel) => {
    if (voxelsMap.current.has(voxel.id)) return;

    const distLat = Math.abs(voxel.lat - latestPos.current.lat);
    const distLon = Math.abs(voxel.lon - latestPos.current.lng);
    if (distLat > DEGREE_THRESHOLD || distLon > DEGREE_THRESHOLD) return;

    if (!originGps.current) return;
    const origin = originGps.current;
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

  // ---------------- GEOLOCATION ----------------
  useEffect(() => {
    const watchId = navigator.geolocation.watchPosition(
      pos => {
        latestPos.current = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        };

        setPosition(latestPos.current);

        if (!originGps.current) {
          originGps.current = { ...latestPos.current };
        }
      },
      null,
      { enableHighAccuracy: true }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  const requestCompass = async () => {
    const handleOrientation = (event: DeviceOrientationEvent) => {
      const heading =
        (event as any).webkitCompassHeading ||
        (360 - (event.alpha || 0));

      if (heading !== undefined) {
        sceneRef.current.rotation.y =
          -THREE.MathUtils.degToRad(heading);
        setAligned(true);
      }
    };

    if (typeof (DeviceOrientationEvent as any).requestPermission === "function") {
      const perm = await (DeviceOrientationEvent as any).requestPermission();
      if (perm === "granted")
        window.addEventListener("deviceorientationabsolute", handleOrientation, true);
    } else {
      window.addEventListener("deviceorientationabsolute", handleOrientation, true);
    }
  };

  // ---------------- AR ENGINE ----------------
  useEffect(() => {
    if (!mountRef.current || !session) return;

    const scene = sceneRef.current;

    const camera = new THREE.PerspectiveCamera(
      70,
      window.innerWidth / window.innerHeight,
      0.01,
      20
    );

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
    });

    renderer.xr.enabled = true;
    renderer.setSize(window.innerWidth, window.innerHeight);
    mountRef.current.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xffffff, 0xbbbbff, 3));

    const ghost = new THREE.Mesh(
      new THREE.BoxGeometry(VOXEL_SNAP, VOXEL_SNAP, VOXEL_SNAP),
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
      if (isInteractingWithUI.current) {
        setTimeout(() => { isInteractingWithUI.current = false; }, 100);
        return;
      }

      const currentSession = sessionRef.current;
      if (!ghostRef.current || !currentSession || !originGps.current) return;

      const localPos = ghostRef.current.position;
      let existingVoxelId: string | null = null;

      voxelsMap.current.forEach((mesh, id) => {
        if (mesh.position.distanceTo(localPos) < 0.01 &&
          (mesh as any).user_id === currentSession.user.id) {
          existingVoxelId = id;
        }
      });

      if (existingVoxelId) {
        const meshToDelete = voxelsMap.current.get(existingVoxelId);
        if (meshToDelete) scene.remove(meshToDelete);
        voxelsMap.current.delete(existingVoxelId);
        await supabase.from("voxels").delete().eq("id", existingVoxelId);
      } else {
        const origin = originGps.current;
        const lonScale = METERS_PER_DEGREE * Math.cos(origin.lat * Math.PI / 180);

        const tempId = Math.random().toString();
        const voxelData = {
          id: tempId,
          lat: origin.lat - (localPos.z / METERS_PER_DEGREE),
          lon: origin.lng + (localPos.x / lonScale),
          alt: localPos.y,
          color: selectedColorRef.current.hex,
          user_id: currentSession.user.id
        };

        addVoxelLocally(voxelData as any);
        await supabase.from('voxels').insert([voxelData]);
      }
    };

    controller.addEventListener('select', onSelect);
    scene.add(controller);

    renderer.setAnimationLoop(() => {
      if (!geoConstants || !originGps.current) {
        renderer.render(scene, camera);
        return;
      }

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
  }, [session, !!geoConstants]);

  // ---------------- REALTIME DATA ----------------
  useEffect(() => {
    if (position.lat === 0 || !session) return;

    const fetchRadiusVoxels = async () => {
      const { data } = await supabase
        .from('voxels')
        .select('*')
        .gte('lat', position.lat - DEGREE_THRESHOLD)
        .lte('lat', position.lat + DEGREE_THRESHOLD)
        .gte('lon', position.lng - DEGREE_THRESHOLD)
        .lte('lon', position.lng + DEGREE_THRESHOLD);

      if (data) data.forEach((v: Voxel) => addVoxelLocally(v));
    };

    const channel = supabase.channel('voxels_realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'voxels' }, p => {
        addVoxelLocally(p.new as Voxel);
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'voxels' }, p => {
        const mesh = voxelsMap.current.get((p.old as any).id);
        if (mesh) {
          sceneRef.current.remove(mesh);
          voxelsMap.current.delete((p.old as any).id);
        }
      }).subscribe();

    fetchRadiusVoxels();
    return () => { supabase.removeChannel(channel); };
  }, [position.lat, session]);

  return (
    <>
      <div
        id="ar-overlay"
        className="fixed inset-0 pointer-events-none z-[9999]"
        onPointerDown={() => { isInteractingWithUI.current = true; }}
      >
        <div className="fixed top-6 left-6 flex flex-col gap-3 pointer-events-auto">
          <div className="bg-black/60 backdrop-blur-md px-4 py-2 text-white text-[10px] rounded-full border border-white/10 font-mono">
            {position.lat.toFixed(6)}, {position.lng.toFixed(6)}
          </div>

          <button
            onClick={(e) => { e.stopPropagation(); requestCompass(); }}
            className={`px-4 py-2 rounded-full text-[10px] font-bold shadow-xl border ${
              aligned
                ? "bg-green-500/20 border-green-500/50 text-green-400"
                : "bg-white text-black border-white"
            }`}
          >
            {aligned ? "NORTH LOCKED 🧭" : "ALIGN COMPASS"}
          </button>
        </div>

        <div
          className="absolute inset-0 pointer-events-none flex items-end justify-center pb-12"
          onPointerDown={(e) => {
            e.stopPropagation();
            isInteractingWithUI.current = true;
          }}
        >
          <div className="pointer-events-auto">
            <ColorPicker selected={selectedColor} onChange={setSelectedColor} />
          </div>
        </div>
      </div>

      <div ref={mountRef} className="fixed inset-0" />
    </>
  );
}
