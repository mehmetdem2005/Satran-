# vendor/ — üçüncü taraf kaynak

Bu klasördeki kod **bize ait değil**; olduğu gibi depoya alınmış (vendored)
üst akış projeleridir. Değiştirmeyin: HermesForge'un kendi kodu `backend/`,
`frontend/` ve `android/` altında yaşar.

## hermes-agent

| | |
|---|---|
| Kaynak | https://github.com/NousResearch/hermes-agent |
| Lisans | MIT (bkz. `hermes-agent/LICENSE`) |
| Sürüm | 0.20.4 |
| Commit | `0a8cdec697ee5830a1df23c5e1f247fa1f2efefd` |
| Alındığı tarih | 2026-08-21T00:49:41-07:00 |
| Dal | main |

### Neden depoda?

HermesForge'un motoru. Önceden `scripts/install_hermes.sh` ile indiriliyordu;
artık kaynak doğrudan depoda, böylece:

- depoyu klonlayan herkes aynı Hermes sürümünü alır (üst akış `main` değişse bile)
- çevrimdışı kurulum mümkün
- hangi sürüme karşı geliştirildiği commit düzeyinde belli

### Neyin dışarıda bırakıldığı

Kurulum çıktıları depoya girmez (`.gitignore`):

- `hermes-agent/venv/` — sanal ortam (~186 MB, makineye özgü)
- `__pycache__/`, `*.pyc`, `node_modules/`

Bağımlılıkları kurmak için:

```bash
bash scripts/install_hermes.sh
```

Betik kaynağı depoda bulunca indirmeyi atlar, yalnızca sanal ortamı kurar.

### Güncelleme

```bash
bash scripts/update_hermes.sh          # üst akış main'i çeker, venv'i korur
```

Güncelledikten sonra bu dosyadaki commit/sürüm bilgisini de tazeleyin.
