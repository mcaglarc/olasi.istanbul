import { faultSegments } from "./coordinates.js";
import { districtAmpl } from "./districtAmpl_data.js";

const React = window.React;
const { createRoot } = window.ReactDOM;
const { useEffect, useRef, useState } = React;
const e = React.createElement;

const MAP_CENTER = [41.05, 28.95];
const DEFAULT_EPICENTER = [40.826944, 28.9675];
const DEFAULT_MAGNITUDE = 7.2;
const GRID_STEP = 0.01;
const REDRAW_DEBOUNCE_MS = 260;
const MMI_LEVELS = [4, 5, 6, 7, 8, 9];
const BASE_RADII = { 4: 120000, 5: 100000, 6: 80000, 7: 60000, 8: 40000, 9: 20000 };
const ADSENSE_CLIENT = "ca-pub-9036855632049616";
const ADSENSE_SLOT = "";
const MMI_COLORS = {
  1: "#dbe9ed",
  2: "#c6dfd9",
  3: "#aad0b8",
  4: "#7dbf73",
  5: "#abd465",
  6: "#e2da5b",
  7: "#f1b14e",
  8: "#df7f3d",
  9: "#ca4b3f",
};
const MMI_INFO = {
  9: "Aşırı şiddetli sarsıntı. Yapısal çökme ve yaygın yıkım beklenebilir.",
  8: "Ciddi sarsıntı. Binalarda ağır hasar ve taşıyıcı sistemlerde zorlanma görülebilir.",
  7: "Çok güçlü sarsıntı. Orta seviyede hasar, çatlaklar ve sıva dökülmeleri oluşabilir.",
  6: "Güçlü sarsıntı. İyi tasarlanmış yapılarda hafif, zayıf yapılarda belirgin hasar görülebilir.",
  5: "Orta şiddetli sarsıntı. Küçük eşya devrilmeleri ve sınırlı hasar görülebilir.",
  4: "Hafif sarsıntı. Hissedilir ancak çoğu yapıda belirgin hasar beklenmez.",
};
const HELP_STEPS = [
  "Haritada bir fay hattına tıklayın ya da pini sürükleyin. Pin otomatik olarak en yakın fay çizgisine kilitlenir.",
  "Mw kaydırıcısı ile senaryo büyüklüğünü değiştirin. Harita görünür alanı yeniden hesaplar.",
  "Renkli hücrelere tıklayarak MMI seviyesi, ilçe zemin katsayısı ve uzaklık bilgisini inceleyin.",
];
const REFERENCES = [
  ["İstanbul İli Mikrobölgeleme Projeleri (İBB)", "https://depremzemin.ibb.istanbul/tr/istanbul-ili-mikrobolgeleme-projeleri"],
  ["Yenilenmiş Diri Fay Haritaları (MTA)", "https://www.mta.gov.tr/v3.0/hizmetler/yenilenmis-diri-fay-haritalari"],
  ["Kaynak kodu ve lisans bilgisi", "https://github.com/mcaglarc/olasi.istanbul"],
];

function normalizeDistrictName(name) {
  if (!name) return "";
  const replacements = { "ç": "c", "ğ": "g", "ı": "i", "i": "i", "ö": "o", "ş": "s", "ü": "u" };
  return name.trim().toLocaleLowerCase("tr-TR").replace(/[çğıöşü]/g, (char) => replacements[char] || char);
}

function getDistrictAmplification(districtName) {
  const normalizedDistrict = normalizeDistrictName(districtName);
  const match = districtAmpl.find((item) => normalizeDistrictName(item.district) === normalizedDistrict);
  return match ? match.ampl : 1;
}

function computeMMI(magnitude, distanceKm) {
  const safeDistance = Math.max(distanceKm, 1);
  return 1.5 * magnitude - 3.0 * Math.log10(safeDistance);
}

function clampMMI(value) {
  return Math.max(1, Math.min(9, Math.round(value)));
}

