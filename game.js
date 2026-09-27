import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.164.1/build/three.module.js';

const game = document.querySelector('#game');
const loading = document.querySelector('#loading');
const crosshair = document.querySelector('#crosshair');
const coordinates = document.querySelector('#coordinates');
const healthBar = document.querySelector('#health-bar');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9bc9d2);
scene.fog = new THREE.Fog(0x9bc9d2, 34, 65);

const camera = new THREE.PerspectiveCamera(76, innerWidth / innerHeight, 0.08, 120);
camera.rotation.order = 'YXZ';

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
game.prepend(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xe6f7ff, 0x6c7850, 1.65));
const sun = new THREE.DirectionalLight(0xffe9bc, 2.1);
sun.position.set(-28, 48, 25);
scene.add(sun);

const CHUNK_SIZE = 12;
const RENDER_DISTANCE = 4;
const BEDROCK = -8;
const renderKinds = ['grass', 'dirt', 'stone'];
const chunks = new Map();
const terrainMeshes = new Set();
const minedBlocks = new Set();
let loadedCenterX = null;
let loadedCenterZ = null;
const cube = new THREE.BoxGeometry(1, 1, 1);
const grassTexture = new THREE.TextureLoader().load('./uploads/grass.png');
const grassSideTexture = new THREE.TextureLoader().load('./uploads/grassside.png');
const dirtTexture = new THREE.TextureLoader().load('./uploads/dirt.png');
for (const texture of [grassTexture, grassSideTexture, dirtTexture]) {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
}
const grassMaterial = new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true });
grassMaterial.onBeforeCompile = shader => {
  shader.uniforms.grassTopMap = { value: grassTexture };
  shader.uniforms.grassSideMap = { value: grassSideTexture };
  shader.uniforms.dirtMap = { value: dirtTexture };
  shader.vertexShader = shader.vertexShader
    .replace(
      '#include <common>',
      `#include <common>
attribute float aGrassRotation;
attribute float aGrassFlip;
varying vec2 vGrassUv;
varying float vGrassRotation;
varying float vGrassFlip;
varying float vGrassFaceY;`
    )
    .replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
vGrassUv = uv;
vGrassRotation = aGrassRotation;
vGrassFlip = aGrassFlip;
vGrassFaceY = normal.y;`
    );
  shader.fragmentShader = shader.fragmentShader
    .replace(
      '#include <common>',
      `#include <common>
uniform sampler2D grassTopMap;
uniform sampler2D grassSideMap;
uniform sampler2D dirtMap;
varying vec2 vGrassUv;
varying float vGrassRotation;
varying float vGrassFlip;
varying float vGrassFaceY;`
    )
    .replace(
      '#include <map_fragment>',
      `vec2 grassUv = vGrassUv - vec2(0.5);
vec4 grassTexel;
if (vGrassFaceY > 0.5) {
  if (vGrassRotation < 0.5) grassUv = vec2(grassUv.x, grassUv.y);
  else if (vGrassRotation < 1.5) grassUv = vec2(-grassUv.y, grassUv.x);
  else if (vGrassRotation < 2.5) grassUv = vec2(-grassUv.x, -grassUv.y);
  else grassUv = vec2(grassUv.y, -grassUv.x);
  grassTexel = texture2D(grassTopMap, grassUv + vec2(0.5));
} else if (vGrassFaceY < -0.5) {
  if (vGrassRotation < 0.5) grassUv = vec2(grassUv.x, grassUv.y);
  else if (vGrassRotation < 1.5) grassUv = vec2(-grassUv.y, grassUv.x);
  else if (vGrassRotation < 2.5) grassUv = vec2(-grassUv.x, -grassUv.y);
  else grassUv = vec2(grassUv.y, -grassUv.x);
  grassTexel = texture2D(dirtMap, grassUv + vec2(0.5));
} else {
  if (vGrassFlip > 0.5) grassUv.x = -grassUv.x;
  grassTexel = texture2D(grassSideMap, grassUv + vec2(0.5));
}
diffuseColor *= grassTexel;`
    );
};
grassMaterial.customProgramCacheKey = () => 'block-grass-top-side-bottom-v2';

const dirtMaterial = new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true });
dirtMaterial.onBeforeCompile = shader => {
  shader.uniforms.dirtMap = { value: dirtTexture };
  shader.vertexShader = shader.vertexShader
    .replace(
      '#include <common>',
      `#include <common>
attribute float aDirtRotation;
varying vec2 vDirtUv;
varying float vDirtRotation;`
    )
    .replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
vDirtUv = uv;
vDirtRotation = aDirtRotation;`
    );
  shader.fragmentShader = shader.fragmentShader
    .replace(
      '#include <common>',
      `#include <common>
uniform sampler2D dirtMap;
varying vec2 vDirtUv;
varying float vDirtRotation;`
    )
    .replace(
      '#include <map_fragment>',
      `vec2 dirtUv = vDirtUv - vec2(0.5);
if (vDirtRotation < 0.5) dirtUv = vec2(dirtUv.x, dirtUv.y);
else if (vDirtRotation < 1.5) dirtUv = vec2(-dirtUv.y, dirtUv.x);
else if (vDirtRotation < 2.5) dirtUv = vec2(-dirtUv.x, -dirtUv.y);
else dirtUv = vec2(dirtUv.y, -dirtUv.x);
diffuseColor *= texture2D(dirtMap, dirtUv + vec2(0.5));`
    );
};
dirtMaterial.customProgramCacheKey = () => 'block-dirt-texture-v1';
const materials = {
  grass: grassMaterial,
  dirt: dirtMaterial,
  stone: new THREE.MeshStandardMaterial({ color: 0x777c73, roughness: 1, flatShading: true })
};

