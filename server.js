import express from 'express';
import { Server } from 'colyseus';
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

// Colyseus odası
class SatrancOdasi extends Room {
  onCreate(options) {
    this.setState(new OyunDurumu());
    this.maxClients = 100;

    this.onMessage("hareket", (client, data) => {
      const oyuncu = this.state.oyuncular.get(client.sessionId);
      if (oyuncu) {
        oyuncu.x += data.dx || 0;
        oyuncu.z += data.dz || 0;
      }
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
        } catch(e) { console.error(e); }

        if (hedef.can <= 0) {
          this.broadcast("oyuncu_oldu", { id: hedefId });
          this.state.oyuncular.delete(hedefId);
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
    switch(tip) {
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
