# Precios SEPA · Córdoba (para el panel de Romaneto)

Todos los días baja el archivo oficial del SEPA (Precios Claros, datos abiertos
CC BY 4.0), se queda con los supermercados de la provincia de Córdoba, marca los
que están a menos de 9 km de Villa Allende / Saldán y publica `docs/cordoba.json`.
El panel lo lee desde GitHub Pages.

## Poner en marcha (una sola vez)

1. Crear una cuenta en github.com (gratis) y un repositorio nuevo, por ejemplo
   `precios-cordoba`. **Público** (los datos son públicos y así GitHub Pages y
   las Actions son gratis).
2. Subir estos archivos al repositorio, respetando las carpetas:
   `sepa-cordoba.mjs`, `README.md`, `docs/.nojekyll`, `.github/workflows/sepa.yml`.
   (En la web de GitHub: *Add file → Upload files*, arrastrar la carpeta entera).
3. Settings → Pages → Source: *Deploy from a branch* → Branch `main`, carpeta `/docs` → Save.
4. Actions → "Precios SEPA Córdoba" → *Run workflow* para la primera corrida
   (tarda unos minutos). Después corre sola todos los días a las 9.
5. El archivo queda en `https://TU-USUARIO.github.io/precios-cordoba/cordoba.json`.
   Esa dirección se pega en el panel: Panel consolidado → 🏷️ Artículos →
   Comparador de precios.

## Opcional: achicar el archivo

Si en el panel tocás "⬇ Lista de códigos (eans.txt)" y subís ese archivo a la
carpeta `docs/` del repositorio, solo se guardan los productos que vende Romaneto.

## Si algo falla

La pestaña Actions muestra el detalle de cada corrida. Lo más común es que el
SEPA cambie la dirección del archivo: el paso "Bajar el último archivo" busca
siempre el zip más reciente del dataset `sepa-precios`.
