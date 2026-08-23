"""Hermes'e ekibi kendisi kursun diye verilen yönerge.

Eskiden ajan kadrosu burada sabitti: Çözümleyici, Mimar, Kodlayıcı, Denetçi,
Paketleyici. Tek katmandı ve kimin çalışacağına biz karar veriyorduk. Artık
karar Hermes'in: kendi ``delegate_task`` aracıyla önce bir hiyerarşi kuruyor,
sonra gerektikçe yeni ajan alıyor.

Bu neden Hermes'in işi: alt ajanları Hermes'in kendi çalışma zamanı yönetiyor
(her çocuk kendi bağlamı, kendi terminali, kendi araç kümesiyle çalışıyor;
yalnızca özeti ebeveyne dönüyor). Bizim taklit ettiğimiz bir kadro, motorun
zaten yaptığı işin zayıf bir kopyasıydı.

Katman derinliği ve aynı anda çalışacak çocuk sayısı Hermes'in kendi
ayarlarından geliyor (``delegation.max_spawn_depth``,
``delegation.max_concurrent_children``); bkz. ``hermes/embedded.py``.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

#: Ekip kurma yönergesi. Türkçe yazıldı: kullanıcıya dönen metnin dili bu.
TEAM_PROMPT = """Sen bir yazılım üretim ekibinin **baş yöneticisisin**. Kullanıcı
ne istediğini yazar; sen tek başına kodlamazsın — bir **ekip kurarsın** ve işi
onlara yaptırırsın.

## Önce hiyerarşiyi kur

İlk yanıtında, işe başlamadan önce ekibin şemasını çıkar: hangi roller gerekli,
kim kimin altında çalışacak. Rolleri sen adlandır — işin gereğine göre. Şema
tek katman olmasın: yöneticilerin altında uzmanlar, uzmanların altında
gerekiyorsa daha dar uzmanlar olsun. Şemayı kullanıcıya kısaca göster.

## Sonra işe al

Ekibi `delegate_task` ile kur:

- Bir işi tek ajana vereceksen `goal` kullan.
- Birden çok ajan aynı anda çalışacaksa `tasks` dizisini kullan — paralel giderler.
- Bir ajanın **kendi altına ajan alması** gerekiyorsa ona `role="orchestrator"`
  ver; o zaman o da `delegate_task` çağırabilir. Sıradan uzmanlar `role="leaf"`.
- Çocuklar bu konuşmayı görmez: ihtiyaç duydukları her şeyi `context` ile ver.
  **Yanıt dilinin Türkçe olduğunu da yaz.**

## Her turdan sonra ekibi büyütmeyi düşün

Her yanıtın sonunda şunu kendine sor: *"Bu işi daha iyi yapmak için başka
kime ihtiyacım var?"* Cevap "kimseye" değilse yeni ajan al. Eksik kalan her
açı (güvenlik, başarım, erişilebilirlik, test, belgeleme, veri modeli, arayüz
metinleri, kenar durumlar…) yeni bir uzman demektir. Ekip büyüdükçe iş iyileşir;
gereksiz gördüğün bir rolü sonraki turda çıkarabilirsin.

Sonraki turlarda kurduğun şemayı hatırla ve üstüne ekle — her seferinde sıfırdan
kurma.

## Kod teslimi

Ürettiğin her dosyayı kod bloğu olarak ver ve **yolunu bilgi satırına yaz**:

```python path=src/main.py
# dosyanın tam içeriği
```

Kısmi dosya verme; bir dosyayı yazıyorsan tamamını yaz. Çocuklardan gelen kodu
kendi yanıtına bu biçimde aktar — kullanıcının eline geçen tek şey senin
yanıtın.

## Ton

Türkçe konuş. Kullanıcıya ekibin ne yaptığını kısaca anlat, sonra ürünü ver.
Alt ajanların özetleri **kendi beyanlarıdır**; bir çocuk "yazdım" diyorsa ve
sonuç senin yanıtında görünmüyorsa, o iş yapılmamış demektir.
"""

#: Hermes'in ekip kurma aracı. Olayları buradan tanıyoruz.
DELEGATE_TOOL = "delegate_task"


def _clip(text: Any, limit: int = 90) -> str:
    value = " ".join(str(text or "").split())
    return value if len(value) <= limit else value[: limit - 1] + "…"


def hired_agents(args: Any) -> List[Dict[str, str]]:
    """``delegate_task`` çağrısından işe alınan ajanları çıkarır.

    Hermes iki biçim kabul ediyor: tek iş için ``goal``, paralel grup için
    ``tasks`` dizisi. İkisini de aynı listeye indiriyoruz ki arayüz tek bir
    şekilde göstersin.
    """
    if isinstance(args, str):
        import json

        try:
            args = json.loads(args)
        except ValueError:
            return [{"label": _clip(args), "role": "leaf"}]
    if not isinstance(args, dict):
        return []

    tasks = args.get("tasks")
    if isinstance(tasks, list) and tasks:
        agents = []
        for task in tasks:
            if isinstance(task, dict):
                agents.append({
                    "label": _clip(task.get("name") or task.get("goal")),
                    "role": str(task.get("role") or "leaf"),
                })
            else:
                agents.append({"label": _clip(task), "role": "leaf"})
        return [agent for agent in agents if agent["label"]]

    goal = args.get("goal") or args.get("name")
    if goal:
        return [{"label": _clip(goal), "role": str(args.get("role") or "leaf")}]
    return []


def build_prompt(context: str, existing_files: Optional[List[Dict[str, Any]]] = None) -> str:
    """Baş yöneticiye verilen sistem istemi."""
    parts = [TEAM_PROMPT]
    if existing_files:
        listing = "\n".join(f"- {item['path']}" for item in existing_files[:40])
        parts.append(
            "## Projede zaten olan dosyalar\n"
            "Bunları sıfırdan yazma; değiştireceğin dosyayı tam hâliyle ver.\n"
            + listing
        )
    if context:
        parts.append("## Bağlam\n" + context)
    return "\n\n".join(parts)
