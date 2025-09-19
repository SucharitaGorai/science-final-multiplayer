import React, { useEffect, useRef, useState } from 'react';

// Try local three first (if installed), then fall back to CDN
const THREE_URL = 'https://unpkg.com/three@0.154.0/build/three.module.js';
const ORBIT_URL = 'https://unpkg.com/three@0.154.0/examples/jsm/controls/OrbitControls.js';

export default function EscapeGame({ socket, room, name, avatar }) {
  const mountRef = useRef(null);
  const [joined, setJoined] = useState(false);
  const playersRef = useRef({}); // id -> {mesh}
  const nameSpritesRef = useRef({}); // id -> {sprite}
  const localIdRef = useRef(null);
  const threeRef = useRef(null);
  const objectsRef = useRef({}); // interactive objects
  const [hudMsg, setHudMsg] = useState('WASD to move. Find the glowing console for a puzzle.');
  const [loading3d, setLoading3d] = useState(true);
  const proximityTimersRef = useRef({}); // consoleId -> timer id
  const askedRecentlyRef = useRef({}); // consoleId -> timestamp
  const unlockedRef = useRef(false);
  const [escaped, setEscaped] = useState(false);
  const [countdownLeft, setCountdownLeft] = useState(null); // ms left during synchronized countdown
  const countdownDeadlineRef = useRef(null);
  const [roster, setRoster] = useState([]); // list of names playing
  const [keyProgress, setKeyProgress] = useState({ solvedCount: 0, required: 3 });
  const particlesRef = useRef([]); // array of { points, velocities: Float32Array, life: number, material }
  const [qaOpen, setQaOpen] = useState(false);
  const [qaQuestion, setQaQuestion] = useState('');
  const [qaAnswer, setQaAnswer] = useState('');
  const [qaExpected, setQaExpected] = useState('');
  const qaConsoleIdRef = useRef(null);
  // Mobile joystick state
  const joyRef = useRef({ active: false, startX: 0, startY: 0 });
  const joyVecRef = useRef({ x: 0, z: 0 }); // -1..1 range
  const [joyUI, setJoyUI] = useState({ active: false, dx: 0, dy: 0 });
  // Public interact handler (usable from JSX and DOM listeners)
  const interactRef = useRef(() => {});

  // Science questions (physics / Newton's laws)
  const questions = [
    { q: 'SI unit of force?', a: 'newton' },
    { q: "Which law is the 'Law of Inertia'? (first/second/third)", a: 'first' },
    { q: 'If net force is zero, the acceleration is...? (zero/nonzero)', a: 'zero' },
    { q: 'F = m × a. What happens to acceleration if force doubles (same mass)? (double/half/same)', a: 'double' },
    { q: 'Action–reaction pairs are equal and opposite: which law number? (first/second/third)', a: 'third' },
  ];

  useEffect(() => {
    if (!socket || !room || !name) return;
    if (!mountRef.current) return;

    let cleanup = () => {};

    (async () => {
      // Robust import: try local, then CDN
      let THREE;
      let OrbitControls;
      try {
        THREE = (await import('three')).default || (await import('three'));
        ({ OrbitControls } = await import('three/examples/jsm/controls/OrbitControls.js'));
      } catch (e) {
        THREE = await import(/* @vite-ignore */ THREE_URL);
        ({ OrbitControls } = await import(/* @vite-ignore */ ORBIT_URL));
      }
      threeRef.current = THREE;

      const width = mountRef.current.clientWidth;
      const height = mountRef.current.clientHeight;

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x0b0b15);

      const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
      camera.position.set(0, 6, 12);

      const renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setSize(width, height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      mountRef.current.appendChild(renderer.domElement);
      renderer.domElement.setAttribute('tabindex', '0');
      renderer.domElement.style.outline = 'none';
      renderer.domElement.addEventListener('click', () => renderer.domElement.focus());

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.enablePan = false;
      controls.minDistance = 5;
      controls.maxDistance = 30;
      controls.target.set(0, 1, 0);

      // Lights
      const ambient = new THREE.AmbientLight(0x8888aa, 0.7);
      scene.add(ambient);
      const dir = new THREE.DirectionalLight(0xffffff, 0.7);
      dir.position.set(3, 10, 5);
      scene.add(dir);

      // Floor
      const floorGeo = new THREE.PlaneGeometry(40, 40);
      const floorMat = new THREE.MeshStandardMaterial({ color: 0x151527, metalness: 0.1, roughness: 0.8 });
      const floor = new THREE.Mesh(floorGeo, floorMat);
      floor.rotation.x = -Math.PI / 2;
      scene.add(floor);

      // Walls (simple haunted room)
      const wallMat = new THREE.MeshStandardMaterial({ color: 0x1b1233 });
      const wallGeo = new THREE.BoxGeometry(40, 8, 1);
      const wall1 = new THREE.Mesh(wallGeo, wallMat); wall1.position.set(0, 4, -20); scene.add(wall1);
      const wall2 = new THREE.Mesh(wallGeo, wallMat); wall2.position.set(0, 4, 20); scene.add(wall2);
      const wall3 = new THREE.Mesh(new THREE.BoxGeometry(1, 8, 40), wallMat); wall3.position.set(-20, 4, 0); scene.add(wall3);
      const wall4 = new THREE.Mesh(new THREE.BoxGeometry(1, 8, 40), wallMat); wall4.position.set(20, 4, 0); scene.add(wall4);

      // Exit door (becomes active when puzzles solved)
      const doorMat = new THREE.MeshStandardMaterial({ color: 0x3366ff, emissive: 0x000066, emissiveIntensity: 0.2 });
      const door = new THREE.Mesh(new THREE.BoxGeometry(3, 5, 0.5), doorMat);
      door.position.set(0, 2.5, -19.5);
      scene.add(door);
      objectsRef.current.door = door;

      // Vault (simple chest) behind the door: base + lid that opens
      const vaultGroup = new THREE.Group();
      const base = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.2, 2.2), new THREE.MeshStandardMaterial({ color: 0x2b2946, metalness: 0.6, roughness: 0.3 }));
      base.position.set(0, 0.6, -18.2);
      const lid = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.4, 2.2), new THREE.MeshStandardMaterial({ color: 0x5b57a3, metalness: 0.7, roughness: 0.25, emissive: 0x111133, emissiveIntensity: 0.2 }));
      lid.position.set(0, 1.2, -18.2);
      lid.geometry.translate(0, 0.2, 0); // hinge at back
      vaultGroup.add(base);
      vaultGroup.add(lid);
      scene.add(vaultGroup);
      objectsRef.current.vault = { group: vaultGroup, lid };

      // Multiple puzzle consoles (glowing)
      objectsRef.current.consoles = {};
      const consoleGeo = new THREE.BoxGeometry(2, 1, 1);
      const consoleDefs = [
        { id: 'c1', pos: [5, 0.5, 5] },
        { id: 'c2', pos: [-6, 0.5, 4] },
        { id: 'c3', pos: [-4, 0.5, -6] },
      ];
      consoleDefs.forEach(def => {
        const mat = new THREE.MeshStandardMaterial({ color: 0x7c3aed, emissive: 0x3f1e7a, emissiveIntensity: 0.7 });
        const mesh = new THREE.Mesh(consoleGeo.clone(), mat);
        mesh.position.set(def.pos[0], def.pos[1], def.pos[2]);
        scene.add(mesh);
        objectsRef.current.consoles[def.id] = { mesh, solved: false };
      });

      // Treasure boxes: 6 boxes around the room (server decides contents)
      objectsRef.current.boxes = [];
      const boxGeo = new THREE.BoxGeometry(1.2, 0.9, 1.0);
      const boxPositions = [
        [ 6, 0.45,  6],
        [-6, 0.45,  6],
        [ 8, 0.45, -5],
        [-8, 0.45, -5],
        [ 0, 0.45,  8],
        [ 0, 0.45, -8],
      ];
      boxPositions.forEach((p, idx) => {
        const mat = new THREE.MeshStandardMaterial({ color: 0x7a5830, metalness: 0.2, roughness: 0.8 });
        const mesh = new THREE.Mesh(boxGeo.clone(), mat);
        mesh.position.set(p[0], p[1], p[2]);
        scene.add(mesh);
        objectsRef.current.boxes[idx] = { mesh, opened: false };
      });

      // Avatars: use sprite images under public/avatars
      const avatarUrls = [
        '/avatars/rogue.png',
        '/avatars/knight.png',
        '/avatars/commando.png',
      ];
      // Visual tuning for avatar size/height and label placement
      const AVATAR_HEIGHT = 3.2; // slightly smaller than before for better fit
      const AVATAR_Y = AVATAR_HEIGHT / 2; // center the sprite so bottom touches floor (y=0)
      const NAME_OFFSET = AVATAR_HEIGHT * 0.9; // label height above ground
      const avatarKeyToUrl = (key) => {
        const k = String(key || 'rogue').toLowerCase();
        if (k === 'rogue') return '/avatars/rogue.png';
        if (k === 'knight') return '/avatars/knight.png';
        if (k === 'commando') return '/avatars/commando.png';
        // fallback stable hash to pick one
        const idx = hashToIndex(k, avatarUrls.length);
        return avatarUrls[idx];
      };
      const texLoader = new THREE.TextureLoader();

      function hashToIndex(str, modulo) {
        let h = 0;
        for (let i = 0; i < String(str).length; i++) {
          h = (h * 31 + String(str).charCodeAt(i)) | 0;
        }
        return Math.abs(h) % modulo;
      }

      function makeAvatarSprite(url) {
        try {
          const tex = texLoader.load(url);
          tex.minFilter = THREE.NearestFilter;
          tex.magFilter = THREE.NearestFilter;
          tex.generateMipmaps = false;
          const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
          const spr = new THREE.Sprite(mat);
          // Scale to roughly human-sized in our world units
          // Slightly narrower to match reduced height
          spr.scale.set(1.8, AVATAR_HEIGHT, 1);
          return spr;
        } catch (e) {
          // Fallback to a simple box if texture fails
          const fallback = new THREE.Mesh(new THREE.BoxGeometry(1.4, AVATAR_HEIGHT, 1), new THREE.MeshToonMaterial({ color: 0x8b5cf6 }));
          return fallback;
        }
      }

      // Create local player sprite using chosen avatar
      const localPlayer = makeAvatarSprite(avatarKeyToUrl(avatar));
      localPlayer.position.set(0, AVATAR_Y, 0);
      scene.add(localPlayer);

      const keys = { w: false, a: false, s: false, d: false };
      const keyDown = (e) => {
        const k = e.key.toLowerCase();
        if (k in keys) { keys[k] = true; e.preventDefault(); }
      };
      const keyUp = (e) => {
        const k = e.key.toLowerCase();
        if (k in keys) { keys[k] = false; e.preventDefault(); }
      };
      window.addEventListener('keydown', keyDown, { passive: false });
      window.addEventListener('keyup', keyUp, { passive: false });
      renderer.domElement.addEventListener('keydown', keyDown, { passive: false });
      renderer.domElement.addEventListener('keyup', keyUp, { passive: false });

      let lastSent = 0;
      const speed = 5; // units/sec

      const clock = new THREE.Clock();
      let stop = false;
      const followOffset = new THREE.Vector3(0, 4, 8);
      const camTarget = new THREE.Vector3();
      function spawnBurst(pos, color = 0x22cc88, count = 36) {
        const positions = new Float32Array(count * 3);
        const velocities = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
          positions[i*3+0] = pos.x;
          positions[i*3+1] = pos.y + 0.3;
          positions[i*3+2] = pos.z;
          const theta = Math.random() * Math.PI * 2;
          const speed = 1.5 + Math.random() * 1.5;
          velocities[i*3+0] = Math.cos(theta) * speed;
          velocities[i*3+1] = 2.5 + Math.random() * 1.5;
          velocities[i*3+2] = Math.sin(theta) * speed;
        }
        const geom = new THREE.BufferGeometry();
        geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const mat = new THREE.PointsMaterial({ color, size: 0.15, transparent: true, opacity: 1.0, depthWrite: false });
        const points = new THREE.Points(geom, mat);
        scene.add(points);
        particlesRef.current.push({ points, velocities, life: 1.2, material: mat });
      }
      function animate() {
        if (stop) return;
        requestAnimationFrame(animate);
        const dt = clock.getDelta();

        const dir = new THREE.Vector3();
        // keyboard input
        let dx = 0, dz = 0;
        if (keys.w) dz -= 1;
        if (keys.s) dz += 1;
        if (keys.a) dx -= 1;
        if (keys.d) dx += 1;
        // joystick input (already normalized -1..1)
        dx += joyVecRef.current.x;
        dz += joyVecRef.current.z;
        dir.set(dx, 0, dz);
        if (dir.lengthSq() > 0) {
          dir.normalize().multiplyScalar(speed * dt);
          localPlayer.position.add(dir);
        }

        // Make camera follow the player smoothly
        camTarget.copy(localPlayer.position).add(followOffset);
        camera.position.lerp(camTarget, 0.08);
        controls.target.lerp(localPlayer.position, 0.2);
        // Update name sprite positions above avatars
        Object.entries(playersRef.current).forEach(([id, entry]) => {
          const spr = nameSpritesRef.current[id];
          if (spr && entry?.mesh) {
            spr.position.set(entry.mesh.position.x, entry.mesh.position.y + (NAME_OFFSET - AVATAR_Y), entry.mesh.position.z);
          }
        });
        const mySpr = nameSpritesRef.current[localIdRef.current];
        if (mySpr) mySpr.position.set(localPlayer.position.x, localPlayer.position.y + (NAME_OFFSET - AVATAR_Y), localPlayer.position.z);

        controls.update();

        // Update particle bursts
        if (particlesRef.current.length) {
          for (let p = particlesRef.current.length - 1; p >= 0; p--) {
            const sys = particlesRef.current[p];
            const attr = sys.points.geometry.getAttribute('position');
            const arr = attr.array;
            const vel = sys.velocities;
            const n = vel.length / 3;
            for (let i = 0; i < n; i++) {
              vel[i*3+1] -= 4.0 * dt; // gravity
              arr[i*3+0] += vel[i*3+0] * dt;
              arr[i*3+1] += vel[i*3+1] * dt;
              arr[i*3+2] += vel[i*3+2] * dt;
            }
            attr.needsUpdate = true;
            sys.life -= dt;
            sys.material.opacity = Math.max(0, sys.life / 1.2);
            if (sys.life <= 0) {
              scene.remove(sys.points);
              sys.points.geometry.dispose();
              sys.material.dispose();
              particlesRef.current.splice(p, 1);
            }
          }
        }

        // If unlocked, gently animate vault lid opening
        if (unlockedRef.current && objectsRef.current.vault?.lid) {
          const target = -Math.PI / 1.8; // ~100 degrees
          objectsRef.current.vault.lid.rotation.x = THREE.MathUtils.lerp(objectsRef.current.vault.lid.rotation.x, target, 0.05);
        }

        // Proximity auto-question: if near an unsolved console for ~1s, pop a question
        // Disabled during countdown
        if (countdownDeadlineRef.current && Date.now() < countdownDeadlineRef.current) {
          renderer.render(scene, camera);
          const t = performance.now();
          if (t - lastSent > 66) {
            socket.emit('escapeMove', room, { x: localPlayer.position.x, y: localPlayer.position.y, z: localPlayer.position.z });
            lastSent = t;
          }
          return;
        }
        const consoles = objectsRef.current.consoles || {};
        let nearestId = null; let nearestDist = Infinity;
        Object.entries(consoles).forEach(([id, entry]) => {
          if (!entry || entry.solved) return;
          const dx = localPlayer.position.x - entry.mesh.position.x;
          const dz = localPlayer.position.z - entry.mesh.position.z;
          const d2 = dx*dx + dz*dz;
          if (d2 < 9 && d2 < nearestDist) { nearestDist = d2; nearestId = id; }
        });
        const now = performance.now();
        if (nearestId) {
          // throttle asking: no more than once every 4s per console
          const last = askedRecentlyRef.current[nearestId] || 0;
          if (!proximityTimersRef.current[nearestId] && now - last > 4000) {
            proximityTimersRef.current[nearestId] = setTimeout(() => {
              // still near and unsolved?
              const entry = consoles[nearestId];
              if (entry && !entry.solved) {
                const dx = localPlayer.position.x - entry.mesh.position.x;
                const dz = localPlayer.position.z - entry.mesh.position.z;
                if (dx*dx + dz*dz < 9) {
                  const q = questions[Math.floor(Math.random() * questions.length)];
                  qaConsoleIdRef.current = nearestId;
                  setQaQuestion(q.q);
                  setQaExpected(String(q.a).toLowerCase());
                  setQaAnswer('');
                  setQaOpen(true);
                  askedRecentlyRef.current[nearestId] = performance.now();
                }
              }
              clearTimeout(proximityTimersRef.current[nearestId]);
              delete proximityTimersRef.current[nearestId];
            }, 1000);
          }
        }
        // If player reaches the door after unlock, mark escaped and show overlay
        if (!escaped && unlockedRef.current && door) {
          const dx = localPlayer.position.x - door.position.x;
          const dz = localPlayer.position.z - door.position.z;
          if (dx*dx + dz*dz < 4) { // within ~2 units
            setEscaped(true);
            setHudMsg('You found the vault!');
          }
        }
        renderer.render(scene, camera);

        // Throttle network updates to ~15 fps
        const t = performance.now();
        if (t - lastSent > 66) {
          socket.emit('escapeMove', room, { x: localPlayer.position.x, y: localPlayer.position.y, z: localPlayer.position.z });
          lastSent = t;
        }
      }

      // Socket handlers
      socket.emit('escapeJoin', room, name, avatar || 'rogue');

      function makeNameSprite(text) {
        const canvas = document.createElement('canvas');
        canvas.width = 256; canvas.height = 64;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#00000088';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.font = '28px sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, canvas.width/2, canvas.height/2);
        const tex = new THREE.CanvasTexture(canvas);
        tex.minFilter = THREE.LinearFilter;
        const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false });
        const sprite = new THREE.Sprite(mat);
        sprite.scale.set(2.8, 0.7, 1);
        return sprite;
      }

      socket.on('escapeWelcome', (payload) => {
        localIdRef.current = payload.id;
        // Spawn existing players with names
        const names = [];
        (payload.players || []).forEach(p => {
          names.push(p.name);
          if (p.id === payload.id) return;
          spawnRemote(p.id, p.pos, p.name, p.avatar);
        });
        // Local name label
        const myLabel = makeNameSprite(name);
        myLabel.position.set(localPlayer.position.x, localPlayer.position.y + (NAME_OFFSET - AVATAR_Y), localPlayer.position.z);
        scene.add(myLabel);
        nameSpritesRef.current[payload.id] = myLabel;
        setRoster(prev => Array.from(new Set([name, ...names])));
        const sc = Number(payload.state?.solvedCount || 0);
        const req = Number(payload.state?.requiredToUnlock || 3);
        setKeyProgress({ solvedCount: sc, required: req });
        setHudMsg(payload.state?.completed ? 'Door unlocked! Head to the glowing exit.' : `Find ${req} keys from treasure boxes to unlock the door.`);
        setJoined(true);
        setLoading3d(false);
      });

      // Initial boxes state: which ones are opened (no reveal of keys)
      socket.on('escapeBoxes', ({ opened }) => {
        if (!objectsRef.current.boxes) return;
        (opened || []).forEach((isOpen, i) => {
          const entry = objectsRef.current.boxes[i];
          if (!entry) return;
          entry.opened = !!isOpen;
          if (entry.opened && entry.mesh?.material) {
            // mark opened empty by default until result events arrive
            entry.mesh.material.color.setHex(0x444444);
          }
        });
      });

      // Synchronized countdown handler
      socket.on('escapeCountdown', ({ deadline }) => {
        countdownDeadlineRef.current = deadline;
        const tick = () => {
          const left = Math.max(0, deadline - Date.now());
          setCountdownLeft(left);
          if (left > 0) {
            requestAnimationFrame(tick);
          } else {
            setCountdownLeft(null);
          }
        };
        tick();
      });

      socket.on('escapePlayerJoined', (p) => {
        if (p.id === localIdRef.current) return;
        spawnRemote(p.id, p.pos, p.name, p.avatar);
        setRoster(prev => Array.from(new Set([...(prev||[]), p.name])));
      });

      socket.on('escapePlayerLeft', (id) => {
        const entry = playersRef.current[id];
        if (entry) {
          scene.remove(entry.mesh);
          delete playersRef.current[id];
        }
        const spr = nameSpritesRef.current[id];
        if (spr) { scene.remove(spr); delete nameSpritesRef.current[id]; }
      });

      socket.on('escapePlayerMoved', ({ id, pos }) => {
        const entry = playersRef.current[id];
        if (entry) {
          // normalize Y to our sprite height so feet stay on floor
          entry.mesh.position.set(pos.x, AVATAR_Y, pos.z);
        }
      });

      socket.on('escapeState', (state) => {
        if (state?.completed) {
          // Make door glow green
          if (objectsRef.current.door?.material) {
            const mat = objectsRef.current.door.material;
            mat.emissiveIntensity = 1.2;
            mat.color.setHex(0x22cc88);
          }
          // Also turn all consoles green to mark solved
          if (objectsRef.current.consoles) {
            Object.values(objectsRef.current.consoles).forEach(entry => {
              if (!entry?.mesh?.material) return;
              const cmat = entry.mesh.material;
              cmat.color.setHex(0x22cc88);
              cmat.emissive = new threeRef.current.Color(0x0b662e);
              cmat.emissiveIntensity = 0.9;
              entry.solved = true;
            });
          }
          // Color any opened boxes that were keys should already be set via results
          setHudMsg('Door unlocked! Everyone escape through the door!');
          unlockedRef.current = true;
        } else if (state?.reset) {
          // Reset to initial locked visuals
          if (objectsRef.current.door?.material) {
            const mat = objectsRef.current.door.material;
            mat.color.setHex(0x3366ff);
            mat.emissive = new threeRef.current.Color(0x000066);
            mat.emissiveIntensity = 0.2;
          }
          if (objectsRef.current.consoles) {
            Object.values(objectsRef.current.consoles).forEach(entry => {
              if (!entry?.mesh?.material) return;
              const cmat = entry.mesh.material;
              cmat.color.setHex(0x7c3aed);
              cmat.emissive = new threeRef.current.Color(0x3f1e7a);
              cmat.emissiveIntensity = 0.7;
              entry.solved = false;
            });
          }
          // Reset treasure boxes visuals
          if (objectsRef.current.boxes) {
            objectsRef.current.boxes.forEach(entry => {
              if (!entry?.mesh?.material) return;
              entry.mesh.material.color.setHex(0x7a5830);
              entry.opened = false;
            });
          }
          // Close vault lid
          if (objectsRef.current.vault?.lid) {
            objectsRef.current.vault.lid.rotation.x = 0;
          }
          unlockedRef.current = false;
          setEscaped(false);
          setKeyProgress(prev => ({ solvedCount: 0, required: prev.required }));
          setHudMsg(`Find ${keyProgress.required} keys from treasure boxes to unlock the door. WASD to move.`);
        }
      });

      // Progress updates from server
      socket.on('escapeKeyProgress', ({ solvedCount, requiredToUnlock, required }) => {
        const req = Number(requiredToUnlock || required || keyProgress.required || 3);
        const sc = Math.max(0, Math.min(req, Number(solvedCount || 0)));
        setKeyProgress({ solvedCount: sc, required: req });
      });

      // Box open result: color green if key found, gray if empty
      socket.on('escapeBoxResult', ({ index, found }) => {
        const entry = objectsRef.current.boxes?.[index];
        if (!entry || !entry.mesh?.material) return;
        entry.opened = true;
        if (found) {
          entry.mesh.material.color.setHex(0x22cc88);
          setHudMsg('You found a key!');
          // quick glow pulse
          entry.mesh.material.emissive = new threeRef.current.Color(0x0b662e);
          entry.mesh.material.emissiveIntensity = 0.9;
          setTimeout(() => { if (entry.mesh?.material) entry.mesh.material.emissiveIntensity = 0.2; }, 600);
          // particle burst
          spawnBurst(entry.mesh.position, 0x22cc88, 40);
        } else {
          entry.mesh.material.color.setHex(0x444444);
          setHudMsg('Empty box. Keep searching!');
          // subtle dust puff
          spawnBurst(entry.mesh.position, 0x888888, 22);
        }
      });

      // Visual sync for a single solved console
      socket.on('escapeConsoleSolved', ({ consoleId }) => {
        const entry = objectsRef.current.consoles?.[consoleId];
        if (entry && entry.mesh?.material && !entry.solved) {
          const cmat = entry.mesh.material;
          cmat.color.setHex(0x22cc88);
          cmat.emissive = new threeRef.current.Color(0x0b662e);
          cmat.emissiveIntensity = 0.9;
          entry.solved = true;
        }
      });

      interactRef.current = function interact() {
        const boxes = objectsRef.current.boxes || [];
        // find nearest unopened box within radius 2.5
        let nearestBox = -1; let nearestD2 = Infinity;
        boxes.forEach((entry, i) => {
          if (!entry || entry.opened) return;
          const dx = localPlayer.position.x - entry.mesh.position.x;
          const dz = localPlayer.position.z - entry.mesh.position.z;
          const d2 = dx*dx + dz*dz;
          if (d2 < 6.25 && d2 < nearestD2) { nearestD2 = d2; nearestBox = i; }
        });
        if (nearestBox >= 0) {
          socket.emit('escapeOpenBox', room, nearestBox);
          return;
        }

        const consoles = objectsRef.current.consoles || {};
        // find nearest unsolved console within radius 3
        let nearestId = null; let nearestDist = Infinity; let nearestMesh = null;
        Object.entries(consoles).forEach(([id, entry]) => {
          if (!entry || entry.solved) return;
          const dx = localPlayer.position.x - entry.mesh.position.x;
          const dz = localPlayer.position.z - entry.mesh.position.z;
          const d2 = dx*dx + dz*dz;
          if (d2 < 9 && d2 < nearestDist) { nearestDist = d2; nearestId = id; nearestMesh = entry.mesh; }
        });
        if (!nearestId) return; // not close to any console

        const q = questions[Math.floor(Math.random() * questions.length)];
        qaConsoleIdRef.current = nearestId;
        setQaQuestion(q.q);
        setQaExpected(String(q.a).toLowerCase());
        setQaAnswer('');
        setQaOpen(true);
      }

      // Interactions: click anywhere to interact (desktop)
      const onClickInteract = () => interactRef.current && interactRef.current();
      renderer.domElement.addEventListener('click', onClickInteract);

      function spawnRemote(id, pos, pname, avatarKey) {
        const mesh = makeAvatarSprite(avatarKeyToUrl(avatarKey));
        mesh.position.set(pos?.x || 0, AVATAR_Y, pos?.z || 0);
        scene.add(mesh);
        playersRef.current[id] = { mesh };
        // add name sprite
        const label = makeNameSprite(pname || 'Player');
        label.position.set(mesh.position.x, mesh.position.y + (NAME_OFFSET - AVATAR_Y), mesh.position.z);
        scene.add(label);
        nameSpritesRef.current[id] = label;
      }

      const onResize = () => {
        if (!mountRef.current) return;
        const w = mountRef.current.clientWidth;
        const h = mountRef.current.clientHeight;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      };
      window.addEventListener('resize', onResize);

      animate();

      cleanup = () => {
        stop = true;
        window.removeEventListener('resize', onResize);
        renderer.dispose();
        mountRef.current && mountRef.current.removeChild(renderer.domElement);
        socket.off('escapeWelcome');
        socket.off('escapePlayerJoined');
        socket.off('escapePlayerLeft');
        socket.off('escapePlayerMoved');
        socket.off('escapeState');
        socket.off('escapeConsoleSolved');
        socket.off('escapeKeyProgress');
        socket.off('escapeBoxes');
        socket.off('escapeBoxResult');
        socket.off('escapeCountdown');
        socket.emit('escapeLeave', room);
        window.removeEventListener('keydown', keyDown);
        window.removeEventListener('keyup', keyUp);
        // clear any pending proximity timers
        Object.values(proximityTimersRef.current).forEach(t => clearTimeout(t));
        proximityTimersRef.current = {};
        // remove click listener
        try { renderer.domElement.removeEventListener('click', onClickInteract); } catch {}
      };
    })();

    return () => cleanup();
  }, [socket, room, name, avatar]);

  return (
    <div className="escape-wrapper">
      <div className="escape-header">🕯️ Haunted Escape (Beta)
        {roster.length > 0 && (
          <div style={{marginTop: 4, fontSize: 11}}>
            {roster.join(' • ')}
          </div>
        )}
      </div>
      <div style={{position:'absolute', top:8, right:12, zIndex:2, fontFamily:'\'Press Start 2P\', monospace', fontSize:12, color:'#a78bfa', textShadow:'1px 1px 0px #000', padding:'6px 10px', background:'rgba(15,10,31,0.8)', border:'2px solid #7c3aed', borderRadius:8}}>
        🔑 Keys: {keyProgress.solvedCount}/{keyProgress.required}
      </div>
      <div ref={mountRef} className="escape-canvas" />
      {/* Mobile controls: joystick + Interact button */}
      <div
        onTouchStart={(e)=>{
          const t = e.touches[0];
          joyRef.current = { active: true, startX: t.clientX, startY: t.clientY };
          setJoyUI({ active: true, dx: 0, dy: 0 });
        }}
        onTouchMove={(e)=>{
          if (!joyRef.current.active) return;
          const t = e.touches[0];
          const dx = t.clientX - joyRef.current.startX;
          const dy = t.clientY - joyRef.current.startY;
          const R = 40; // radius px
          const mag = Math.max(1, Math.hypot(dx, dy));
          const clampedX = Math.max(-R, Math.min(R, dx));
          const clampedY = Math.max(-R, Math.min(R, dy));
          setJoyUI({ active: true, dx: clampedX, dy: clampedY });
          joyVecRef.current = { x: clampedX / R, z: clampedY / R };
        }}
        onTouchEnd={()=>{
          joyRef.current.active = false;
          setJoyUI({ active: false, dx: 0, dy: 0 });
          joyVecRef.current = { x: 0, z: 0 };
        }}
        style={{ position:'absolute', left:12, bottom:12, width:100, height:100, zIndex:3, touchAction:'none' }}
      >
        <div style={{ position:'absolute', left:0, top:0, width:100, height:100, borderRadius:50, background:'rgba(60,60,90,0.3)', border:'2px solid #7c3aed' }} />
        <div style={{ position:'absolute', left:50-20 + joyUI.dx*0.5, top:50-20 + joyUI.dy*0.5, width:40, height:40, borderRadius:20, background:'#7c3aed', boxShadow:'0 0 10px #7c3aed' }} />
      </div>
      <button
        onClick={() => interactRef.current && interactRef.current()}
        style={{ position:'absolute', right:12, bottom:18, zIndex:3, padding:'10px 14px', background:'#2a2a40', color:'#e9d5ff', border:'2px solid #7c3aed', borderRadius:8 }}
      >
        Interact
      </button>
      <div className="escape-hud">{hudMsg}</div>
      {qaOpen && (
        <div className="escape-overlay" style={{background:'rgba(0,0,0,0.6)'}}>
          <div style={{background:'#1b1233', border:'3px solid #7c3aed', boxShadow:'0 0 0 6px #3b1747 inset', padding:20, borderRadius:8, minWidth:300}}>
            <div style={{fontFamily:'\'Press Start 2P\', monospace', fontSize:12, color:'#e9d5ff', textShadow:'1px 1px 0px #000', marginBottom:10}}>
              {qaQuestion}
            </div>
            <input
              className="chat-input"
              placeholder="Type answer"
              value={qaAnswer}
              onChange={(e)=>setQaAnswer(e.target.value)}
              style={{width:'100%'}}
            />
            <div style={{display:'flex', gap:8, marginTop:10, justifyContent:'flex-end'}}>
              <button className="chat-send-btn" onClick={()=>{
                const ok = String(qaAnswer||'').trim().toLowerCase() === qaExpected;
                const id = qaConsoleIdRef.current;
                const consoles = objectsRef.current.consoles || {};
                const entry = consoles[id];
                if (ok) {
                  if (entry && entry.mesh?.material) {
                    const cmat = entry.mesh.material;
                    cmat.color.setHex(0x22cc88);
                    cmat.emissive = new threeRef.current.Color(0x0b662e);
                    cmat.emissiveIntensity = 0.9;
                    entry.solved = true;
                  }
                  socket.emit('escapeConsoleSolved', room, id);
                  socket.emit('escapePuzzleSolved', room);
                  setHudMsg('Correct! Console unlocked.');
                  setQaOpen(false);
                } else {
                  setHudMsg('Wrong answer! Try again.');
                }
              }}>Submit</button>
              <button className="preset-btn" onClick={()=> setQaOpen(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
      {!joined && <div className="escape-overlay">{loading3d ? 'Loading 3D…' : 'Joining…'}</div>}
      {countdownLeft !== null && (
        <div className="escape-overlay" style={{background: 'rgba(0,0,0,0.6)'}}>
          <div style={{textAlign:'center'}}>
            <div style={{fontSize: 18, marginBottom: 6}}>Treasure Hunt starts in</div>
            <div style={{fontSize: 48, fontWeight: 800}}>{Math.ceil(countdownLeft/1000)}</div>
          </div>
        </div>
      )}
      {escaped && (
        <div className="escape-overlay" style={{background: 'rgba(0,0,0,0.6)'}}>
          <div style={{textAlign:'center'}}>
            <div style={{fontSize: 28, marginBottom: 8}}>🎉 Congratulations! 🎉</div>
            <div style={{fontSize: 16, opacity: 0.9}}>You escaped the vault!</div>
          </div>
        </div>
      )}
    </div>
  );
}
