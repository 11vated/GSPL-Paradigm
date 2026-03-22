/**
 * Three.js Garden Scene — 3D visualization of seeds as living organisms.
 * Uses React Three Fiber (@react-three/fiber) and drei helpers.
 */

import { Canvas } from '@react-three/fiber';
import { OrbitControls, Environment, Float, Text, Grid } from '@react-three/drei';
import { useMemo } from 'react';
import type { UniversalSeed, Gene } from '@paradigm/types';
import { DOMAIN_COLORS } from '@paradigm/studio';

interface GardenSceneProps {
  seeds: UniversalSeed[];
  selectedSeed: UniversalSeed | null;
  onSeedSelect: (seed: UniversalSeed) => void;
}

/** Extract a numeric value from a scalar gene, or return fallback. */
function scalarValue(gene: Gene | undefined, fallback: number): number {
  if (gene?.type === 'scalar') return gene.value;
  return fallback;
}

/** Extract a color vector [r, g, b] from a vector gene, or derive from domain. */
function seedColor(seed: UniversalSeed): string {
  const colorGene = seed.genes['color'];
  if (colorGene?.type === 'vector' && colorGene.value.length >= 3) {
    const [r, g, b] = colorGene.value;
    return `rgb(${Math.round((r ?? 0.5) * 255)}, ${Math.round((g ?? 0.5) * 255)}, ${Math.round((b ?? 0.5) * 255)})`;
  }
  return DOMAIN_COLORS[seed.$domain] ?? '#22c55e';
}

/** Calculate seed "size" from its gene complexity. */
function seedScale(seed: UniversalSeed): number {
  const geneCount = Object.keys(seed.genes).length;
  const generation = seed.$lineage.generation;
  return 0.3 + Math.min(geneCount * 0.05, 0.5) + Math.min(generation * 0.02, 0.3);
}

/** Position seeds in a spiral garden layout. */
function spiralPosition(index: number, total: number): [number, number, number] {
  const angle = index * 2.4; // golden angle
  const radius = 1.5 + Math.sqrt(index) * 1.2;
  const x = Math.cos(angle) * radius;
  const z = Math.sin(angle) * radius;
  const y = 0;
  return [x, y, z];
}

interface SeedMeshProps {
  seed: UniversalSeed;
  position: [number, number, number];
  isSelected: boolean;
  onClick: () => void;
}

function SeedMesh({ seed, position, isSelected, onClick }: SeedMeshProps) {
  const color = seedColor(seed);
  const scale = seedScale(seed);
  const generation = seed.$lineage.generation;

  const domain = seed.$domain;

  function SeedGeometry() {
    if (domain === 'building' || domain === 'vehicle') return <boxGeometry />;
    if (domain === 'weapon' || domain === 'terrain') return <coneGeometry />;
    if (domain === 'organism' || domain === 'plant') return <sphereGeometry />;
    return <dodecahedronGeometry />;
  }

  return (
    <Float
      speed={1.5 + generation * 0.2}
      rotationIntensity={0.3}
      floatIntensity={0.4}
    >
      <group position={position} onClick={(e) => { e.stopPropagation(); onClick(); }}>
        {/* Main seed body */}
        <mesh scale={scale} castShadow>
          <SeedGeometry />
          <meshStandardMaterial
            color={color}
            roughness={0.4}
            metalness={0.1}
            emissive={isSelected ? color : '#000000'}
            emissiveIntensity={isSelected ? 0.3 : 0}
          />
        </mesh>

        {/* Selection ring */}
        {isSelected && (
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.1, 0]}>
            <ringGeometry args={[scale * 1.2, scale * 1.4, 32]} />
            <meshBasicMaterial color="#22c55e" transparent opacity={0.6} />
          </mesh>
        )}

        {/* Seed name label */}
        <Text
          position={[0, scale + 0.4, 0]}
          fontSize={0.18}
          color="#a1a1aa"
          anchorX="center"
          anchorY="bottom"
          outlineWidth={0.02}
          outlineColor="#000000"
        >
          {seed.$name}
        </Text>

        {/* Generation indicator — small orbiting dot */}
        {generation > 0 && (
          <mesh position={[scale * 0.8, scale * 0.5, 0]} scale={0.08}>
            <sphereGeometry />
            <meshBasicMaterial color="#f59e0b" />
          </mesh>
        )}
      </group>
    </Float>
  );
}

function GroundPlane() {
  return (
    <Grid
      args={[50, 50]}
      cellSize={1}
      cellThickness={0.5}
      cellColor="#27272a"
      sectionSize={5}
      sectionThickness={1}
      sectionColor="#3f3f46"
      fadeDistance={30}
      fadeStrength={1}
      followCamera={false}
      infiniteGrid
    />
  );
}

function ParticleField() {
  const positions = useMemo(() => {
    const pts: [number, number, number][] = [];
    for (let i = 0; i < 80; i++) {
      pts.push([
        (Math.random() - 0.5) * 30,
        Math.random() * 8,
        (Math.random() - 0.5) * 30,
      ]);
    }
    return pts;
  }, []);

  return (
    <group>
      {positions.map((pos, i) => (
        <mesh key={i} position={pos}>
          <sphereGeometry args={[0.02, 4, 4]} />
          <meshBasicMaterial color="#22c55e" transparent opacity={0.4} />
        </mesh>
      ))}
    </group>
  );
}

export function GardenScene({ seeds, selectedSeed, onSeedSelect }: GardenSceneProps) {
  return (
    <div className="h-full w-full">
      <Canvas
        shadows
        camera={{ position: [8, 6, 8], fov: 50 }}
        style={{ background: '#09090b' }}
      >
        {/* Lighting */}
        <ambientLight intensity={0.3} />
        <directionalLight
          position={[10, 15, 5]}
          intensity={1}
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
        />
        <pointLight position={[-5, 5, -5]} intensity={0.5} color="#a78bfa" />

        {/* Environment */}
        <fog attach="fog" args={['#09090b', 15, 35]} />
        <GroundPlane />
        <ParticleField />

        {/* Seeds */}
        {seeds.map((seed, index) => (
          <SeedMesh
            key={seed.$hash}
            seed={seed}
            position={spiralPosition(index, seeds.length)}
            isSelected={selectedSeed?.$hash === seed.$hash}
            onClick={() => onSeedSelect(seed)}
          />
        ))}

        {/* Empty state beacon */}
        {seeds.length === 0 && (
          <Float speed={2} floatIntensity={1}>
            <mesh position={[0, 1, 0]}>
              <octahedronGeometry args={[0.5]} />
              <meshStandardMaterial
                color="#22c55e"
                emissive="#22c55e"
                emissiveIntensity={0.5}
                wireframe
              />
            </mesh>
            <Text
              position={[0, 2.2, 0]}
              fontSize={0.3}
              color="#22c55e"
              anchorX="center"
            >
              Plant your first seed
            </Text>
          </Float>
        )}

        {/* Camera controls */}
        <OrbitControls
          makeDefault
          minDistance={3}
          maxDistance={30}
          minPolarAngle={0.2}
          maxPolarAngle={Math.PI / 2.2}
          enableDamping
          dampingFactor={0.05}
        />
      </Canvas>
    </div>
  );
}
