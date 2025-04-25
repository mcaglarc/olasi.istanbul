# deprem-simulator

Deprem Etki Simülatörü

İstanbul için deprem şiddeti ve zemin etkisi görselleştirme aracı. Farklı büyüklük ve merkez üssü senaryolarında, ilçelere göre deprem şiddeti ve zemin amplifikasyonu haritası sunar. Fay hatları, zemin etkisi ve MMI (Modified Mercalli Intensity) seviyeleriyle deprem etkilerini interaktif olarak keşfedin.

- İstanbul ilçelerine göre deprem şiddeti simülasyonu
- Zemin amplifikasyonu ve fay hattı görselleştirmesi
- Açık kaynak, eğitim ve farkındalık amaçlı

Demo: https://olasi.istanbul

## Özellikler
- İstanbul üzerinde merkez üssü ve büyüklük seçimiyle deprem şiddeti simülasyonu
- Zemin amplifikasyonu ve ilçelere göre şiddet haritası
- Açık kaynak kodlu, eğitim ve farkındalık amaçlı

## Kurulum ve Kullanım

1. Bu repoyu klonlayın:
   ```sh
   git clone https://github.com/mcaglarc/deprem-simulator.git
   ```
2. Dosya yapısı:
   - `public/` — HTML dosyaları
   - `js/` — JavaScript dosyaları
   - `data/` — JSON ve veri dosyaları

3. Lokal olarak çalıştırmak için:
   - `public` klasörünü bir statik sunucuda açın (örn. VSCode Live Server, Python HTTP server, veya Azure Static Web Apps)


## Referanslar
- [İstanbul İli Mikrobölgeleme Projeleri (İBB)](https://depremzemin.ibb.istanbul/tr/istanbul-ili-mikrobolgeleme-projeleri)
- [Yenilenmiş Diri Fay Haritaları (MTA)](https://www.mta.gov.tr/v3.0/hizmetler/yenilenmis-diri-fay-haritalari)

## Lisans
MIT
