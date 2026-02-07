# Location-Anchored 3D Block Placement App - Technical Specification

## Project Overview

A web-based, location-anchored 3D voxel placement application. Users can place 2m blocks in real-world space that persist and are visible to all nearby users. Supports AR mode (WebXR) with GPS fallback.

**Center Location:** Carnegie Mellon University
**Coordinates:** 40.4443°N, 79.9436°W
**Initial Scale:** Campus-wide (500m radius)

---

## Core Technical Decisions

### World Grid System
- **Block Size:** 2m × 2m × 2m cubes
- **Chunk Size:** 16 × 16 × 16 blocks (32m × 32m × 32m)
- **Load Radius:** 100m from user position
- **Max Placement Distance:** 50m from user
- **Altitude Handling:** Snap to ground level (Y=0 baseline, can build up/down)

### Coordinate System

**Global Coordinate System:**
- Origin: CMU center (40.4443°N, 79.9436°W, elevation baseline)
- Use Local Tangent Plane (LTP) projection
- X-axis: East, Y-axis: Up, Z-axis: North

**Conversion Formula (GPS → Local Meters):**
```javascript
const ORIGIN_LAT = 40.4443;
const ORIGIN_LON = -79.9436;
const METERS_PER_DEGREE_LAT = 111319.9;

function gpsToLocal(lat, lon) {
  const metersPerDegreeLon = 111319.9 * Math.cos(ORIGIN_LAT * Math.PI / 180);

  const x = (lon - ORIGIN_LON) * metersPerDegreeLon;
  const z = (lat - ORIGIN_LAT) * METERS_PER_DEGREE_LAT;

  return { x, z };
}

function localToGPS(x, z) {
  const metersPerDegreeLon = 111319.9 * Math.cos(ORIGIN_LAT * Math.PI / 180);

  const lon = ORIGIN_LON + (x / metersPerDegreeLon);
  const lat = ORIGIN_LAT + (z / METERS_PER_DEGREE_LAT);

  return { lat, lon };
}
```

**Chunk Coordinate System:**
```javascript
function worldToChunk(x, y, z) {
  const CHUNK_SIZE = 32; // meters
  return {
    chunkX: Math.floor(x / CHUNK_SIZE),
    chunkY: Math.floor(y / CHUNK_SIZE),
    chunkZ: Math.floor(z / CHUNK_SIZE)
  };
}

function chunkToWorld(chunkX, chunkY, chunkZ) {
  const CHUNK_SIZE = 32;
  return {
    x: chunkX * CHUNK_SIZE,
    y: chunkY * CHUNK_SIZE,
    z: chunkZ * CHUNK_SIZE
  };
}
```

**Block Grid Snapping:**
```javascript
const BLOCK_SIZE = 2; // meters

function snapToGrid(x, y, z) {
  return {
    x: Math.floor(x / BLOCK_SIZE) * BLOCK_SIZE,
    y: Math.floor(y / BLOCK_SIZE) * BLOCK_SIZE,
    z: Math.floor(z / BLOCK_SIZE) * BLOCK_SIZE
  };
}
```

---

## Dual-Mode System

### Mode Detection
```javascript
async function detectMode() {
  if ('xr' in navigator) {
    const supported = await navigator.xr.isSessionSupported('immersive-ar');
    return supported ? 'AR' : 'GPS';
  }
  return 'GPS';
}
```

### AR Mode (Primary)

**Requirements:**
- iOS Safari 12+ or Android Chrome 79+
- Device with ARCore/ARKit support
- Camera permissions

**Features:**
- WebXR Device API with hit-testing
- 2m block placement with cm-accurate positioning
- Surface detection for placement
- GPS used only for chunk loading
- Device pose tracking

**AR Session Initialization:**
```javascript
const session = await navigator.xr.requestSession('immersive-ar', {
  requiredFeatures: ['hit-test', 'local'],
  optionalFeatures: ['dom-overlay']
});

// Align AR local space to GPS global coordinates
const gpsPosition = await getCurrentPosition();
const localOrigin = gpsToLocal(gpsPosition.lat, gpsPosition.lon);
// Store alignment offset for converting AR coordinates to world coordinates
```

**AR Coordinate Alignment:**
- On AR session start, record GPS position as AR origin
- All AR coordinates converted to world coordinates using this offset
- AR provides precise relative positioning
- GPS provides absolute positioning (which chunk region)

