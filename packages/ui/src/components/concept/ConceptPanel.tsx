/**
 * Entity Concept Panel — The primary UI for creating living entities.
 * Input concept description → ISCA analysis → morphology → sprite blueprint.
 */

import { useState, useCallback } from 'react';
import type { ISCAResult, ConceptModel, EntityBlueprint, StyleType } from '@paradigm/types';
import { useConceptStore } from '../../stores/conceptStore';
import { Panel } from '../common/Panel';
import { SeedPreview } from '../preview/SeedPreview';

function CoCreationInput() {
  const [coMessage, setCoMessage] = useState('');
  const coCreate = useConceptStore((s) => s.coCreate);
  const loading = useConceptStore((s) => s.loading);

  const handleCoCreate = useCallback(() => {
    if (coMessage.trim().length === 0) return;
    void coCreate(coMessage);
    setCoMessage('');
  }, [coMessage, coCreate]);

  return (
    <div className="flex gap-2">
      <input
        type="text"
        value={coMessage}
        onChange={(e) => setCoMessage(e.target.value)}
        placeholder='Tell your entity what to become... "make it more intimidating"'
        disabled={loading}
        className="flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-1.5 text-xs text-[var(--color-text)] placeholder:text-[var(--color-text-dim)] focus:border-[var(--color-cyan)] focus:outline-none"
        onKeyDown={(e) => { if (e.key === 'Enter') handleCoCreate(); }}
      />
      <button
        type="button"
        onClick={handleCoCreate}
        disabled={loading || coMessage.trim().length === 0}
        className="rounded-md bg-[var(--color-cyan)] px-3 py-1.5 text-xs font-medium text-[var(--color-bg)] hover:opacity-90 disabled:opacity-50"
      >
        Co-Create
      </button>
    </div>
  );
}

const STYLES: StyleType[] = ['default', 'anime', 'cartoon', 'pixel', 'fantasy', 'cyberpunk', 'realistic', 'minimal', 'noir'];

function ISCABadges({ isca }: { isca: ISCAResult }) {
  return (
    <div className="flex flex-col gap-3">
      {/* Archetype + Body */}
      <div className="flex items-center gap-2">
        <span className="rounded-md bg-[var(--color-primary)] px-2.5 py-1 text-xs font-semibold text-white">
          {isca.archetype}
        </span>
        <span className="rounded-md bg-[var(--color-cyan)] px-2.5 py-1 text-xs font-semibold text-[var(--color-bg)]">
          {isca.bodyStructure}
        </span>
      </div>

      {/* Elements */}
      {isca.elements.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {isca.elements.map((el) => (
            <span key={el} className="rounded-full bg-orange-900/30 px-2 py-0.5 text-[10px] font-medium text-orange-300">
              {el}
            </span>
          ))}
        </div>
      )}

      {/* Capabilities */}
      <div className="flex flex-wrap gap-1">
        {isca.capabilities.map((cap) => (
          <span key={cap} className="rounded bg-[var(--color-surface-raised)] px-1.5 py-0.5 text-[10px] text-[var(--color-text-muted)]">
            {cap.replace('can_', '')}
          </span>
        ))}
      </div>

      {/* Weapons + Armor */}
      {(isca.weapons.length > 0 || isca.armor.length > 0) && (
        <div className="flex flex-wrap gap-1">
          {isca.weapons.map((w) => (
            <span key={w} className="rounded bg-red-900/20 px-1.5 py-0.5 text-[10px] text-red-300">{w}</span>
          ))}
          {isca.armor.map((a) => (
            <span key={a} className="rounded bg-blue-900/20 px-1.5 py-0.5 text-[10px] text-blue-300">{a}</span>
          ))}
        </div>
      )}

      {/* Secondary Actions */}
      {isca.secondaryActionElements.length > 0 && (
        <div className="flex items-center gap-1.5 text-[10px] text-[var(--color-text-dim)]">
          Physics: {isca.secondaryActionElements.join(', ')}
        </div>
      )}

      {/* Animations */}
      <div className="text-[10px] text-[var(--color-text-dim)]">
        Animations: {isca.suggestedAnimations.join(', ')}
      </div>
    </div>
  );
}

