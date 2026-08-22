import { h, render } from 'preact';
import { useState, useEffect, useCallback, useRef } from 'preact/hooks';

interface DocStructure {
  type: string;
  url?: string;
}

interface DocPreview {
  domain: string;
  lastUpdated: string;
  url?: string;
  filePath?: string | null;
  structure: DocStructure[];
}

const getApiUrl = () => {
  if (typeof window !== 'undefined') {
    return (window as any).__DOCINGEST_API_URL__ || (window as any).DOCINGEST_API_URL || 'https://docingest.iamrp.dev/api';
  }
  return 'https://docingest.iamrp.dev/api';
};

const getPrimaryDomain = (domain: string) => {
  const cleanDomain = domain.replace(/^docs\./, '').replace(/\.ai$/, '');
  return cleanDomain.charAt(0).toUpperCase() + cleanDomain.slice(1);
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
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [previewDomain, setPreviewDomain] = useState<string | null>(null);

  // Check URL query params on mount
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const searchParam = params.get('search') || params.get('q') || params.get('domain');
      if (searchParam) {
        setSearchTerm(searchParam);
        setSearchQuery(searchParam);
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
    try {
      const endpoint = searchQuery 
        ? `${API_URL}/docs/fullsearch?q=${encodeURIComponent(searchQuery)}&page=${page}&sortBy=newest`
        : `${API_URL}/docs/list?page=${page}&sortBy=newest`;

      const response = await fetch(endpoint);
      if (!response.ok) throw new Error(`Failed to fetch documentation (${response.status})`);
      
      const data = await response.json();
      const newDocs: DocPreview[] = data.docs || [];

      setDocs(prev => {
        if (page === 1) return newDocs;
        const map = new Map<string, DocPreview>();
        [...prev, ...newDocs].forEach(d => map.set(d.domain, d));
        return Array.from(map.values());
      });

      setHasMore(newDocs.length > 0 && newDocs.length >= 10);
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

  const handleSubmit = (e: any) => {
    e.preventDefault();
    setIsSearching(true);
    setSearchQuery(searchTerm);
    setPage(1);
  };

  const handleLoadMore = () => {
    if (hasMore && !isLoading && !isFetchingMore) {
      setIsFetchingMore(true);
      setPage(prev => prev + 1);
    }
  };

  const handleCopy = async (doc: DocPreview) => {
    const API_URL = getApiUrl();
    try {
      if (!doc.filePath && !doc.domain) throw new Error('File path not available');
      const param = doc.filePath ? `path=${encodeURIComponent(doc.filePath)}` : `domain=${encodeURIComponent(doc.domain)}`;
      const response = await fetch(`${API_URL}/docs/content?${param}`);
      if (!response.ok) throw new Error('Failed to fetch content from API');
      
      const content = await response.text();
      await navigator.clipboard.writeText(content);
      setCopiedDomain(doc.domain);
      setTimeout(() => setCopiedDomain(null), 3000);
    } catch (err: any) {
      console.error('Copy error:', err);
      alert(`Copy failed: ${err.message}`);
    }
  };

  const handleDownload = async (doc: DocPreview) => {
    const API_URL = getApiUrl();
    try {
      const param = doc.filePath ? `path=${encodeURIComponent(doc.filePath)}` : `domain=${encodeURIComponent(doc.domain)}`;
      const response = await fetch(`${API_URL}/docs/download?${param}`);
      if (!response.ok) throw new Error('Failed to download file');
      
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
      console.error('Download error:', err);
      alert(`Download failed: ${err.message}`);
    }
  };

  const handlePreview = async (doc: DocPreview) => {
    const API_URL = getApiUrl();
    try {
      const param = doc.filePath ? `path=${encodeURIComponent(doc.filePath)}` : `domain=${encodeURIComponent(doc.domain)}`;
      const response = await fetch(`${API_URL}/docs/content?${param}`);
      if (!response.ok) throw new Error('Failed to fetch content');
      const text = await response.text();
      setPreviewContent(text.slice(0, 10000) + (text.length > 10000 ? '\n\n...[Content truncated for preview]...' : ''));
      setPreviewDomain(doc.domain);
    } catch (err: any) {
      alert(`Preview failed: ${err.message}`);
    }
  };

  return (
    <div className="docingest-view-container" style={{
      marginTop: '1.5rem',
      padding: '1.5rem',
      backgroundColor: '#0d0914',
      border: '1px solid #332d4a',
      borderRadius: '8px',
      color: '#e2e1e8',
      fontFamily: 'inherit'
    }}>
      {/* Header */}
      <div style={{ marginBottom: '1.5rem', borderBottom: '1px solid #1e1b2e', paddingBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ color: '#ffffff', margin: '0 0 0.5rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ color: '#00ff00' }}>◈</span> Searchable Documentation Corpus
          </h2>
          <p style={{ margin: 0, color: '#8b889c', fontSize: '0.9rem' }}>
            Query, inspect, copy, or download canonical documentation scraped and formatted for AI context ingestion.
          </p>
        </div>
        <div>
          <a
            href="/Software-&-Github/Tools/DocIngest/add"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              backgroundColor: '#00ff00',
              color: '#000000',
              fontWeight: 'bold',
              padding: '0.5rem 1rem',
              borderRadius: '4px',
              textDecoration: 'none',
              fontSize: '0.85rem'
            }}
          >
            + Ingest New URL
          </a>
        </div>
      </div>

      {/* Search Form */}
      <form onSubmit={handleSubmit} style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="Filter by library or domain (e.g. react, docker, tailwind, openwrt)..."
            value={searchTerm}
            onInput={(e: any) => setSearchTerm(e.target.value)}
            style={{
              flex: '1 1 280px',
              padding: '0.75rem 1rem',
              backgroundColor: '#1e1b2e',
              border: '1px solid #332d4a',
              borderRadius: '4px',
              color: '#ffffff',
              fontFamily: 'inherit',
              fontSize: '0.9rem'
            }}
          />
          <button
            type="submit"
            disabled={isSearching}
            style={{
              backgroundColor: '#b026ff',
              color: '#ffffff',
              fontWeight: 'bold',
              padding: '0.75rem 1.5rem',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '0.9rem'
            }}
          >
            {isSearching ? 'Searching...' : 'Search'}
          </button>
          {searchQuery && (
            <button
              type="button"
              onClick={() => { setSearchTerm(''); setSearchQuery(''); setPage(1); }}
              style={{
                backgroundColor: '#1e1b2e',
                color: '#8b889c',
                border: '1px solid #332d4a',
                padding: '0.75rem 1rem',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '0.9rem'
              }}
            >
              Clear
            </button>
          )}
        </div>
      </form>

      {/* Error Message */}
      {error && (
        <div style={{
          padding: '0.75rem 1rem',
          backgroundColor: 'rgba(239, 68, 68, 0.15)',
          border: '1px solid rgba(239, 68, 68, 0.4)',
          borderRadius: '4px',
          color: '#f87171',
          marginBottom: '1.5rem'
        }}>
          ⚠️ {error}
        </div>
      )}

      {/* Loading state */}
      {isLoading && docs.length === 0 && (
        <div style={{ textAlign: 'center', padding: '2.5rem 0', color: '#8b889c' }}>
          <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>⏳</div>
          Loading documentation corpus from DocIngest API...
        </div>
      )}

      {/* Empty Search Result */}
      {!isLoading && docs.length === 0 && (
        <div style={{ textAlign: 'center', padding: '2.5rem 0', color: '#8b889c' }}>
          <p>No documentation found matching "<strong>{searchQuery}</strong>".</p>
          <p style={{ fontSize: '0.85rem' }}>
            Try a different search term or <a href="/Software-&-Github/Tools/DocIngest/add" style={{ color: '#00ff00' }}>ingest this URL now</a>.
          </p>
        </div>
      )}

      {/* Documentation Card Grid */}
      {docs.length > 0 && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '1.25rem'
        }}>
          {docs.map((doc, idx) => (
            <div
              key={idx}
              style={{
                backgroundColor: '#1e1b2e',
                border: '1px solid #332d4a',
                borderRadius: '6px',
                padding: '1.25rem',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: '1rem',
                transition: 'border-color 0.2s'
              }}
            >
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <h3 style={{ margin: 0, color: '#ffffff', fontSize: '1.1rem' }}>
                    {getPrimaryDomain(doc.domain)}
                  </h3>
                  <span style={{
                    fontSize: '0.75rem',
                    backgroundColor: 'rgba(176, 38, 255, 0.15)',
                    color: '#b026ff',
                    padding: '0.2rem 0.5rem',
                    borderRadius: '4px',
                    border: '1px solid rgba(176, 38, 255, 0.3)'
                  }}>
                    {doc.structure ? `${doc.structure.length} Sections` : 'Markdown Corpus'}
                  </span>
                </div>

                <div style={{ color: '#8b889c', fontSize: '0.85rem', wordBreak: 'break-all', marginBottom: '0.5rem' }}>
                  <strong>Domain:</strong> {doc.domain}
                </div>

                <div style={{ color: '#767676', fontSize: '0.8rem' }}>
                  <strong>Indexed:</strong> {new Date(doc.lastUpdated).toLocaleDateString()}
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', paddingTop: '0.75rem', borderTop: '1px solid #28243d' }}>
                <button
                  onClick={() => handleCopy(doc)}
                  style={{
                    backgroundColor: copiedDomain === doc.domain ? '#00ff00' : 'rgba(0, 255, 0, 0.1)',
                    color: copiedDomain === doc.domain ? '#000000' : '#00ff00',
                    border: '1px solid rgba(0, 255, 0, 0.3)',
                    padding: '0.4rem 0.75rem',
                    borderRadius: '4px',
                    fontSize: '0.8rem',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  {copiedDomain === doc.domain ? '✓ Copied Markdown' : '📋 Copy Context'}
                </button>

                <button
                  onClick={() => handleDownload(doc)}
                  style={{
                    backgroundColor: 'rgba(95, 175, 215, 0.1)',
                    color: '#5fafd7',
                    border: '1px solid rgba(95, 175, 215, 0.3)',
                    padding: '0.4rem 0.75rem',
                    borderRadius: '4px',
                    fontSize: '0.8rem',
                    cursor: 'pointer'
                  }}
                >
                  💾 Download .md
                </button>

                <button
                  onClick={() => handlePreview(doc)}
                  style={{
                    backgroundColor: 'transparent',
                    color: '#e2e1e8',
                    border: '1px solid #332d4a',
                    padding: '0.4rem 0.75rem',
                    borderRadius: '4px',
                    fontSize: '0.8rem',
                    cursor: 'pointer'
                  }}
                >
                  👁️ Inspect
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination Load More */}
      {hasMore && !isLoading && docs.length > 0 && (
        <div style={{ textAlign: 'center', marginTop: '2rem' }}>
          <button
            onClick={handleLoadMore}
            disabled={isFetchingMore}
            style={{
              backgroundColor: '#1e1b2e',
              color: '#00ff00',
              fontWeight: 'bold',
              border: '1px solid #332d4a',
              padding: '0.6rem 1.5rem',
              borderRadius: '4px',
              cursor: isFetchingMore ? 'not-allowed' : 'pointer'
            }}
          >
            {isFetchingMore ? 'Loading More Documents...' : 'Load Next Page →'}
          </button>
        </div>
      )}

      {/* Preview Modal */}
      {previewContent && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          zIndex: 9999,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '1.5rem'
        }}>
          <div style={{
            backgroundColor: '#0d0914',
            border: '1px solid #b026ff',
            borderRadius: '8px',
            maxWidth: '900px',
            width: '100%',
            maxHeight: '85vh',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}>
            <div style={{
              padding: '1rem 1.5rem',
              borderBottom: '1px solid #1e1b2e',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <h3 style={{ margin: 0, color: '#ffffff' }}>
                Preview: {previewDomain}
              </h3>
              <button
                onClick={() => { setPreviewContent(null); setPreviewDomain(null); }}
                style={{
                  backgroundColor: 'transparent',
                  color: '#ef4444',
                  border: 'none',
                  fontSize: '1.25rem',
                  cursor: 'pointer'
                }}
              >
                ✕
              </button>
            </div>
            <div style={{
              padding: '1.5rem',
              overflowY: 'auto',
              flex: 1,
              fontFamily: 'monospace',
              fontSize: '0.85rem',
              color: '#cccccc',
              whiteSpace: 'pre-wrap',
              backgroundColor: '#050308'
            }}>
              {previewContent}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const mountViewApp = () => {
  const root = document.getElementById('docingest-view-root');
  if (root) {
    render(<ViewPageApp />, root);
  }
};

document.addEventListener('nav', mountViewApp);
if (document.readyState === 'complete' || document.readyState === 'interactive') {
  mountViewApp();
}

export default "";
