# La Llave del Caballero

Escape room retro en pixel art para el navegador. Un caballero medieval despierta en un laberinto oscuro:
debe superar **3 pruebas**, encontrar la **llave** y escapar por la puerta final.

## Jugar

Abre `index.html` en el navegador (no necesita servidor ni instalación).

- Mover: flechas o `WASD` (en móvil, cruceta en pantalla)
- Música: `M` o el botón "MUSICA"
- Pruebas: acertijo, secuencia de runas y candado de 4 cifras (el código está en un pergamino escondido)

## Detalles técnicos

- HTML + CSS + JavaScript puro, sin dependencias.
- Todos los gráficos son SVG de 16x16 (`assets/`), generados como pixel art.
- Música y efectos sintetizados con WebAudio (chiptune), sin archivos de audio.
- Fuente: Press Start 2P (licencia OFL, ver `fonts/OFL.txt`).
- El laberinto se genera con una semilla fija (`?seed=NUMERO` en la URL para probar otros).