function ConceptSummary({ concept }: { concept: ConceptModel }) {
  return (
    <Panel title="Concept Model">
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <span className="text-[var(--color-text-muted)]">Name</span>
          <p className="font-medium text-[var(--color-text)]">{concept.name}</p>
        </div>
        <div>
          <span className="text-[var(--color-text-muted)]">Species</span>
          <p className="text-[var(--color-text-secondary)]">{concept.species}</p>
        </div>
        <div>
          <span className="text-[var(--color-text-muted)]">Style</span>
          <p className="text-[var(--color-text-secondary)]">{concept.style}</p>
        </div>
        <div>
          <span className="text-[var(--color-text-muted)]">Type</span>
          <p className="text-[var(--color-text-secondary)]">{concept.conceptType}</p>
        </div>
      </div>

      {/* Morphology */}
      <div className="mt-3 rounded-md bg-[var(--color-bg)] p-2">
        <span className="text-[10px] text-[var(--color-text-muted)]">Morphology</span>
        <div className="mt-1 grid grid-cols-2 gap-1 text-[10px]">
          <div>Head/Body: <span className="font-mono text-[var(--color-cyan)]">{concept.morphology.proportions.headToBodyRatio.toFixed(2)}</span></div>
          <div>Limb/Body: <span className="font-mono text-[var(--color-cyan)]">{concept.morphology.proportions.limbToBodyRatio.toFixed(2)}</span></div>
          <div>Exaggeration: <span className="font-mono text-[var(--color-cyan)]">{concept.morphology.exaggeration.toFixed(2)}</span></div>
          <div>Symmetry: <span className="text-[var(--color-text-secondary)]">{concept.morphology.symmetry}</span></div>
        </div>
      </div>

      {/* Abilities */}
      {concept.abilities.length > 0 && (
        <div className="mt-3">
          <span className="text-[10px] text-[var(--color-text-muted)]">Abilities</span>
          <div className="mt-1 flex flex-col gap-1">
            {concept.abilities.map((ab, i) => (
              <div key={i} className="flex items-center gap-2 rounded bg-[var(--color-bg)] px-2 py-1 text-[10px]">
                <span className="font-medium text-[var(--color-primary)]">{ab.name}</span>
                <span className="text-[var(--color-text-dim)]">{ab.type}</span>
                <span className="rounded bg-orange-900/20 px-1 text-orange-300">{ab.element}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Panel>
  );
}

function BlueprintSummary({ blueprint }: { blueprint: EntityBlueprint }) {
  return (
    <Panel title="Entity Blueprint">
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <span className="text-[var(--color-text-muted)]">Seed Hash</span>
          <p className="truncate font-mono text-[var(--color-text-secondary)]">{blueprint.seed.$hash}</p>
        </div>
        <div>
          <span className="text-[var(--color-text-muted)]">Skeleton</span>
          <p className="text-[var(--color-text-secondary)]">{blueprint.skeletonType}</p>
        </div>
        <div>
          <span className="text-[var(--color-text-muted)]">Frame Size</span>
          <p className="font-mono text-[var(--color-text-secondary)]">{blueprint.spriteConfig.frameWidth}x{blueprint.spriteConfig.frameHeight}</p>
        </div>
        <div>
          <span className="text-[var(--color-text-muted)]">Animations</span>
          <p className="text-[var(--color-text-secondary)]">{blueprint.spriteConfig.animations.length}</p>
        </div>
      </div>
    </Panel>
  );
}

export function ConceptPanel() {
  const input = useConceptStore((s) => s.input);
  const setInput = useConceptStore((s) => s.setInput);
  const isca = useConceptStore((s) => s.isca);
  const concept = useConceptStore((s) => s.concept);
  const blueprint = useConceptStore((s) => s.blueprint);
  const loading = useConceptStore((s) => s.loading);
  const error = useConceptStore((s) => s.error);
  const createEntity = useConceptStore((s) => s.createEntity);
  const mutateEntity = useConceptStore((s) => s.mutateEntity);
  const generateSprite = useConceptStore((s) => s.generateSprite);
  const canonicalEnabled = useConceptStore((s) => s.canonicalEnabled);
  const setCanonicalEnabled = useConceptStore((s) => s.setCanonicalEnabled);
  const mutationIntensity = useConceptStore((s) => s.mutationIntensity);
  const setMutationIntensity = useConceptStore((s) => s.setMutationIntensity);
  const evolutionHistory = useConceptStore((s) => s.evolutionHistory);
  const generationStatus = useConceptStore((s) => s.generationStatus);
  const generationProgress = useConceptStore((s) => s.generationProgress);
  const spriteResult = useConceptStore((s) => s.spriteResult);

  const handleSubmit = useCallback(() => {
    void createEntity();
  }, [createEntity]);

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)]">
        Entity Creator
      </h2>

      {/* Input */}
      <Panel title="Concept Description">
        <div className="flex flex-col gap-3">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder='e.g. "chibi lightning dragon" or "Goku" or "dark necromancer with skull staff"'
            disabled={loading}
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5 text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-dim)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)] disabled:opacity-50"
            onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
          />

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={loading || input.trim().length === 0}
              className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white transition-all hover:bg-[var(--color-primary-dim)] disabled:cursor-not-allowed disabled:opacity-50"
              style={loading ? { boxShadow: '0 0 20px var(--color-primary-glow)' } : undefined}
            >
              {loading ? 'Creating...' : 'Create Entity'}
            </button>

            <label className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
              <input
                type="checkbox"
                checked={canonicalEnabled}
                onChange={(e) => setCanonicalEnabled(e.target.checked)}
                className="accent-[var(--color-primary)]"
              />
              Canonical Mode
            </label>
          </div>

          {/* Quick suggestions */}
          <div className="flex flex-wrap gap-1.5">
            {['chibi lightning dragon', 'Goku', 'dark necromancer', 'fire warrior with sword', 'pixel art ninja', 'ice phoenix'].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setInput(s)}
                className="rounded-full bg-[var(--color-surface-raised)] px-2.5 py-1 text-[10px] text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text-secondary)]"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </Panel>

      {/* Error */}
      {error && (
        <div className="rounded-md border border-red-800/50 bg-[var(--color-danger-bg)] px-3 py-2 text-xs text-red-400">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center gap-2 rounded-md bg-[var(--color-primary-glow)] px-4 py-3 text-sm text-[var(--color-primary)]">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-[var(--color-primary)]" />
          Analyzing concept and creating entity...
        </div>
      )}

      {/* Gene-Driven 3D Preview — renders directly from seed genes */}
      {blueprint && !loading && (
        <Panel title="Seed Preview" subtitle="Real-time SDF rendering from gene values — mutation changes the form">
          <div className="aspect-video w-full overflow-hidden rounded-md">
            <SeedPreview seed={blueprint.seed} className="h-full w-full" />
          </div>
          <div className="mt-2 flex items-center gap-2 text-[10px] text-[var(--color-text-dim)]">
            <span>Genes: {Object.keys(blueprint.seed.genes).length}</span>
            <span>Body: {blueprint.skeletonType}</span>
            <span>Hash: {blueprint.seed.$hash.slice(0, 12)}...</span>
          </div>
        </Panel>
      )}

      {/* Evolution Controls */}
      {blueprint && !loading && (
        <Panel title="Evolution" subtitle={`Generation ${evolutionHistory.length} — mutate to see the form change`}>
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <label className="flex flex-1 flex-col gap-1">
                <span className="text-[10px] text-[var(--color-text-muted)]">
                  Mutation Intensity: <span className="font-mono text-[var(--color-primary)]">{mutationIntensity.toFixed(2)}</span>
                </span>
                <input
                  type="range"
                  min={0.01}
                  max={0.5}
                  step={0.01}
                  value={mutationIntensity}
                  onChange={(e) => setMutationIntensity(parseFloat(e.target.value))}
                  className="w-full accent-[var(--color-primary)]"
                />
              </label>
              <button
                type="button"
                onClick={() => void mutateEntity()}
                disabled={loading}
                className="rounded-md bg-[var(--color-cyan)] px-4 py-2 text-sm font-medium text-[var(--color-bg)] transition-all hover:opacity-90 disabled:opacity-50"
              >
                Mutate
              </button>
            </div>
            {evolutionHistory.length > 1 && (
              <div className="text-[10px] text-[var(--color-text-dim)]">
                Lineage: {evolutionHistory.map((s) => s.$hash.slice(0, 6)).join(' → ')}
              </div>
            )}
            <CoCreationInput />
          </div>
        </Panel>
      )}

      {/* Sprite Forge AI Generation */}
      {concept && !loading && (
        <Panel
          title="AI Sprite Generation"
          subtitle="Constraint-validated via Sprite Forge"
          actions={
            <button
              type="button"
              onClick={() => void generateSprite()}
              disabled={generationStatus === 'generating'}
              className="rounded-md bg-[var(--color-violet)] px-3 py-1.5 text-xs font-medium text-white transition-all hover:opacity-90 disabled:opacity-50"
            >
              {generationStatus === 'generating' ? generationProgress || 'Generating...' : 'Generate AI Sprite'}
            </button>
          }
        >
          {generationStatus === 'generating' && (
            <div className="flex items-center gap-2 text-sm text-[var(--color-violet)]">
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-[var(--color-violet)]" />
              {generationProgress}
            </div>
          )}
          {generationStatus === 'complete' && spriteResult && (
            <div className="flex flex-col gap-2 text-xs">
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                  spriteResult['validationPassed'] ? 'bg-emerald-900/30 text-emerald-300' : 'bg-amber-900/30 text-amber-300'
                }`}>
                  {spriteResult['validationPassed'] ? 'Constraints passed' : 'Needs review'}
                </span>
                <span className="text-[var(--color-text-dim)]">
                  {Number(spriteResult['generationTimeSeconds'] ?? 0).toFixed(1)}s, {String(spriteResult['attempts'] ?? '?')} attempt(s)
                </span>
              </div>
              {typeof spriteResult['spriteSheetPath'] === 'string' && spriteResult['spriteSheetPath'] && (
                <div className="text-[var(--color-text-muted)]">
                  Output: {spriteResult['spriteSheetPath']}
                </div>
              )}
              {(spriteResult['constraintViolations'] as string[])?.length > 0 && (
                <div className="rounded-md bg-[var(--color-bg)] p-2 text-[10px] text-amber-300">
                  {(spriteResult['constraintViolations'] as string[]).join('; ')}
                </div>
              )}
            </div>
          )}
          {generationStatus === 'error' && (
            <div className="text-xs text-red-400">
              Sprite Forge may not be running. Start it with: <code className="rounded bg-[var(--color-surface-raised)] px-1">start_webapp.bat</code>
            </div>
          )}
          {generationStatus === 'idle' && (
            <div className="text-[10px] text-[var(--color-text-dim)]">
              Generates game-ready pixel art via Sprite Forge AI (requires server at localhost:8000).
            </div>
          )}
        </Panel>
      )}

      {/* Results */}
      {isca && !loading && (
        <Panel title="ISCA Analysis">
          <ISCABadges isca={isca} />
        </Panel>
      )}

      {concept && !loading && <ConceptSummary concept={concept} />}
      {blueprint && !loading && <BlueprintSummary blueprint={blueprint} />}
    </div>
  );
}
