/** Align with Spring `camunda.chat.max-attachment-bytes-per-file` (default 5 MB). */
export const CLIENT_MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024

export function assertFileSizesOk(files) {
  if (!files || !files.length) return
  for (const f of files) {
    if (f.size > CLIENT_MAX_ATTACHMENT_BYTES) {
      throw new Error(
        `File "${f.name}" is too large (max ${Math.floor(CLIENT_MAX_ATTACHMENT_BYTES / 1024 / 1024)} MB per file).`
      )
    }
  }
}

/**
 * Read browser File objects into JSON-safe payloads for the Spring API.
 * @param {File[]} files
 * @returns {Promise<{ fileName: string, mimeType: string, contentBase64: string }[]>}
 */
export function filesToAttachmentParts(files) {
  if (!files || files.length === 0) return Promise.resolve([])
  return Promise.all(
    files.map(
      (file) =>
        new Promise((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => {
            const result = String(reader.result || '')
            const i = result.indexOf(',')
            const contentBase64 = i >= 0 ? result.slice(i + 1) : result
            resolve({
              fileName: file.name || 'attachment',
              mimeType: file.type || 'application/octet-stream',
              contentBase64,
            })
          }
          reader.onerror = () => reject(reader.error || new Error('Failed to read file'))
          reader.readAsDataURL(file)
        })
    )
  )
}
