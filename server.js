import express from 'express';
import { Server, Room } from 'colyseus';
import { createServer } from 'http';
import { monitor } from '@colyseus/monitor';
import cors from 'cors';
import dotenv from 'dotenv';
import Groq from 'groq-sdk';
import { Schema, type, MapSchema } from '@colyseus/schema';

dotenv.config();
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const server = createServer(app);
const gameServer = new Server({ server });

// ========== SABİTLER ==========
const PLAYER_RADIUS = 0.6;
const WORLD_MIN = -95;
const WORLD_MAX = 95;
const SEED = 123456789; // sabit seed – böylece her sunucu başlangıcında aynı harita oluşur

// ========== SEED'Lİ RASTGELE FONKSİYONU ==========
function seededRandom(seed) {
    let s = seed;
    return function() {
        s = (s * 1103515245 + 12345) & 0x7fffffff;
        return s / 0x7fffffff;
    };
}
const rnd = seededRandom(SEED);

// ========== STATİK ENGELLERİ OLUŞTUR ==========
const staticObstacles = [];

// Ağaçlar (300 adet – dairesel dağılım)
for (let i = 0; i < 300; i++) {
    const angle = rnd() * Math.PI * 2;
    const radius = 40 + rnd() * 60;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    staticObstacles.push({ type: "tree", x, z, radius: 0.65 });
}

// Kayalar (100 adet – rastgele dağılım)
for (let i = 0; i < 100; i++) {
    const x = (rnd() - 0.5) * 180;
    const z = (rnd() - 0.5) * 180;
    const rad = 0.8 + rnd() * 0.6;
    staticObstacles.push({ type: "rock", x, z, radius: rad });
}

// Duvarlar / binalar (20 adet – dikdörtgen)
for (let i = 0; i < 20; i++) {
    const x = (rnd() - 0.5) * 150;
    const z = (rnd() - 0.5) * 150;
    const width = 2 + rnd() * 5;
    const depth = 1 + rnd() * 4;
    staticObstacles.push({ type: "wall", x, z, width, depth });
}

console.log(`Statik engeller oluşturuldu: ${staticObstacles.length} adet`);

// ========== ÇARPIŞMA: KAYMA ALGORİTMASI ==========
function resolveSlide(sessionId, cx, cz, nx, nz, playerRadius, state) {
    let x = nx;
    let z = nz;

    for (const obs of staticObstacles) {
        if (obs.type === "tree" || obs.type === "rock") {
            // Dairesel engel ile çarpışma
            const minDist = playerRadius + obs.radius;
            const dx = x - obs.x;
            const dz = z - obs.z;
            const dist = Math.sqrt(dx * dx + dz * dz);
            if (dist < minDist && dist > 0) {
                const nx2 = dx / dist;
                const nz2 = dz / dist;
                // Oyuncuyu engelden dışarı it
                x = obs.x + nx2 * minDist;
                z = obs.z + nz2 * minDist;
            } else if (dist === 0) {
                // Tam üst üste gelme (nadir) – hafif kaydır
                x = obs.x + minDist;
            }
        } else if (obs.type === "wall") {
            // Dikdörtgen engel ile AABB çarpışması (yarıçap genişletilmiş kutu)
            const halfW = obs.width / 2 + playerRadius;
            const halfD = obs.depth / 2 + playerRadius;
            const dx = x - obs.x;
            const dz = z - obs.z;
            if (Math.abs(dx) < halfW && Math.abs(dz) < halfD) {
                // En yakın kenardan it
                const overlapX = halfW - Math.abs(dx);
                const overlapZ = halfD - Math.abs(dz);
                if (overlapX < overlapZ) {
                    x += dx >= 0 ? overlapX : -overlapX;
                } else {
                    z += dz >= 0 ? overlapZ : -overlapZ;
                }
            }
        }
    }

    // Dünya sınırları
    x = Math.min(WORLD_MAX, Math.max(WORLD_MIN, x));
    z = Math.min(WORLD_MAX, Math.max(WORLD_MIN, z));

    return { x, z };
}