**Placement Flow:**
1. User taps screen
2. Perform hit-test against real-world surfaces
3. Get hit point in AR local coordinates
4. Convert AR local → world coordinates using alignment offset
5. Snap to 2m grid
6. Show ghost block preview
7. Confirm placement → send to server

### GPS Fallback Mode

**Requirements:**
- GPS/location permissions
- Any modern browser

**Features:**
- 3D scene with orbit camera controls
- Same 2m block grid
- Virtual placement (not anchored to surfaces)
- GPS for position and chunk loading
- Touch/mouse controls for camera

**Placement Flow:**
1. User moves camera to desired position
2. Raycast from camera center
3. Snap intersection to 2m grid
4. Show ghost block with uncertainty indicator (5m radius sphere)
5. Confirm placement → send to server

**GPS Uncertainty Handling:**
- Show placement confidence radius
- Visual indicator: semi-transparent sphere around ghost block
- Recommend placing larger structures (multiple blocks)

---

## Visual Design

### Block Appearance
- Minecraft-style voxels with smooth shading
- Slightly rounded edges (bevel modifier: 0.05m)
- Metallic/glossy material for modern look
- Subtle ambient occlusion

### Color Palette (10 colors)
```javascript
const BLOCK_COLORS = [
  { name: 'Red', hex: '#E74C3C' },
  { name: 'Blue', hex: '#3498DB' },
  { name: 'Green', hex: '#2ECC71' },
  { name: 'Yellow', hex: '#F1C40F' },
  { name: 'Purple', hex: '#9B59B6' },
  { name: 'Orange', hex: '#E67E22' },
  { name: 'Pink', hex: '#FD79A8' },
  { name: 'Cyan', hex: '#00CEC9' },
  { name: 'White', hex: '#ECF0F1' },
  { name: 'Black', hex: '#2C3E50' }
];
```

### UI Elements
- Floating color picker (bottom center)
- Mode indicator (top left): "AR Mode" or "GPS Mode"
- Placement status (top right): "Ready" / "Placing..." / "Error"
- Mini-map (bottom right, optional)
- Block count / rate limit indicator

---

## Tech Stack

### Frontend
- **Framework:** Next.js 14 (App Router)
- **3D Rendering:** Three.js + React Three Fiber (@react-three/fiber)
- **AR:** WebXR Device API (vanilla, no library needed)
- **Camera Controls:** @react-three/drei (OrbitControls for GPS mode)
- **UI:** Tailwind CSS + Radix UI
- **State:** Zustand
- **Real-time:** Socket.IO client

### Backend
- **Runtime:** Node.js 20+
- **Framework:** Next.js API Routes
- **WebSocket:** Socket.IO
- **Database:** Postgres (Vercel Postgres or Supabase)
- **ORM:** Prisma
- **Validation:** Zod

### Hosting
- **Platform:** Vercel (free tier)
  - Frontend: Vercel edge network
  - API Routes: Serverless functions
  - Database: Vercel Postgres (512MB free)
  - WebSocket: Vercel supports Socket.IO on serverless

**Alternative if WebSocket issues:**
- Frontend: Vercel
- Backend + WebSocket: Railway or Render (free tier)
- Database: Supabase (free tier)

---

## Database Schema

### Tables

