const express = require("express");
const http = require("http");
const { Server, Room } = require("colyseus");
const { Schema, MapSchema, type } = require("@colyseus/schema");

// ========== 1. SUNUCU KURULUMU ==========
const app = express();
app.use(express.static("public"));
const httpServer = http.createServer(app);

// ========== 2. SABITLER ==========
const PLAYER_RADIUS = 1.2;
const WORLD_MIN = -50;
const WORLD_MAX = 50;

// ========== 3. STATİK ENGELLER ==========
const staticObstacles = [
    // Ağaçlar
    { type: "tree", x: 10,  z: 10,  radius: 1.2 },
    { type: "tree", x: -15, z: 8,   radius: 1.2 },
    { type: "tree", x: 20,  z: -20, radius: 1.2 },
    { type: "tree", x: -25, z: -15, radius: 1.2 },
    { type: "tree", x: 5,   z: -30, radius: 1.2 },
    { type: "tree", x: -10, z: 35,  radius: 1.2 },
    { type: "tree", x: 30,  z: 5,   radius: 1.2 },
    { type: "tree", x: -35, z: 20,  radius: 1.2 },
    { type: "tree", x: 15,  z: 40,  radius: 1.2 },
    { type: "tree", x: -40, z: -10, radius: 1.2 },
    // Kayalar
    { type: "rock", x: -5,  z: 20,  radius: 1.5 },
    { type: "rock", x: 25,  z: -10, radius: 1.8 },
    { type: "rock", x: -20, z: -30, radius: 1.5 },
    { type: "rock", x: 35,  z: 30,  radius: 2.0 },
    { type: "rock", x: -30, z: 5,   radius: 1.5 },
    // Duvarlar (AABB)
    { type: "wall", x: 0,   z: 0,   width: 8, depth: 1.5 },
    { type: "wall", x: -20, z: -20, width: 1.5, depth: 10 },
    { type: "wall", x: 20,  z: 20,  width: 10, depth: 1.5 },
    { type: "wall", x: 10,  z: -40, width: 6, depth: 1.5 },
    { type: "wall", x: -30, z: 30,  width: 1.5, depth: 8 },
];

// ========== 4. ÇARPŞMA FONKSİYONLARI ==========

// 4.1 Daire-daire çarpışması
function circleCollision(px, pz, pr, cx, cz, cr) {
    const dx = px - cx;
    const dz = pz - cz;
    const distSq = dx * dx + dz * dz;
    const minDist = pr + cr;
    return distSq < minDist * minDist;
}

// 4.2 Dikdörtgen (AABB) – daire çarpışması
function rectCircleCollision(px, pz, pr, rx, rz, rw, rd) {
    const halfW = rw / 2;
    const halfD = rd / 2;
    const left = rx - halfW;
    const right = rx + halfW;
    const top = rz - halfD;
    const bottom = rz + halfD;

    const closestX = Math.max(left, Math.min(px, right));
    const closestZ = Math.max(top, Math.min(pz, bottom));
    const dx = px - closestX;
    const dz = pz - closestZ;
    const distSq = dx * dx + dz * dz;
    return distSq < pr * pr;
}

// 4.3 Ana çarpışma kontrolü (statik + dinamik + sınır)
function hasCollision(oyuncuId, x, z, radius, state) {
    // Statik engeller
    for (let obs of staticObstacles) {
        if (obs.type === "wall") {
            if (rectCircleCollision(x, z, radius, obs.x, obs.z, obs.width, obs.depth))
                return true;
        } else {
            if (circleCollision(x, z, radius, obs.x, obs.z, obs.radius))
                return true;
        }
    }
    // Diğer oyuncular
    for (let [id, other] of state.oyuncular.entries()) {
        if (id === oyuncuId) continue;
        if (circleCollision(x, z, radius, other.x, other.z, PLAYER_RADIUS))
            return true;
    }
    // Dünya sınırları
    if (x < WORLD_MIN || x > WORLD_MAX || z < WORLD_MIN || z > WORLD_MAX)
        return true;

    return false;
}

