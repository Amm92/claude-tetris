# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Qué es

Tetris en JavaScript vanilla + HTML5 Canvas + CSS. Sin dependencias, sin build, sin tests, sin `package.json`.

## Ejecutar

```bash
open index.html                  # directo (macOS)
python3 -m http.server 8000      # o servidor estático → http://localhost:8000
```

No hay lint ni test runner. Verificación = abrir en navegador y jugar; errores en consola del navegador.

## Arquitectura

3 archivos cooperan:

- `index.html` — DOM: `<canvas id="board">` (300×600), panel lateral (score/lines/level, `<canvas id="next-canvas">`), overlay pausa/game-over. Carga `game.js` al final.
- `style.css` — dark/retro arcade. Reset propio, flexbox, `backdrop-filter` en overlay.
- `game.js` — toda la lógica (`'use strict'`, sin módulos, todo en scope global del archivo).

### game.js — puntos clave

- **Tablero**: matriz `ROWS×COLS` (`board`), cada celda `0` vacía o índice de color `1–7`. Índices mapean a `COLORS` y `PIECES` (ambos arrays con `null` en posición 0, así el tipo de pieza == índice de color).
- **Piezas**: matrices cuadradas en `PIECES`. `randomPiece()` genera tipo 1–7. `current`/`next` son `{type, shape, x, y}`.
- **Rotación**: `rotateCW` = transpuesta + reverso de filas. `tryRotate` prueba wall kicks `[0,-1,1,-2,2]` en x.
- **Colisión**: `collide(shape, ox, oy)` — límites del tablero + solape con bloques fijados. Base de todo movimiento.
- **Game loop**: `loop(ts)` con `requestAnimationFrame`. Acumula `dropAccum`; al superar `dropInterval` baja una fila o `lockPiece()`. `animId` guarda el frame para cancelar.
- **Bloqueo**: `lockPiece()` → `merge()` (fija pieza en board) → `clearLines()` → `spawn()`.
- **Nivel/velocidad**: `level = floor(lines/10)+1`; `dropInterval = max(100, 1000-(level-1)*90)`.
- **Puntuación**: `LINE_SCORES` × level; hard drop +2/celda, soft drop +1/fila.
- **Ghost**: `ghostY()` proyecta caída; se dibuja con alpha 0.2.
- **Estados**: `paused`, `gameOver`. `endGame()` en `spawn()` si la pieza nueva ya colisiona. `init()` resetea todo y arranca el loop; se llama al cargar y desde el botón reiniciar.
- **Input**: un `keydown` global. `P` pausa siempre; el resto ignora si `paused || gameOver`.

## Al modificar

- Cambiar `COLS`/`ROWS`/`BLOCK` obliga a ajustar `width`/`height` de `<canvas id="board">` en `index.html` (`COLS*BLOCK` × `ROWS*BLOCK`).
- Añadir un tipo de pieza = añadir entrada en `PIECES` y en `COLORS` en el mismo índice.
- Textos de UI en español (mantener idioma).
