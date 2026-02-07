import Image from "next/image";
import Viewer from "../components/Viewer";

import VoxelWorld from '@/components/VoxelWorld';
export default function Home() {
return(
    <main className="h-screen w-screen">
      <VoxelWorld />
      <Viewer/>
    </main>
  );
}