function terrainHeight(x, z) {
  const broad = Math.sin(x * 0.16 + 0.6) * 2.5 + Math.cos(z * 0.14 - 0.8) * 2.2;
  const ridge = Math.sin((x + z) * 0.105) * 1.8 + Math.cos((x - z) * 0.19) * 0.9;
  const detail = Math.sin(x * 0.39 + z * 0.21) * 0.6 + Math.cos(z * 0.37 - x * 0.13) * 0.55;
  return Math.round(3 + broad + ridge + detail);
}

function blockKind(y, top) {
  if (y === top) return 'grass';
  return y >= top - 3 ? 'dirt' : 'stone';
}

function blockOrientation(x, y, z) {
  let hash = Math.imul(x, 374761393) ^ Math.imul(z, 668265263) ^ Math.imul(y, 1442695041);
  hash = Math.imul(hash ^ (hash >>> 13), 1274126177);
  hash ^= hash >>> 16;
  return { rotation: hash & 3, flip: (hash >>> 2) & 1 };
}

function chunkKey(cx, cz) {
  return `${cx},${cz}`;
}

function blockKey(x, y, z) {
  return `${x},${y},${z}`;
}

function buildChunk(cx, cz) {
  const originX = cx * CHUNK_SIZE;
  const originZ = cz * CHUNK_SIZE;
  const counts = Object.fromEntries(renderKinds.map(kind => [kind, 0]));
  for (let dx = 0; dx < CHUNK_SIZE; dx++) {
    for (let dz = 0; dz < CHUNK_SIZE; dz++) {
      const x = originX + dx;
      const z = originZ + dz;
      const top = terrainHeight(x, z);
      for (let y = BEDROCK; y <= top; y++) {
        if (!minedBlocks.has(blockKey(x, y, z))) {
          counts[blockKind(y, top)]++;
        }
      }
    }
  }

  const meshes = {};
  const voxels = {};
  for (const kind of renderKinds) {
    if (counts[kind] === 0) continue;
    const geometry = kind === 'grass' || kind === 'dirt' ? cube.clone() : cube;
    const mesh = new THREE.InstancedMesh(geometry, materials[kind], counts[kind]);
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    voxels[kind] = [];
    mesh.userData.voxels = voxels[kind];
    if (kind === 'grass') {
      geometry.setAttribute('aGrassRotation', new THREE.InstancedBufferAttribute(new Float32Array(counts.grass), 1));
      geometry.setAttribute('aGrassFlip', new THREE.InstancedBufferAttribute(new Float32Array(counts.grass), 1));
      mesh.userData.instanceAttributes = ['aGrassRotation', 'aGrassFlip'];
    } else if (kind === 'dirt') {
      geometry.setAttribute('aDirtRotation', new THREE.InstancedBufferAttribute(new Float32Array(counts.dirt), 1));
      mesh.userData.instanceAttributes = ['aDirtRotation'];
    }
    meshes[kind] = mesh;
    terrainMeshes.add(mesh);
    scene.add(mesh);
  }

  const written = Object.fromEntries(renderKinds.map(kind => [kind, 0]));
  const transform = new THREE.Object3D();
  for (let dx = 0; dx < CHUNK_SIZE; dx++) {
    for (let dz = 0; dz < CHUNK_SIZE; dz++) {
      const x = originX + dx;
      const z = originZ + dz;
      const top = terrainHeight(x, z);
      for (let y = BEDROCK; y <= top; y++) {
        if (minedBlocks.has(blockKey(x, y, z))) continue;
        const kind = blockKind(y, top);
        transform.position.set(x + 0.5, y + 0.5, z + 0.5);
        transform.updateMatrix();
        const instance = written[kind]++;
        meshes[kind].setMatrixAt(instance, transform.matrix);
        if (kind === 'grass' || kind === 'dirt') {
          const orientation = blockOrientation(x, y, z);
          if (kind === 'grass') {
            meshes.grass.geometry.getAttribute('aGrassRotation').array[instance] = orientation.rotation;
            meshes.grass.geometry.getAttribute('aGrassFlip').array[instance] = orientation.flip;
          } else {
            meshes.dirt.geometry.getAttribute('aDirtRotation').array[instance] = orientation.rotation;
          }
        }
        voxels[kind].push({ x, y, z });
      }
    }
  }
  for (const mesh of Object.values(meshes)) {
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.userData.instanceAttributes) {
      for (const attributeName of mesh.userData.instanceAttributes) {
        mesh.geometry.getAttribute(attributeName).needsUpdate = true;
      }
    }
    mesh.computeBoundingSphere();
  }
  chunks.set(chunkKey(cx, cz), meshes);
}