```sql
-- Blocks table
CREATE TABLE blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- World position (in meters from origin)
  x REAL NOT NULL,
  y REAL NOT NULL,
  z REAL NOT NULL,

  -- Chunk coordinates (for fast queries)
  chunk_x INTEGER NOT NULL,
  chunk_y INTEGER NOT NULL,
  chunk_z INTEGER NOT NULL,

  -- Block properties
  color VARCHAR(7) NOT NULL, -- hex color

  -- User tracking
  user_id VARCHAR(255) NOT NULL, -- session ID or user ID
  placed_at TIMESTAMP DEFAULT NOW(),

  -- Optional: placement mode for analytics
  placement_mode VARCHAR(10), -- 'AR' or 'GPS'

  UNIQUE(x, y, z) -- Only one block per position
);

-- Indexes
CREATE INDEX idx_blocks_chunk ON blocks(chunk_x, chunk_y, chunk_z);
CREATE INDEX idx_blocks_user ON blocks(user_id);
CREATE INDEX idx_blocks_placed_at ON blocks(placed_at);

-- Users table (for anonymous sessions)
CREATE TABLE users (
  id VARCHAR(255) PRIMARY KEY, -- session ID
  created_at TIMESTAMP DEFAULT NOW(),
  last_seen TIMESTAMP DEFAULT NOW(),

  -- Optional: track for rate limiting
  blocks_placed_count INTEGER DEFAULT 0,
  last_block_placed_at TIMESTAMP
);

-- Chunk subscriptions (for WebSocket management)
CREATE TABLE chunk_subscriptions (
  user_id VARCHAR(255) NOT NULL,
  chunk_x INTEGER NOT NULL,
  chunk_y INTEGER NOT NULL,
  chunk_z INTEGER NOT NULL,
  subscribed_at TIMESTAMP DEFAULT NOW(),

  PRIMARY KEY(user_id, chunk_x, chunk_y, chunk_z)
);
```

### Prisma Schema

```prisma
// prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Block {
  id        String   @id @default(uuid())

  // World position
  x         Float
  y         Float
  z         Float

  // Chunk coordinates
  chunkX    Int      @map("chunk_x")
  chunkY    Int      @map("chunk_y")
  chunkZ    Int      @map("chunk_z")

  // Block properties
  color     String

  // User tracking
  userId    String   @map("user_id")
  placedAt  DateTime @default(now()) @map("placed_at")

  placementMode String? @map("placement_mode")

  @@unique([x, y, z])
  @@index([chunkX, chunkY, chunkZ])
  @@index([userId])
  @@map("blocks")
}

model User {
  id                  String   @id
  createdAt           DateTime @default(now()) @map("created_at")
  lastSeen            DateTime @default(now()) @map("last_seen")
  blocksPlacedCount   Int      @default(0) @map("blocks_placed_count")
  lastBlockPlacedAt   DateTime? @map("last_block_placed_at")

  @@map("users")
}
```

---

## API Endpoints

### REST API

**Base URL:** `/api`

#### `GET /api/chunks`
Get blocks for multiple chunks.

**Query Parameters:**
```typescript
{
  chunks: string; // JSON array of chunk coords: [[x,y,z], [x,y,z], ...]
}
```

**Response:**
```typescript
{
  blocks: Array<{
    id: string;
    x: number;
    y: number;
    z: number;
    chunkX: number;
    chunkY: number;
    chunkZ: number;
    color: string;
    userId: string;
    placedAt: string;
  }>;
}
```

#### `POST /api/blocks`
Place a new block.

**Body:**
```typescript
{
  x: number;
  y: number;
  z: number;
  color: string; // hex code
  mode: 'AR' | 'GPS';
  userPosition: { x: number; z: number }; // for validation
}
```

**Validation:**
- Block position snapped to 2m grid
- Within 50m of user position
- Color is valid hex code
- Rate limit: 10 blocks per minute per user

**Response:**
```typescript
{
  success: true;
  block: Block;
}
// OR
{
  success: false;
  error: string;
}
```

#### `DELETE /api/blocks/:id`
Delete own block.

**Response:**
```typescript
{
  success: true;
}
```

#### `POST /api/users/session`
Create or refresh user session.

**Response:**
```typescript
{
  userId: string;
}
```

---

## WebSocket Events

**Server URL:** Same as app URL (Vercel supports Socket.IO)

### Client → Server

#### `subscribe-chunks`
Subscribe to updates for chunks in view.
```typescript
{
  chunks: Array<{ x: number; y: number; z: number }>;
}
```

#### `unsubscribe-chunks`
Unsubscribe from chunks no longer in view.
```typescript
{
  chunks: Array<{ x: number; y: number; z: number }>;
}
```

#### `place-block`
Real-time block placement (optimistic).
```typescript
{
  x: number;
  y: number;
  z: number;
  color: string;
  mode: 'AR' | 'GPS';
  userPosition: { x: number; z: number };
}
```

### Server → Client

#### `block-placed`
New block placed by someone.
```typescript
{
  block: Block;
}
```

#### `block-deleted`
Block deleted by someone.
```typescript
{
  blockId: string;
  position: { x: number; y: number; z: number };
}
```

