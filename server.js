require("dotenv").config();

// ========== 1. SABİTLER ==========
const PLAYER_RADIUS = 0.6;
const WORLD_MIN = -95;
const WORLD_MAX = 95;
const SEED = 123456789; // sabit seed – böylece her sunucu başlangıcında aynı harita oluşur

// ========== 2. SEED'Lİ RASTGELE FONKSİYONU ==========
function seededRandom(seed) {
    let s = seed;
    return function() {
        s = (s * 1103515245 + 12345) & 0x7fffffff;
        return s / 0x7fffffff;
    };
}
const rnd = seededRandom(SEED);

// ========== 3. STATİK ENGELLERİ OLUŞTUR ==========
const staticObstacles = [];

// 3.1 Ağaçlar (300 adet – dairesel dağılım)
for (let i = 0; i < 300; i++) {
    const angle = rnd() * Math.PI * 2;
    const radius = 40 + rnd() * 60;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    staticObstacles.push({
        type: "tree",
        x: x,
        z: z,
        radius: 0.65
    });
}

// 3.2 Kayalar (100 adet – rastgele dağılım)
for (let i = 0; i < 100; i++) {
    const x = (rnd() - 0.5) * 180;
    const z = (rnd() - 0.5) * 180;
    const rad = 0.8 + rnd() * 0.6;
    staticObstacles.push({
        type: "rock",
        x: x,
        z: z,
        radius: rad
    });
}

// 3.3 Duvarlar / binalar (20 adet – dikdörtgen)
for (let i = 0; i < 20; i++) {
    const x = (rnd() - 0.5) * 150;
    const z = (rnd() - 0.5) * 150;
    const width = 2 + rnd() * 5;
    const depth = 1 + rnd() * 4;
    staticObstacles.push({
        type: "wall",
        x: x,
        z: z,
        width: width,
        depth: depth
    });
}

console.log(`Statik engeller oluşturuldu: ${staticObstacles.length} adet`);
