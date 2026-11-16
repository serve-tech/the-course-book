/**
 * Byte-level readers for tests of photo privacy (issue #67). They read the
 * file formats directly, independently of sharp, so a test can show a
 * fixture really carries a location and an output really carries none.
 *
 * References: JPEG markers (ITU T.81, Annex B), EXIF 2.32 (TIFF IFDs; GPS
 * IFD pointer tag 0x8825, GPSLatitude tag 0x0002), and the WebP container
 * (https://developers.google.com/speed/webp/docs/riff_container).
 */

/** The JPEG segments before the image data, as `[marker, payload]`, e.g. APP1 (0xe1) for EXIF and XMP. */
export function jpegSegments(bytes: Uint8Array): [number, Uint8Array][] {
  const segments: [number, Uint8Array][] = [];
  let offset = 2; // after SOI (FFD8)
  while (offset + 4 <= bytes.length && bytes[offset] === 0xff) {
    const marker = bytes[offset + 1] ?? 0;
    if (marker === 0xda) break; // start of scan: image data follows
    const length = ((bytes[offset + 2] ?? 0) << 8) | (bytes[offset + 3] ?? 0);
    segments.push([marker, bytes.subarray(offset + 4, offset + 2 + length)]);
    offset += 2 + length;
  }
  return segments;
}

const EXIF_HEADER = "Exif\0\0";

/**
 * The GPS latitude in a JPEG's EXIF as degrees, minutes and seconds, or
 * null when it has none.
 */
export function jpegGpsLatitude(bytes: Uint8Array): [number, number, number] | null {
  const exif = jpegSegments(bytes).find(([marker, payload]) => marker === 0xe1 && new TextDecoder().decode(payload.subarray(0, 6)) === EXIF_HEADER);
  if (!exif) return null;
  const tiff = exif[1].subarray(6);
  const view = new DataView(tiff.buffer, tiff.byteOffset, tiff.byteLength);
  const little = view.getUint16(0) === 0x4949;
  const u16 = (at: number) => view.getUint16(at, little);
  const u32 = (at: number) => view.getUint32(at, little);
  const entries = (ifd: number) => Array.from({ length: u16(ifd) }, (_, i) => ifd + 2 + i * 12);
  const gpsPointer = entries(u32(4)).find((entry) => u16(entry) === 0x8825);
  if (gpsPointer === undefined) return null;
  const latitude = entries(u32(gpsPointer + 8)).find((entry) => u16(entry) === 0x0002);
  if (latitude === undefined) return null;
  const values = u32(latitude + 8);
  const rational = (i: number) => u32(values + i * 8) / u32(values + i * 8 + 4);
  return [rational(0), rational(1), rational(2)];
}

/** The chunk names of a WebP file in order, e.g. `["VP8 "]`, or `["VP8X", "EXIF", "VP8 "]` with metadata. */
export function webpChunks(bytes: Uint8Array): string[] {
  const text = (at: number) => new TextDecoder().decode(bytes.subarray(at, at + 4));
  if (text(0) !== "RIFF" || text(8) !== "WEBP") throw new Error("Not a WebP file");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const chunks: string[] = [];
  for (let offset = 12; offset + 8 <= bytes.length; ) {
    chunks.push(text(offset));
    const size = view.getUint32(offset + 4, true);
    offset += 8 + size + (size % 2);
  }
  return chunks;
}
