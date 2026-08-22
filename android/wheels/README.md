# Android için elde üretilen wheel'ler

Hermes'i APK'nın içinde çalıştırmak için gereken iki paketin Android yapısı
PyPI'da da Chaquopy deposunda da yok. İkisini de burada üretiyoruz.

## `pydantic_core`

Rust ile yazılmış doğrulama motoru. Chaquopy deposunda yalnızca `0.0.1` yer
tutucusu var; onsuz pip `pydantic 1.10`'a düşüyor ve Hermes, openai SDK'sı ve
FastAPI'nin üçü de pydantic 2 istediği için hiçbiri kurulamıyor.

Android NDK ile çapraz derlendi:

```bash
rustup target add aarch64-linux-android armv7-linux-androideabi
export PYO3_CROSS=1
export PYO3_CROSS_PYTHON_VERSION=3.11
export PYO3_CROSS_LIB_DIR=<Chaquopy target zip'inden çıkan jniLibs/<abi>>
export _PYTHON_SYSCONFIGDATA_NAME=_sysconfigdata__linux_
cargo build --release --target aarch64-linux-android
```

`PYO3_CROSS_LIB_DIR` içine Chaquopy'nin kendi `_sysconfigdata__linux_` dosyası
kopyalanır (stdlib zip'inden çıkar). 32-bit hedefte `SIZEOF_VOID_P` gibi
alanlar 4'e çekilmelidir, yoksa pyo3 "target architecture does not match"
hatası verir.

Çıkan `.so` `scripts/` altındaki paketleyiciyle Chaquopy'nin ad biçimine
uygun bir wheel'e konur:

    pydantic_core-<sürüm>-0-cp311-cp311-android_24_<abi>.whl

## `jiter`

openai SDK'sı 2.x jiter'i **tek bir yerde** kullanıyor:

    openai/lib/streaming/chat/_completions.py:  from jiter import from_json

Yaptığı iş "JSON metnini Python nesnesine çevir". Rust yapısının Android
sürümü yok; yerine standart kütüphanenin `json` modülüne dayanan saf Python
bir gölge paket koyduk. Ölçüldü: gerçek Hermes gateway'i bu gölge paketle
tam bir ajan turu tamamlıyor.

## Gerekmediği ölçülenler

`uvloop`, `httptools`, `watchfiles` ve `nemo_relay` olmadan da gateway
açılıyor ve çalışıyor; hepsinin saf Python yedeği var ya da tembel yükleniyor.