function formatCoordinate(value) {
  return value.toFixed(4);
}

function buildDistrictIndex(geojson) {
  return geojson.features.map((feature) => ({
    feature,
    bbox: window.turf.bbox(feature),
    name: feature.properties?.name || "Bilinmeyen İlçe",
  }));
}

function getDistrictAtPoint(lat, lng, districtIndex) {
  const point = [lng, lat];
  for (const item of districtIndex) {
    const [minLng, minLat, maxLng, maxLat] = item.bbox;
    if (lng < minLng || lng > maxLng || lat < minLat || lat > maxLat) continue;
    if (window.turf.booleanPointInPolygon(point, item.feature)) return item.name;
  }
  return null;
}

function getGeojsonBounds(geojson) {
  let minLat = 90;
  let maxLat = -90;
  let minLng = 180;
  let maxLng = -180;
  geojson.features.forEach((feature) => {
    const polygons = feature.geometry.type === "Polygon" ? [feature.geometry.coordinates] : feature.geometry.coordinates;
    polygons.forEach((polygon) => {
      polygon.forEach((ring) => {
        ring.forEach(([lng, lat]) => {
          minLat = Math.min(minLat, lat);
          maxLat = Math.max(maxLat, lat);
          minLng = Math.min(minLng, lng);
          maxLng = Math.max(maxLng, lng);
        });
      });
    });
  });
  return { minLat, maxLat, minLng, maxLng };
}

function segmentIntersectsBounds(segment, bounds) {
  return segment.some(([lat, lng]) => lat >= bounds.minLat && lat <= bounds.maxLat && lng >= bounds.minLng && lng <= bounds.maxLng);
}

function filterFaultSegmentsForIstanbul(bounds) {
  const paddedBounds = {
    minLat: bounds.minLat - 0.35,
    maxLat: bounds.maxLat + 0.35,
    minLng: bounds.minLng - 0.6,
    maxLng: bounds.maxLng + 0.6,
  };
  return faultSegments.flat().filter((segment) => Array.isArray(segment) && segment.length > 1).filter((segment) => segmentIntersectsBounds(segment, paddedBounds));
}

function createFaultFeatures(segments) {
  return segments.map((segment) => window.turf.lineString(segment.map(([lat, lng]) => [lng, lat])));
}

function snapToFault(latlng, faultFeatures) {
  const point = window.turf.point([latlng.lng, latlng.lat]);
  let bestPoint = null;
  faultFeatures.forEach((feature) => {
    const snapped = window.turf.nearestPointOnLine(feature, point, { units: "kilometers" });
    const distanceKm = snapped.properties?.dist ?? window.turf.distance(point, snapped, { units: "kilometers" });
    if (!bestPoint || distanceKm < bestPoint.distanceKm) {
      const [lng, lat] = snapped.geometry.coordinates;
      bestPoint = { lat, lng, distanceKm };
    }
  });
  return bestPoint || { lat: latlng.lat, lng: latlng.lng, distanceKm: 0 };
}

function createEpicenterIcon() {
  return window.L.divIcon({
    className: "",
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    html: '<div class="epicenter-marker"><span class="epicenter-marker__pulse"></span><span class="epicenter-marker__dot"></span></div>',
  });
}

function createCellPopup(cell) {
  const color = MMI_COLORS[cell.mmi] || "#dbe9ed";
  return `
    <div class="fault-popup">
      <div class="fault-popup__header">
        <span class="fault-popup__swatch" style="background:${color};"></span>
        <div class="fault-popup__title-wrap">
          <h3>MMI ${cell.mmi}</h3>
          <p class="fault-popup__district">${cell.district || "İlçe dışı"}</p>
        </div>
      </div>
      <p class="fault-popup__description">${cell.description}</p>
      <div class="fault-popup__meta">
        <span>Zemin amplifikasyonu <strong>${cell.amplification.toFixed(2)}</strong></span>
        <span>Uzaklık <strong>${cell.distanceKm.toFixed(1)} km</strong></span>
      </div>
    </div>
  `;
}

