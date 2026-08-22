document.addEventListener("nav", () => {
  const widgets = document.querySelectorAll('.docingest-widget');
  
  widgets.forEach(widget => {
    const apiUrl = widget.getAttribute('data-api-url') || "https://docingest.iamrp.dev/api";
    
    // Elements
    const urlInput = widget.querySelector('#docingest-url-input') as HTMLInputElement;
    const submitBtn = widget.querySelector('#docingest-submit-btn') as HTMLButtonElement;
    const statusDiv = widget.querySelector('#docingest-status') as HTMLDivElement;
    const searchInput = widget.querySelector('#docingest-search-input') as HTMLInputElement;
    const docList = widget.querySelector('#docingest-doc-list') as HTMLUListElement;

    let allDocs: any[] = [];

    const fetchDocuments = async () => {
      if (!docList) return;
      
      try {
        const res = await fetch(`${apiUrl}/docs/list?page=1&limit=20`);
        if (!res.ok) throw new Error("Failed to fetch documents");
        const data = await res.json();
        allDocs = data.docs || [];
        renderDocuments(allDocs);
      } catch (err: any) {
        docList.innerHTML = `<li class="empty-state">Error loading documents: ${err.message}</li>`;
      }
    };

    const renderDocuments = (docs: any[]) => {
      if (!docList) return;
      
      if (docs.length === 0) {
        docList.innerHTML = `<li class="empty-state">No documents found.</li>`;
        return;
      }

      docList.innerHTML = docs.map(doc => `
        <li class="doc-card" style="padding: 0.75rem; border: 1px solid #332d4a; border-radius: 4px; margin-bottom: 0.5rem; background: #1e1b2e;">
          <h4 style="margin: 0 0 0.25rem 0; color: #ffffff;">${doc.domain}</h4>
          <a href="${doc.url || ('https://' + doc.domain)}" target="_blank" rel="noopener noreferrer" class="doc-url" style="color: #00ff00; font-size: 0.85rem;">${doc.domain}</a>
          <div class="doc-meta" style="color: #8b889c; font-size: 0.8rem; margin-top: 0.25rem;">
            <span>Indexed: ${new Date(doc.lastUpdated || Date.now()).toLocaleDateString()}</span>
          </div>
        </li>
      `).join('');
    };

    if (submitBtn && urlInput) {
      submitBtn.addEventListener('click', async () => {
        const url = urlInput.value.trim();
        if (!url) return;

        submitBtn.disabled = true;
        submitBtn.textContent = "Ingesting...";
        statusDiv.textContent = "Queueing document for ingestion...";
        statusDiv.className = "docingest-status";

        try {
          const res = await fetch(`${apiUrl}/crawl/start`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
              url,
              limit: 100,
              maxDepth: 5,
              scrapeOptions: {
                formats: ['markdown', 'html'],
                onlyMainContent: true
              }
            })
          });

          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Failed to initiate crawl");

          statusDiv.textContent = `Job queued successfully (Task ID: ${data.id || 'Active'})!`;
          statusDiv.className = "docingest-status success";
          urlInput.value = "";
          
          if (docList) {
            setTimeout(fetchDocuments, 2000);
          }
        } catch (err: any) {
          statusDiv.textContent = `Error: ${err.message}`;
          statusDiv.className = "docingest-status error";
        } finally {
          submitBtn.disabled = false;
          submitBtn.textContent = "Ingest";
        }
      });
    }

    if (searchInput && docList) {
      searchInput.addEventListener('input', (e) => {
        const query = (e.target as HTMLInputElement).value.toLowerCase();
        if (!query) {
          renderDocuments(allDocs);
          return;
        }
        
        const filtered = allDocs.filter(doc => 
          (doc.domain && doc.domain.toLowerCase().includes(query)) ||
          (doc.url && doc.url.toLowerCase().includes(query))
        );
        renderDocuments(filtered);
      });
    }

    // Initial load of documents if list exists
    if (docList) {
      fetchDocuments();
    }
  });
});