function removeChunkMeshes(cx, cz) {
  const key = chunkKey(cx, cz);
  const meshes = chunks.get(key);
  if (!meshes) return;
  for (const mesh of Object.values(meshes)) {
    scene.remove(mesh);
    terrainMeshes.delete(mesh);
  }
  chunks.delete(key);
}

function syncChunks() {
  const centerX = Math.floor(player.x / CHUNK_SIZE);
  const centerZ = Math.floor(player.z / CHUNK_SIZE);
  if (centerX === loadedCenterX && centerZ === loadedCenterZ) return;
  const wanted = new Set();
  for (let cx = centerX - RENDER_DISTANCE; cx <= centerX + RENDER_DISTANCE; cx++) {
    for (let cz = centerZ - RENDER_DISTANCE; cz <= centerZ + RENDER_DISTANCE; cz++) {
      const key = chunkKey(cx, cz);
      wanted.add(key);
      if (!chunks.has(key)) buildChunk(cx, cz);
    }
  }
  for (const [key, meshes] of chunks) {
    if (wanted.has(key)) continue;
    for (const mesh of Object.values(meshes)) {
      scene.remove(mesh);
      terrainMeshes.delete(mesh);
    }
    chunks.delete(key);
  }
  loadedCenterX = centerX;
  loadedCenterZ = centerZ;
}

function surfaceAt(x, z) {
  return terrainHeight(Math.floor(x), Math.floor(z)) + 1;
}

const player = {
  x: 0.5,
  y: surfaceAt(0.5, 0.5),
  z: 0.5,
  vy: 0,
  fallPeakY: surfaceAt(0.5, 0.5),
  yaw: Math.PI * 0.25,
  pitch: -0.13,
  grounded: true,
  health: 8,
  maxHealth: 8,
  radius: 0.31,
  height: 1.78,
  eye: 1.59
};
camera.position.set(player.x, player.y + player.eye, player.z);
camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ');
syncChunks();
renderHealth();
const keys = new Set();
const clock = new THREE.Clock();
let locked = false;
let coordinateTimer = 0;
const raycaster = new THREE.Raycaster();
raycaster.far = 6;
const screenCenter = new THREE.Vector2(0, 0);

function renderHealth() {
  const hearts = healthBar.querySelectorAll('img');
  hearts.forEach((heart, index) => {
    const remaining = player.health - index * 2;
    heart.src = remaining >= 2
      ? './uploads/full_heart.png'
      : remaining === 1
        ? './uploads/half_heart.png'
        : './uploads/empty_heart.png';
  });
  healthBar.setAttribute('aria-label', `Health: ${player.health / 2} of ${player.maxHealth / 2} hearts`);
}

function mineBlock() {
  raycaster.setFromCamera(screenCenter, camera);
  const [hit] = raycaster.intersectObjects([...terrainMeshes], false);
  if (!hit || hit.instanceId === undefined) return;
  const voxel = hit.object.userData.voxels[hit.instanceId];
  if (!voxel) return;

  minedBlocks.add(blockKey(voxel.x, voxel.y, voxel.z));
  const cx = Math.floor(voxel.x / CHUNK_SIZE);
  const cz = Math.floor(voxel.z / CHUNK_SIZE);
  removeChunkMeshes(cx, cz);
  buildChunk(cx, cz);
}

function isSolid(x, y, z) {
  const bx = Math.floor(x);
  const bz = Math.floor(z);
  const iy = Math.floor(y);
  if (minedBlocks.has(blockKey(bx, iy, bz))) return false;
  if (iy < BEDROCK) return true;
  return iy <= terrainHeight(bx, bz);
}

