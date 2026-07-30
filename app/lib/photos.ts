// Getting an owner's photo to the API — ADR-019 amendment 2026-07-28.
//
// This is a TRANSFER optimisation and nothing else. It is not a security
// control (the browser is the attacker's side of the wire) and it does not
// produce a served size (the Function re-encodes into card/detail/full
// regardless). Mobile uplink is several times slower than downlink, and an
// owner posting twelve 8 MP photos should not wait two minutes to find out
// whether the first one was accepted.
//
// So the browser downscales to a GENEROUS ceiling and stops. Making a final
// size here would hand us a lossy master we could never derive a new size
// from — the reason the full variant exists at all.

/** The long edge the browser aims for. Matches the server's `full`: sending
 *  more than the master will ever be is pure upload time. */
export const UPLOAD_EDGE = 2560;

/** The widths the server writes (`PhotoPipeline`). Used to describe a `srcset`
 *  honestly — a width descriptor the file does not have is how the browser
 *  ends up choosing the wrong one. */
const WIDTHS = { card: 800, detail: 1600, full: 2560 } as const;

/** A photo in any of the shapes the API hands out. Both the public and the
 *  owner projections carry the same three URLs under the same names. */
type Sized = { url: string; cardUrl?: string | null; detailUrl?: string | null };

/**
 * A `srcset` covering whatever sizes this photo actually has.
 *
 * Photos uploaded before the pipeline existed have only `url`, and for those
 * this returns undefined rather than a single-entry srcset — one candidate
 * tells the browser nothing it does not already get from `src`.
 *
 * The width descriptors are approximate for a portrait photo, whose LONG edge
 * is its height: a 2560-tall portrait is 1707 wide, so `2560w` overstates it.
 * That is the right way to be wrong — the browser errs toward the larger file
 * on a wide layout, and never toward a card image stretched over a hero.
 */
export function srcSet(photo: Sized): string | undefined {
  const entries = [
    photo.cardUrl ? `${photo.cardUrl} ${WIDTHS.card}w` : null,
    photo.detailUrl ? `${photo.detailUrl} ${WIDTHS.detail}w` : null,
    photo.cardUrl || photo.detailUrl ? `${photo.url} ${WIDTHS.full}w` : null,
  ].filter((e) => e !== null);
  return entries.length > 1 ? entries.join(", ") : undefined;
}

/**
 * How wide the image will actually be drawn.
 *
 * Without a `sizes`, a srcset is measured against the full viewport and every
 * image downloads the largest candidate — the exact problem this exists to
 * fix. But an over-declared `sizes` is the same bug in miniature: a tile drawn
 * 195 px that claims `50vw` fetches the 1600 px file to draw it at 195. So
 * these are per-position, measured, rather than one value shared by three
 * layouts that are not the same size.
 *
 * Slightly generous is the right direction to err — the cost is one size step,
 * where being under means a visibly soft image.
 */
export const SIZES = {
  /** Search results: full width on a phone, half a 1280 px grid above that. */
  card: "(min-width: 40rem) 40vw, 100vw",
  /** The gallery's hero frame — roughly half the content column. */
  hero: "(min-width: 40rem) 50vw, 100vw",
  /** The four supporting tiles beside it, and the dialog's two-column grid.
   *  Both land near a quarter of the viewport. */
  tile: "(min-width: 40rem) 25vw, 100vw",
  /** A single photo inside `ui/Dialog`, whose fixed class caps it at
   *  `min(92vw, 28rem)` — the image is drawn at exactly that width, not a
   *  viewport fraction, once the viewport passes 28rem. */
  lightbox: "(min-width: 28rem) 28rem, 92vw",
} as const;

/** Below this, resizing costs a decode and an encode to save nothing. */
const WORTH_IT_BYTES = 900 * 1024;

/** What the API accepts. Anything else is refused server-side by its magic
 *  bytes; this only keeps the file picker honest and the error early. */
export const ACCEPT = "image/jpeg,image/png,image/webp";

/**
 * A smaller version of the file, or the file itself.
 *
 * Never throws and never blocks the upload. Every failure path — an exotic
 * colour profile, an out-of-memory canvas on a cheap phone, a browser without
 * `createImageBitmap` — returns the original untouched, because a slow upload
 * beats a refused one. The server's behaviour does not change either way.
 */
export async function shrink(file: File): Promise<Blob> {
  if (!worthShrinking(file)) return file;

  try {
    const bitmap = await decode(file);
    if (!bitmap) return file;

    try {
      // Already small enough: whatever the camera wrote is a better master
      // than anything we would re-encode it into.
      if (Math.max(bitmap.width, bitmap.height) <= UPLOAD_EDGE) return file;

      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext("2d");
      if (!context) return file;
      context.drawImage(bitmap, 0, 0);

      const shrunk = await new Promise<Blob | null>((resolve) =>
        // WebP at 0.9 — the file still has to survive a second encode
        // server-side, so this is deliberately generous. JPEG would also do;
        // WebP is smaller at the same visible quality and every browser that
        // has `createImageBitmap` can write it.
        canvas.toBlob(resolve, "image/webp", 0.9),
      );
      canvas.width = canvas.height = 0;

      // A "smaller" file that is bigger is a worse master AND a slower upload.
      return shrunk && shrunk.size < file.size ? shrunk : file;
    } finally {
      bitmap.close();
    }
  } catch {
    return file;
  }
}

const worthShrinking = (file: File) =>
  file.size > WORTH_IT_BYTES &&
  typeof createImageBitmap === "function" &&
  typeof document !== "undefined";

/**
 * Decode straight to the target size.
 *
 * `resizeWidth`/`resizeHeight` make the downscale happen DURING decode, so a
 * 50 MP photo never becomes a 200 MB buffer on a phone that cannot hold one.
 * Where the options are unsupported they are ignored rather than rejected,
 * which is why the full-size decode below is a fallback and not a branch.
 *
 * `imageOrientation: "from-image"` applies EXIF rotation. Without it a canvas
 * round-trip both ignores the flag and drops it, and a portrait photo would
 * arrive at the server sideways with nothing left to say so.
 */
async function decode(file: File): Promise<ImageBitmap | null> {
  const options: ImageBitmapOptions = {
    imageOrientation: "from-image",
    resizeQuality: "high",
  };
  try {
    const probe = await createImageBitmap(file, options);
    // Read before closing: `close()` zeroes width and height, so a scale
    // computed afterwards would ask for a 0x0 bitmap.
    const { width, height } = probe;
    const longest = Math.max(width, height);
    if (longest <= UPLOAD_EDGE) return probe;

    const scale = UPLOAD_EDGE / longest;
    probe.close();
    return await createImageBitmap(file, {
      ...options,
      resizeWidth: Math.round(width * scale),
      resizeHeight: Math.round(height * scale),
    });
  } catch {
    return null;
  }
}
