import type { CadEngineInstance, CadEngineMaterialLike, CadEngineSceneNode } from './cadEngineTypes';
import type { EngineSceneDiagnostics } from './runtimeDiagnostics';

function safeNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function patchMaterial(materialRaw: CadEngineMaterialLike | undefined) {
  if (!materialRaw) return;
  materialRaw.clipping = false;
  materialRaw.clippingPlanes = [];
  materialRaw.clipShadows = false;
  materialRaw.needsUpdate = true;
}

function visitNode(node: CadEngineSceneNode | undefined, stats: EngineSceneDiagnostics) {
  if (!node) return;

  node.visible = true;
  node.frustumCulled = false;
  if (node.renderOrder !== undefined) {
    node.renderOrder = 1;
  }

  if (Array.isArray(node.material)) {
    for (const material of node.material) {
      patchMaterial(material);
    }
  } else {
    patchMaterial(node.material);
  }

  const posCount = safeNumber(node.geometry?.attributes?.position?.count);
  if (node.type === 'Mesh') {
    stats.meshNodes += 1;
    stats.meshVertices += posCount;
  } else if (node.type === 'LineSegments' || node.type === 'Line') {
    stats.lineNodes += 1;
    stats.lineVertices += posCount;
  }
}

export function isScenePopulated(diag: EngineSceneDiagnostics | null | undefined): boolean {
  if (!diag) return false;
  return diag.meshNodes > 0 || diag.lineNodes > 0 || diag.meshVertices > 0 || diag.lineVertices > 0;
}

export function patchSceneMaterials(engine: CadEngineInstance | null): EngineSceneDiagnostics {
  const stats: EngineSceneDiagnostics = {
    meshNodes: 0,
    lineNodes: 0,
    meshVertices: 0,
    lineVertices: 0,
  };

  const scene = engine?.scene;
  if (!scene) return stats;

  const renderer = scene._renderer;
  if (renderer) {
    renderer.localClippingEnabled = false;
  }

  const roots: CadEngineSceneNode[] = [];
  if (scene.MainScene) roots.push(scene.MainScene);
  if (scene.scenes) roots.push(scene.scenes);
  if (roots.length === 0 && typeof scene.traverse === 'function') {
    roots.push({ traverse: scene.traverse });
  }

  for (const root of roots) {
    if (typeof root.traverse === 'function') {
      root.traverse((node) => visitNode(node, stats));
    } else {
      visitNode(root, stats);
    }
  }

  scene.needsUpdateGPUData = true;
  return stats;
}

export async function waitForScenePopulation(
  engine: CadEngineInstance | null,
  timeoutMs: number,
  intervalMs: number
): Promise<EngineSceneDiagnostics> {
  const start = Date.now();
  let latest = patchSceneMaterials(engine);
  while (Date.now() - start < timeoutMs) {
    latest = patchSceneMaterials(engine);
    if (isScenePopulated(latest)) {
      return latest;
    }
    await new Promise<void>((resolve) => window.setTimeout(resolve, intervalMs));
  }
  return latest;
}
