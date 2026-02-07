"use client";

import { useEffect, useState } from 'react';
import { Canvas } from "@react-three/fiber";
import { Box, OrbitControls } from "@react-three/drei";
import { supabase } from '@/utils/supabase';

export default function VoxelWorld() {
  const [voxels, setVoxels] = useState<any[]>([]);

  // 1. Load data and setup Real-time listener
  useEffect(() => {

    const init = async () => {
      const { data, error: fetchError } = await supabase.from('voxels').select('*');
      if (data) {
        console.log("initial voxels:", data.length);
        setVoxels(data);
      }
      const channel = supabase
        .channel('realtime_voxels')
        .on('postgres_changes', 
          { event: 'INSERT', schema: 'public', table: 'voxels' }, 
          (payload) => {
            console.log("new voxel:", payload.new);
            setVoxels((prev) => [...prev, payload.new]);
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    };

    init();
  }, []);


  const addVoxel = async (x: number, y: number, z: number) => {
    const { error } = await supabase.from('voxels').insert([
      { lat: z, lon: x, alt: y, color: '#ff4500' } // Using simple x,y,z for now
    ]);
    if (error) console.error("Error saving:", error);
  };

  return (
    <div className="w-full h-screen">
      <Canvas camera={{ position: [10, 10, 10] }}>
        <ambientLight intensity={0.5} />
        <pointLight position={[10, 10, 10]} />
        
        {/* Render all voxels from the database */}
        {voxels.map((v) => (
          <Box key={v.id} position={[v.lon, v.alt, v.lat]}>
            <meshStandardMaterial color={v.color} />
          </Box>
        ))}

        {/* Click the floor to add a voxel */}
        <mesh 
          rotation={[-Math.PI / 2, 0, 0]} 
          onPointerDown={(e) => addVoxel(Math.round(e.point.x), 0, Math.round(e.point.z))}
        >
          <planeGeometry args={[100, 100]} />
          <meshStandardMaterial color="#222" opacity={0.5} transparent />
        </mesh>

        <OrbitControls />
      </Canvas>
    </div>
  );
}