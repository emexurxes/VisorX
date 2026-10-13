# VisorX

Visor web que descarga y muestra el ZIP del estudio en esta misma web. Al abrir la página, se descargan las cuatro partes de `Archivo.zip` desde este repositorio, se verifica el SHA-256 del archivo reconstruido y se abre el DICOM localmente en el navegador. No hacen falta el pendrive ni iniciar sesión para que cargue.

**El repositorio y el estudio son públicos. Cualquier visitante puede descargar y conservar una copia de la radiografía y de los archivos del ZIP.** La página lo indica y procesa la imagen en el dispositivo de quien la abre.

## Activar GitHub Pages

1. Sube todos los archivos de esta carpeta a la raíz de `VisorX`, incluidas `Archivo.zip.001` a `Archivo.zip.004`.
2. En el repositorio, abre **Settings → Pages**.
3. En **Build and deployment**, selecciona **Deploy from a branch**, la rama `main` y la carpeta `/ (root)`; guarda.
4. La página aparecerá en `https://emexurxes.github.io/VisorX/` al terminar la primera publicación.

## Controles

- Rueda o botones para ampliar; arrastra la imagen para moverla.
- **M** mueve, **B** ajusta brillo y contraste, **D** mide.
- **R** gira, **I** invierte tonos y **0** restablece.
- La exportación PNG guarda la imagen con la orientación y tonos actuales.

Las mediciones usan la escala DICOM si está declarada. Son orientativas. Este visor personal no está validado para diagnóstico clínico. Solo admite DICOM monocromo nativo de 8/16 bits; informa si no puede abrir otro formato.

Incluye `dicom-parser` 1.8.21 y `fflate` 0.8.2; ambas bibliotecas distribuyen sus licencias MIT en los ficheros `*-LICENSE`.
