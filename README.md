# Prickly Pyramids

Videojuego multijugador local en el navegador inspirado en **Prickly Pyramids**. Los jugadores compiten sobre una pirámide de bloques en 2D: cada paso marca un bloque con púas y un segundo paso lo voltea al vacío. El objetivo es eliminar a los rivales haciéndolos caer. Cada jugador tiene **3 vidas**; gana el **último en pie**.

![HTML5](https://img.shields.io/badge/HTML5-Canvas-E34F26?logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-Modern-1572B6?logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-Vanilla-F7DF1E?logo=javascript&logoColor=black)

## Características

- **2 a 4 jugadores** en la misma pantalla y teclado
- Pirámide procedural con bloques que cambian de estado (sólido → pinchado → volteándose → vacío)
- Sistema de vidas, reaparición e invencibilidad breve tras respawn
- Interfaz oscura con tipografía futurista y efectos de partículas
- Sin dependencias externas: solo HTML, CSS y JavaScript puro

## Requisitos

- Navegador web moderno (Chrome, Firefox, Edge o Safari)
- Teclado con suficientes teclas para todos los jugadores

No se necesita servidor ni instalación de paquetes.

## Cómo jugar

### Inicio rápido

1. Abre `index.html` en tu navegador (doble clic o arrastra el archivo a una pestaña).
2. Elige el número de jugadores (2, 3 o 4).
3. Pulsa **Jugar**.

También puedes servir la carpeta con un servidor local:

```bash
# Python 3
python -m http.server 8080

# Node.js (si tienes npx)
npx serve .
```

Luego visita `http://localhost:8080`.

### Objetivo

Sé el último jugador con vidas restantes. Haz que tus rivales caigan al **vacío** volteando los bloques bajo sus pies.

### Mecánicas

| Acción | Efecto |
|--------|--------|
| Primer paso sobre un bloque | El bloque se **pincha** (marca amarilla con púas) |
| Segundo paso sobre el mismo bloque | El bloque **se voltea** y desaparece tras una breve animación |
| Bloque eliminado bajo un jugador | El jugador **cae al vacío** y pierde 1 vida |
| Sin vidas | El jugador queda eliminado |
| Caída con vidas restantes | Reaparece en un bloque sólido aleatorio (con invencibilidad temporal) |

### Controles

Cada jugador usa **cuatro teclas** para moverse en las cuatro direcciones (arriba, abajo, izquierda, derecha). Solo puedes moverte a bloques adyacentes que aún existan.

| Jugador | Arriba | Abajo | Izquierda | Derecha |
|---------|--------|-------|-----------|---------|
| **Jugador 1** | `↑` | `↓` | `←` | `→` |
| **Jugador 2** | `W` | `S` | `A` | `D` |
| **Jugador 3** | `I` | `K` | `J` | `L` |
| **Jugador 4** | `T` | `G` | `F` | `H` |

> **Consejo:** Mantén pulsada una tecla direccional para desplazarte de forma continua. Planifica rutas que fuercen a los rivales hacia los bordes de la pirámide.

## Estructura del proyecto

```
prickly-pyramids/
├── index.html    # Estructura HTML y pantallas (menú, juego, resultado)
├── style.css     # Estilos oscuros y diseño de la interfaz
├── game.js       # Lógica del juego, Canvas y multijugador
└── README.md     # Este archivo
```

## Personalización

En `game.js`, el objeto `CONFIG` permite ajustar:

- `rows`: altura de la pirámide (por defecto 7)
- `maxLives`: vidas iniciales (por defecto 3)
- `flipDuration`: tiempo de animación al voltear un bloque (ms)
- `invincibleTime`: duración de invencibilidad tras reaparecer (ms)
- Colores y teclas de cada jugador en `CONFIG.players`

## Licencia

Proyecto de código abierto para uso educativo y personal. Siéntete libre de modificarlo y compartirlo.

## Créditos

Inspirado en el clásico **Prickly Pyramids**. Implementación web original con HTML5 Canvas.