function surfaceUnderPlayer(x, z) {
  const minX = Math.floor(x - player.radius + 1e-7);
  const maxX = Math.floor(x + player.radius - 1e-7);
  const minZ = Math.floor(z - player.radius + 1e-7);
  const maxZ = Math.floor(z + player.radius - 1e-7);
  let surface = BEDROCK;
  for (let bx = minX; bx <= maxX; bx++) {
    for (let bz = minZ; bz <= maxZ; bz++) {
      for (let y = terrainHeight(bx, bz); y >= BEDROCK; y--) {
        if (!minedBlocks.has(blockKey(bx, y, bz))) {
          surface = Math.max(surface, y + 1);
          break;
        }
      }
    }
  }
  return surface;
}

function applyFallDamage(distance) {
  if (distance < 4 || player.health <= 0) return;
  const damage = Math.floor((distance - 2 + 1e-6) / 2);
  player.health = Math.max(0, player.health - damage);
  renderHealth();
}

function collides(x, y, z) {
  const minX = x - player.radius + 1e-7;
  const maxX = x + player.radius - 1e-7;
  const minY = y + 1e-7;
  const maxY = y + player.height - 1e-7;
  const minZ = z - player.radius + 1e-7;
  const maxZ = z + player.radius - 1e-7;
  for (let bx = Math.floor(minX); bx <= Math.floor(maxX); bx++) {
    for (let by = Math.floor(minY); by <= Math.floor(maxY); by++) {
      for (let bz = Math.floor(minZ); bz <= Math.floor(maxZ); bz++) {
        if (isSolid(bx + 0.5, by + 0.5, bz + 0.5)) return true;
      }
    }
  }
  return false;
}

function moveAxis(axis, amount) {
  if (!amount) return false;
  const distance = Math.abs(amount);
  const steps = Math.max(1, Math.ceil(distance / 0.12));
  const delta = amount / steps;
  let collided = false;
  for (let i = 0; i < steps; i++) {
    const nextX = player.x + (axis === 'x' ? delta : 0);
    const nextY = player.y + (axis === 'y' ? delta : 0);
    const nextZ = player.z + (axis === 'z' ? delta : 0);
    if (collides(nextX, nextY, nextZ)) {
      collided = true;
      if (axis === 'y') player.vy = 0;
      break;
    }
    player.x = nextX;
    player.y = nextY;
    player.z = nextZ;
  }
  return collided;
}

function updatePlayer(dt) {
  const forward = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
  const strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
  const mag = Math.hypot(forward, strafe) || 1;
  const sprinting = keys.has('ShiftLeft') || keys.has('ShiftRight');
  const speed = sprinting ? 7.1 : 4.8;
  const f = forward / mag * speed * dt;
  const s = strafe / mag * speed * dt;
  const dx = -Math.sin(player.yaw) * f + Math.cos(player.yaw) * s;
  const dz = -Math.cos(player.yaw) * f - Math.sin(player.yaw) * s;
  moveAxis('x', dx);
  moveAxis('z', dz);
  syncChunks();

  const wasGrounded = player.grounded;
  if (keys.has('Space') && player.grounded) {
    player.vy = 8.0;
    player.grounded = false;
  }
  if (wasGrounded) player.fallPeakY = player.y;
  player.vy = Math.max(-24, player.vy - 21 * dt);
  const wasDescending = player.vy <= 0;
  const hitY = moveAxis('y', player.vy * dt);
  const landed = hitY && wasDescending;
  player.fallPeakY = Math.max(player.fallPeakY, player.y);
  if (landed) {
    const landingY = surfaceUnderPlayer(player.x, player.z);
    applyFallDamage(player.fallPeakY - landingY);
    player.fallPeakY = landingY;
  }
  player.grounded = landed;

  camera.position.set(player.x, player.y + player.eye, player.z);
  camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ');
  coordinateTimer += dt;
  if (coordinateTimer > 0.15) {
    coordinates.textContent = `${Math.floor(player.x)}, ${Math.floor(player.z)}`;
    coordinateTimer = 0;
  }
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  if (locked) updatePlayer(dt);
  renderer.render(scene, camera);
}

renderer.domElement.addEventListener('click', () => {
  if (!locked) renderer.domElement.requestPointerLock();
});
document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === renderer.domElement;
  crosshair.classList.toggle('visible', locked);
  if (!locked) keys.clear();
});
document.addEventListener('mousedown', event => {
  if (!locked || event.button !== 0) return;
  event.preventDefault();
  mineBlock();
});
document.addEventListener('mousemove', event => {
  if (!locked) return;
  player.yaw -= event.movementX * 0.0022;
  player.pitch -= event.movementY * 0.0022;
  player.pitch = THREE.MathUtils.clamp(player.pitch, -1.48, 1.48);
});
document.addEventListener('keydown', event => {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) event.preventDefault();
  keys.add(event.code);
});
document.addEventListener('keyup', event => keys.delete(event.code));
window.addEventListener('blur', () => keys.clear());
window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7));
});

loading.classList.add('hidden');
animate();
