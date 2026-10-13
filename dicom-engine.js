(function (root) {
  'use strict';

  const MAX_INPUT_BYTES = 256 * 1024 * 1024;
  const MAX_SAMPLES = 32 * 1024 * 1024;
  const MAX_DIMENSION = 32768;
  const SYNTAXES = {
    '1.2.840.10008.1.2': { littleEndian: true, label: 'Implicit VR Little Endian' },
    '1.2.840.10008.1.2.1': { littleEndian: true, label: 'Explicit VR Little Endian' },
    '1.2.840.10008.1.2.2': { littleEndian: false, label: 'Explicit VR Big Endian' }
  };

  function fail(message) { throw new Error(message); }

  function textValue(dataset, tag) {
    const value = dataset.string(tag);
    return value == null ? '' : String(value).replace(/\0/g, '').trim();
  }

  function numberValue(dataset, tag, fallback, label) {
    const text = textValue(dataset, tag);
    if (!text) return fallback;
    const value = Number(text.split('\\')[0].trim());
    if (!Number.isFinite(value)) fail('El archivo contiene un valor inválido de ' + label + '.');
    return value;
  }

  function ushort(dataset, tag, label) {
    if (!dataset.elements[tag] || dataset.elements[tag].length !== 2) {
      fail('Falta un valor válido de ' + label + ' en el DICOM.');
    }
    const value = dataset.uint16(tag);
    if (!Number.isInteger(value)) fail('Falta un valor válido de ' + label + ' en el DICOM.');
    return value;
  }

  function windowValid(width, fn) {
    return Number.isFinite(width) && (fn === 'LINEAR' ? width >= 1 : width > 0);
  }

  function parse(input) {
    if (!(input instanceof Uint8Array)) fail('Selecciona un archivo DICOM válido.');
    if (input.byteLength < 8) fail('El archivo está vacío o incompleto.');
    if (input.byteLength > MAX_INPUT_BYTES) fail('El DICOM supera el límite de 256 MB de este visor.');
    if (!root.dicomParser || typeof root.dicomParser.parseDicom !== 'function') {
      fail('No se ha podido cargar el lector DICOM. Vuelve a abrir el visor.');
    }

    let dataset;
    try {
      // Stop at Pixel Data: decoding is performed below after all size checks.
      dataset = root.dicomParser.parseDicom(input, { untilTag: 'x7fe00010' });
    } catch (error) {
      const detail = String(error && error.message || error);
      if (/deflat|inflater|pako/i.test(detail)) {
        fail('Este DICOM usa compresión Deflate. Exporta una copia DICOM sin compresión.');
      }
      fail('No se pudo leer el DICOM. Puede estar incompleto o no tener una cabecera DICOM compatible.');
    }

    const transferSyntax = textValue(dataset, 'x00020010');
    const syntax = SYNTAXES[transferSyntax];
    if (!syntax) {
      fail('Este DICOM usa una compresión o codificación no compatible. Exporta una copia DICOM sin compresión.');
    }

    const photo = textValue(dataset, 'x00280004').toUpperCase();
    const samplesPerPixel = ushort(dataset, 'x00280002', 'muestras por píxel');
    if (samplesPerPixel !== 1 || (photo !== 'MONOCHROME1' && photo !== 'MONOCHROME2')) {
      fail('Este visor admite imágenes DICOM monocromas. El archivo contiene color u otro formato no compatible.');
    }
    if (dataset.elements.x00283000 || dataset.elements.x00283010 || dataset.elements.x20500010) {
      fail('Este DICOM utiliza tablas LUT que este visor no interpreta. Abre el estudio en su visor original.');
    }
    if (dataset.elements.x52009229 || dataset.elements.x52009230) {
      fail('Este DICOM contiene ajustes por fotograma que aún no admite este visor. Abre el estudio en su visor original.');
    }
    const presentationShape = textValue(dataset, 'x20500020').toUpperCase();
    if (presentationShape && presentationShape !== 'IDENTITY' && presentationShape !== 'INVERSE') {
      fail('La transformación de presentación de este DICOM no es compatible.');
    }

    const width = ushort(dataset, 'x00280011', 'columnas');
    const height = ushort(dataset, 'x00280010', 'filas');
    const frames = numberValue(dataset, 'x00280008', 1, 'número de imágenes');
    if (width < 1 || height < 1 || width > MAX_DIMENSION || height > MAX_DIMENSION) {
      fail('Las dimensiones del DICOM no son válidas o superan el límite del visor.');
    }
    if (!Number.isSafeInteger(frames) || frames < 1) fail('El número de imágenes del DICOM no es válido.');
    const sampleCount = width * height * frames;
    if (!Number.isSafeInteger(sampleCount) || sampleCount > MAX_SAMPLES) {
      fail('El estudio supera el límite de 32 millones de píxeles de este visor. Abre una serie más pequeña.');
    }

    const bitsAllocated = ushort(dataset, 'x00280100', 'bits por muestra');
    const bitsStored = ushort(dataset, 'x00280101', 'bits almacenados');
    const highBit = ushort(dataset, 'x00280102', 'bit superior');
    const pixelRepresentation = ushort(dataset, 'x00280103', 'representación del píxel');
    if (bitsAllocated !== 8 && bitsAllocated !== 16) fail('Este visor admite píxeles DICOM de 8 o 16 bits.');
    if (bitsStored < 1 || bitsStored > bitsAllocated || highBit >= bitsAllocated || highBit < bitsStored - 1) {
      fail('La distribución de bits de los píxeles DICOM no es válida.');
    }
    if (pixelRepresentation !== 0 && pixelRepresentation !== 1) fail('La representación de los píxeles no es válida.');

    const pixelData = dataset.elements.x7fe00010;
    if (!pixelData) fail('Este archivo no contiene una imagen. Selecciona un DICOM de imagen, no DICOMDIR.');
    if (pixelData.encapsulatedPixelData || pixelData.hadUndefinedLength || pixelData.length === 0xffffffff) {
      fail('Este DICOM contiene píxeles comprimidos. Exporta una copia DICOM sin compresión.');
    }
    const bytesPerSample = bitsAllocated / 8;
    const expectedBytes = sampleCount * bytesPerSample;
    const allowedPadding = expectedBytes % 2;
    if (!Number.isSafeInteger(pixelData.dataOffset) || !Number.isSafeInteger(pixelData.length) || pixelData.dataOffset < 0 ||
        pixelData.length < expectedBytes || pixelData.dataOffset + pixelData.length > dataset.byteArray.byteLength) {
      fail('Los datos de la imagen están incompletos. Copia de nuevo el archivo DICOM.');
    }
    if (pixelData.length !== expectedBytes && pixelData.length !== expectedBytes + allowedPadding) {
      fail('El tamaño de los píxeles no coincide con las dimensiones declaradas en el DICOM.');
    }

    const slope = numberValue(dataset, 'x00281053', 1, 'escala');
    const intercept = numberValue(dataset, 'x00281052', 0, 'desplazamiento');
    const voiFunction = (textValue(dataset, 'x00281056') || 'LINEAR').toUpperCase();
    if (!['LINEAR', 'LINEAR_EXACT', 'SIGMOID'].includes(voiFunction)) {
      fail('La función de contraste del DICOM no es compatible con este visor.');
    }
    const byteArray = dataset.byteArray;
    const dataView = new DataView(byteArray.buffer, byteArray.byteOffset + pixelData.dataOffset, expectedBytes);
    const pixels = new Float32Array(sampleCount);
    const shift = highBit - bitsStored + 1;
    const mask = Math.pow(2, bitsStored) - 1;
    const signBit = Math.pow(2, bitsStored - 1);
    const signRange = Math.pow(2, bitsStored);
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < sampleCount; i++) {
      const word = bytesPerSample === 1 ? dataView.getUint8(i) : dataView.getUint16(i * 2, syntax.littleEndian);
      let stored = (word >>> shift) & mask;
      if (pixelRepresentation === 1 && (stored & signBit)) stored -= signRange;
      const value = Math.fround(stored * slope + intercept);
      if (!Number.isFinite(value)) fail('La escala de los píxeles produce valores fuera de rango.');
      pixels[i] = value;
      if (value < min) min = value;
      if (value > max) max = value;
    }

    const warnings = [];
    let defaultCenter = voiFunction === 'LINEAR' ? (min + max + 1) / 2 : (min + max) / 2;
    let defaultWidth = voiFunction === 'LINEAR' ? max - min + 1 : Math.max(max - min, 1);
    const declaredCenter = numberValue(dataset, 'x00281050', null, 'centro de ventana');
    const declaredWidth = numberValue(dataset, 'x00281051', null, 'ancho de ventana');
    if (declaredCenter !== null && windowValid(declaredWidth, voiFunction)) {
      defaultCenter = declaredCenter;
      defaultWidth = declaredWidth;
    } else if (declaredCenter !== null || declaredWidth !== null) {
      warnings.push('La ventana original está incompleta o es inválida; se ha ajustado al rango de píxeles.');
    }

    // PixelSpacing is the only source of calibrated image-plane distances.
    // ImagerPixelSpacing measures detector spacing and must not substitute for it.
    let spacing = null;
    const spacingText = textValue(dataset, 'x00280030');
    if (spacingText) {
      const values = spacingText.split('\\').map(value => Number(value.trim()));
      if (values.length === 2 && values.every(value => Number.isFinite(value) && value > 0)) spacing = values;
      else warnings.push('El espaciado de píxeles es inválido; las distancias se muestran en píxeles.');
    }

    return {
      width, height, frames, pixels, photo, defaultCenter, defaultWidth, min, max,
      bitsStored, bitsAllocated, highBit, signed: pixelRepresentation === 1,
      spacing, modality: textValue(dataset, 'x00080060'), voiFunction,
      slope, intercept, transferSyntax, transferSyntaxLabel: syntax.label,
      presentationShape, warnings
    };
  }

  function rasterize(image, options) {
    const opts = options || {};
    const frame = opts.frame == null ? 0 : opts.frame;
    const center = opts.center == null ? image.defaultCenter : opts.center;
    const width = opts.width == null ? image.defaultWidth : opts.width;
    const fn = image.voiFunction || 'LINEAR';
    if (!Number.isInteger(frame) || frame < 0 || frame >= image.frames) fail('La imagen seleccionada no existe en este DICOM.');
    if (!Number.isFinite(center) || !windowValid(width, fn)) fail('Los ajustes de contraste no son válidos.');
    if (!['LINEAR', 'LINEAR_EXACT', 'SIGMOID'].includes(fn)) fail('La función de contraste no es compatible.');
    const count = image.width * image.height;
    if (!Number.isSafeInteger(count) || count < 1 || count > MAX_SAMPLES ||
        !(image.pixels instanceof Float32Array) || image.pixels.length < count * image.frames) {
      fail('La imagen no contiene una matriz de píxeles válida.');
    }
    const rgba = new Uint8ClampedArray(count * 4);
    const originalInverse = image.presentationShape ? image.presentationShape === 'INVERSE' : image.photo === 'MONOCHROME1';
    const inverted = originalInverse !== Boolean(opts.invert);
    const start = count * frame;
    const lower = center - 0.5 - (width - 1) / 2;
    const upper = center - 0.5 + (width - 1) / 2;
    for (let i = 0; i < count; i++) {
      const pixel = image.pixels[start + i];
      let value;
      if (fn === 'SIGMOID') {
        value = 255 / (1 + Math.exp(-4 * (pixel - center) / width));
      } else if (fn === 'LINEAR_EXACT') {
        value = ((pixel - center) / width + 0.5) * 255;
      } else {
        value = pixel <= lower ? 0 : pixel > upper ? 255 : ((pixel - (center - 0.5)) / (width - 1) + 0.5) * 255;
      }
      value = Math.max(0, Math.min(255, value));
      if (inverted) value = 255 - value;
      const offset = i * 4;
      rgba[offset] = rgba[offset + 1] = rgba[offset + 2] = Math.round(value);
      rgba[offset + 3] = 255;
    }
    return rgba;
  }

  root.DicomEngine = Object.freeze({ parse, rasterize, MAX_INPUT_BYTES, MAX_SAMPLES });
})(typeof window !== 'undefined' ? window : globalThis);