#### `placement-error`
Block placement failed.
```typescript
{
  error: string;
  tempId?: string; // for rolling back optimistic update
}
```

#### `chunks-loaded`
Response to subscribe-chunks.
```typescript
{
  chunks: Array<{
    chunk: { x: number; y: number; z: number };
    blocks: Block[];
  }>;
}
```

---

## Frontend Architecture

### Directory Structure
```
src/
├── app/
│   ├── page.tsx              # Main app page
│   ├── layout.tsx            # Root layout
│   └── api/                  # API routes
│       ├── blocks/
│       ├── chunks/
│       └── users/
├── components/
│   ├── Scene.tsx             # Main 3D scene
│   ├── ARMode.tsx            # AR mode component
│   ├── GPSMode.tsx           # GPS fallback mode
│   ├── BlockRenderer.tsx     # Instanced block rendering
│   ├── GhostBlock.tsx        # Placement preview
│   ├── ColorPicker.tsx       # Block color selector
│   ├── UI/
│   │   ├── ModeIndicator.tsx
│   │   ├── StatusBar.tsx
│   │   └── MiniMap.tsx
│   └── Controls/
│       ├── ARControls.tsx
│       └── OrbitCameraControls.tsx
├── lib/
│   ├── coordinates.ts        # GPS ↔ local conversion
│   ├── chunks.ts             # Chunk math utilities
│   ├── websocket.ts          # Socket.IO client setup
│   └── prisma.ts             # Prisma client
├── store/
│   ├── useBlockStore.ts      # Block state (Zustand)
│   ├── useUserStore.ts       # User session state
│   └── useARStore.ts         # AR session state
└── types/
    └── index.ts              # Shared TypeScript types
```

### State Management (Zustand)

**Block Store:**
```typescript
type BlockStore = {
  blocks: Map<string, Block>; // key: "x,y,z"
  loadedChunks: Set<string>; // key: "cx,cy,cz"

  addBlock: (block: Block) => void;
  removeBlock: (id: string) => void;
  getBlocksInChunk: (cx: number, cy: number, cz: number) => Block[];
  setChunkLoaded: (cx: number, cy: number, cz: number) => void;
};
```

**User Store:**
```typescript
type UserStore = {
  userId: string | null;
  position: { x: number; z: number } | null;
  mode: 'AR' | 'GPS';

  setUserId: (id: string) => void;
  updatePosition: (x: number, z: number) => void;
  setMode: (mode: 'AR' | 'GPS') => void;
};
```

### Three.js Scene Setup

**GPS Mode:**
```typescript
<Canvas camera={{ position: [0, 10, 10], fov: 75 }}>
  <ambientLight intensity={0.5} />
  <directionalLight position={[10, 10, 5]} intensity={1} />

  <BlockRenderer blocks={visibleBlocks} />
  <GhostBlock position={ghostPosition} color={selectedColor} />

  <OrbitControls />
  <Grid />
</Canvas>
```

**AR Mode:**
```typescript
// Use native WebXR, render Three.js scene into AR session
const xrSession = await navigator.xr.requestSession('immersive-ar', {...});
renderer.xr.setSession(xrSession);

// Hit-test for placement
const hitTestSource = await xrSession.requestHitTestSource({...});
```

### Instanced Rendering

```typescript
// Render all blocks of same color as single instanced mesh
const InstancedBlocks = ({ blocks, color }) => {
  const meshRef = useRef<InstancedMesh>(null);

  useEffect(() => {
    if (!meshRef.current) return;

    blocks.forEach((block, i) => {
      const matrix = new Matrix4();
      matrix.setPosition(block.x, block.y, block.z);
      meshRef.current.setMatrixAt(i, matrix);
    });

    meshRef.current.instanceMatrix.needsUpdate = true;
  }, [blocks]);

  return (
    <instancedMesh ref={meshRef} args={[null, null, blocks.length]}>
      <boxGeometry args={[2, 2, 2]} />
      <meshStandardMaterial color={color} />
    </instancedMesh>
  );
};
```

---

## Backend Architecture

### WebSocket Server

