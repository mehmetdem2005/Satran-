// ========== MODEL OLUŞTURMA FONKSİYONLARI ==========

function createTreeModel(x, z) {
    const group = new THREE.Group();
    const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.5, 0.7, 1.2),
        new THREE.MeshStandardMaterial({ color: 0x8B5A2B })
    );
    trunk.position.y = -0.4;
    trunk.castShadow = true;
    const foliage = new THREE.Mesh(
        new THREE.ConeGeometry(0.7, 1.0, 6),
        new THREE.MeshStandardMaterial({ color: 0x3c9e3c })
    );
    foliage.position.y = 0.3;
    foliage.castShadow = true;
    group.add(trunk, foliage);
    group.position.set(x, -0.8, z);
    return group;
}

function createRockModel(x, z, radius) {
    const rock = new THREE.Mesh(
        new THREE.DodecahedronGeometry(radius * 0.8),
        new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.9 })
    );
    rock.position.set(x, -0.5, z);
    rock.scale.set(1, 0.6, 1);
    rock.castShadow = true;
    return rock;
}

function createWallModel(x, z, width, depth) {
    const wall = new THREE.Mesh(
        new THREE.BoxGeometry(width, 1.5, depth),
        new THREE.MeshStandardMaterial({ color: 0xaa8866 })
    );
    wall.position.set(x, -0.2, z);
    wall.castShadow = true;
    wall.receiveShadow = true;
    return wall;
}

// ========== SAHNE KURULUMU ==========
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
scene.fog = new THREE.Fog(0x87ceeb, 60, 120);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(0, 15, 20);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Işıklandırma
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);
const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
dirLight.position.set(30, 50, 20);
dirLight.castShadow = true;
scene.add(dirLight);

// Zemin
const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(100, 100),
    new THREE.MeshStandardMaterial({ color: 0x4a7c3f })
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -1;
ground.receiveShadow = true;
scene.add(ground);

// ========== OYUNCU MESHLERİ ==========
const tasTipleriRenk = {
    piyon:  0xffffff,
    kale:   0xaaaaff,
    fil:    0xaaffaa,
    at:     0xffaaaa,
    vezir:  0xffdd00,
    sah:    0xff8800,
};

const takimRenkleri = [0x3355ff, 0xff3333, 0x33cc33, 0xffaa00];

function createPlayerMesh(tasTipi, takim) {
    const group = new THREE.Group();
    const bodyColor = takimRenkleri[takim] || 0xffffff;
    const body = new THREE.Mesh(
        new THREE.CylinderGeometry(0.5, 0.7, 1.4, 8),
        new THREE.MeshStandardMaterial({ color: bodyColor })
    );
    body.castShadow = true;
    const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.45, 8, 8),
        new THREE.MeshStandardMaterial({ color: tasTipleriRenk[tasTipi] || 0xffffff })
    );
    head.position.y = 1.0;
    head.castShadow = true;
    group.add(body, head);
    return group;
}

// ========== KLAVYE DURUMU ==========
const tuslar = {};
window.addEventListener("keydown", e => { tuslar[e.code] = true; });
window.addEventListener("keyup",   e => { tuslar[e.code] = false; });

// ========== OYUN DEĞİŞKENLERİ ==========
let room = null;
let benimId = null;
let oyuncuMeshleri = {};

// ========== OYUNA KATILMA ==========
function joinGame() {
    const isim = document.getElementById("isim").value.trim() || "İsimsiz";
    const tasTipi = document.getElementById("tasTipi").value;

    const client = new Colyseus.Client(`ws://${location.hostname}:3000`);
    client.joinOrCreate("oyun", { isim, tasTipi }).then(r => {
        room = r;
        benimId = room.sessionId;

        document.getElementById("ui").style.display = "none";
        document.getElementById("hud").style.display = "block";
        document.getElementById("hud-isim").textContent = `👤 ${isim}`;

        // Durum değişikliklerini izle
        room.onStateChange(state => {
            // Yeni oyuncuları ekle
            state.oyuncular.forEach((oyuncu, id) => {
                if (!oyuncuMeshleri[id]) {
                    const mesh = createPlayerMesh(oyuncu.tasTipi, oyuncu.takim);
                    scene.add(mesh);
                    oyuncuMeshleri[id] = mesh;
                }
                const mesh = oyuncuMeshleri[id];
                mesh.position.set(oyuncu.x, 0, oyuncu.z);

                if (id === benimId) {
                    document.getElementById("hud-can").textContent = `❤️ Can: ${oyuncu.can}`;
                    document.getElementById("hud-takim").textContent = `🏳️ Takım: ${oyuncu.takim + 1}`;
                }
            });

            // Ayrılan oyuncuların meshlerini kaldır
            for (const id in oyuncuMeshleri) {
                if (!state.oyuncular.has(id)) {
                    scene.remove(oyuncuMeshleri[id]);
                    delete oyuncuMeshleri[id];
                }
            }
        });

        // Engelleri al ve sahneye ekle
        room.onMessage("engeller", (obstacles) => {
            obstacles.forEach(obs => {
                if (obs.type === "tree") {
                    const tree = createTreeModel(obs.x, obs.z);
                    scene.add(tree);
                } else if (obs.type === "rock") {
                    const rock = createRockModel(obs.x, obs.z, obs.radius);
                    scene.add(rock);
                } else if (obs.type === "wall") {
                    const wall = createWallModel(obs.x, obs.z, obs.width, obs.depth);
                    scene.add(wall);
                }
            });
        });

    }).catch(err => {
        console.error("Bağlantı hatası:", err);
        alert("Sunucuya bağlanılamadı. Sunucunun çalıştığından emin olun.");
    });
}

document.getElementById("basla").addEventListener("click", joinGame);

// ========== ANA DÖNGÜ ==========
const HARE_HIZI = 0.2;

function animate() {
    requestAnimationFrame(animate);

    if (room && benimId) {
        let dx = 0, dz = 0;
        if (tuslar["ArrowUp"]    || tuslar["KeyW"]) dz -= HARE_HIZI;
        if (tuslar["ArrowDown"]  || tuslar["KeyS"]) dz += HARE_HIZI;
        if (tuslar["ArrowLeft"]  || tuslar["KeyA"]) dx -= HARE_HIZI;
        if (tuslar["ArrowRight"] || tuslar["KeyD"]) dx += HARE_HIZI;

        if (dx !== 0 || dz !== 0) {
            room.send("hareket", { dx, dz });
        }

        // Kamera oyuncuyu takip etsin
        const benimMesh = oyuncuMeshleri[benimId];
        if (benimMesh) {
            camera.position.x = benimMesh.position.x;
            camera.position.z = benimMesh.position.z + 18;
            camera.position.y = 14;
            camera.lookAt(benimMesh.position.x, 0, benimMesh.position.z);
        }
    }

    renderer.render(scene, camera);
}

animate();
