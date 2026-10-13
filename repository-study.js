/* Load the public archive stored alongside this page. */
async function loadRepositoryStudy() {
  const manifestResponse = await fetch('./manifest.json', { cache: 'no-store' });
  if (!manifestResponse.ok) {
    if (manifestResponse.status === 404) return null;
    throw new Error('No se pudo consultar el archivo público.');
  }
  const manifest = await manifestResponse.json();
  if (!manifest || !Array.isArray(manifest.parts) || manifest.parts.length < 1 || manifest.parts.length > 8 || manifest.size > 150 * 1024 * 1024) {
    throw new Error('El manifiesto del estudio no es válido.');
  }
  const archive = new Uint8Array(manifest.size);
  let offset = 0;
  for (const part of manifest.parts) {
    if (!/^Archivo\.zip\.\d{3}$/.test(part.path) || !Number.isInteger(part.size) || part.size < 1 || offset + part.size > archive.length) {
      throw new Error('El manifiesto del estudio contiene una parte no válida.');
    }
    const response = await fetch(`./${part.path}`, { cache: 'no-store' });
    if (!response.ok) throw new Error('No se pudo descargar el archivo del repositorio.');
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length !== part.size) throw new Error('Una parte del ZIP está incompleta.');
    archive.set(bytes, offset);
    offset += bytes.length;
    const loading = document.getElementById('loading-text');
    if (loading) loading.textContent = `Descargando estudio ${Math.round(offset / manifest.size * 100)} %…`;
  }
  if (offset !== manifest.size || !/^[a-f0-9]{64}$/i.test(manifest.sha256)) throw new Error('El ZIP descargado está incompleto.');
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', archive));
  const actual = Array.from(digest, x => x.toString(16).padStart(2, '0')).join('');
  if (actual !== manifest.sha256.toLowerCase()) throw new Error('El ZIP no coincide con el original.');
  return new File([archive], 'Archivo.zip', { type: 'application/zip' });
}
