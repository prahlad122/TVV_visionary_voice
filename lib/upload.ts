'use client'

export type UploadAssetType = 'issue' | 'cover' | 'page'

type UploadOptions = {
  issueId: string
  assetType: UploadAssetType
  /** Name inside the issue's folder, e.g. `issue-may.pdf` or `pages/page-0001.webp`. */
  filename: string
  onProgress?: (loaded: number) => void
}

async function signUpload(file: Blob, options: UploadOptions) {
  const response = await fetch('/api/storage/upload-url', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ issueId: options.issueId, assetType: options.assetType, filename: options.filename, contentType: file.type, size: file.size }),
  })
  const body = await response.json().catch(() => ({})) as { url?: string; key?: string; error?: string }
  if (!response.ok || !body.url || !body.key) throw new Error(body.error ?? `Upload could not start (${response.status}).`)
  return { url: body.url, key: body.key }
}

function put(url: string, file: Blob, onProgress?: (loaded: number) => void) {
  // XMLHttpRequest, unlike fetch, reports upload progress.
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest()
    request.open('PUT', url)
    request.setRequestHeader('Content-Type', file.type)
    request.upload.onprogress = (event) => onProgress?.(event.loaded)
    request.onload = () => request.status >= 200 && request.status < 300
      ? resolve()
      : reject(new Error(`Upload to storage failed (${request.status}).`))
    request.onerror = () => reject(new Error('Upload to storage failed. Check your connection and the R2 bucket CORS settings.'))
    request.send(file)
  })
}

/**
 * Upload a file straight from the browser to Cloudflare R2 and return its
 * object key. A failed transfer is retried once with a fresh signed URL.
 */
export async function uploadToStorage(file: Blob, options: UploadOptions): Promise<string> {
  for (let attempt = 1; ; attempt += 1) {
    const { url, key } = await signUpload(file, options)
    try {
      await put(url, file, options.onProgress)
      return key
    } catch (error) {
      if (attempt >= 2) throw error
      options.onProgress?.(0)
    }
  }
}
