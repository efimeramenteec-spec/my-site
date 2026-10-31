---
description: Cierra una sesión de producción/ajuste de anuncios — rescata assets, actualiza el estado compacto y la memoria, sin tocar el repo del panel
model: opus
---

Cierras la sesión de trabajo con las skills de anuncios (`/adscript`, `/adgenerator`). El objetivo es el mismo que un buen cierre: dejar TODO lo producido y aprendido en su sitio durable, en archivos **compactos**, para que la próxima sesión arranque leyendo poco y no re-derive nada. Mantén el contexto ligero: resume, no narres.

**Esto NO toca el repo `my-site` (el panel de Efimeramente).** El trabajo de anuncios vive en `~/.claude/` y en las carpetas de proyecto de `~/Downloads/`. No hagas `build`, `commit` ni `push` del panel — es otro dominio.

## Protocolo

1. **Rescata los assets antes que nada (lo único irreversible).** Las URLs de APIMart caducan a las **72 h**. Si esta sesión generó imágenes o clips que solo existen como URL, **descárgalos ya** a la carpeta del proyecto. Un proyecto a medias con las URLs muertas se pierde entero. Esto va primero, siempre.

2. **Cierra la carpeta del proyecto** (si hubo producción de un anuncio): `README.md` con la tabla de planos / **orden de montaje**, la locución, dónde caen los cortes, y el **manifiesto de URLs** de cada generación. Vídeos numerados con cero a la izquierda en orden de línea de tiempo.

3. **Actualiza el estado compacto** `~/.claude/adgenerator-state.md` (créalo si no existe):
   - **"Hecho esta sesión"** al principio, con fecha y los detalles técnicos que una sesión futura necesitaría (rutas, nombres de modelo, gotchas).
   - **"Pendiente / próximo"**: quita lo que ya está hecho, añade lo que surgió hoy.
   - **"Proyectos"**: una línea por anuncio con su estado (guion / imágenes / vídeo / montado) y su carpeta.
   - Si el archivo pasa de ~300 líneas, mueve lo más viejo de "Hecho esta sesión" a un `CHANGELOG` al final del propio archivo hasta bajar de 300.

4. **Actualiza la memoria** `adgenerator-protocol` (en la carpeta de memoria del proyecto) con cualquier **lección de método durable** (cambios de workflow, estilos nuevos, gotchas verificados). No dupliques: edita la entrada existente en vez de crear otra.

5. **Resumen de 5 líneas:** qué se produjo/cambió y qué debe retomar la próxima sesión.

6. **Prompt para la próxima sesión (SIEMPRE).** Termina entregando, en un bloque de código copiable, un **prompt listo para pegar** que arranque la siguiente sesión sin fricción. Debe: (a) nombrar la skill a correr (`/adscript`, `/adgenerator`, etc.) y el objetivo concreto; (b) apuntar a los archivos que hay que leer primero (`~/.claude/adgenerator-state.md` siempre, más el guion/carpeta relevante); (c) recordar cualquier gate abierto o insumo que el humano debe traer (p.ej. la locución grabada). Cuatro–ocho líneas, específico, en el idioma en que se trabaja (español). Este bloque es lo último del cierre.

## Reglas

- **Nada destructivo sin avisar.** Prefiere mover a borrar; los assets descartados se sustituyen, no se acumulan (confunden al montar), pero avisa antes de borrar algo que no creaste esta sesión.
- **Si no hubo producción** (fue solo ajuste de método/skill), di qué pasos omites (1 y 2) y ve directo a estado + memoria.
- **Arranque de la próxima sesión:** lo que dejas en `adgenerator-state.md` es lo que se lee primero. Que sea suficiente para retomar sin releer nada más — y lo bastante corto para no gastar tokens.
