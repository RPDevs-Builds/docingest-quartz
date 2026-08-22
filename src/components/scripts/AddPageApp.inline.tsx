import { h, render } from 'preact';
import { useState, useEffect, useRef, useCallback } from 'preact/hooks';

// API configuration
const API_URL = 'https://docingest.iamrp.dev/api';

interface DocPreview {
  content?: string;
  type?: string;
  lastUpdated: string;
  url?: string;
  domain: string;
  filePath?: string;
  structure?: Array<{ type: string; url?: string }>;
}

interface SavedUrl {
  url: string;
  domain: string;
  lastScraped: string;
  totalPages: number;
  successfulPages: number;
  failedPages: string[];
}

interface ScrapingMetrics {
  totalPages: number;
  completedPages: number;
  failedPages: string[];
  inProgress: boolean;
}

interface CrawlStatusResponse {
  status: string;
  completed: number;
  total: number;
  outcomes?: Array<{
    url: string;
    canonicalUrl?: string;
    status: 'valid' | 'blocked' | 'empty' | 'duplicate' | 'rejected' | 'failed';
    reason?: string;
  }>;
  providerTotals?: {
    discovered: number;
    returned: number;
    discoveredIsExact: boolean;
  };
  error?: string;
  data?: Array<{
    markdown?: string;
    metadata?: {
      sourceURL?: string;
      title?: string;
    };
  }>;
}

interface CrawlResponse {
  success: boolean;
  data?: any[];
  id?: string;
  url?: string;
  status?: string;
  error?: string;
}

