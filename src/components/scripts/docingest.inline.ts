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
        const res = await fetch(`${apiUrl}/documents`);
        if (!res.ok) throw new Error("Failed to fetch documents");
        const data = await res.json();
        allDocs = data.documents || [];
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
        <li class="doc-card">
          <h4>${doc.title || 'Untitled Document'}</h4>
          <a href="${doc.url}" target="_blank" rel="noopener noreferrer" class="doc-url">${doc.url}</a>
          <div class="doc-meta">
            <span>${new Date(doc.created_at || Date.now()).toLocaleDateString()}</span>
            <span>${doc.status || 'Processed'}</span>
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
        statusDiv.textContent = "Ingesting document. This may take a moment...";
        statusDiv.className = "docingest-status";

        try {
          const res = await fetch(`${apiUrl}/ingest`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url })
          });

          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Failed to ingest URL");

          statusDiv.textContent = "Successfully ingested document!";
          statusDiv.className = "docingest-status success";
          urlInput.value = "";
          
          // Refresh list if it exists on the same page
          if (docList) {
            fetchDocuments();
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
          (doc.title && doc.title.toLowerCase().includes(query)) ||
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