// 4.4 Kayma (slide) algoritması
function resolveSlide(oyuncuId, oldX, oldZ, newX, newZ, radius, state) {
    let finalX = oldX, finalZ = oldZ;

    // Önce sadece X ekseninde dene
    if (!hasCollision(oyuncuId, newX, oldZ, radius, state)) {
        finalX = newX;
    }

    // Sonra sadece Z ekseninde dene (mevcut finalX ile)
    if (!hasCollision(oyuncuId, finalX, newZ, radius, state)) {
        finalZ = newZ;
    }

    // Hâlâ çarpışma varsa eski konuma dön
    if (hasCollision(oyuncuId, finalX, finalZ, radius, state)) {
        return { x: oldX, z: oldZ };
    }

    return { x: finalX, z: finalZ };
}

// ========== 5. SCHEMA TANIMLARI ==========
class Oyuncu extends Schema {}
type("string")(Oyuncu.prototype, "id");
type("string")(Oyuncu.prototype, "isim");
type("string")(Oyuncu.prototype, "tasTipi");
type("number")(Oyuncu.prototype, "can");
type("number")(Oyuncu.prototype, "x");
type("number")(Oyuncu.prototype, "z");
type("number")(Oyuncu.prototype, "takim");

class OyunDurumu extends Schema {}
type({ map: Oyuncu })(OyunDurumu.prototype, "oyuncular");

// ========== 6. OYUN ODASI ==========
class OyunOdasi extends Room {
    tasCan(tip) {
        const canlar = {
            piyon: 2,
            kale: 5,
            fil: 4,
            at: 4,
            vezir: 8,
            sah: 10,
        };
        return canlar[tip] || 2;
    }

    onCreate() {
        const durum = new OyunDurumu();
        durum.oyuncular = new MapSchema();
        this.setState(durum);
    }

    onJoin(client, options) {
        const yeni = new Oyuncu();
        yeni.id = client.sessionId;
        yeni.isim = options.isim || "İsimsiz";
        yeni.tasTipi = options.tasTipi || "piyon";
        yeni.can = this.tasCan(yeni.tasTipi);
        yeni.x = (Math.random() - 0.5) * 80;
        yeni.z = (Math.random() - 0.5) * 80;
        yeni.takim = options.takim || Math.floor(Math.random() * 4);
        this.state.oyuncular.set(client.sessionId, yeni);

        // Engelleri bu oyuncuya gönder
        client.send("engeller", staticObstacles);
    }

    onLeave(client) {
        this.state.oyuncular.delete(client.sessionId);
    }

    onMessage(type, handler) {
        super.onMessage(type, handler);
    }
}

// ========== 7. MESAJ İŞLEYİCİLERİ ==========
// Not: onMessage'ı onCreate içinde tanımlamak Colyseus'un önerilen yoludur.
// Yukarıdaki OyunOdasi sınıfını genişletiyoruz:

OyunOdasi.prototype.onCreate = function () {
    const durum = new OyunDurumu();
    durum.oyuncular = new MapSchema();
    this.setState(durum);

    this.onMessage("hareket", (client, data) => {
        const oyuncu = this.state.oyuncular.get(client.sessionId);
        if (!oyuncu) return;

        let dx = data.dx || 0;
        let dz = data.dz || 0;

        // Maksimum adım boyutu (hız sınırlaması)
        const maxStep = 0.25;
        dx = Math.min(maxStep, Math.max(-maxStep, dx));
        dz = Math.min(maxStep, Math.max(-maxStep, dz));

        // Aday yeni konum
        const newX = oyuncu.x + dx;
        const newZ = oyuncu.z + dz;

        // Çarpışma ve kaymayı uygula
        const { x: finalX, z: finalZ } = resolveSlide(
            client.sessionId,
            oyuncu.x, oyuncu.z,
            newX, newZ,
            PLAYER_RADIUS,
            this.state
        );

        oyuncu.x = finalX;
        oyuncu.z = finalZ;
    });
};

// ========== 8. SUNUCUYU BAŞLAT ==========
const gameServer = new Server({ server: httpServer });
gameServer.define("oyun", OyunOdasi);

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
    console.log(`Sunucu http://localhost:${PORT} adresinde çalışıyor`);
});
