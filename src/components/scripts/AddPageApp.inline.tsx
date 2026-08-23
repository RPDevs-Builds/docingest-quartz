import { h, render } from 'preact';
import { useState, useEffect, useRef, useCallback } from 'preact/hooks';

// API configuration with dynamic fallback
const getApiUrl = () => {
  if (typeof window !== 'undefined') {
    return (window as any).__DOCINGEST_API_URL__ || (window as any).DOCINGEST_API_URL || 'https://docingest.iamrp.dev/api';
  }
  return 'https://docingest.iamrp.dev/api';
};

interface DocPreview {
  content?: string;
  type?: string;
  lastUpdated: string;
  url?: string;
  domain: string;
  filePath?: string | null;
  structure?: Array<{ type: string; url?: string }>;
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

  const [newDataLoading, setnewDataLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noMoreData, setNoMoreData] = useState<boolean>(false);
  const [page, setPage] = useState<number>(1);
  const [debugInfo, setDebugInfo] = useState<string | null>(null);
  const debugLogRef = useRef<HTMLDivElement>(null);

  const [savedDocs, setSavedDocs] = useState<DocPreview[]>([]);
  const [selectedDoc, setSelectedDoc] = useState<DocPreview | null>(null);
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [copiedPreview, setCopiedPreview] = useState(false);

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

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollTimeoutRef.current) {
        clearTimeout(pollTimeoutRef.current);
      }
    };
  }, []);

  const logAndUpdateDebug = (message: string) => {
    console.log('[DocIngest]', message);
    setDebugInfo(prev => `${prev ? prev + '\n' : ''}${message}`);
  };

  const getDomain = (urlString: string) => {
    try {
      const u = new URL(urlString);
      return u.hostname;
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
      setUrlError('Please enter a valid URL (e.g., https://docs.example.com)');
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
      const urlObj = new URL(u);
      const path = urlObj.pathname;
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

  const handleUrlChange = (e: any) => {
    const newUrl = e.target.value;
    setUrl(newUrl);
    setError(null);
    if (!newUrl) return;

    validateUrl(newUrl);
    const suggested = suggestIncludePattern(newUrl);
    if (suggested && !includePattern) {
      setIncludePattern(suggested);
    }
  };

  const loadSavedData = async (limit = 6, pageNum = 1) => {
    const API_URL = getApiUrl();
    setnewDataLoading(true);
    try {
      const response = await fetch(`${API_URL}/docs/list?page=${pageNum}&limit=${limit}&sortBy=newest`);
      if (!response.ok) throw new Error('Failed to load saved docs');
      const data = await response.json();
      const newDocs: DocPreview[] = data.docs || [];
      if (pageNum === 1) {
        setSavedDocs(newDocs);
      } else {
        setSavedDocs(prev => {
          const map = new Map<string, DocPreview>();
          [...prev, ...newDocs].forEach(d => map.set(d.domain, d));
          return Array.from(map.values());
        });
      }
      if (newDocs.length < limit) {
        setNoMoreData(true);
      }
    } catch (err: any) {
      console.error('Error loading saved docs:', err);
    } finally {
      setnewDataLoading(false);
    }
  };

  useEffect(() => {
    loadSavedData(6, 1);
  }, []);

  const handleCrawlAndDownload = async () => {
    if (!validateUrl(url) || !validatePattern(includePattern, 'include') || !validatePattern(excludePattern, 'exclude')) {
      return;
    }

    const API_URL = getApiUrl();
    setIsLoading(true);
    setError(null);
    setDebugInfo(null);
    const domain = getDomain(url);
    logAndUpdateDebug(`🚀 Starting documentation download for: ${domain}`);

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

    try {
      logAndUpdateDebug(`⚡ Dispatching crawl request to Firecrawl proxy...`);
      const response = await fetch(`${API_URL}/crawl/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Server returned ${response.status}: ${errorText}`);
      }

      const data = await response.json() as CrawlResponse;
      if (!data.success || !data.id) {
        throw new Error(data.error || 'Failed to start crawl: No job ID returned.');
      }

      logAndUpdateDebug(`✅ Job registered with ID: ${data.id}. Beginning status monitoring...`);
      setIsCrawling(true);
      pollAttemptsRef.current = 0;
      pollCrawlStatus(data.id, domain);
    } catch (err: any) {
      console.error('Download error:', err);
      setError(err.message || 'Failed to start download. Please try again.');
      logAndUpdateDebug(`❌ Error: ${err.message || 'Unknown error'}`);
      setIsCrawling(false);
      setMetrics(prev => ({ ...prev, inProgress: false }));
    } finally {
      setIsLoading(false);
    }
  };

  const pollCrawlStatus = async (id: string, domain: string, retryCount = 0) => {
    pollAttemptsRef.current++;
    if (pollAttemptsRef.current > maxPollAttempts) {
      logAndUpdateDebug(`⏰ Timeout: Crawl exceeded maximum duration (~25 min)`);
      setError('Crawl timed out. Please try again with fewer pages.');
      setIsCrawling(false);
      setMetrics(prev => ({ ...prev, inProgress: false }));
      return;
    }

    const API_URL = getApiUrl();
    try {
      const response = await fetch(`${API_URL}/crawl/status/${id}`);
      if (!response.ok) {
        if (response.status === 429) {
          logAndUpdateDebug(`⚠️ Rate limited. Pausing for 15 seconds...`);
          pollTimeoutRef.current = setTimeout(() => pollCrawlStatus(id, domain, 0), 15000);
          return;
        }
        if (retryCount < 3) {
          pollTimeoutRef.current = setTimeout(() => pollCrawlStatus(id, domain, retryCount + 1), 5000);
          return;
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json() as CrawlStatusResponse;
      const progressPercent = data.completed && data.total ? Math.round((data.completed / data.total) * 100) : 0;

      if (data.status === 'scraping') {
        logAndUpdateDebug(`📊 Ingesting: ${data.completed || 0}/${data.total || 0} pages (${progressPercent}%)`);
      }

      setMetrics(prev => ({
        ...prev,
        totalPages: data.total || 0,
        completedPages: data.completed || 0,
        failedPages: (data.outcomes || [])
          .filter((outcome) => outcome.status !== 'valid')
          .map((outcome) => outcome.reason ? `${outcome.url} (${outcome.reason})` : outcome.url),
        inProgress: data.status !== 'completed' && data.status !== 'failed'
      }));

      if (data.status === 'completed') {
        setIsCrawling(false);
        const timestamp = new Date().toISOString();
        const pages: DocPreview[] = (data.data || [])
          .filter((item) => Boolean(item.markdown && item.metadata?.sourceURL))
          .map((item) => ({
            content: item.markdown || '',
            type: item.metadata?.title || 'Unknown',
            lastUpdated: timestamp,
            url: item.metadata?.sourceURL,
            domain,
          }));

        logAndUpdateDebug(`💾 Crawl completed! Saving ${pages.length} documents into corpus...`);

        try {
          const requestData = {
            domain,
            timestamp,
            pages,
            crawlId: id,
            crawlOutcomes: data.outcomes || [],
            providerTotals: data.providerTotals,
          };

          const saveResponse = await fetch(`${API_URL}/docs/save`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestData),
          });

          if (saveResponse.ok) {
            logAndUpdateDebug(`🎉 Documentation successfully indexed and ready for MCP search!`);
            loadSavedData(6, 1);
          } else {
            logAndUpdateDebug(`⚠️ Saved with warning: Server returned status ${saveResponse.status}`);
          }
        } catch (saveErr) {
          console.error('Error saving docs:', saveErr);
          logAndUpdateDebug(`⚠️ Error saving documents to database: ${saveErr}`);
        }
      } else if (data.status === 'failed') {
        setIsCrawling(false);
        setError(data.error || 'Crawl failed on server.');
        logAndUpdateDebug(`❌ Ingestion failed: ${data.error || 'Unknown error'}`);
      } else {
        // Continue polling every 3.5 seconds
        pollTimeoutRef.current = setTimeout(() => pollCrawlStatus(id, domain, 0), 3500);
      }
    } catch (err: any) {
      console.error('Polling error:', err);
      logAndUpdateDebug(`⚠️ Status poll error: ${err.message}`);
      pollTimeoutRef.current = setTimeout(() => pollCrawlStatus(id, domain, retryCount + 1), 5000);
    }
  };

  const handleOpenPreview = async (doc: DocPreview) => {
    setSelectedDoc(doc);
    setShowPreviewModal(true);
    setPreviewContent('Loading documentation content...');
    setCopiedPreview(false);

    const API_URL = getApiUrl();
    try {
      const param = doc.filePath ? `path=${encodeURIComponent(doc.filePath)}` : `domain=${encodeURIComponent(doc.domain)}`;
      const response = await fetch(`${API_URL}/docs/content?${param}`);
      if (!response.ok) throw new Error('Failed to load content');
      const text = await response.text();
      setPreviewContent(text);
    } catch (err: any) {
      setPreviewContent(`Failed to load content: ${err.message}`);
    }
  };

  const handleDownloadDoc = async (doc: DocPreview) => {
    const API_URL = getApiUrl();
    try {
      const param = doc.filePath ? `path=${encodeURIComponent(doc.filePath)}` : `domain=${encodeURIComponent(doc.domain)}`;
      const response = await fetch(`${API_URL}/docs/download?${param}`);
      if (!response.ok) throw new Error('Download failed');
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `${doc.domain}_documentation.md`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(blobUrl);
      document.body.removeChild(a);
    } catch (err: any) {
      alert(`Download error: ${err.message}`);
    }
  };

  const handleCopyPreview = async () => {
    if (!previewContent) return;
    try {
      await navigator.clipboard.writeText(previewContent);
      setCopiedPreview(true);
      setTimeout(() => setCopiedPreview(false), 2500);
    } catch (err) {
      alert('Failed to copy to clipboard');
    }
  };

  return (
    <div class="docingest-app-container">
      {/* Main Neo-Brutalist Card */}
      <div class="di-neo-card-wrapper">
        <div class="di-neo-shadow"></div>
        <div class="di-neo-card">
          <div class="di-neo-card-inner">
            {/* Target URL Input */}
            <div class="di-input-group">
              <label class="di-input-label">Target Documentation URL *</label>
              <div class="di-input-wrapper">
                <div class="di-neo-shadow-sm"></div>
                <input
                  type="url"
                  value={url}
                  onInput={handleUrlChange}
                  placeholder="https://docs.docker.com/engine/"
                  disabled={isCrawling || isLoading}
                  class={`di-input ${urlError ? 'di-input-error' : ''}`}
                  required
                />
              </div>
              {urlError && <div class="di-error-text">{urlError}</div>}
            </div>

            {/* Ingestion Settings Grid */}
            <div class="di-grid-3">
              {/* Include Path */}
              <div class="di-input-group">
                <label class="di-input-label">Include files under:</label>
                <div class="di-input-wrapper">
                  <div class="di-neo-shadow-sm"></div>
                  <input
                    type="text"
                    value={includePattern}
                    onInput={(e: any) => { setIncludePattern(e.target.value); validatePattern(e.target.value, 'include'); }}
                    placeholder="/docs/*"
                    disabled={isCrawling || isLoading}
                    class={`di-input ${includePatternError ? 'di-input-error' : ''}`}
                  />
                </div>
                <span class="di-input-hint">Only crawl URLs starting with this path</span>
                {includePatternError && <div class="di-error-text">{includePatternError}</div>}
              </div>

              {/* Exclude Path */}
              <div class="di-input-group">
                <label class="di-input-label">Exclude files under:</label>
                <div class="di-input-wrapper">
                  <div class="di-neo-shadow-sm"></div>
                  <input
                    type="text"
                    value={excludePattern}
                    onInput={(e: any) => { setExcludePattern(e.target.value); validatePattern(e.target.value, 'exclude'); }}
                    placeholder="/api/*, /internal/*"
                    disabled={isCrawling || isLoading}
                    class={`di-input ${excludePatternError ? 'di-input-error' : ''}`}
                  />
                </div>
                <span class="di-input-hint">Skip URLs matching these wildcards</span>
                {excludePatternError && <div class="di-error-text">{excludePatternError}</div>}
              </div>

              {/* Max Pages Slider */}
              <div class="di-input-group">
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <label class="di-input-label">Max Pages:</label>
                  <span style={{ fontWeight: 800, color: 'var(--secondary, #00afaf)' }}>{maxPages}</span>
                </div>
                <div class="di-range-wrapper">
                  <div class="di-range-track">
                    <div class="di-range-fill" style={{ width: `${(maxPages / 1000) * 100}%` }}></div>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="1000"
                    step="25"
                    value={maxPages}
                    onInput={(e: any) => setMaxPages(Number(e.target.value))}
                    disabled={isCrawling || isLoading}
                    class="di-range-input"
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginTop: '0.4rem', color: 'var(--gray, #8b889c)', fontWeight: 600 }}>
                    <span>10</span>
                    <span>500</span>
                    <span>1000</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Submit Button */}
            <div style={{ marginTop: '0.5rem' }}>
              <button
                onClick={handleCrawlAndDownload}
                disabled={isLoading || isCrawling || !url}
                class="di-btn di-btn-primary di-btn-full"
                style={{ padding: '1rem 1.5rem', fontSize: '1.05rem' }}
              >
                {isCrawling ? (
                  <>
                    <span class="di-spinner"></span>
                    <span>Indexing Documentation ({metrics.completedPages}/{metrics.totalPages || '...'} pages)...</span>
                  </>
                ) : (
                  <span>Start Indexing</span>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Crawl Progress Bar */}
      {metrics.inProgress && (
        <div class="di-neo-card-wrapper">
          <div class="di-neo-shadow"></div>
          <div class="di-progress-container">
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, color: 'var(--secondary, #00afaf)' }}>
              <span>Indexing in progress: {metrics.completedPages}/{metrics.totalPages} pages</span>
              <span>{metrics.totalPages > 0 ? Math.round((metrics.completedPages / metrics.totalPages) * 100) : 0}%</span>
            </div>
            <div class="di-progress-bar-bg">
              <div
                class="di-progress-bar-fill"
                style={{ width: `${metrics.totalPages > 0 ? (metrics.completedPages / metrics.totalPages) * 100 : 5}%` }}
              ></div>
            </div>
          </div>
        </div>
      )}

      {/* Error Alert */}
      {error && (
        <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.15)', border: '2px solid #ef4444', borderRadius: '0.5rem', padding: '1rem', color: '#fca5a5', marginBottom: '1.5rem', fontWeight: 600 }}>
          {error}
        </div>
      )}

      {/* Debug & Status Output Terminal */}
      {debugInfo && (
        <div class="di-terminal-box">
          <div class="di-terminal-header">
            <span>Processing Log & Outcomes</span>
            <button
              onClick={() => setDebugInfo(null)}
              style={{ background: 'none', border: 'none', color: 'var(--gray, #8b889c)', cursor: 'pointer', fontSize: '0.75rem' }}
            >
              Clear Log
            </button>
          </div>
          <div ref={debugLogRef} style={{ maxHeight: '180px', overflowY: 'auto' }}>
            <pre style={{ margin: 0, fontFamily: 'inherit', whiteSpace: 'pre-wrap' }}>{debugInfo}</pre>
          </div>
        </div>
      )}

      {/* Saved / Indexed Documentation Section */}
      <div style={{ marginTop: '2.5rem' }}>
        <h2 style={{ fontSize: '1.6rem', fontWeight: 800, marginBottom: '1.25rem', color: 'var(--dark, #ffffff)' }}>
          Recent Ingestions
        </h2>

        {savedDocs.length === 0 && !newDataLoading ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--gray, #8b889c)', border: '2px dashed var(--gray, #8b889c)', borderRadius: '0.5rem' }}>
            No documentation saved yet. Submit a URL above to index your first doc set.
          </div>
        ) : (
          <div class="di-grid-2">
            {savedDocs.map((doc, idx) => (
              <div key={idx} class="di-neo-card-wrapper">
                <div class="di-neo-shadow"></div>
                <div class="di-neo-card di-doc-card">
                  <div>
                    <h3 class="di-doc-title">{doc.type || doc.domain}</h3>
                    <div class="di-doc-meta">
                      <div><strong>Domain:</strong> {doc.domain}</div>
                      <div><strong>Indexed:</strong> {new Date(doc.lastUpdated).toLocaleDateString()}</div>
                      {doc.url && (
                        <div>
                          <a
                            href={doc.url.startsWith('http') ? doc.url : `https://${doc.url}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: 'var(--secondary, #00afaf)', textDecoration: 'none', fontWeight: 600 }}
                          >
                            View Source ↗
                          </a>
                        </div>
                      )}
                    </div>
                  </div>

                  <div class="di-doc-actions">
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                      <button
                        onClick={() => handleOpenPreview(doc)}
                        class="di-btn di-btn-secondary"
                      >
                        Preview
                      </button>
                      <button
                        onClick={() => handleDownloadDoc(doc)}
                        class="di-btn di-btn-primary"
                      >
                        Download
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Load More Button */}
        {!noMoreData && savedDocs.length > 0 && (
          <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
            <button
              onClick={() => {
                const nextPage = page + 1;
                setPage(nextPage);
                loadSavedData(6, nextPage);
              }}
              disabled={newDataLoading}
              class="di-btn di-btn-primary"
            >
              {newDataLoading ? (
                <>
                  <span class="di-spinner"></span>
                  <span>Loading...</span>
                </>
              ) : (
                <span>Load More</span>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Markdown Document Preview Modal */}
      {showPreviewModal && (
        <div class="di-modal-backdrop" onClick={() => setShowPreviewModal(false)}>
          <div class="di-modal-dialog" onClick={(e) => e.stopPropagation()}>
            <div class="di-modal-header">
              <h3 class="di-modal-title">
                {selectedDoc?.type || selectedDoc?.domain} — Documentation Preview
              </h3>
              <button
                onClick={() => setShowPreviewModal(false)}
                style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', fontWeight: 700, color: 'var(--dark, #ffffff)' }}
              >
                ✕
              </button>
            </div>
            <div class="di-modal-body">
              <pre style={{ margin: 0, fontFamily: 'inherit', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {previewContent}
              </pre>
            </div>
            <div class="di-modal-footer">
              <button
                onClick={handleCopyPreview}
                class="di-btn di-btn-secondary"
              >
                {copiedPreview ? '✓ Copied!' : 'Copy Markdown'}
              </button>
              <button
                onClick={() => selectedDoc && handleDownloadDoc(selectedDoc)}
                class="di-btn di-btn-primary"
              >
                Download File
              </button>
              <button
                onClick={() => setShowPreviewModal(false)}
                class="di-btn di-btn-neutral"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Automatic hydration mounting on target DOM container
const rootElement = document.getElementById('docingest-add-root');
if (rootElement) {
  render(<AddPageApp />, rootElement);
}

export default AddPageApp;
