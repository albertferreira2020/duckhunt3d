import { LoadingManager, TextureLoader, SRGBColorSpace, RepeatWrapping } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';

/**
 * AssetManager com fallback procedural.
 *
 * Todo modelo do jogo é registrado por chave com uma factory procedural. Se existir
 * um `.glb` correspondente em `assets/models/`, ele é carregado (com Draco) e substitui
 * a factory — o gameplay não sabe a diferença. É o caminho para trocar os modelos
 * gerados em código por assets autorais sem tocar em nenhum sistema.
 */
export const createAssetManager = ({ onProgress } = {}) => {
  const manager = new LoadingManager();
  const draco = new DRACOLoader().setDecoderPath(
    'https://www.gstatic.com/draco/versioned/decoders/1.5.7/',
  );
  const gltfLoader = new GLTFLoader(manager).setDRACOLoader(draco);
  const textureLoader = new TextureLoader(manager);

  const models = new Map();
  const textures = new Map();
  const factories = new Map();

  manager.onProgress = (_url, loaded, total) => onProgress?.(total ? loaded / total : 1);

  /** Registra a versão procedural de um asset. */
  const registerProcedural = (key, factory) => factories.set(key, factory);

  /** Tenta carregar um .glb; silencia a falha e mantém o procedural. */
  const tryLoadModel = (key, url) =>
    new Promise((resolve) => {
      gltfLoader.load(
        url,
        (gltf) => {
          models.set(key, gltf);
          resolve(gltf);
        },
        undefined,
        () => resolve(null),
      );
    });

  const loadTexture = (key, url, { srgb = true, repeat } = {}) =>
    new Promise((resolve) => {
      textureLoader.load(
        url,
        (tex) => {
          if (srgb) tex.colorSpace = SRGBColorSpace;
          if (repeat) {
            tex.wrapS = tex.wrapT = RepeatWrapping;
            tex.repeat.set(repeat, repeat);
          }
          textures.set(key, tex);
          resolve(tex);
        },
        undefined,
        () => resolve(null),
      );
    });

  /**
   * Instancia um asset: usa o GLTF carregado quando existe, senão a factory procedural.
   * Retorna sempre `{ scene, animations }` para uniformizar o consumo por AnimationMixer.
   */
  const instantiate = (key, ...args) => {
    const gltf = models.get(key);
    if (gltf) {
      const scene = gltf.scene.clone(true);
      scene.traverse((o) => {
        if (!o.isMesh) return;
        o.castShadow = true;
        o.receiveShadow = true;
      });
      return { scene, animations: gltf.animations ?? [] };
    }
    const factory = factories.get(key);
    if (!factory) throw new Error(`Asset "${key}" não registrado`);
    const built = factory(...args);
    return built.scene ? built : { scene: built, animations: [] };
  };

  const dispose = () => {
    draco.dispose();
    textures.forEach((t) => t.dispose());
    textures.clear();
    models.clear();
  };

  return {
    manager,
    registerProcedural,
    tryLoadModel,
    loadTexture,
    instantiate,
    getTexture: (key) => textures.get(key),
    hasModel: (key) => models.has(key),
    dispose,
  };
};
