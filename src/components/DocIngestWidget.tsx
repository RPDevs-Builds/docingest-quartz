import type { ComponentType } from "preact";

export type QuartzComponentProps = { [key: string]: any };
export type QuartzComponent = ComponentType<QuartzComponentProps> & {
  css?: string;
  beforeDOMLoaded?: string;
  afterDOMLoaded?: string;
};
export type QuartzComponentConstructor = (opts?: any) => QuartzComponent;

// @ts-ignore
import script from "./scripts/docingest.inline"
// @ts-ignore
import style from "./styles/docingest.scss"

export interface DocIngestWidgetOptions {
  apiUrl?: string;
}

export default ((opts?: DocIngestWidgetOptions) => {
  const Component: QuartzComponent = (props: QuartzComponentProps) => {
    const mode = props.fileData.frontmatter?.docingest;
    const apiUrl = opts?.apiUrl || "https://docingest.iamrp.dev/api";

    if (mode === "add" || mode === "view") {
      return (
        <div class={`docingest-widget docingest-${mode}`} data-api-url={apiUrl}>
          {mode === "add" && (
            <div style={{ marginBottom: "2rem" }}>
              <div class="docingest-form">
                <input 
                  type="url" 
                  id="docingest-url-input" 
                  placeholder="https://example.com/docs" 
                  required 
                />
                <button id="docingest-submit-btn">Ingest</button>
              </div>
              <div id="docingest-status" class="docingest-status"></div>
            </div>
          )}

          <div class="docingest-search" style={{ marginBottom: "1rem" }}>
            <input 
              type="text" 
              id="docingest-search-input" 
              placeholder="Search ingested documents..." 
            />
          </div>
          
          <ul id="docingest-doc-list" class="docingest-doc-list">
            <li class="empty-state">Loading documents...</li>
          </ul>
        </div>
      );
    }

    return null;
  };

  Component.css = style;
  Component.afterDOMLoaded = script;

  return Component;
}) satisfies QuartzComponentConstructor;
