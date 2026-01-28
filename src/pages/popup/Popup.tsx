import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';

interface IpInfo {
  ip: string;
  country: string;
  city: string;
  region: string;
  org: string;
}

interface PingResult {
  url: string;
  latency: number | null;
  status: 'pending' | 'success' | 'error';
  isAverage?: boolean;
  testCount?: number;
  allLatencies?: number[];
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

type TabType = 'vpn' | 'chat';

export default function Popup() {
  const [activeTab, setActiveTab] = useState<TabType>('vpn');

  const [ipInfo, setIpInfo] = useState<IpInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pingResult, setPingResult] = useState<PingResult | null>(null);
  const [testing, setTesting] = useState(false);
  const [testingAverage, setTestingAverage] = useState(false);
  const [avgProgress, setAvgProgress] = useState(0);

  // Chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchIpInfo();
  }, []);

  const fetchIpInfo = async () => {
    setLoading(true);
    setError(null);
    try {
      // Using ipwho.is - HTTPS, free, no API key required
      const response = await fetch('https://ipwho.is/');
      if (!response.ok) throw new Error('Failed to fetch IP info');
      const data = await response.json();
      if (!data.success) throw new Error(data.message || 'API error');
      setIpInfo({
        ip: data.ip,
        country: data.country,
        city: data.city,
        region: data.region,
        org: data.connection?.isp || data.connection?.org || 'Unknown',
      });
    } catch (err) {
      console.error('IP fetch error:', err);
      setError('Failed to fetch IP information');
    } finally {
      setLoading(false);
    }
  };

  const singlePing = async (): Promise<number | null> => {
    const startTime = performance.now();
    try {
      const response = await fetch('https://www.cloudflare.com/cdn-cgi/trace', {
        method: 'GET',
        cache: 'no-store',
      });
      const endTime = performance.now();
      if (response.ok) {
        return Math.round(endTime - startTime);
      }
      return null;
    } catch {
      return null;
    }
  };

  const testConnection = async () => {
    setTesting(true);
    setPingResult({ url: 'cloudflare.com', latency: null, status: 'pending' });

    const latency = await singlePing();

    if (latency !== null) {
      setPingResult({
        url: 'cloudflare.com',
        latency,
        status: 'success',
      });
    } else {
      setPingResult({
        url: 'cloudflare.com',
        latency: null,
        status: 'error',
      });
    }
    setTesting(false);
  };

  const testAverageConnection = async () => {
    const TEST_COUNT = 5;
    setTestingAverage(true);
    setAvgProgress(0);
    setPingResult({
      url: 'cloudflare.com',
      latency: null,
      status: 'pending',
      isAverage: true,
      testCount: TEST_COUNT,
    });

    const latencies: number[] = [];

    for (let i = 0; i < TEST_COUNT; i++) {
      setAvgProgress(i + 1);
      const latency = await singlePing();
      if (latency !== null) {
        latencies.push(latency);
      }
      // Small delay between tests
      if (i < TEST_COUNT - 1) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }

    if (latencies.length > 0) {
      const avgLatency = Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length);
      const minLatency = Math.min(...latencies);
      const maxLatency = Math.max(...latencies);
      setPingResult({
        url: 'cloudflare.com',
        latency: avgLatency,
        status: 'success',
        isAverage: true,
        testCount: latencies.length,
        allLatencies: latencies,
      });
    } else {
      setPingResult({
        url: 'cloudflare.com',
        latency: null,
        status: 'error',
        isAverage: true,
      });
    }
    setTestingAverage(false);
    setAvgProgress(0);
  };

  const getCountryFlag = (countryName: string) => {
    const flags: Record<string, string> = {
      'United States': '🇺🇸',
      'Canada': '🇨🇦',
      'United Kingdom': '🇬🇧',
      'Germany': '🇩🇪',
      'France': '🇫🇷',
      'Japan': '🇯🇵',
      'Australia': '🇦🇺',
      'Netherlands': '🇳🇱',
      'Singapore': '🇸🇬',
      'Hong Kong': '🇭🇰',
      'China': '🇨🇳',
      'Taiwan': '🇹🇼',
      'South Korea': '🇰🇷',
      'India': '🇮🇳',
      'Brazil': '🇧🇷',
      'Mexico': '🇲🇽',
      'Switzerland': '🇨🇭',
      'Sweden': '🇸🇪',
      'Norway': '🇳🇴',
      'Ireland': '🇮🇪',
    };
    return flags[countryName] || '🌍';
  };

  const getLatencyColor = (latency: number) => {
    if (latency < 100) return 'good';
    if (latency < 300) return 'warn';
    return 'bad';
  };

  const isAnyTestRunning = testing || testingAverage;

  const sendChatMessage = async () => {
    if (!chatInput.trim() || chatLoading) return;

    const userMessage = chatInput.trim();
    setChatInput('');
    setChatMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setChatLoading(true);

    // Add empty assistant message that will be streamed
    setChatMessages(prev => [...prev, { role: 'assistant', content: '' }]);

    try {
      const apiKey = import.meta.env.VITE_COHERE_KEY;
      if (!apiKey) {
        throw new Error('VITE_COHERE_KEY not set');
      }

      // Build conversation history for context
      const allMessages = [...chatMessages, { role: 'user' as const, content: userMessage }];
      const cohereMessages = allMessages.map(m => ({
        role: m.role,
        content: m.content,
      }));

      const response = await fetch('https://api.cohere.com/v2/chat', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
        },
        body: JSON.stringify({
          model: 'command-a-03-2025',
          temperature: 0.7,
          stream: true,
          messages: cohereMessages,
        }),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('No response body');
      }

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);
              if (parsed.type === 'content-delta') {
                const text = parsed.delta?.message?.content?.text || '';
                setChatMessages(prev => {
                  const updated = [...prev];
                  const lastIdx = updated.length - 1;
                  if (updated[lastIdx]?.role === 'assistant') {
                    updated[lastIdx] = {
                      ...updated[lastIdx],
                      content: updated[lastIdx].content + text
                    };
                  }
                  return updated;
                });
                // Auto-scroll
                if (chatContainerRef.current) {
                  chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
                }
              }
            } catch {
              // Skip non-JSON lines
            }
          }
        }
      }
    } catch (err) {
      console.error('Chat error:', err);
      setChatMessages(prev => {
        const updated = [...prev];
        const lastIdx = updated.length - 1;
        if (updated[lastIdx]?.role === 'assistant') {
          updated[lastIdx] = {
            ...updated[lastIdx],
            content: `Error: ${err instanceof Error ? err.message : 'Failed to connect'}`
          };
        }
        return updated;
      });
    } finally {
      setChatLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendChatMessage();
    }
  };

  return (
    <div className="popup-container">
      {/* Header with tabs */}
      <header className="header">
        <span className="header-title">🔐 <strong>VPN Check</strong></span>
        <div className="tab-buttons">
          <button
            className={`tab-btn ${activeTab === 'vpn' ? 'active' : ''}`}
            onClick={() => setActiveTab('vpn')}
          >
            VPN
          </button>
          <button
            className={`tab-btn ${activeTab === 'chat' ? 'active' : ''}`}
            onClick={() => setActiveTab('chat')}
          >
            🤖 Chat
          </button>
        </div>
      </header>

      {/* VPN Tab Content */}
      {activeTab === 'vpn' && (
        <>
          {/* IP Information */}
          <section className="card">
            {loading ? (
              <div className="loading">
                <div className="spinner"></div>
              </div>
            ) : error ? (
              <div className="error-state">
                <p className="error-text">{error}</p>
                <button onClick={fetchIpInfo} className="link-button">
                  retry
                </button>
              </div>
            ) : ipInfo && (
              <>
                <div className="country-display">
                  <span className="country-flag">{getCountryFlag(ipInfo.country)}</span>
                  <span className="country-name">{ipInfo.country}</span>
                </div>

                <div className="info-rows">
                  <div className="info-row">
                    <span className="info-label">ip</span>
                    <span className="info-value mono">{ipInfo.ip}</span>
                  </div>

                  <div className="info-row">
                    <span className="info-label">location</span>
                    <span className="info-value">{ipInfo.city}, {ipInfo.region}</span>
                  </div>

                  <div className="info-row">
                    <span className="info-label">provider</span>
                    <span className="info-value truncate" title={ipInfo.org}>
                      {ipInfo.org}
                    </span>
                  </div>
                </div>
              </>
            )}
          </section>

          {/* Connection Test */}
          <section className="card">
            <div className="button-group">
              <button
                onClick={testConnection}
                disabled={isAnyTestRunning}
                className="btn"
              >
                {testing ? (
                  <span className="spinner-small"></span>
                ) : (
                  <>⚡ <strong>Ping</strong></>
                )}
              </button>

              <button
                onClick={testAverageConnection}
                disabled={isAnyTestRunning}
                className="btn"
              >
                {testingAverage ? (
                  <span>{avgProgress}/5</span>
                ) : (
                  <>📊 <strong>Avg ×5</strong></>
                )}
              </button>
            </div>

            {pingResult && (
              <div className="result-display">
                {pingResult.status === 'pending' ? (
                  <p className="result-pending">
                    {pingResult.isAverage
                      ? `test ${avgProgress}/${pingResult.testCount}`
                      : 'testing...'}
                  </p>
                ) : pingResult.status === 'success' ? (
                  <div className="result-success">
                    <p className={`latency-value ${getLatencyColor(pingResult.latency!)}`}>
                      <strong>{pingResult.latency}ms</strong>
                    </p>
                    {pingResult.isAverage && pingResult.allLatencies && (
                      <>
                        <div className="latency-details">
                          <span>min {Math.min(...pingResult.allLatencies)}</span>
                          <span>·</span>
                          <span>max {Math.max(...pingResult.allLatencies)}</span>
                        </div>
                        <div className="individual-tests">
                          <span className="tests-label">Tests:</span>
                          {pingResult.allLatencies.map((l, i) => (
                            <span key={i} className={`test-value ${getLatencyColor(l)}`}>
                              {l}{i < pingResult.allLatencies!.length - 1 ? ',' : ''}
                            </span>
                          ))}
                        </div>
                      </>
                    )}
                    <p className="status-label">
                      {pingResult.latency! < 100 ? '✨ Excellent' : pingResult.latency! < 300 ? '👍 Good' : '🐌 Slow'}
                    </p>
                  </div>
                ) : (
                  <div className="result-error">
                    <p>❌ Connection failed</p>
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Refresh */}
          <button onClick={fetchIpInfo} className="refresh-button">
            refresh
          </button>
        </>
      )}

      {/* Chat Tab Content */}
      {activeTab === 'chat' && (
        <div className="chat-container">
          {/* Chat messages */}
          <div className="chat-messages" ref={chatContainerRef}>
            {chatMessages.length === 0 ? (
              <div className="chat-empty">
                <p>👋 Ask me anything!</p>
                <p className="chat-hint">Powered by Cohere</p>
              </div>
            ) : (
              chatMessages.map((msg, idx) => (
                <div key={idx} className={`chat-message ${msg.role}`}>
                  <div className="message-content">
                    {msg.role === 'assistant' ? (
                      <ReactMarkdown>{msg.content || '...'}</ReactMarkdown>
                    ) : (
                      msg.content
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Chat input */}
          <div className="chat-input-container">
            <input
              type="text"
              className="chat-input"
              placeholder="Type a message..."
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={chatLoading}
            />
            <button
              className="chat-send-btn"
              onClick={sendChatMessage}
              disabled={chatLoading || !chatInput.trim()}
            >
              {chatLoading ? <span className="spinner-small"></span> : '→'}
            </button>
          </div>
        </div>
      )}

      <style>{`
        .popup-container {
          padding: 16px;
          background: var(--bg-dark);
          min-height: 100%;
        }

        .header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
          padding-bottom: 12px;
          border-bottom: 1px solid var(--border-subtle);
        }

        .header-title {
          font-size: 14px;
          letter-spacing: 0.5px;
          color: var(--chalk-muted);
          text-transform: lowercase;
        }

        .tab-buttons {
          display: flex;
          gap: 4px;
        }

        .tab-btn {
          background: none;
          border: 1px solid var(--border-subtle);
          color: var(--chalk-dim);
          font-size: 11px;
          padding: 4px 10px;
          border-radius: 3px;
          cursor: pointer;
          font-family: inherit;
          transition: all 0.15s;
        }

        .tab-btn:hover {
          border-color: var(--chalk-dim);
          color: var(--chalk-light);
        }

        .tab-btn.active {
          background: var(--chalk-dim);
          border-color: var(--chalk-dim);
          color: var(--bg-dark);
        }

        /* Chat UI */
        .chat-container {
          display: flex;
          flex-direction: column;
          height: 350px;
        }

        .chat-messages {
          flex: 1;
          overflow-y: auto;
          padding: 8px 0;
        }

        .chat-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100%;
          color: var(--chalk-dim);
        }

        .chat-empty p {
          margin: 4px 0;
        }

        .chat-hint {
          font-size: 10px;
          color: var(--chalk-dark);
        }

        .chat-message {
          margin-bottom: 12px;
        }

        .chat-message.user {
          text-align: right;
        }

        .chat-message.user .message-content {
          display: inline-block;
          background: var(--status-good);
          color: var(--bg-dark);
          padding: 8px 12px;
          border-radius: 12px 12px 2px 12px;
          max-width: 85%;
          text-align: left;
          font-size: 12px;
        }

        .chat-message.assistant .message-content {
          background: var(--bg-card);
          border: 1px solid var(--border-subtle);
          padding: 10px 12px;
          border-radius: 12px 12px 12px 2px;
          max-width: 95%;
          font-size: 11px;
          color: var(--chalk-light);
          line-height: 1.5;
        }

        .chat-message.assistant .message-content h1,
        .chat-message.assistant .message-content h2,
        .chat-message.assistant .message-content h3 {
          color: var(--chalk-white);
          margin: 8px 0 4px 0;
          font-weight: 600;
        }
        .chat-message.assistant .message-content h1 { font-size: 13px; }
        .chat-message.assistant .message-content h2 { font-size: 12px; }
        .chat-message.assistant .message-content h3 { font-size: 11px; }

        .chat-message.assistant .message-content p {
          margin: 4px 0;
        }

        .chat-message.assistant .message-content ul,
        .chat-message.assistant .message-content ol {
          margin: 4px 0;
          padding-left: 16px;
        }

        .chat-message.assistant .message-content code {
          background: rgba(255, 255, 255, 0.08);
          padding: 1px 4px;
          border-radius: 2px;
          font-family: 'SF Mono', 'Menlo', monospace;
          font-size: 10px;
        }

        .chat-message.assistant .message-content pre {
          background: rgba(0, 0, 0, 0.2);
          padding: 8px;
          border-radius: 3px;
          overflow-x: auto;
          margin: 6px 0;
        }

        .chat-message.assistant .message-content pre code {
          background: none;
          padding: 0;
        }

        .chat-input-container {
          display: flex;
          gap: 8px;
          padding-top: 12px;
          border-top: 1px solid var(--border-subtle);
        }

        .chat-input {
          flex: 1;
          background: var(--bg-card);
          border: 1px solid var(--border-subtle);
          color: var(--chalk-light);
          font-size: 12px;
          padding: 10px 12px;
          border-radius: 6px;
          font-family: inherit;
          outline: none;
          transition: border-color 0.15s;
        }

        .chat-input:focus {
          border-color: var(--chalk-dim);
        }

        .chat-input::placeholder {
          color: var(--chalk-dark);
        }

        .chat-input:disabled {
          opacity: 0.6;
        }

        .chat-send-btn {
          background: var(--status-good);
          border: none;
          color: var(--bg-dark);
          font-size: 16px;
          width: 40px;
          border-radius: 6px;
          cursor: pointer;
          font-family: inherit;
          transition: opacity 0.15s;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .chat-send-btn:hover:not(:disabled) {
          opacity: 0.85;
        }

        .chat-send-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .card {
          background: var(--bg-card);
          border: 1px solid var(--border-subtle);
          border-radius: 4px;
          padding: 16px;
          margin-bottom: 12px;
        }

        .loading {
          display: flex;
          justify-content: center;
          padding: 20px 0;
        }

        .spinner {
          width: 20px;
          height: 20px;
          border: 2px solid var(--chalk-dark);
          border-top-color: var(--chalk-muted);
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        .spinner-small {
          display: inline-block;
          width: 12px;
          height: 12px;
          border: 1.5px solid var(--chalk-dark);
          border-top-color: var(--chalk-light);
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .error-state {
          text-align: center;
        }

        .error-text {
          color: var(--status-bad);
          font-size: 12px;
          margin-bottom: 8px;
        }

        .link-button {
          background: none;
          border: none;
          color: var(--chalk-muted);
          font-size: 12px;
          cursor: pointer;
          text-decoration: underline;
          font-family: inherit;
        }

        .link-button:hover {
          color: var(--chalk-light);
        }

        .country-display {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          margin-bottom: 16px;
        }

        .country-flag {
          font-size: 24px;
        }

        .country-name {
          font-size: 14px;
          color: var(--chalk-white);
        }

        .info-rows {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .info-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .info-label {
          font-size: 11px;
          color: var(--chalk-dim);
          text-transform: lowercase;
        }

        .info-value {
          font-size: 12px;
          color: var(--chalk-light);
        }

        .info-value.mono {
          font-family: 'SF Mono', 'Menlo', monospace;
          background: var(--bg-dark);
          padding: 2px 6px;
          border-radius: 2px;
        }

        .info-value.truncate {
          max-width: 160px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .button-group {
          display: flex;
          gap: 8px;
          margin-bottom: 12px;
        }

        .btn {
          flex: 1;
          background: var(--bg-dark);
          border: 1px solid var(--border-subtle);
          color: var(--chalk-light);
          font-size: 12px;
          padding: 8px 12px;
          border-radius: 3px;
          cursor: pointer;
          font-family: inherit;
          transition: border-color 0.15s, color 0.15s;
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 32px;
        }

        .btn:hover:not(:disabled) {
          border-color: var(--chalk-dim);
          color: var(--chalk-white);
        }

        .btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .result-display {
          text-align: center;
          padding-top: 4px;
        }

        .result-pending {
          color: var(--chalk-dim);
          font-size: 12px;
        }

        .result-success {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
        }

        .latency-value {
          font-size: 24px;
          font-weight: 500;
          letter-spacing: -0.5px;
        }

        .latency-value.good {
          color: var(--status-good);
        }

        .latency-value.warn {
          color: var(--status-warn);
        }

        .latency-value.bad {
          color: var(--status-bad);
        }

        .latency-details {
          display: flex;
          gap: 6px;
          font-size: 10px;
          color: var(--chalk-dim);
        }

        .result-error p {
          color: var(--status-bad);
          font-size: 12px;
        }

        .status-label {
          font-size: 11px;
          color: var(--chalk-dim);
          margin-top: 4px;
        }

        .individual-tests {
          display: flex;
          flex-wrap: wrap;
          gap: 4px;
          justify-content: center;
          font-size: 10px;
          margin-top: 4px;
        }

        .tests-label {
          color: var(--chalk-dim);
          margin-right: 2px;
        }

        .test-value {
          font-family: 'SF Mono', 'Menlo', monospace;
        }

        .test-value.good {
          color: var(--status-good);
        }

        .test-value.warn {
          color: var(--status-warn);
        }

        .test-value.bad {
          color: var(--status-bad);
        }

        .refresh-button {
          width: 100%;
          background: none;
          border: none;
          color: var(--chalk-dim);
          font-size: 11px;
          padding: 8px;
          cursor: pointer;
          font-family: inherit;
          transition: color 0.15s;
        }

        .refresh-button:hover {
          color: var(--chalk-light);
        }

        .llm-output {
          background: var(--bg-dark);
          border: 1px solid var(--border-subtle);
          border-radius: 3px;
          padding: 12px;
          font-size: 11px;
          color: var(--chalk-light);
          max-height: 200px;
          overflow-y: auto;
          line-height: 1.6;
          word-break: break-word;
        }

        .llm-output h1, .llm-output h2, .llm-output h3 {
          color: var(--chalk-white);
          margin: 12px 0 6px 0;
          font-weight: 600;
        }
        .llm-output h1 { font-size: 14px; }
        .llm-output h2 { font-size: 13px; }
        .llm-output h3 { font-size: 12px; }

        .llm-output p {
          margin: 6px 0;
        }

        .llm-output ul, .llm-output ol {
          margin: 6px 0;
          padding-left: 18px;
        }

        .llm-output li {
          margin: 3px 0;
        }

        .llm-output code {
          background: rgba(255, 255, 255, 0.08);
          padding: 1px 4px;
          border-radius: 2px;
          font-family: 'SF Mono', 'Menlo', monospace;
          font-size: 10px;
        }

        .llm-output pre {
          background: rgba(255, 255, 255, 0.05);
          padding: 8px;
          border-radius: 3px;
          overflow-x: auto;
          margin: 8px 0;
        }

        .llm-output pre code {
          background: none;
          padding: 0;
        }

        .llm-output strong {
          color: var(--chalk-white);
        }

        .llm-output a {
          color: var(--status-good);
        }

        .llm-stats {
          display: flex;
          justify-content: center;
          gap: 6px;
          font-size: 10px;
          color: var(--chalk-dim);
          margin-top: 8px;
        }
      `}</style>
    </div>
  );
}
