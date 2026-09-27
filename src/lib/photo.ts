/** Longest edge of a stored photo. Plenty for a phone screen, and about 250 KB as a JPEG. */
export const MAX_PHOTO_EDGE = 1600
const JPEG_QUALITY = 0.8

export const PHOTO_BUCKET = 'dish-photos'

/** Where a dish's photo lives in the bucket. Row-level security reads the owner and visit from it. */
export function photoPath(ownerId: string, visitId: string, dishId: string): string {
  return `${ownerId}/${visitId}/${dishId}.jpg`
}

/** Scales width and height down to fit within `max` on the long edge, never up. */
export function fitWithin(width: number, height: number, max: number): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height))
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

/**
 * Turns a photo from the camera or library into a small JPEG. Drawing it onto
 * a canvas also drops its metadata, including where it was taken. Safari
 * decodes iPhone HEIC photos and applies their rotation when loading the image.
 */
export async function shrinkPhoto(file: Blob): Promise<Blob> {
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    try {
      await img.decode()
    } catch {
      throw new Error("That photo couldn't be opened. Try taking it again or picking another one.")
    }
    const { width, height } = fitWithin(img.naturalWidth, img.naturalHeight, MAX_PHOTO_EDGE)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) throw new Error("This browser can't prepare photos.")
    context.drawImage(img, 0, 0, width, height)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY))
    if (!blob) throw new Error("That photo couldn't be prepared. Try another one.")
    return blob
  } finally {
    URL.revokeObjectURL(url)
  }
}
