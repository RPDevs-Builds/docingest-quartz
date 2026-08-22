import type { ComponentType } from "preact";
import script from "./scripts/AddPageApp.inline";

export type QuartzComponentProps = { [key: string]: any };
export type QuartzComponent = ComponentType<QuartzComponentProps> & {
  css?: string;
  beforeDOMLoaded?: string;
  afterDOMLoaded?: string;
};
export type QuartzComponentConstructor = (opts?: any) => QuartzComponent;

export interface DocIngestOptions {
  apiUrl?: string;
}

export default ((opts?: DocIngestOptions) => {
  const Component: QuartzComponent = (props: QuartzComponentProps) => {
    const mode = props.fileData.frontmatter?.docingest;

    if (mode === "add") {
      return (
        <div id="docingest-add-root"></div>
      );
    }

    return null;
  };

  Component.afterDOMLoaded = script;

  return Component;
}) satisfies QuartzComponentConstructor;
