/**
 * Three.js Garden Scene — 3D visualization of seeds in deep space.
 * Uses React Three Fiber + drei. Seeds rendered with OKLab-derived colors,
 * domain-specific geometry, glow effects, and connection lines.
 */

import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Float, Text, Grid, Line } from '@react-three/drei';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { UniversalSeed, Gene } from '@paradigm/types';
import { DOMAIN_COLORS } from '@paradigm/studio';
import { useSeedStore } from '../../stores/seedStore';

/** Extract a numeric value from a scalar gene, or return fallback. */
function scalarValue(gene: Gene | undefined, fallback: number): number {
  if (gene?.type === 'scalar') return gene.value;
  return fallback;
}

/** Derive seed color using OKLab-inspired approach from domain + genes. */
function seedColor(seed: UniversalSeed): string {
  const colorGene = seed.genes['color'];
  if (colorGene?.type === 'vector' && colorGene.value.length >= 3) {
    const [r, g, b] = colorGene.value;
    return `rgb(${Math.round((r ?? 0.5) * 255)}, ${Math.round((g ?? 0.5) * 255)}, ${Math.round((b ?? 0.5) * 255)})`;
  }
  return DOMAIN_COLORS[seed.$domain] ?? '#10b981';
}

/** Calculate seed scale from gene complexity and generation. */
function seedScale(seed: UniversalSeed): number {
  const geneCount = Object.keys(seed.genes).length;
  const generation = seed.$lineage.generation;
  const fitness = seed.$fitness?.primary ?? 0;
  return 0.3 + Math.min(geneCount * 0.04, 0.4) + Math.min(generation * 0.015, 0.2) + fitness * 0.2;
}

/** Position seeds in a golden-angle spiral. */
function spiralPosition(index: number, _total: number): [number, number, number] {
  const angle = index * 2.39996; // golden angle in radians
  const radius = 1.5 + Math.sqrt(index) * 1.2;
  return [Math.cos(angle) * radius, 0, Math.sin(angle) * radius];
}

/** Domain-specific geometry selection. */
function SeedGeometry({ domain, fitness }: { domain: string; fitness: number }) {
  const detail = fitness > 0.5 ? 1 : 0;
  switch (domain) {
    case 'building': case 'city': case 'infrastructure':
      return <boxGeometry args={[1, 1.4, 1]} />;
    case 'vehicle': case 'robot':
      return <cylinderGeometry args={[0.3, 0.7, 1.2, 8]} />;
    case 'weapon': case 'crystal':
      return <coneGeometry args={[0.6, 1.4, 6]} />;
    case 'terrain': case 'ecosystem':
      return <icosahedronGeometry args={[0.7, detail]} />;
    case 'organism': case 'plant': case 'insect': case 'fish': case 'bird': case 'mammal':
      return <sphereGeometry args={[0.7, 16, 12]} />;
    case 'music': case 'sound': case 'audio':
      return <torusGeometry args={[0.5, 0.2, 8, 24]} />;
    case 'shader': case 'pattern': case 'render':
      return <octahedronGeometry args={[0.7, detail]} />;
    case 'code': case 'language': case 'network':
      return <dodecahedronGeometry args={[0.6, detail]} />;
    default:
      return <dodecahedronGeometry args={[0.6, detail]} />;
  }
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
  const fitness = seed.$fitness?.primary ?? 0;
  const meshRef = useRef<THREE.Mesh>(null);

  // Subtle rotation based on seed hash
  useFrame((_, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * 0.15;
    }
  });

  return (
    <Float
      speed={1.2 + fitness * 0.8}
      rotationIntensity={0.2}
      floatIntensity={0.3 + fitness * 0.3}
    >
      <group position={position} onClick={(e) => { e.stopPropagation(); onClick(); }}>
        {/* Main seed body */}
        <mesh ref={meshRef} scale={scale} castShadow>
          <SeedGeometry domain={seed.$domain} fitness={fitness} />
          <meshStandardMaterial
            color={color}
            roughness={0.35}
            metalness={0.15}
            emissive={color}
            emissiveIntensity={isSelected ? 0.4 : 0.08}
          />
        </mesh>

        {/* Selection glow ring */}
        {isSelected && (
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]}>
            <ringGeometry args={[scale * 1.1, scale * 1.35, 32]} />
            <meshBasicMaterial color="#10b981" transparent opacity={0.5} side={THREE.DoubleSide} />
          </mesh>
        )}

        {/* Point light for selected seed */}
        {isSelected && (
          <pointLight color={color} intensity={2} distance={4} decay={2} />
        )}

        {/* Name label */}
        <Text
          position={[0, scale + 0.35, 0]}
          fontSize={0.16}
          color={isSelected ? '#10b981' : '#94a3b8'}
          anchorX="center"
          anchorY="bottom"
          outlineWidth={0.015}
          outlineColor="#0a0e1a"
        >
          {seed.$name}
        </Text>

        {/* Fitness indicator dot */}
        {fitness > 0 && (
          <mesh position={[scale * 0.7, scale * 0.6, 0]} scale={0.06 + fitness * 0.04}>
            <sphereGeometry />
            <meshBasicMaterial color="#f59e0b" />
          </mesh>
        )}
      </group>
    </Float>
  );
}

