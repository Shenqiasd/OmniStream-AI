import { mkdir, readFile, rm, stat, unlink, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { Readable } from 'node:stream'
import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { S3Service } from '@yikart/aws-s3'
import mime from 'mime-types'
import { config } from '../../config'

function normalizeObjectPath(objectPath: string) {
  return objectPath.replace(/^\/+/, '').replace(/\\/g, '/')
}

export function isLocalMediaStorageEnabled() {
  return ['development', 'local'].includes(config.environment)
}

export function resolveLocalMediaRoot() {
  return resolve(process.cwd(), '..', '..', 'storage', 'media')
}

export function resolveLocalMediaBaseUrl() {
  return `http://localhost:${config.port}/media/`
}

@Injectable()
export class LocalMediaService implements OnModuleInit {
  private readonly logger = new Logger(LocalMediaService.name)
  private readonly localRoot = resolveLocalMediaRoot()
  private readonly localBaseUrl = resolveLocalMediaBaseUrl()
  private readonly multipartRoot = resolve(this.localRoot, '.multipart')

  constructor(
    private readonly s3Service: S3Service,
  ) {}

  onModuleInit() {
    if (this.isLocalBackend()) {
      void this.ensureLocalRoot()
    }
  }

  isLocalBackend() {
    return isLocalMediaStorageEnabled()
  }

  async ensureLocalRoot() {
    await mkdir(this.localRoot, { recursive: true })
  }

  buildUrl(objectPath: string) {
    if (!objectPath) {
      return objectPath
    }

    const normalizedPath = normalizeObjectPath(objectPath)
    if (/^https?:\/\//.test(normalizedPath)) {
      return normalizedPath
    }

    if (this.isLocalBackend()) {
      return new URL(normalizedPath, this.localBaseUrl).toString()
    }

    return this.s3Service.buildUrl(normalizedPath)
  }

  async putObject(
    objectPath: string,
    file: unknown,
    contentType?: string,
  ) {
    const normalizedPath = normalizeObjectPath(objectPath)

    if (!this.isLocalBackend()) {
      return await this.s3Service.putObject(normalizedPath, file as any, contentType)
    }

    const absolutePath = this.resolveAbsolutePath(normalizedPath)
    await mkdir(dirname(absolutePath), { recursive: true })
    const buffer = await this.toBuffer(file)
    await writeFile(absolutePath, buffer)

    return { path: normalizedPath }
  }

  async putObjectFromUrl(url: string, objectPath: string) {
    const normalizedPath = normalizeObjectPath(objectPath)

    if (!this.isLocalBackend()) {
      return await this.s3Service.putObjectFromUrl(url, normalizedPath)
    }

    try {
      await this.headObject(normalizedPath)
      return { path: normalizedPath, exists: true }
    }
    catch {
      const response = await fetch(url)
      return await this.putObject(
        normalizedPath,
        response.body,
        response.headers.get('content-type') || undefined,
      )
    }
  }

  async headObject(objectPath: string) {
    const normalizedPath = normalizeObjectPath(objectPath)

    if (!this.isLocalBackend()) {
      return await this.s3Service.headObject(normalizedPath)
    }

    const absolutePath = this.resolveAbsolutePath(normalizedPath)
    const metadata = await stat(absolutePath)

    return {
      ContentLength: metadata.size,
      ContentType: mime.lookup(absolutePath) || 'application/octet-stream',
    }
  }

  async deleteObject(objectPath: string) {
    const normalizedPath = normalizeObjectPath(objectPath)

    if (!this.isLocalBackend()) {
      await this.s3Service.deleteObject(normalizedPath)
      return
    }

    const absolutePath = this.resolveAbsolutePath(normalizedPath)
    if (existsSync(absolutePath)) {
      await unlink(absolutePath)
    }
  }

  async getUploadSign(objectPath: string, contentType?: string) {
    const normalizedPath = normalizeObjectPath(objectPath)

    if (!this.isLocalBackend()) {
      return await this.s3Service.getUploadSign(normalizedPath, contentType)
    }

    return {
      mode: 'local',
      uploadUrl: `http://localhost:${config.port}/file/upload`,
      url: this.localBaseUrl,
      fields: {
        key: normalizedPath,
      },
    }
  }

  async initiateMultipartUpload(objectPath: string, contentType?: string) {
    const normalizedPath = normalizeObjectPath(objectPath)

    if (!this.isLocalBackend()) {
      return await this.s3Service.initiateMultipartUpload(normalizedPath, contentType)
    }

    const uploadId = randomUUID()
    const sessionDir = this.resolveMultipartDir(uploadId)
    await mkdir(sessionDir, { recursive: true })
    await writeFile(
      resolve(sessionDir, 'meta.json'),
      JSON.stringify({ objectPath: normalizedPath, contentType }),
      'utf8',
    )

    return uploadId
  }

  async uploadPart(
    objectPath: string,
    uploadId: string,
    partNumber: number,
    partData: unknown,
  ) {
    const normalizedPath = normalizeObjectPath(objectPath)

    if (!this.isLocalBackend()) {
      return await this.s3Service.uploadPart(normalizedPath, uploadId, partNumber, partData as any)
    }

    const sessionDir = this.resolveMultipartDir(uploadId)
    await mkdir(sessionDir, { recursive: true })
    const meta = await this.readMultipartMeta(uploadId)
    if (meta.objectPath !== normalizedPath) {
      this.logger.warn(`Multipart object path mismatch for ${uploadId}: ${normalizedPath} != ${meta.objectPath}`)
    }

    const buffer = await this.toBuffer(partData)
    await writeFile(resolve(sessionDir, `${partNumber}.part`), buffer)

    return {
      ETag: `local-part-${partNumber}`,
      PartNumber: partNumber,
    }
  }

  async completeMultipartUpload(
    objectPath: string,
    uploadId: string,
    parts: { PartNumber: number, ETag: string }[],
  ) {
    const normalizedPath = normalizeObjectPath(objectPath)

    if (!this.isLocalBackend()) {
      await this.s3Service.completeMultipartUpload(normalizedPath, uploadId, parts)
      return
    }

    const sessionDir = this.resolveMultipartDir(uploadId)
    const orderedParts = [...parts].sort((a, b) => a.PartNumber - b.PartNumber)
    const buffers = await Promise.all(
      orderedParts.map(part => readFile(resolve(sessionDir, `${part.PartNumber}.part`))),
    )

    await this.putObject(normalizedPath, Buffer.concat(buffers))
    await rm(sessionDir, { recursive: true, force: true })
  }

  private resolveAbsolutePath(objectPath: string) {
    const absolutePath = resolve(this.localRoot, objectPath)
    if (!absolutePath.startsWith(this.localRoot)) {
      throw new Error(`Invalid object path: ${objectPath}`)
    }
    return absolutePath
  }

  private resolveMultipartDir(uploadId: string) {
    return resolve(this.multipartRoot, uploadId)
  }

  private async readMultipartMeta(uploadId: string): Promise<{ objectPath: string, contentType?: string }> {
    const raw = await readFile(resolve(this.resolveMultipartDir(uploadId), 'meta.json'), 'utf8')
    return JSON.parse(raw)
  }

  private async toBuffer(file: unknown): Promise<Buffer> {
    if (Buffer.isBuffer(file)) {
      return file
    }
    if (file instanceof Uint8Array) {
      return Buffer.from(file)
    }
    if (file instanceof ArrayBuffer) {
      return Buffer.from(file)
    }
    if (typeof file === 'string') {
      return Buffer.from(file)
    }
    if (typeof Blob !== 'undefined' && file instanceof Blob) {
      return Buffer.from(await file.arrayBuffer())
    }
    if (this.isWebReadableStream(file)) {
      return await this.readNodeStream(Readable.fromWeb(file as any))
    }
    if (this.isNodeReadableStream(file)) {
      return await this.readNodeStream(file)
    }

    throw new Error(`Unsupported local media payload: ${typeof file}`)
  }

  private isWebReadableStream(value: unknown): value is ReadableStream<Uint8Array> {
    return value != null && typeof (value as ReadableStream<Uint8Array>).getReader === 'function'
  }

  private isNodeReadableStream(value: unknown): value is NodeJS.ReadableStream {
    return value != null && typeof (value as NodeJS.ReadableStream).on === 'function'
  }

  private async readNodeStream(stream: NodeJS.ReadableStream): Promise<Buffer> {
    const chunks: Buffer[] = []
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    }
    return Buffer.concat(chunks)
  }
}