function formatDistrictName(name) {
  return name || "İlçe sınırları dışında";
}

function getLegendDistance(level, magnitude, amplDistrict) {
  const radius = (BASE_RADII[level] * Math.pow(10, 0.5 * (magnitude - 7.4)) * (amplDistrict || 1)) / 1000;
  return `${radius.toFixed(1)} km`;
}

function Modal({ title, copy, children, onClose }) {
  useEffect(() => {
    function handleEscape(event) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  return e("div", { className: "modal-backdrop", onClick: onClose },
    e("div", { className: "modal-card", onClick: (event) => event.stopPropagation() },
      e("div", { className: "modal-header" },
        e("div", null,
          e("span", { className: "eyebrow" }, "Bilgi"),
          e("h2", { className: "modal-title" }, title),
          e("p", { className: "modal-copy" }, copy),
        ),
        e("button", { className: "close-button", type: "button", "aria-label": "Kapat", onClick: onClose }, "×"),
      ),
      children,
    ),
  );
}

function MapAdDock({ collapsed, onToggle }) {
  const adRef = useRef(null);
  const shellRef = useRef(null);
  const [shellWidth, setShellWidth] = useState(0);
  const minAdWidth = 240;
  const canRenderAd = Boolean(ADSENSE_SLOT) && shellWidth >= minAdWidth;

  useEffect(() => {
    if (collapsed || !shellRef.current) return undefined;

    const updateWidth = () => {
      setShellWidth(Math.round(shellRef.current?.getBoundingClientRect().width || 0));
    };

    updateWidth();

    const observer = new window.ResizeObserver(updateWidth);
    observer.observe(shellRef.current);
    window.addEventListener("resize", updateWidth);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateWidth);
    };
  }, [collapsed]);

  useEffect(() => {
    if (collapsed) return;
    if (!canRenderAd) return;
    if (!adRef.current || !window.adsbygoogle) return;
    if (adRef.current.dataset.loaded === "true") return;
    try {
      window.adsbygoogle.push({});
      adRef.current.dataset.loaded = "true";
    } catch (error) {
      console.error("Adsense init failed", error);
    }
  }, [collapsed, canRenderAd]);

  return e("div", { className: `map-ad-dock${collapsed ? " is-collapsed" : ""}` }, [
    e("button", {
      className: "map-ad-toggle",
      type: "button",
      onClick: onToggle,
      "aria-expanded": String(!collapsed),
      "aria-label": collapsed ? "Sponsorlu alanı göster" : "Sponsorlu alanı gizle",
      key: "toggle",
    }, collapsed ? "Sponsorlu alanı göster" : "Sponsorlu alanı gizle"),
    !collapsed ? e("div", { className: "map-ad-shell", ref: shellRef, key: "shell" }, [
      e("span", { className: "map-ad-label", key: "label" }, "Sponsorlu"),
      canRenderAd
        ? e("ins", {
            ref: adRef,
            className: "adsbygoogle map-adsense-unit",
            style: { display: "block" },
            "data-ad-client": ADSENSE_CLIENT,
            "data-ad-slot": ADSENSE_SLOT,
            "data-ad-format": "auto",
            "data-full-width-responsive": "true",
            key: "ad",
          })
        : e("p", { className: "map-ad-note", key: "note" }, ADSENSE_SLOT ? "Sponsorlu alan bu genişlikte gösterilmiyor." : "AdSense slot tanımlandığında bu alan sabit reklam olarak gösterilecek."),
    ]) : null,
  ]);
}