/** Connection lines between seeds that have relations. */
function SeedConnections({ seeds }: { seeds: UniversalSeed[] }) {
  const connections = useMemo(() => {
    const lines: Array<{ from: [number, number, number]; to: [number, number, number]; color: string }> = [];
    const posMap = new Map<string, [number, number, number]>();

    seeds.forEach((seed, i) => {
      posMap.set(seed.$hash, spiralPosition(i, seeds.length));
    });

    for (const seed of seeds) {
      if (!seed.$relations) continue;
      const fromPos = posMap.get(seed.$hash);
      if (!fromPos) continue;

      for (const rel of seed.$relations) {
        const toPos = posMap.get(rel.targetHash);
        if (!toPos) continue;

        const color = rel.type === 'evolved_from' ? '#10b981'
          : rel.type === 'opposes' ? '#ef4444'
          : rel.type === 'allied_with' ? '#3b82f6'
          : '#64748b';

        lines.push({
          from: [fromPos[0], 0.5, fromPos[2]],
          to: [toPos[0], 0.5, toPos[2]],
          color,
        });
      }
    }

    return lines;
  }, [seeds]);

  return (
    <group>
      {connections.map((conn, i) => (
        <Line
          key={i}
          points={[conn.from, conn.to]}
          color={conn.color}
          lineWidth={1}
          transparent
          opacity={0.3}
          dashed
          dashSize={0.3}
          gapSize={0.15}
        />
      ))}
    </group>
  );
}

function GroundPlane() {
  return (
    <Grid
      args={[60, 60]}
      cellSize={1}
      cellThickness={0.4}
      cellColor="#1e293b"
      sectionSize={5}
      sectionThickness={0.8}
      sectionColor="#334155"
      fadeDistance={35}
      fadeStrength={1.5}
      followCamera={false}
      infiniteGrid
    />
  );
}

/** Ambient particles using instanced rendering for performance. */
function ParticleField() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const count = 120;

  const { matrices, colors } = useMemo(() => {
    const m: THREE.Matrix4[] = [];
    const c: THREE.Color[] = [];
    const particleColors = ['#10b981', '#00f0ff', '#8b5cf6'];

    for (let i = 0; i < count; i++) {
      const mat = new THREE.Matrix4();
      mat.setPosition(
        (Math.random() - 0.5) * 40,
        Math.random() * 10 + 0.5,
        (Math.random() - 0.5) * 40,
      );
      mat.scale(new THREE.Vector3(0.02, 0.02, 0.02));
      m.push(mat);
      c.push(new THREE.Color(particleColors[i % particleColors.length]!));
    }
    return { matrices: m, colors: c };
  }, []);

  useMemo(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    for (let i = 0; i < count; i++) {
      mesh.setMatrixAt(i, matrices[i]!);
      mesh.setColorAt(i, colors[i]!);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [matrices, colors]);

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]}>
      <sphereGeometry args={[1, 4, 4]} />
      <meshBasicMaterial transparent opacity={0.5} />
    </instancedMesh>
  );
}

export function GardenScene() {
  const seeds = useSeedStore((s) => s.seeds);
  const selectedSeed = useSeedStore((s) => s.selectedSeed);
  const selectSeed = useSeedStore((s) => s.selectSeed);

  return (
    <div className="h-full w-full">
      <Canvas
        shadows
        camera={{ position: [8, 6, 8], fov: 50 }}
        style={{ background: '#0a0e1a' }}
      >
        {/* Lighting — deep space ambience */}
        <ambientLight intensity={0.25} color="#94a3b8" />
        <directionalLight
          position={[10, 15, 5]}
          intensity={0.8}
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          color="#f8fafc"
        />
        <pointLight position={[-8, 6, -8]} intensity={0.4} color="#8b5cf6" />
        <pointLight position={[5, 3, -5]} intensity={0.3} color="#00f0ff" />

        {/* Environment */}
        <fog attach="fog" args={['#0a0e1a', 18, 40]} />
        <GroundPlane />
        <ParticleField />

        {/* Seed connections */}
        <SeedConnections seeds={seeds} />

        {/* Seeds */}
        {seeds.map((seed, index) => (
          <SeedMesh
            key={seed.$hash}
            seed={seed}
            position={spiralPosition(index, seeds.length)}
            isSelected={selectedSeed?.$hash === seed.$hash}
            onClick={() => selectSeed(seed)}
          />
        ))}

        {/* Empty state beacon */}
        {seeds.length === 0 && (
          <Float speed={2} floatIntensity={1}>
            <mesh position={[0, 1.5, 0]}>
              <octahedronGeometry args={[0.5]} />
              <meshStandardMaterial
                color="#10b981"
                emissive="#10b981"
                emissiveIntensity={0.6}
                wireframe
              />
            </mesh>
            <Text position={[0, 2.8, 0]} fontSize={0.25} color="#10b981" anchorX="center">
              Plant your first seed
            </Text>
          </Float>
        )}

        {/* Camera controls */}
        <OrbitControls
          makeDefault
          minDistance={3}
          maxDistance={35}
          minPolarAngle={0.2}
          maxPolarAngle={Math.PI / 2.1}
          enableDamping
          dampingFactor={0.05}
        />
      </Canvas>
    </div>
  );
}
