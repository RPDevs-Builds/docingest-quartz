import { h, render } from 'preact';
import { useState, useEffect, useCallback, useRef } from 'preact/hooks';

interface DocStructure {
  type: string;
  url?: string;
}

interface DocPreview {
  type?: string;
  domain: string;
  lastUpdated: string;
  url?: string;
  filePath?: string | null;
  structure?: DocStructure[];
}

const getApiUrl = () => {
  if (typeof window !== 'undefined') {
    return (window as any).__DOCINGEST_API_URL__ || (window as any).DOCINGEST_API_URL || 'https://docingest.iamrp.dev/api';
  }
  return 'https://docingest.iamrp.dev/api';
};

const ViewPageApp = () => {
  const [docs, setDocs] = useState<DocPreview[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  const [copiedDomain, setCopiedDomain] = useState<string | null>(null);
  const [selectedDoc, setSelectedDoc] = useState<DocPreview | null>(null);
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [copiedPreview, setCopiedPreview] = useState(false);

  // Sync with search URL parameters if present
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const query = params.get('search') || params.get('q') || params.get('domain');
      if (query) {
        setSearchTerm(query);
        setSearchQuery(query);
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  const fetchDocs = useCallback(async (isInitial = false) => {
    const API_URL = getApiUrl();
    if (isInitial) {
      setIsLoading(true);
    }
    setError(null);
    try {
      const endpoint = searchQuery
        ? `${API_URL}/docs/fullsearch?q=${encodeURIComponent(searchQuery)}&page=${page}&sortBy=newest`
        : `${API_URL}/docs/list?page=${page}&limit=8&sortBy=newest`;

      const response = await fetch(endpoint);
      if (!response.ok) throw new Error(`Server returned ${response.status}: ${response.statusText}`);

      const data = await response.json();
      const newDocs: DocPreview[] = data.docs || [];

      setDocs(prev => {
        if (page === 1) return newDocs;
        const map = new Map<string, DocPreview>();
        [...prev, ...newDocs].forEach(d => map.set(d.domain, d));
        return Array.from(map.values());
      });

      setHasMore(newDocs.length >= 8);
    } catch (err: any) {
      console.error('Fetch error:', err);
      setError(err.message || 'Failed to load documentation corpus.');
    } finally {
      setIsLoading(false);
      setIsSearching(false);
      setIsFetchingMore(false);
    }
  }, [searchQuery, page]);

  useEffect(() => {
    fetchDocs(page === 1);
  }, [fetchDocs]);

  const handleSearchSubmit = (e?: any) => {
    if (e && e.preventDefault) e.preventDefault();
    setIsSearching(true);
    setSearchQuery(searchTerm.trim());
    setPage(1);
  };

  const handleLoadMore = () => {
    if (hasMore && !isLoading && !isFetchingMore) {
      setIsFetchingMore(true);
      setPage(prev => prev + 1);
    }
  };

  const handleCopyContent = async (doc: DocPreview) => {
    const API_URL = getApiUrl();
    try {
      const param = doc.filePath ? `path=${encodeURIComponent(doc.filePath)}` : `domain=${encodeURIComponent(doc.domain)}`;
      const response = await fetch(`${API_URL}/docs/content?${param}`);
      if (!response.ok) throw new Error('Failed to fetch content');
      const text = await response.text();
      await navigator.clipboard.writeText(text);
      setCopiedDomain(doc.domain);
      setTimeout(() => setCopiedDomain(null), 2500);
    } catch (err: any) {
      alert(`Copy failed: ${err.message}`);
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
      alert(`Download failed: ${err.message}`);
    }
  };

  const handleOpenPreview = async (doc: DocPreview) => {
    setSelectedDoc(doc);
    setShowPreviewModal(true);
    setPreviewContent('Loading full markdown documentation...');
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
      {/* Search Input Form */}
      <form onSubmit={handleSearchSubmit} class="di-search-container">
        <div class="di-input-wrapper" style={{ flex: 1 }}>
          <div class="di-neo-shadow" style={{ pointerEvents: 'none' }}></div>
          <input
            type="text"
            placeholder="Search indexed documentation corpus..."
            value={searchTerm}
            onInput={(e: any) => setSearchTerm(e.target.value)}
            class="di-input"
            style={{ padding: '0.9rem 1.1rem', fontSize: '0.95rem' }}
          />
        </div>
        <div class="di-input-wrapper" style={{ width: 'auto' }}>
          <div class="di-neo-shadow" style={{ pointerEvents: 'none' }}></div>
          <button
            type="submit"
            onClick={handleSearchSubmit}
            disabled={isSearching}
            class="di-btn di-btn-primary"
            style={{ height: '100%', padding: '0.9rem 1.5rem', fontSize: '0.95rem', minWidth: '120px', position: 'relative', zIndex: 2 }}
          >
            {isSearching ? (
              <>
                <span class="di-spinner"></span>
                <span>Searching...</span>
              </>
            ) : (
              <span>Search</span>
            )}
          </button>
        </div>
      </form>

      {/* Error Message */}
      {error && (
        <div style={{ backgroundColor: '#fef2f2', border: '2px solid #ef4444', borderRadius: '0.5rem', padding: '1rem', color: '#b91c1c', marginBottom: '1.5rem', fontWeight: 600 }}>
          {error}
        </div>
      )}

      {/* Loading Skeleton */}
      {isLoading && docs.length === 0 && (
        <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--di-text-muted)' }}>
          <div class="di-spinner di-spinner-primary" style={{ width: '2.5rem', height: '2.5rem', marginBottom: '1rem' }}></div>
          <p style={{ fontWeight: 600 }}>Loading documentation corpus...</p>
        </div>
      )}

      {/* Documentation Cards Grid */}
      {!isLoading && docs.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--di-text-muted)', border: '2px dashed var(--di-border)', borderRadius: '0.5rem' }}>
          No documentation found matching your search. Try a different query or index a new URL.
        </div>
      ) : (
        <div class="di-grid-2">
          {docs.map((doc, index) => (
            <div key={index} class="di-neo-card-wrapper">
              <div class="di-neo-shadow"></div>
              <div class="di-neo-card di-doc-card">
                <div>
                  <h3 class="di-doc-title">{doc.type || doc.domain}</h3>
                  <div class="di-doc-meta">
                    <div><strong>Domain:</strong> {doc.domain}</div>
                    {doc.structure && doc.structure.length > 0 && (
                      <div><strong>Sections:</strong> {doc.structure.length} indexed pages</div>
                    )}
                    <div>
                      <strong>Saved:</strong> {(() => {
                        const d = doc.lastUpdated || (doc as any).lastScraped;
                        if (!d) return 'Recent';
                        try {
                          return new Date(d).toLocaleDateString('en-GB');
                        } catch {
                          return 'Recent';
                        }
                      })()}
                    </div>
                    {doc.url && (
                      <div style={{ marginTop: '0.25rem' }}>
                        <a
                          href={doc.url.startsWith('http') ? doc.url : `https://${doc.url}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: 'var(--di-primary)', textDecoration: 'none', fontWeight: 600, fontSize: '0.85rem' }}
                        >
                          View Original Source ↗
                        </a>
                      </div>
                    )}
                  </div>
                </div>

                <div class="di-doc-actions">
                  <button
                    onClick={() => handleOpenPreview(doc)}
                    class="di-btn di-btn-secondary di-btn-full"
                  >
                    Preview Documentation
                  </button>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                    <button
                      onClick={() => handleCopyContent(doc)}
                      class="di-btn di-btn-neutral"
                    >
                      {copiedDomain === doc.domain ? '✓ Copied!' : 'Copy All'}
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

      {/* Pagination Load More Button */}
      {hasMore && !isLoading && docs.length > 0 && (
        <div style={{ textAlign: 'center', marginTop: '2.5rem' }}>
          <button
            onClick={handleLoadMore}
            disabled={isFetchingMore}
            class="di-btn di-btn-primary"
            style={{ padding: '0.85rem 2rem', fontSize: '0.95rem' }}
          >
            {isFetchingMore ? (
              <>
                <span class="di-spinner"></span>
                <span>Loading more docs...</span>
              </>
            ) : (
              <span>Load More Documentation</span>
            )}
          </button>
        </div>
      )}

      {/* Preview Modal */}
      {showPreviewModal && (
        <div class="di-modal-backdrop" onClick={() => setShowPreviewModal(false)}>
          <div class="di-modal-dialog" onClick={(e) => e.stopPropagation()}>
            <div class="di-modal-header">
              <h3 class="di-modal-title">
                {selectedDoc?.type || selectedDoc?.domain} — Corpus Preview
              </h3>
              <button
                onClick={() => setShowPreviewModal(false)}
                style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', fontWeight: 700, color: 'var(--di-heading)' }}
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
const rootElement = document.getElementById('docingest-view-root');
if (rootElement) {
  render(<ViewPageApp />, rootElement);
}

export default ViewPageApp;