function MapView({ magnitude, onCellSelect, onEpicenterChange, onStatusChange, onBusyChange, onReadyChange, onStatsChange, onActionsReady }) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const districtLayerRef = useRef(null);
  const districtIndexRef = useRef([]);
  const faultFeaturesRef = useRef([]);
  const gridLayerRef = useRef(null);
  const drawGridRef = useRef(() => {});
  const debounceRef = useRef(null);
  const dragFrameRef = useRef(null);
  const selectedRectRef = useRef(null);
  const popupRef = useRef(null);
  const magnitudeRef = useRef(magnitude);
  magnitudeRef.current = magnitude;

  useEffect(() => {
    let disposed = false;
    onBusyChange(true);
    onStatusChange("Harita ve ilçe verileri hazırlanıyor...");

    const map = window.L.map(mapContainerRef.current, { zoomControl: false, minZoom: 9, maxZoom: 15, preferCanvas: true }).setView(MAP_CENTER, 10);
    mapRef.current = map;
    window.L.control.zoom({ position: "bottomright" }).addTo(map);
    map.attributionControl.setPrefix("");
    window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18, attribution: "&copy; OpenStreetMap contributors" }).addTo(map);

    const canvasRenderer = window.L.canvas({ padding: 0.5 });
    const gridLayer = window.L.layerGroup().addTo(map);
    gridLayerRef.current = gridLayer;

    function scheduleDraw() {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      onStatusChange("Görünür alan yeniden hesaplanıyor...");
      debounceRef.current = window.setTimeout(() => {
        onBusyChange(true);
        drawGridRef.current();
      }, REDRAW_DEBOUNCE_MS);
    }

    function highlightRectangle(layer) {
      if (selectedRectRef.current && selectedRectRef.current !== layer) {
        selectedRectRef.current.setStyle({ color: selectedRectRef.current.options.fillColor, weight: 0 });
      }
      selectedRectRef.current = layer;
      layer.setStyle({ color: "#17313a", weight: 1.2 });
    }

    function updateMarkerPosition(latlng, sourceLabel) {
      const snapped = snapToFault(latlng, faultFeaturesRef.current);
      const districtName = getDistrictAtPoint(snapped.lat, snapped.lng, districtIndexRef.current);
      if (markerRef.current) markerRef.current.setLatLng([snapped.lat, snapped.lng]);
      onEpicenterChange({ latitude: snapped.lat, longitude: snapped.lng, district: districtName, snapped: true, source: sourceLabel });
      scheduleDraw();
    }

    fetch("./data/istanbul-districts.json")
      .then((response) => {
        if (!response.ok) throw new Error("İlçe verileri yüklenemedi.");
        return response.json();
      })
      .then((districtGeojson) => {
        if (disposed) return;
        const districtBounds = getGeojsonBounds(districtGeojson);
        districtIndexRef.current = buildDistrictIndex(districtGeojson);

        districtLayerRef.current = window.L.geoJSON(districtGeojson, {
          style: { color: "rgba(23, 49, 58, 0.24)", weight: 1, fillOpacity: 0 },
          interactive: false,
        }).addTo(map);

        const visibleFaultSegments = filterFaultSegmentsForIstanbul(districtBounds);
        faultFeaturesRef.current = createFaultFeatures(visibleFaultSegments);
        visibleFaultSegments.forEach((segment) => {
          window.L.polyline(segment, { color: "#12252d", weight: 3.5, opacity: 0.95, lineCap: "round" }).addTo(map);
        });

        map.fitBounds(districtLayerRef.current.getBounds(), { padding: [24, 24] });
        const initialSnap = snapToFault({ lat: DEFAULT_EPICENTER[0], lng: DEFAULT_EPICENTER[1] }, faultFeaturesRef.current);
        markerRef.current = window.L.marker([initialSnap.lat, initialSnap.lng], { draggable: true, icon: createEpicenterIcon(), title: "Deprem merkez üssü" }).addTo(map);

        markerRef.current.on("drag", () => {
          if (dragFrameRef.current) return;
          dragFrameRef.current = window.requestAnimationFrame(() => {
            dragFrameRef.current = null;
            updateMarkerPosition(markerRef.current.getLatLng(), "Sürükleme");
          });
        });
        markerRef.current.on("dragend", () => updateMarkerPosition(markerRef.current.getLatLng(), "Sürükleme"));
        map.on("click", (event) => {
          if (popupRef.current) {
            map.closePopup(popupRef.current);
            popupRef.current = null;
          }
          updateMarkerPosition(event.latlng, "Harita tıklaması");
        });
        map.on("moveend zoomend", scheduleDraw);

        drawGridRef.current = () => {
          if (!mapRef.current || !markerRef.current) return;
          const epicenter = markerRef.current.getLatLng();
          const mapBounds = mapRef.current.getBounds();
          const epicenterDistrict = getDistrictAtPoint(epicenter.lat, epicenter.lng, districtIndexRef.current);
          const epicenterAmplification = getDistrictAmplification(epicenterDistrict);
          gridLayer.clearLayers();
          selectedRectRef.current = null;
          let cellCount = 0;

          for (let lat = mapBounds.getSouth(); lat <= mapBounds.getNorth(); lat += GRID_STEP) {
            for (let lng = mapBounds.getWest(); lng <= mapBounds.getEast(); lng += GRID_STEP) {
              const districtName = getDistrictAtPoint(lat, lng, districtIndexRef.current);
              if (!districtName) continue;
              const distanceKm = window.L.latLng(lat, lng).distanceTo(epicenter) / 1000;
              const amplification = getDistrictAmplification(districtName);
              const mmi = clampMMI(computeMMI(magnitudeRef.current, distanceKm) * amplification);
              const fillColor = MMI_COLORS[mmi] || "#dbe9ed";
              const rectangle = window.L.rectangle([[lat, lng], [lat + GRID_STEP, lng + GRID_STEP]], {
                renderer: canvasRenderer,
                color: fillColor,
                fillColor,
                fillOpacity: 0.58,
                weight: 0,
                bubblingMouseEvents: false,
              });
              const cell = { district: districtName, mmi, amplification, distanceKm, description: MMI_INFO[mmi] || "Düşük hissedilirlik.", latitude: lat, longitude: lng };
              rectangle.on("click", (ev) => {
                highlightRectangle(rectangle);
                if (popupRef.current) mapRef.current.closePopup(popupRef.current);
                popupRef.current = window.L.popup({
                  closeButton: true,
                  autoPan: true,
                  keepInView: true,
                  autoPanPadding: [24, 24],
                  className: "fault-popup-wrapper",
                  offset: [0, -2],
                })
                  .setLatLng(ev.latlng)
                  .setContent(createCellPopup(cell))
                  .openOn(mapRef.current);
                onCellSelect(cell);
              });
              rectangle.addTo(gridLayer);
              cellCount += 1;
            }
          }

          onStatsChange({ renderedCells: cellCount, faultSegments: faultFeaturesRef.current.length, epicenterAmplification, epicenterDistrict });
          onBusyChange(false);
          onReadyChange(true);
          onStatusChange(`Güncel görünüm ${cellCount.toLocaleString("tr-TR")} hücre ile hesaplandı.`);
        };

        onActionsReady({
          focusIstanbul() {
            if (districtLayerRef.current) map.fitBounds(districtLayerRef.current.getBounds(), { padding: [24, 24] });
          },
          resetEpicenter() {
            updateMarkerPosition({ lat: DEFAULT_EPICENTER[0], lng: DEFAULT_EPICENTER[1] }, "Varsayılan konum");
          },
        });

        updateMarkerPosition({ lat: initialSnap.lat, lng: initialSnap.lng }, "Başlangıç");
        drawGridRef.current();
      })
      .catch((error) => {
        console.error(error);
        onBusyChange(false);
        onStatusChange("Harita başlatılamadı.");
      });

    return () => {
      disposed = true;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (dragFrameRef.current) window.cancelAnimationFrame(dragFrameRef.current);
      if (mapRef.current) mapRef.current.remove();
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current) return undefined;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    onStatusChange("Deprem büyüklüğü güncelleniyor...");
    debounceRef.current = window.setTimeout(() => {
      onBusyChange(true);
      drawGridRef.current();
    }, REDRAW_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [magnitude]);

  return e("div", { className: "map-shell" }, e("div", { className: "map-canvas", ref: mapContainerRef }));
}