```typescript
// lib/socket.ts
import { Server } from 'socket.io';
import type { Server as HTTPServer } from 'http';

export function initSocketServer(httpServer: HTTPServer) {
  const io = new Server(httpServer, {
    cors: { origin: '*' }
  });

  io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('subscribe-chunks', async ({ chunks }) => {
      // Join rooms for each chunk
      chunks.forEach(chunk => {
        const roomName = `chunk:${chunk.x},${chunk.y},${chunk.z}`;
        socket.join(roomName);
      });

      // Send existing blocks for these chunks
      const blocks = await getBlocksForChunks(chunks);
      socket.emit('chunks-loaded', { chunks: blocks });
    });

    socket.on('place-block', async (data) => {
      // Validate and place block
      const result = await placeBlock(data);

      if (result.success) {
        // Broadcast to everyone in this chunk
        const chunk = worldToChunk(data.x, data.y, data.z);
        const roomName = `chunk:${chunk.chunkX},${chunk.chunkY},${chunk.chunkZ}`;
        io.to(roomName).emit('block-placed', { block: result.block });
      } else {
        socket.emit('placement-error', { error: result.error });
      }
    });

    socket.on('disconnect', () => {
      console.log('User disconnected:', socket.id);
    });
  });

  return io;
}
```

### Rate Limiting

```typescript
// Middleware for rate limiting
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const limit = rateLimitStore.get(userId);

  if (!limit || now > limit.resetAt) {
    rateLimitStore.set(userId, {
      count: 1,
      resetAt: now + 60000 // 1 minute
    });
    return true;
  }

  if (limit.count >= 10) {
    return false; // Rate limit exceeded
  }

  limit.count++;
  return true;
}
```

### Validation Functions

```typescript
// Validate block placement
function validateBlockPlacement(data: {
  x: number;
  y: number;
  z: number;
  color: string;
  userPosition: { x: number; z: number };
}): { valid: boolean; error?: string } {
  // Check grid alignment
  if (data.x % 2 !== 0 || data.y % 2 !== 0 || data.z % 2 !== 0) {
    return { valid: false, error: 'Block not aligned to grid' };
  }

  // Check distance from user
  const distance = Math.sqrt(
    Math.pow(data.x - data.userPosition.x, 2) +
    Math.pow(data.z - data.userPosition.z, 2)
  );

  if (distance > 50) {
    return { valid: false, error: 'Block too far from user position' };
  }

  // Check color format
  if (!/^#[0-9A-F]{6}$/i.test(data.color)) {
    return { valid: false, error: 'Invalid color format' };
  }

  return { valid: true };
}
```

---

## Deployment

### Environment Variables

```bash
# .env
DATABASE_URL="postgresql://user:password@host:5432/dbname"
NEXT_PUBLIC_APP_URL="https://your-app.vercel.app"

# Optional
NEXT_PUBLIC_ANALYTICS_ID="..."
```

### Vercel Deployment

1. **Connect GitHub repo to Vercel**
2. **Configure build settings:**
   - Framework: Next.js
   - Build command: `npm run build`
   - Output directory: `.next`
3. **Add environment variables**
4. **Enable Vercel Postgres:**
   - Go to Storage tab
   - Create Postgres database
   - Connection string auto-added to env vars
5. **Deploy**

### Database Setup

```bash
# Install Prisma CLI
npm install -D prisma

# Generate Prisma client
npx prisma generate

# Push schema to database
npx prisma db push

# (Optional) Open Prisma Studio to view data
npx prisma studio
```

---

## Implementation Phases

### Phase 1: Core Infrastructure (Week 1)
- [ ] Next.js project setup with TypeScript
- [ ] Prisma schema + database migrations
- [ ] Coordinate system utilities (GPS ↔ local ↔ chunk)
- [ ] Basic REST API (GET chunks, POST block)
- [ ] User session management

### Phase 2: GPS Mode (Week 1-2)
- [ ] Three.js scene with orbit controls
- [ ] Block rendering with instancing
- [ ] GPS position tracking
- [ ] Chunk loading based on GPS position
- [ ] Block placement with ghost preview
- [ ] Color picker UI
- [ ] WebSocket integration for real-time updates

### Phase 3: AR Mode (Week 2-3)
- [ ] WebXR session initialization
- [ ] AR hit-testing for surface detection
- [ ] AR coordinate alignment to GPS
- [ ] Block placement in AR
- [ ] Mode detection and switching
- [ ] AR-specific UI (minimal overlay)

