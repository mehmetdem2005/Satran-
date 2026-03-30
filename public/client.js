import * as THREE from 'three';
import { Client } from 'colyseus.js';

// --- Bağlantı ---
const client = new Client('ws://localhost:3000');
let room;
let playerMesh;
let otherPlayers = new Map();
let scene, camera, renderer;

// --- 3D Sahne ---
scene = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB);
scene.fog = new THREE.Fog(0x87CEEB, 100, 200);

camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Zemin
const groundMat = new THREE.MeshStandardMaterial({ color: 0x5c9e5e, roughness: 0.8 });
const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), groundMat);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -1;
ground.receiveShadow = true;
scene.add(ground);

// Işık
const ambientLight = new THREE.AmbientLight(0x404060);
scene.add(ambientLight);
const dirLight = new THREE.DirectionalLight(0xffffff, 1);
dirLight.position.set(10, 20, 5);
dirLight.castShadow = true;
dirLight.receiveShadow = false;
scene.add(dirLight);

// Rastgele ağaçlar (basit silindir + küre)
for (let i = 0; i < 300; i++) {
    const treeGroup = new THREE.Group();
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x8B5A2B });
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 1.2), trunkMat);
    trunk.position.y = -0.4;
    trunk.castShadow = true;
    const foliageMat = new THREE.MeshStandardMaterial({ color: 0x3c9e3c });
    const foliage = new THREE.Mesh(new THREE.ConeGeometry(0.7, 1.0, 6), foliageMat);
    foliage.position.y = 0.3;
    foliage.castShadow = true;
    treeGroup.add(trunk, foliage);
    const angle = Math.random() * Math.PI * 2;
    const radius = 40 + Math.random() * 60;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    treeGroup.position.set(x, -0.8, z);
    scene.add(treeGroup);
}

// Oyuncunun kendi karakteri (küp – sonra model eklenebilir)
playerMesh = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.2, 0.8), new THREE.MeshStandardMaterial({ color: 0xff6600 }));
playerMesh.castShadow = true;
playerMesh.receiveShadow = true;
scene.add(playerMesh);

// Kamera takip
camera.position.set(0, 6, 12);

// Diğer oyuncuları güncelle
function updateOtherPlayers(state) {
    // Yeni ekle
    for (let [id, oyuncu] of Object.entries(state.oyuncular)) {
        if (id === room.sessionId) continue;
        if (!otherPlayers.has(id)) {
            const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.2, 0.8), new THREE.MeshStandardMaterial({ color: 0x3399ff }));
            mesh.castShadow = true;
            scene.add(mesh);
            otherPlayers.set(id, mesh);
        }
        const mesh = otherPlayers.get(id);
        mesh.position.set(oyuncu.x, 0, oyuncu.z);
    }
    // Silinenler
    for (let [id, mesh] of otherPlayers.entries()) {
        if (!state.oyuncular[id]) {
            scene.remove(mesh);
            otherPlayers.delete(id);
        }
    }
}

// Oyuncu listesini güncelle (UI)
function updatePlayerList(state) {
    const listDiv = document.getElementById('oyuncuListesi');
    let html = '<strong>Oyuncular</strong><br>';
    for (let [id, oyuncu] of Object.entries(state.oyuncular)) {
        html += `${oyuncu.isim} (${oyuncu.tasTipi}) ❤️${oyuncu.can}<br>`;
    }
    listDiv.innerHTML = html;
}

// Odaya katıl
async function joinGame() {
    try {
        room = await client.joinOrCreate("satranc", {
            isim: "Oyuncu_" + Math.floor(Math.random() * 1000),
            tasTipi: ["piyon", "at", "fil", "kale", "vezir", "kral"][Math.floor(Math.random() * 6)]
        });
        console.log("Odaya girildi", room.sessionId);

        room.onStateChange((state) => {
            // Kendi bilgileri güncelle
            const me = state.oyuncular[room.sessionId];
            if (me) {
                document.getElementById('canbar').innerHTML = `❤️ Can: ${me.can}`;
                document.getElementById('tasTipi').innerHTML = `♟️ ${me.tasTipi.toUpperCase()}`;
                playerMesh.position.set(me.x, 0, me.z);
            }
            updateOtherPlayers(state);
            updatePlayerList(state);
        });

        room.onMessage("anlatici", (msg) => {
            document.getElementById('anlatici').innerHTML = `💬 Anlatıcı: ${msg.mesaj}`;
            setTimeout(() => {
                if (document.getElementById('anlatici').innerHTML === `💬 Anlatıcı: ${msg.mesaj}`)
                    document.getElementById('anlatici').innerHTML = `💬 Anlatıcı hazır...`;
            }, 5000);
        });

        room.onMessage("oyuncu_oldu", (msg) => {
            document.getElementById('anlatici').innerHTML = `💀 Bir oyuncu öldü! ${msg.id}`;
        });

        // Hareket butonları
        let hareketAktif = { dx: 0, dz: 0 };
        let interval = setInterval(() => {
            if (room && (hareketAktif.dx !== 0 || hareketAktif.dz !== 0)) {
                room.send("hareket", hareketAktif);
            }
        }, 100);

        const btnUp = document.getElementById('up');
        const btnDown = document.getElementById('down');
        const btnLeft = document.getElementById('left');
        const btnRight = document.getElementById('right');

        function startMove(dx, dz) {
            hareketAktif.dx = dx;
            hareketAktif.dz = dz;
        }
        function stopMove() {
            hareketAktif.dx = 0;
            hareketAktif.dz = 0;
            room.send("hareket", { dx: 0, dz: 0 });
        }

        btnUp.addEventListener('touchstart', (e) => { e.preventDefault(); startMove(0, -0.15); });
        btnUp.addEventListener('touchend', stopMove);
        btnDown.addEventListener('touchstart', (e) => { e.preventDefault(); startMove(0, 0.15); });
        btnDown.addEventListener('touchend', stopMove);
        btnLeft.addEventListener('touchstart', (e) => { e.preventDefault(); startMove(-0.15, 0); });
        btnLeft.addEventListener('touchend', stopMove);
        btnRight.addEventListener('touchstart', (e) => { e.preventDefault(); startMove(0.15, 0); });
        btnRight.addEventListener('touchend', stopMove);

        // Saldırı butonu – en yakın oyuncuyu bul
        document.getElementById('attack').addEventListener('click', () => {
            let closestId = null;
            let minDist = 5;
            const mePos = playerMesh.position;
            for (let [id, mesh] of otherPlayers.entries()) {
                const dist = mePos.distanceTo(mesh.position);
                if (dist < minDist) {
                    minDist = dist;
                    closestId = id;
                }
            }
            if (closestId) {
                room.send("vurus", closestId);
                document.getElementById('anlatici').innerHTML = `⚔️ Saldırı yaptın!`;
            } else {
                document.getElementById('anlatici').innerHTML = `💨 Yakında kimse yok!`;
            }
        });

    } catch (err) {
        console.error(err);
        document.getElementById('anlatici').innerHTML = `❌ Sunucuya bağlanamadı!`;
    }
}

// Animasyon döngüsü
function animate() {
    requestAnimationFrame(animate);
    if (playerMesh && camera) {
        // Kamera takip
        camera.position.x = playerMesh.position.x;
        camera.position.z = playerMesh.position.z + 10;
        camera.position.y = 6;
        camera.lookAt(playerMesh.position);
    }
    renderer.render(scene, camera);
}
animate();

joinGame();