const AddPageApp = () => {
  const [url, setUrl] = useState('');
  const [includePattern, setIncludePattern] = useState('');
  const [excludePattern, setExcludePattern] = useState('');
  const [maxPages, setMaxPages] = useState(250);
  const [isLoading, setIsLoading] = useState(false);
  const [isCrawling, setIsCrawling] = useState(false);
  const [autoStartTriggered, setAutoStartTriggered] = useState(false);

  const [newDataLoading, setnewDataLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noMoreData, setNoMoreData] = useState<boolean>(false);
  const [page, setPage] = useState<number>(1);
  const [debugInfo, setDebugInfo] = useState<string | null>(null);
  const debugLogRef = useRef<HTMLDivElement>(null);

  const [savedDocs, setSavedDocs] = useState<DocPreview[]>([]);
  const [metrics, setMetrics] = useState<ScrapingMetrics>({
    totalPages: 0,
    completedPages: 0,
    failedPages: [],
    inProgress: false
  });

  const [urlError, setUrlError] = useState<string | null>(null);
  const [includePatternError, setIncludePatternError] = useState<string | null>(null);
  const [excludePatternError, setExcludePatternError] = useState<string | null>(null);

  const pollTimeoutRef = useRef<any>(null);
  const pollAttemptsRef = useRef(0);
  const maxPollAttempts = 300;

  // Auto-scroll debug log to bottom
  useEffect(() => {
    if (debugLogRef.current) {
      debugLogRef.current.scrollTop = debugLogRef.current.scrollHeight;
    }
  }, [debugInfo]);

  // Cleanup polling timer on unmount
  useEffect(() => {
    return () => {
      if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);
    };
  }, []);

  const logAndUpdateDebug = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    const formatted = `[${timestamp}] ${message}`;
    console.log(formatted);
    setDebugInfo(prev => `${prev ? prev + '\n' : ''}${formatted}`);
  };

  const getDomain = (urlString: string) => {
    try {
      const parsed = new URL(urlString);
      return parsed.hostname;
    } catch {
      return 'unknown-domain';
    }
  };

  const validateUrl = (u: string): boolean => {
    try {
      new URL(u);
      setUrlError(null);
      return true;
    } catch {
      setUrlError('Please enter a valid URL (e.g. https://docs.example.com)');
      return false;
    }
  };

  const validatePattern = (pattern: string, type: 'include' | 'exclude'): boolean => {
    if (!pattern) {
      if (type === 'include') setIncludePatternError(null);
      else setExcludePatternError(null);
      return true;
    }
    try {
      new RegExp(pattern.replace(/\*/g, '.*'));
      if (type === 'include') setIncludePatternError(null);
      else setExcludePatternError(null);
      return true;
    } catch {
      const err = 'Invalid pattern. Use * for wildcards (e.g., /api*, */docs/*)';
      if (type === 'include') setIncludePatternError(err);
      else setExcludePatternError(err);
      return false;
    }
  };

  const suggestIncludePattern = (u: string): string => {
    try {
      const parsed = new URL(u);
      const path = parsed.pathname;
      if (path.includes('/docs')) {
        const docsIndex = path.indexOf('/docs');
        return path.slice(0, docsIndex) + '/docs/*';
      }
      if (path === '/api' || path.startsWith('/api/')) {
        return '/api/*';
      }
      return '';
    } catch {
      return '';
    }
  };

  const loadSavedData = async (limitCount = 6) => {
    try {
      setnewDataLoading(true);
      const res = await fetch(`${API_URL}/docs/list?page=${page}&limit=${limitCount}`);
      if (!res.ok) throw new Error(`Failed to fetch saved docs: ${res.statusText}`);
      const data = await res.json();
      if (data.docs && Array.isArray(data.docs)) {
        if (data.docs.length === 0) {
          setNoMoreData(true);
        } else {
          setSavedDocs(prev => {
            const map = new Map<string, DocPreview>();
            [...prev, ...data.docs].forEach(d => map.set(d.domain, d));
            return Array.from(map.values());
          });
          setPage(prev => prev + 1);
        }
      }
    } catch (err: any) {
      console.warn('Could not load saved data from API:', err.message);
    } finally {
      setnewDataLoading(false);
    }
  };

  useEffect(() => {
    loadSavedData(6);
  }, []);

  // Check URL query parameters for auto-fill and auto-start
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const urlParam = params.get('url');
      const autoStart = params.get('autoStart') === 'true';

      if (urlParam && !url) {
        setUrl(urlParam);
        const suggested = suggestIncludePattern(urlParam);
        if (suggested) setIncludePattern(suggested);

        if (autoStart && !autoStartTriggered) {
          setAutoStartTriggered(true);
          setTimeout(() => {
            handleCrawl();
          }, 300);
        }
      }
    } catch (e) {
      console.error(e);
    }
  }, [autoStartTriggered]);

  const handleUrlChange = (e: any) => {
    const val = e.target.value;
    setUrl(val);
    setError(null);
    if (!val) return;

    validateUrl(val);
    const suggested = suggestIncludePattern(val);
    if (suggested && !includePattern) {
      setIncludePattern(suggested);
    }
  };

  const pollCrawlStatus = async (id: string, domain: string, retryCount = 0) => {
    pollAttemptsRef.current++;
    if (pollAttemptsRef.current > maxPollAttempts) {
      logAndUpdateDebug(`⏰ TIMEOUT: Crawl exceeded maximum duration limit.`);
      setError('Crawl timed out. Please try again with fewer max pages.');
      setIsCrawling(false);
      setMetrics(prev => ({ ...prev, inProgress: false }));
      return;
    }

    try {
      const response = await fetch(`${API_URL}/crawl/status/${id}`);
      if (!response.ok) {
        if (response.status === 429) {
          logAndUpdateDebug(`⚠️ Rate limited. Waiting 10s before retry...`);
          pollTimeoutRef.current = setTimeout(() => pollCrawlStatus(id, domain, 0), 10000);
          return;
        }
        if (retryCount < 3) {
          logAndUpdateDebug(`⚠️ HTTP status ${response.status}. Retrying (${retryCount + 1}/3)...`);
          pollTimeoutRef.current = setTimeout(() => pollCrawlStatus(id, domain, retryCount + 1), 4000);
          return;
        }
        throw new Error(`Failed to fetch crawl status: ${response.statusText}`);
      }

      const statusData: CrawlStatusResponse = await response.json();
      
      const completed = statusData.completed || (statusData.data ? statusData.data.length : 0);
      const total = statusData.total || statusData.providerTotals?.discovered || completed;
      
      setMetrics({
        totalPages: total,
        completedPages: completed,
        failedPages: statusData.outcomes?.filter(o => o.status === 'failed').map(o => o.url) || [],
        inProgress: statusData.status !== 'completed' && statusData.status !== 'failed'
      });

      logAndUpdateDebug(`⚡ Progress: ${completed} / ${total} pages indexed (${statusData.status})`);

      if (statusData.status === 'completed') {
        logAndUpdateDebug(`🎉 Crawl completed successfully for domain: ${domain}!`);
        setIsCrawling(false);
        // Refresh saved docs
        loadSavedData(6);
      } else if (statusData.status === 'failed') {
        logAndUpdateDebug(`❌ Crawl job failed: ${statusData.error || 'Unknown error'}`);
        setError(statusData.error || 'Crawl failed on server.');
        setIsCrawling(false);
      } else {
        // Continue polling
        pollTimeoutRef.current = setTimeout(() => pollCrawlStatus(id, domain, 0), 3000);
      }
    } catch (err: any) {
      logAndUpdateDebug(`⚠️ Polling error: ${err.message}`);
      if (retryCount < 3) {
        pollTimeoutRef.current = setTimeout(() => pollCrawlStatus(id, domain, retryCount + 1), 4000);
      } else {
        setIsCrawling(false);
        setError('Lost connection to crawler status service.');
      }
    }
  };

  const handleCrawl = async () => {
    if (!validateUrl(url) || !validatePattern(includePattern, 'include') || !validatePattern(excludePattern, 'exclude')) {
      return;
    }

    setIsLoading(true);
    setError(null);
    setDebugInfo(null);
    pollAttemptsRef.current = 0;

    const domain = getDomain(url);
    logAndUpdateDebug(`🚀 Initializing documentation ingestion for: ${domain}`);

    try {
      // Check if recently indexed
      try {
        const checkRes = await fetch(`${API_URL}/docs/check-domain/${encodeURIComponent(url)}`);
        if (checkRes.ok) {
          const checkData = await checkRes.json();
          if (checkData.found) {
            logAndUpdateDebug(`ℹ️ Existing documentation indexed for ${domain} (${new Date(checkData.lastUpdated).toLocaleDateString()}).`);
          }
        }
      } catch (e) {
        // Non-fatal, proceed with crawl
      }

      setMetrics({
        totalPages: 0,
        completedPages: 0,
        failedPages: [],
        inProgress: true
      });

      const requestBody = {
        url,
        limit: maxPages,
        maxDepth: 5,
        allowBackwardLinks: true,
        ignoreQueryParameters: true,
        ...(includePattern && { includePaths: [includePattern] }),
        ...(excludePattern && { excludePaths: [excludePattern] }),
        scrapeOptions: {
          formats: ['markdown', 'html'],
          onlyMainContent: true,
          removeBase64Images: true,
          blockAds: true,
          timeout: 60000,
          waitFor: 2000,
          maxAge: 3600000
        }
      };

      logAndUpdateDebug(`📡 Sending crawl request to ${API_URL}/crawl/start`);
      const res = await fetch(`${API_URL}/crawl/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`HTTP ${res.status}: ${errText}`);
      }

      const data: CrawlResponse = await res.json();
      if (!data.success || !data.id) {
        throw new Error(data.error || 'Failed to start crawl: No task ID returned.');
      }

      logAndUpdateDebug(`✅ Job queued with Task ID: ${data.id}`);
      setIsCrawling(true);
      pollCrawlStatus(data.id, domain);

    } catch (err: any) {
      console.error('Crawl start error:', err);
      setError(err.message || 'Failed to initiate crawl.');
      logAndUpdateDebug(`❌ Error: ${err.message}`);
      setIsCrawling(false);
      setMetrics(prev => ({ ...prev, inProgress: false }));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="docingest-app-container" style={{
      marginTop: '1.5rem',
      padding: '1.5rem',
      backgroundColor: '#0d0914',
      border: '1px solid #332d4a',
      borderRadius: '8px',
      color: '#e2e1e8',
      fontFamily: 'inherit'
    }}>
      {/* Header */}
      <div style={{ marginBottom: '1.5rem', borderBottom: '1px solid #1e1b2e', paddingBottom: '1rem' }}>
        <h2 style={{ color: '#ffffff', margin: '0 0 0.5rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ color: '#00ff00' }}>◈</span> DocIngest URL Ingestion Engine
        </h2>
        <p style={{ margin: 0, color: '#8b889c', fontSize: '0.9rem' }}>
          Autonomous web scraper & document indexer powering the local MCP documentation server.
        </p>
      </div>

      {/* Main Ingestion Form */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1rem' }}>
        <div>
          <label style={{ display: 'block', color: '#ffffff', fontWeight: 'bold', marginBottom: '0.4rem', fontSize: '0.9rem' }}>
            Target Documentation URL *
          </label>
          <input
            type="url"
            value={url}
            onInput={handleUrlChange}
            placeholder="https://docs.docker.com/engine/"
            disabled={isCrawling || isLoading}
            style={{
              width: '100%',
              padding: '0.75rem 1rem',
              backgroundColor: '#1e1b2e',
              border: urlError ? '1px solid #ef4444' : '1px solid #332d4a',
              borderRadius: '4px',
              color: '#ffffff',
              fontFamily: 'inherit',
              boxSizing: 'border-box'
            }}
          />
          {urlError && <div style={{ color: '#ef4444', fontSize: '0.8rem', marginTop: '0.3rem' }}>{urlError}</div>}
        </div>

        {/* Pattern filters & limits */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', color: '#8b889c', marginBottom: '0.4rem', fontSize: '0.85rem' }}>
              Include Pattern (Wildcards: *)
            </label>
            <input
              type="text"
              value={includePattern}
              onInput={(e: any) => { setIncludePattern(e.target.value); validatePattern(e.target.value, 'include'); }}
              placeholder="/engine/*"
              disabled={isCrawling || isLoading}
              style={{
                width: '100%',
                padding: '0.6rem 0.8rem',
                backgroundColor: '#1e1b2e',
                border: includePatternError ? '1px solid #ef4444' : '1px solid #332d4a',
                borderRadius: '4px',
                color: '#ffffff',
                fontFamily: 'inherit',
                boxSizing: 'border-box'
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', color: '#8b889c', marginBottom: '0.4rem', fontSize: '0.85rem' }}>
              Exclude Pattern
            </label>
            <input
              type="text"
              value={excludePattern}
              onInput={(e: any) => { setExcludePattern(e.target.value); validatePattern(e.target.value, 'exclude'); }}
              placeholder="*/changelog*, */v1/*"
              disabled={isCrawling || isLoading}
              style={{
                width: '100%',
                padding: '0.6rem 0.8rem',
                backgroundColor: '#1e1b2e',
                border: excludePatternError ? '1px solid #ef4444' : '1px solid #332d4a',
                borderRadius: '4px',
                color: '#ffffff',
                fontFamily: 'inherit',
                boxSizing: 'border-box'
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', color: '#8b889c', marginBottom: '0.4rem', fontSize: '0.85rem' }}>
              Max Pages Cap
            </label>
            <input
              type="number"
              value={maxPages}
              onInput={(e: any) => setMaxPages(parseInt(e.target.value) || 50)}
              min="1"
              max="1000"
              disabled={isCrawling || isLoading}
              style={{
                width: '100%',
                padding: '0.6rem 0.8rem',
                backgroundColor: '#1e1b2e',
                border: '1px solid #332d4a',
                borderRadius: '4px',
                color: '#ffffff',
                fontFamily: 'inherit',
                boxSizing: 'border-box'
              }}
            />
          </div>
        </div>

        {/* Action Button */}
        <div style={{ marginTop: '0.5rem' }}>
          <button
            onClick={handleCrawl}
            disabled={isLoading || isCrawling || !url}
            style={{
              backgroundColor: isCrawling ? '#b026ff' : '#00ff00',
              color: '#000000',
              fontWeight: 'bold',
              padding: '0.75rem 1.75rem',
              border: 'none',
              borderRadius: '4px',
              cursor: (isLoading || isCrawling || !url) ? 'not-allowed' : 'pointer',
              opacity: (isLoading || isCrawling || !url) ? 0.6 : 1,
              transition: 'all 0.2s ease',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
          >
            {isCrawling ? (
              <span>⏳ Crawling & Ingesting ({metrics.completedPages}/{metrics.totalPages || '?'})...</span>
            ) : isLoading ? (
              <span>Initializing Request...</span>
            ) : (
              <span>⚡ Start Documentation Ingestion</span>
            )}
          </button>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div style={{
          marginTop: '1.25rem',
          padding: '0.75rem 1rem',
          backgroundColor: 'rgba(239, 68, 68, 0.15)',
          border: '1px solid rgba(239, 68, 68, 0.4)',
          borderRadius: '4px',
          color: '#f87171'
        }}>
          ⚠️ {error}
        </div>
      )}

      {/* Progress & Metrics Dashboard */}
      {(isCrawling || metrics.completedPages > 0) && (
        <div style={{
          marginTop: '1.5rem',
          padding: '1rem',
          backgroundColor: '#1e1b2e',
          border: '1px solid #332d4a',
          borderRadius: '6px'
        }}>
          <h4 style={{ margin: '0 0 0.5rem 0', color: '#ffffff', fontSize: '0.95rem' }}>
            Ingestion Progress
          </h4>
          <div style={{ display: 'flex', gap: '1.5rem', fontSize: '0.85rem', color: '#8b889c', marginBottom: '0.75rem' }}>
            <div>Discovered: <strong style={{ color: '#ffffff' }}>{metrics.totalPages}</strong></div>
            <div>Completed: <strong style={{ color: '#00ff00' }}>{metrics.completedPages}</strong></div>
            <div>Failed: <strong style={{ color: metrics.failedPages.length ? '#ef4444' : '#ffffff' }}>{metrics.failedPages.length}</strong></div>
          </div>
          {/* Progress Bar */}
          <div style={{ width: '100%', height: '8px', backgroundColor: '#0d0914', borderRadius: '4px', overflow: 'hidden' }}>
            <div style={{
              width: `${metrics.totalPages > 0 ? Math.min(100, Math.round((metrics.completedPages / metrics.totalPages) * 100)) : (isCrawling ? 30 : 0)}%`,
              height: '100%',
              backgroundColor: '#00ff00',
              transition: 'width 0.3s ease'
            }} />
          </div>
        </div>
      )}

      {/* Real-time Telemetry / Debug Log */}
      {debugInfo && (
        <div style={{ marginTop: '1.5rem' }}>
          <div style={{ fontSize: '0.85rem', color: '#8b889c', marginBottom: '0.3rem' }}>Operational Telemetry Log:</div>
          <div
            ref={debugLogRef}
            style={{
              maxHeight: '180px',
              overflowY: 'auto',
              backgroundColor: '#050308',
              border: '1px solid #1e1b2e',
              padding: '0.75rem',
              borderRadius: '4px',
              fontFamily: 'monospace',
              fontSize: '0.8rem',
              color: '#00ff00',
              whiteSpace: 'pre-wrap'
            }}
          >
            {debugInfo}
          </div>
        </div>
      )}

      {/* Saved Documentation Corpus Grid */}
      {savedDocs.length > 0 && (
        <div style={{ marginTop: '2.5rem', borderTop: '1px solid #1e1b2e', paddingTop: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ margin: 0, color: '#ffffff', fontSize: '1.1rem' }}>
              ◈ Indexed Documentation Repositories
            </h3>
            <a
              href="/Software-&-Github/Tools/DocIngest/view"
              style={{ color: '#00ff00', fontSize: '0.85rem', textDecoration: 'none' }}
            >
              Browse Full Corpus Viewer →
            </a>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem' }}>
            {savedDocs.map((doc, idx) => (
              <div
                key={idx}
                style={{
                  backgroundColor: '#1e1b2e',
                  border: '1px solid #332d4a',
                  borderRadius: '6px',
                  padding: '1rem',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '0.75rem'
                }}
              >
                <div>
                  <div style={{ color: '#ffffff', fontWeight: 'bold', fontSize: '0.95rem', wordBreak: 'break-all' }}>
                    {doc.domain}
                  </div>
                  <div style={{ color: '#8b889c', fontSize: '0.8rem', marginTop: '0.3rem' }}>
                    Indexed: {new Date(doc.lastUpdated).toLocaleDateString()}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <a
                    href={`/Software-&-Github/Tools/DocIngest/view?search=${encodeURIComponent(doc.domain)}`}
                    style={{
                      display: 'inline-block',
                      backgroundColor: 'rgba(0, 255, 0, 0.1)',
                      color: '#00ff00',
                      border: '1px solid rgba(0, 255, 0, 0.3)',
                      padding: '0.35rem 0.75rem',
                      borderRadius: '4px',
                      fontSize: '0.8rem',
                      textDecoration: 'none'
                    }}
                  >
                    Inspect Docs
                  </a>
                </div>
              </div>
            ))}
          </div>

          {!noMoreData && (
            <div style={{ textAlign: 'center', marginTop: '1.25rem' }}>
              <button
                onClick={() => loadSavedData(6)}
                disabled={newDataLoading}
                style={{
                  backgroundColor: '#1e1b2e',
                  color: '#e2e1e8',
                  border: '1px solid #332d4a',
                  padding: '0.5rem 1.25rem',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '0.85rem'
                }}
              >
                {newDataLoading ? 'Loading...' : 'Load More Indexed Repositories'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// Mount the app on Quartz navigation
const mountAddApp = () => {
  const root = document.getElementById('docingest-add-root');
  if (root) {
    render(<AddPageApp />, root);
  }
};

document.addEventListener('nav', mountAddApp);
if (document.readyState === 'complete' || document.readyState === 'interactive') {
  mountAddApp();
}

export default "";