// ========== OYUNCU İTME MEKANİĞİ ==========
// İtme kuvveti ve mesafe hesaplama
function pushPlayers(oyuncu1, oyuncu2) {
    const dx = oyuncu2.x - oyuncu1.x;
    const dz = oyuncu2.z - oyuncu1.z;
    const minDist = PLAYER_RADIUS * 2;
    // Hızlı uzaklık testi (sqrt'ten kaçın)
    if (dx * dx + dz * dz >= minDist * minDist) return;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < minDist) {
        const overlap = minDist - dist;
        const angle = Math.atan2(dz, dx);
        const pushX = Math.cos(angle) * overlap / 2;
        const pushZ = Math.sin(angle) * overlap / 2;

        oyuncu1.x -= pushX;
        oyuncu1.z -= pushZ;
        oyuncu2.x += pushX;
        oyuncu2.z += pushZ;

        // Dünya sınırları kontrolü (sınırlardan dışarı itme)
        oyuncu1.x = Math.min(WORLD_MAX, Math.max(WORLD_MIN, oyuncu1.x));
        oyuncu1.z = Math.min(WORLD_MAX, Math.max(WORLD_MIN, oyuncu1.z));
        oyuncu2.x = Math.min(WORLD_MAX, Math.max(WORLD_MIN, oyuncu2.x));
        oyuncu2.z = Math.min(WORLD_MAX, Math.max(WORLD_MIN, oyuncu2.z));
    }
}

// ========== ŞEMALAR ==========
// Oyuncu şeması
class Oyuncu extends Schema {
    @type("string") id = "";
    @type("string") isim = "";
    @type("number") x = 0;
    @type("number") z = 0;
    @type("number") can = 100;
    @type("string") tasTipi = "piyon";
    @type("number") takim = 0;
}

// Oyun durumu şeması
class OyunDurumu extends Schema {
    @type({ map: Oyuncu }) oyuncular = new MapSchema();
}

// ========== COLYSEUS ODASI ==========
class SatrancOdasi extends Room {
    onCreate(options) {
        this.setState(new OyunDurumu());
        this.maxClients = 100;

        this.onMessage("hareket", (client, data) => {
            const oyuncu = this.state.oyuncular.get(client.sessionId);
            if (!oyuncu) return;

            let dx = data.dx || 0;
            let dz = data.dz || 0;
            const maxStep = 0.25;
            dx = Math.min(maxStep, Math.max(-maxStep, dx));
            dz = Math.min(maxStep, Math.max(-maxStep, dz));

            let newX = oyuncu.x + dx;
            let newZ = oyuncu.z + dz;

            // Kayma algoritması ile çarpışmayı çöz
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

        this.onMessage("vurus", async (client, hedefId) => {
            const saldiran = this.state.oyuncular.get(client.sessionId);
            const hedef = this.state.oyuncular.get(hedefId);
            if (saldiran && hedef && saldiran.takim !== hedef.takim) {
                let hasar = 10;
                if (saldiran.tasTipi === "vezir") hasar = 30;
                if (saldiran.tasTipi === "kral") hasar = 50;
                hedef.can -= hasar;

                // Groq anlatıcı yorumu
                try {
                    const yorum = await groq.chat.completions.create({
                        model: "openai/gpt-oss-120b",
                        messages: [{ role: "user", content: `Oyuncu ${saldiran.isim} (${saldiran.tasTipi}) adlı oyuncuya ${hasar} hasar vurdu. Kısa, komik ve küfürbaz bir yorum yap (anneye sövme).` }],
                        temperature: 0.9,
                        max_tokens: 60,
                    });
                    this.broadcast("anlatici", { mesaj: yorum.choices[0].message.content });
                } catch (e) { console.error(e); }

                if (hedef.can <= 0) {
                    this.broadcast("oyuncu_oldu", { id: hedefId });
                    this.state.oyuncular.delete(hedefId);
                }
            }
        });

        // Her sunucu tick'inde tüm oyuncu çiftlerini kontrol ederek birbirini it
        this.onUpdate(() => {
            const oyuncular = Array.from(this.state.oyuncular.values());
            for (let i = 0; i < oyuncular.length; i++) {
                for (let j = i + 1; j < oyuncular.length; j++) {
                    pushPlayers(oyuncular[i], oyuncular[j]);
                }
            }
        });
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
    }

    onLeave(client) {
        this.state.oyuncular.delete(client.sessionId);
    }

    tasCan(tip) {
        switch (tip) {
            case "piyon": return 100;
            case "at": case "fil": case "kale": return 200;
            case "vezir": return 300;
            case "kral": return 500;
            default: return 100;
        }
    }
}

gameServer.define("satranc", SatrancOdasi);
app.use("/colyseus", monitor());

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Sunucu çalışıyor: http://localhost:${PORT}`));
