import { useCallback, useEffect, useRef, useState } from 'react';
import './App.css';
import logo from './code81-logo.svg';
import * as api from './api';
import { assertFileSizesOk, filesToAttachmentParts } from './fileAttachments';

function App() {
  const [configOk, setConfigOk] = useState(null);
  const [error, setError] = useState('');
  const [processInstanceKey, setProcessInstanceKey] = useState('');
  const [studentEmail, setStudentEmail] = useState('');
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [pendingFiles, setPendingFiles] = useState([]);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState('idle');
  const pollRef = useRef(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => {
    api.health().then(() => setConfigOk(true)).catch(() => setConfigOk(false));
  }, []);

  const appendUser = useCallback((text, fileNames) => {
    const extra =
      fileNames && fileNames.length ? `\nAttached: ${fileNames.join(', ')}` : '';
    setMessages((m) => [...m, { role: 'user', content: text + extra }]);
  }, []);

  const startPolling = useCallback(
    (key) => {
      stopPolling();
      pollRef.current = setInterval(async () => {
        try {
          const s = await api.pollSession(key);
          if (s.phase === 'awaiting_user' && s.assistantMessage) {
            setPhase('awaiting_user');
            setMessages((prev) => {
              const incoming = s.assistantMessage;
              const last = prev[prev.length - 1];
              if (last && last.role === 'assistant' && last.content === incoming) {
                return prev;
              }
              // After a user reply (e.g. attachment-only), last is user — stale polls can repeat the same bot text.
              let lastUserIdx = -1;
              for (let i = prev.length - 1; i >= 0; i--) {
                if (prev[i].role === 'user') {
                  lastUserIdx = i;
                  break;
                }
              }
              if (lastUserIdx > 0) {
                const beforeLastUser = prev[lastUserIdx - 1];
                if (
                  beforeLastUser &&
                  beforeLastUser.role === 'assistant' &&
                  beforeLastUser.content === incoming
                ) {
                  return prev;
                }
              }
              return [...prev, { role: 'assistant', content: incoming }];
            });
            stopPolling();
          } else if (s.phase === 'agent_running') {
            setPhase('agent_running');
          }
        } catch (e) {
          setError(String(e.message || e));
          stopPolling();
        }
      }, 3000);
    },
    [stopPolling]
  );

  useEffect(() => () => stopPolling(), [stopPolling]);

  const hasOutgoing = input.trim().length > 0 || pendingFiles.length > 0;

  const handleSend = async (e) => {
    e.preventDefault();
    if (!hasOutgoing || busy) return;

    const text = input.trim();
    const files = [...pendingFiles];
    const names = files.map((f) => f.name);

    setError('');
    setBusy(true);
    setInput('');
    setPendingFiles([]);
    setFileInputKey((k) => k + 1);

    const displayText = text || (files.length ? `[${files.length} file(s)]` : '');
    appendUser(displayText, names);

    try {
      assertFileSizesOk(files);
      const attachments = await filesToAttachmentParts(files);

      if (!processInstanceKey) {
        const { processInstanceKey: key } = await api.startFromChat({
          message: text,
          studentEmail: studentEmail.trim() || undefined,
          attachments,
        });
        setProcessInstanceKey(key);
        setPhase('agent_running');
        startPolling(key);
      } else {
        setPhase('agent_running');
        await api.sendUserMessage(processInstanceKey, text, attachments);
        startPolling(processInstanceKey);
      }
    } catch (err) {
      setError(String(err.message || err));
    } finally {
      setBusy(false);
    }
  };

  const clearFiles = () => {
    setPendingFiles([]);
    setFileInputKey((k) => k + 1);
  };

  const canSend =
    hasOutgoing &&
    !busy &&
    ((!processInstanceKey && phase === 'idle') || (!!processInstanceKey && phase === 'awaiting_user'));

  return (
    <div className="app">
      <header className="app-header">
        <img src={logo} alt="Code81 Logo" className="navbar-logo" />
        <h1>Absent Chatbot</h1>
      </header>

      {configOk === false && (
        <div className="banner warn">
          Cannot reach the Spring API (<code>/api/chat/health</code>). Start the backend on port{' '}
          <code>8080</code> (<code>backent-chatbot</code>) or set <code>REACT_APP_API_BASE_URL</code>.
        </div>
      )}

      <main className="layout layout-single">
        <section className="chat-panel">
          <div className="panel-header">

            {processInstanceKey ? (
              <p className="meta">
                Conversation / process instance: <code>{processInstanceKey}</code>
              </p>
            ) : null}


          </div>

          <div className="messages" aria-live="polite">
            {messages.length === 0 ? (
              <p className="empty">
                Welcome to the Code81 Absence Request Portal.<br/><br/>
                Please provide the details of your absence and attach any supporting documentation (such as medical certificates). Once submitted, your request will be reviewed and you will receive a response shortly.
              </p>
            ) : (
              messages.map((msg, i) => (
                <div key={i} className={`msg msg-${msg.role}`}>
                  <span className="msg-label">
                    {msg.role === 'user' ? (
                      <>You <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg></>
                    ) : (
                      <><svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg> Agent</>
                    )}
                  </span>
                  <div className="msg-bubble">{msg.content}</div>
                </div>
              ))
            )}
            {(busy || phase === 'agent_running') && (
              <div className="msg msg-assistant">
                <span className="msg-label">
                  <><svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg> Agent</>
                </span>
                <div className="msg-bubble typing-indicator">
                  <span></span><span></span><span></span>
                </div>
              </div>
            )}
          </div>

          <div className="composer-section">
            {pendingFiles.length > 0 && (
              <div className="file-chips">
                {pendingFiles.map((f) => (
                  <span key={f.name + f.size} className="file-chip" title={f.name}>
                    <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" style={{marginRight: 4}}><path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"></path></svg>
                    {f.name}
                  </span>
                ))}
                <button type="button" className="link-btn" onClick={clearFiles}>
                  Clear
                </button>
              </div>
            )}

            <form onSubmit={handleSend} className="composer">
              <label className="file-picker" title="Attach files">
                <input
                  key={fileInputKey}
                  type="file"
                  multiple
                  accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,application/pdf,image/*"
                  onChange={(e) => {
                    const list = e.target.files ? Array.from(e.target.files) : [];
                    setPendingFiles(list);
                  }}
                  disabled={busy || (processInstanceKey !== '' && phase !== 'awaiting_user')}
                />
                <div className={`attachment-btn ${(busy || (processInstanceKey !== '' && phase !== 'awaiting_user')) ? 'disabled' : ''}`}>
                  <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"></path></svg>
                </div>
              </label>

              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={
                  processInstanceKey
                    ? 'Reply to the agent…'
                    : 'Describe your absence…'
                }
                disabled={busy || (processInstanceKey !== '' && phase !== 'awaiting_user')}
              />
              <button type="submit" className="send-btn" disabled={!canSend}>
                <span>Send</span>
                <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"></path></svg>
              </button>
            </form>
          </div>
        </section>
      </main>

      {error && (
        <div className="banner error" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}

export default App;