function DetailItem(label, value) {
  return e("div", { className: "detail-item", key: label }, [e("span", { className: "detail-label", key: "l" }, label), e("span", { className: "detail-value", key: "v" }, value)]);
}

function App() {
  const [magnitude, setMagnitude] = useState(DEFAULT_MAGNITUDE);
  const [modalType, setModalType] = useState(null);
  const [adCollapsed, setAdCollapsed] = useState(false);
  const [epicenter, setEpicenter] = useState({ latitude: DEFAULT_EPICENTER[0], longitude: DEFAULT_EPICENTER[1], district: null, snapped: true, source: "Başlangıç" });
  const [mapBusy, setMapBusy] = useState(true);
  const [mapReady, setMapReady] = useState(false);
  const [statusMessage, setStatusMessage] = useState("Harita hazırlanıyor...");
  const [mapStats, setMapStats] = useState({ renderedCells: 0, faultSegments: 0, epicenterAmplification: 1, epicenterDistrict: null });
  const actionsRef = useRef({ focusIstanbul() {}, resetEpicenter() {} });

  const legendItems = MMI_LEVELS.slice().reverse().map((level) => ({ level, color: MMI_COLORS[level], description: MMI_INFO[level], distance: getLegendDistance(level, magnitude, mapStats.epicenterAmplification) }));

  const legendPreview = legendItems.map((item) =>
    e("div", { className: "legend-item", key: item.level }, [
      e("div", { className: "legend-left", key: "l" }, [
        e("span", { className: "swatch", style: { background: item.color }, key: "s" }),
        e("div", { className: "legend-text", key: "t" }, [
          e("strong", { key: "st" }, `MMI ${item.level}`),
          e("span", { key: "sp" }, item.description),
        ]),
      ]),
      e("span", { className: "legend-distance", key: "d" }, item.distance),
    ]),
  );

  return e("div", { className: "app-shell" }, [
    e("div", { className: "app-frame", key: "frame" }, [
      e("aside", { className: "sidebar", key: "sidebar" }, [
        e("section", { className: "panel hero-panel sidebar-banner", key: "hero" }, [
          e("div", { className: "brand-row", key: "brand" }, [
            e("img", { className: "brand-logo", src: "./assets/logo.png", alt: "Deprem Etki Simülatörü logosu", key: "img" }),
            e("div", { key: "txt" }, [e("span", { className: "eyebrow", key: "ey" }, "İstanbul Senaryo"), e("h1", { className: "hero-title", key: "h1" }, "Fay üstü deprem haritası")]),
          ]),
          e("p", { className: "hero-copy", key: "copy" }, "Pin yalnızca fay çizgisine yerleşir."),
          e("div", { className: "hero-actions", key: "act" }, [e("button", { className: "action-button", type: "button", onClick: () => setModalType("help"), key: "help" }, "Nasıl kullanılır"), e("button", { className: "ghost-button", type: "button", onClick: () => setModalType("references"), key: "refs" }, "Referanslar")]),
        ]),
        e("section", { className: "panel section-panel sidebar-controls", key: "scenario" }, [
          e("h2", { className: "section-title", key: "h" }, "Senaryo"),
          e("div", { className: "range-wrap", key: "w" }, [
            e("div", { className: "range-header", key: "head" }, [e("strong", { key: "s" }, "Mw büyüklüğü"), e("span", { className: "range-value", key: "v" }, magnitude.toFixed(1))]),
            e("input", { className: "range-input", type: "range", min: "6", max: "8.4", step: "0.1", value: magnitude, onInput: (event) => setMagnitude(Number(event.currentTarget.value)), key: "input" }),
            e("div", { className: "pill-row", key: "pills" }, [e("span", { className: "pill", key: "p1" }, "Pin yalnızca fay hattına yerleşir"), e("span", { className: "pill", key: "p2" }, "Harita görünümü kaydırıldığında yeniden hesaplanır")]),
          ]),
        ]),
        e("section", { className: "panel section-panel compact-panel sidebar-legend", key: "legend" }, [
          e("h2", { className: "section-title", key: "h" }, "Etki seviyeleri"),
          e("div", { className: "legend-list compact-legend", key: "list" }, legendPreview),
        ]),
      ]),
      e("main", { className: "panel map-panel", key: "main" }, [
        e("div", { className: "map-toolbar", key: "toolbar" }, [e("div", { key: "txt" }, [e("h2", { className: "toolbar-title", key: "h" }, "İstanbul etki haritası"), e("p", { className: "toolbar-copy", key: "p" }, "Fay hattına tıklayarak ya da pini sürükleyerek merkez üssünü değiştirin.")]), e("div", { className: "map-actions", key: "a" }, [e("button", { className: "ghost-button", type: "button", onClick: () => actionsRef.current.focusIstanbul(), key: "focus" }, "İstanbul görünümüne dön"), e("button", { className: "primary-button", type: "button", onClick: () => actionsRef.current.resetEpicenter(), key: "reset" }, "Varsayılan üssü yükle")])]),
        e("div", { className: "map-stage", key: "mapwrap" }, [
          e(MapView, { magnitude, onCellSelect: () => {}, onEpicenterChange: setEpicenter, onStatusChange: setStatusMessage, onBusyChange: setMapBusy, onReadyChange: setMapReady, onStatsChange: setMapStats, onActionsReady: (actions) => { actionsRef.current = actions; }, key: "map" }),
          e(MapAdDock, { collapsed: adCollapsed, onToggle: () => setAdCollapsed((value) => !value), key: "ad-dock" }),
          mapBusy ? e("div", { className: "map-loading", key: "load" }, e("div", { className: "loading-card" }, [
            e("span", { className: "eyebrow", key: "e" }, "Hazırlanıyor"),
            e("h3", { style: { margin: "8px 0 0", fontSize: "1.2rem" }, key: "h" }, mapReady ? "İstanbul senaryosu güncelleniyor" : "İstanbul senaryo katmanları yükleniyor"),
            e("p", { className: "section-copy", style: { marginTop: "8px", marginBottom: 0 }, key: "p" }, mapReady ? statusMessage : "Fay çizgileri, ilçe sınırları ve görünür harita hücreleri ilk kez hesaplanıyor."),
            e("div", { className: "loading-bar", key: "b" }, e("span")),
          ])) : null,
        ]),
        e("div", { className: "map-bottom-bar", key: "bottom" }, [
          e("p", { className: "map-disclaimer", key: "warn" }, "Bu araç farkındalık içindir. Gerçek risk değerlendirmeleri için resmi veriler kullanılmalıdır."),
        ]),
      ]),
    ]),
    modalType === "help" ? e(Modal, { title: "Simülatör nasıl kullanılır?", copy: "Yeni arayüz, merkez üssünü yalnızca fay hattı üzerinde tutar.", onClose: () => setModalType(null), key: "help-modal" }, e("div", { className: "helper-list" }, HELP_STEPS.map((step, index) => e("div", { className: "helper-item", key: step }, [e("span", { className: "helper-index", key: "i" }, index + 1), e("p", { className: "helper-text", key: "t" }, step)])))) : null,
    modalType === "references" ? e(Modal, { title: "Veri kaynakları ve proje", copy: "Aşağıdaki bağlantılar uygulamada kullanılan temel referansları içerir.", onClose: () => setModalType(null), key: "refs-modal" }, e("ol", { className: "reference-list" }, REFERENCES.map(([label, href]) => e("li", { key: href }, e("a", { href, target: "_blank", rel: "noreferrer noopener" }, label))))) : null,
  ]);
}

createRoot(document.getElementById("root")).render(e(App));