### Phase 4: Polish & Optimization (Week 3-4)
- [ ] Chunk loading/unloading optimization
- [ ] Frustum culling for blocks
- [ ] Mobile responsive UI
- [ ] Error handling and user feedback
- [ ] Loading states and skeletons
- [ ] Rate limiting UI indicators
- [ ] Performance profiling and optimization

### Phase 5: Testing & Launch (Week 4)
- [ ] Cross-browser testing (iOS Safari, Android Chrome)
- [ ] GPS accuracy testing on campus
- [ ] AR calibration testing
- [ ] Multi-user testing
- [ ] Load testing (many blocks)
- [ ] Deploy to production
- [ ] Monitor errors and performance

---

## Testing Strategy

### Local Development Testing

**Mock GPS positions:**
```typescript
// lib/mockGPS.ts
export const MOCK_POSITIONS = {
  gates: { lat: 40.4443, lon: -79.9436 }, // Gates Center
  cut: { lat: 40.4432, lon: -79.9453 },   // CUT
  wean: { lat: 40.4429, lon: -79.9454 },  // Wean Hall
};

export function getMockPosition(location: keyof typeof MOCK_POSITIONS) {
  return MOCK_POSITIONS[location];
}
```

**AR testing:**
- Use Chrome DevTools WebXR emulator extension
- Test on real devices in open outdoor space

### Integration Testing

**Block placement flow:**
1. User A places block at position (10, 0, 20)
2. Verify block saved in database
3. User B in same chunk should receive `block-placed` event
4. Verify block renders for User B

**Conflict resolution:**
1. User A and User B both place block at (10, 0, 20)
2. First request succeeds, second returns conflict error
3. Second user gets error message

### Performance Benchmarks

- Initial load: < 3 seconds
- Block placement latency: < 500ms
- Frame rate: 60fps with 1000+ blocks in view
- Chunk loading: < 200ms per chunk
- WebSocket message latency: < 100ms

---

## Security Considerations

### Input Validation
- All coordinates validated server-side
- Block position must be on grid
- Distance checks enforced
- Color format validated
- Rate limiting per user

### Anonymous User Tracking
- Session IDs stored in localStorage
- Server validates session ID on each request
- No sensitive data stored client-side

### Database Security
- Prepared statements (Prisma prevents SQL injection)
- Indexes on query fields
- Connection pooling

### Rate Limiting
- 10 blocks per minute per user
- WebSocket connection limit per IP
- API endpoint rate limiting

---

## Future Enhancements (Post-MVP)

### Features
- User accounts and authentication
- Block ownership and permissions
- Admin moderation tools (delete any block, ban users)
- Time decay (blocks expire after N days)
- Block types (different shapes, materials)
- Collaborative structures (multi-block creations)
- Mini-games (capture the flag, build contests)
- World analytics dashboard

### Technical Improvements
- PostGIS for spatial queries
- Redis for caching chunks
- CDN for static assets
- Spatial indexing (R-tree)
- WebRTC for peer-to-peer block data
- Progressive Web App (PWA) with offline support
- Multi-region deployment

### Scaling
- Increase load radius to 1km+
- Support 100k+ concurrent users
- Horizontal scaling with load balancer
- Separate WebSocket servers
- Event sourcing for block history

---

## Resources & References

### Documentation
- [WebXR Device API](https://developer.mozilla.org/en-US/docs/Web/API/WebXR_Device_API)
- [Three.js Docs](https://threejs.org/docs/)
- [React Three Fiber](https://docs.pmnd.rs/react-three-fiber/)
- [Socket.IO Docs](https://socket.io/docs/v4/)
- [Prisma Docs](https://www.prisma.io/docs/)
- [Next.js Docs](https://nextjs.org/docs)

### Coordinate System Math
- [Local Tangent Plane](https://en.wikipedia.org/wiki/Local_tangent_plane_coordinates)
- [GPS Coordinate Conversion](https://www.movable-type.co.uk/scripts/latlong.html)

### WebXR Examples
- [WebXR Samples](https://immersive-web.github.io/webxr-samples/)
- [Three.js WebXR Examples](https://threejs.org/examples/?q=webxr)

---

## Contact & Support

**Project Repository:** (Add GitHub link)
**Issues:** (Add GitHub issues link)
**Documentation:** This file

---

*Last Updated: 2026-02-06*
