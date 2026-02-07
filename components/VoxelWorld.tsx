"use client";

import { useEffect, useState } from 'react';
import { Canvas } from "@react-three/fiber";
import { Box, OrbitControls } from "@react-three/drei";
import { supabase } from '@/utils/supabase';

export default function VoxelWorld() {
  const [voxels, setVoxels] = useState<any[]>([]);

  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.from('voxels').select('*');
      if (data) setVoxels(data);

      const channel = supabase
        .channel('realtime_voxels')
        .on('postgres_changes', 
          { event: '*', schema: 'public', table: 'voxels' }, // Listen for ALL (*) changes
          (payload) => {
            if (payload.eventType === 'INSERT') {
              setVoxels((prev) => [...prev, payload.new]);
            } else if (payload.eventType === 'DELETE') {
              setVoxels((prev) => prev.filter(v => v.id !== payload.old.id));
            }
          }
        )
        .subscribe();

      return () => { supabase.removeChannel(channel); };
    };
    init();
  }, []);

  const addVoxel = async (x: number, y: number, z: number) => {
    await supabase.from('voxels').insert([{ lat: z, lon: x, alt: y, color: '#ff4500' }]);
  };

  const removeVoxel = async (id: string) => {
  console.log("📡 Attempting to delete voxel ID:", id); // Check if ID is defined
  
  const { error, count } = await supabase
    .from('voxels')
    .delete()
    .eq('id', id)
    .select(); // Adding .select() returns the deleted row so we can see if it worked

  if (error) {
    console.error("❌ Supabase Delete Error:", error.message);
  } else if (count === 0) {
    console.warn("⚠️ No row found with that ID. Check your RLS policies!");
  } else {
    console.log("✅ Successfully deleted from DB:", id);
  }
};

  return (
    <div className="w-full h-screen">
      <Canvas camera={{ position: [10, 10, 10] }}>
        <ambientLight intensity={0.5} />
        <pointLight position={[10, 10, 10]} />
        
        {voxels.map((v) => (
          <Box 
            key={v.id} 
            position={[v.lon, v.alt, v.lat]}
            onClick={(e) => {
              e.stopPropagation(); // Prevents clicking the floor through the box
              console.log("remove");
              console.log(v.id);
              removeVoxel(v.id);
            }}
          >
            <meshStandardMaterial color={v.color} />
          </Box>
        ))}

        <mesh 
          rotation={[-Math.PI / 2, 0, 0]} 
          onClick={(e) => {
            // Check if we hit the floor directly
            console.log("add");
            addVoxel(Math.round(e.point.x), 0, Math.round(e.point.z));
          }}
        >
          <planeGeometry args={[100, 100]} />
          <meshStandardMaterial color="#222" opacity={0.5} transparent />
        </mesh>

        <OrbitControls />
      </Canvas>
    </div>
  );
}