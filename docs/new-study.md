# Publicar un estudio nuevo (5 minutos)

Sin tocar código. Necesitas permiso de escritura en el repositorio de GitHub.

1. **Copia un estudio existente** de `public/studies/` como plantilla:
   - Card sort: `tarjetas-wiki.json`
   - Tree test: `arbol-a.csv` (se puede editar en Excel o Google Sheets)
2. **Cámbiale el nombre.** El nombre del archivo es el enlace: `becas-2027.csv` → `…/#/s/becas-2027`.
   Usa solo letras, números, `-` y `_`.
3. **Edita el contenido**:
   - Card sort: `title`, `intro` y una fila `card` por tarjeta, cada una con un `id` único.
   - Tree test: una fila `node` por entrada del menú (`parent` vacío en el primer nivel) y una fila `task` por
     pregunta, con el `id` del nodo o nodos correctos en `correct`, separados por `|`.
   - Redacta las tareas como situaciones, sin repetir las palabras de los títulos del árbol (por ejemplo, no
     escribas "rebate" si hay un nodo "Rebate"): si no, la tarea mide si la persona encuentra la palabra, no el tema.
   - Opcional: un texto `consent` si el de por defecto no sirve para tu estudio (debe decir qué se guarda).
   - No hace falta agregar nada para "No sé qué significa", "No sé dónde buscaría esto" ni "Esta tarea no aplica
     a mi rol": aparecen en todos los estudios.
4. **Súbelo** a `public/studies/` en la rama `main` (en GitHub web: *Add file → Upload files*).
5. **Espera 2 o 3 minutos** a que termine el workflow *CI and deploy* en la pestaña Actions.
6. **Abre tú mismo el enlace** en tu celular: `https://<usuario>.github.io/<repo>/#/s/<nombre-del-archivo>`.
   Si el archivo tiene un error, la página muestra el error exacto (id repetido, padre inexistente, etc.).
   Corrige el archivo y vuelve a subirlo.
7. **Comparte el enlace** con los participantes.

Consejos:

- No cambies los ids cuando ya haya participantes: los resultados los usan.
- Para comparar dos versiones (A/B), crea los dos archivos de estudio y un archivo pequeño de tipo split que
  apunte a ellos (ver "Enlace A/B" en el README). Comparte solo el enlace A/B.
- Para cerrar un estudio, borra su archivo. Las respuestas recogidas siguen en la base de datos.
- Exporta los resultados con `npm run export` y genera el panel con `npm run report` (ver el README).
