import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

/**
 * Magazine files live in a private Cloudflare R2 bucket, reached through R2's
 * S3-compatible API. Browsers upload straight to R2 with short-lived signed
 * URLs, and readers download through /api/magazine-assets, which checks access.
 */

let client: S3Client | null = null

function env(name: string) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is not set. Add the Cloudflare R2 settings to .env.local.`)
  return value
}

function bucket() {
  return env('R2_BUCKET')
}

function r2() {
  client ??= new S3Client({
    region: 'auto',
    endpoint: `https://${env('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: env('R2_ACCESS_KEY_ID'), secretAccessKey: env('R2_SECRET_ACCESS_KEY') },
  })
  return client
}

/** A signed URL the browser can PUT one file to. It expires after `expiresIn` seconds. */
export async function createUploadUrl(key: string, contentType: string, expiresIn = 60 * 60) {
  return getSignedUrl(r2(), new PutObjectCommand({ Bucket: bucket(), Key: key, ContentType: contentType }), { expiresIn })
}

/** Read an object, optionally a byte range. Returns null when the object does not exist. */
export async function getObject(key: string, range?: string | null) {
  try {
    const result = await r2().send(new GetObjectCommand({ Bucket: bucket(), Key: key, ...(range ? { Range: range } : {}) }))
    if (!result.Body) return null
    return {
      stream: result.Body.transformToWebStream(),
      contentType: result.ContentType,
      contentLength: result.ContentLength,
      contentRange: result.ContentRange,
      etag: result.ETag,
    }
  } catch (error) {
    if (isMissing(error)) return null
    throw error
  }
}

/** Size and type of an object, or null when it does not exist. */
export async function headObject(key: string) {
  try {
    const result = await r2().send(new HeadObjectCommand({ Bucket: bucket(), Key: key }))
    return { size: result.ContentLength ?? 0, contentType: result.ContentType }
  } catch (error) {
    if (isMissing(error)) return null
    throw error
  }
}

/** Delete objects in batches of 1,000 (the S3 limit per request). */
export async function deleteObjects(keys: string[]) {
  for (let index = 0; index < keys.length; index += 1000) {
    const batch = keys.slice(index, index + 1000)
    await r2().send(new DeleteObjectsCommand({
      Bucket: bucket(),
      Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true },
    }))
  }
}

function isMissing(error: unknown) {
  return error instanceof S3ServiceException && (error.name === 'NoSuchKey' || error.name === 'NotFound' || error.$metadata.httpStatusCode === 404)
}
