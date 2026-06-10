const base = process.env.REACT_APP_API_BASE_URL || ''

function parseErrorBody(data, fallback) {
  if (data && typeof data === 'object' && data.error) {
    return String(data.error)
  }
  return fallback
}

export async function health() {
  const r = await fetch(`${base}/api/chat/health`)
  if (!r.ok) throw new Error(await r.text())
  return r.json()
}

/**
 * POST /api/chat/start — { message?, studentEmail?, attachments? }
 */
export async function startFromChat(payload) {
  const r = await fetch(`${base}/api/chat/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      studentEmail: payload.studentEmail,
      message: payload.message ?? payload.initialMessage ?? '',
      attachments: payload.attachments && payload.attachments.length ? payload.attachments : undefined,
    }),
  })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) {
    throw new Error(parseErrorBody(data, r.statusText))
  }
  // Backend returns string so Zeebe processInstanceKey is not rounded by IEEE-754 in JSON.
  const id = data.conversationId
  if (id == null) throw new Error('Missing conversationId in response')
  return { processInstanceKey: String(id).trim() }
}

export async function pollSession(processInstanceKey) {
  const r = await fetch(`${base}/api/chat/${encodeURIComponent(processInstanceKey)}`)
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(parseErrorBody(data, r.statusText))

  const { status, message, messageId } = data
  if (status === 'pending_user_reply') {
    return {
      phase: 'awaiting_user',
      assistantMessage: message != null ? String(message) : '',
      // Engine job key of this assistant turn: lets the UI ignore stale polls without
      // comparing message text (identical texts on different turns are still shown).
      messageId: messageId != null ? String(messageId) : null,
    }
  }
  if (status === 'ended') {
    return { phase: 'ended', assistantMessage: null, messageId: null }
  }
  if (status === 'waiting' || status === 'processing') {
    return { phase: 'agent_running', assistantMessage: message != null ? String(message) : null, messageId: null }
  }
  return { phase: 'agent_running', assistantMessage: null, messageId: null }
}

/**
 * POST /api/chat/{id} — { message?, attachments? }
 */
export async function sendUserMessage(processInstanceKey, text, attachments) {
  const r = await fetch(`${base}/api/chat/${encodeURIComponent(processInstanceKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: text ?? '',
      attachments: attachments && attachments.length ? attachments : undefined,
    }),
  })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) {
    throw new Error(parseErrorBody(data, r.statusText))
  }
  return data
}
