import * as preact from 'preact';

type QuartzComponentProps$2 = {
    [key: string]: any;
};
interface DocIngestWidgetOptions {
    apiUrl?: string;
}
declare const _default$2: (opts?: DocIngestWidgetOptions) => preact.FunctionComponent<QuartzComponentProps$2> & {
    css?: string;
    beforeDOMLoaded?: string;
    afterDOMLoaded?: string;
};

type QuartzComponentProps$1 = {
    [key: string]: any;
};
interface DocIngestOptions$1 {
    apiUrl?: string;
}
declare const _default$1: (opts?: DocIngestOptions$1) => preact.FunctionComponent<QuartzComponentProps$1> & {
    css?: string;
    beforeDOMLoaded?: string;
    afterDOMLoaded?: string;
};

type QuartzComponentProps = {
    [key: string]: any;
};
interface DocIngestOptions {
    apiUrl?: string;
}
declare const _default: (opts?: DocIngestOptions) => preact.FunctionComponent<QuartzComponentProps> & {
    css?: string;
    beforeDOMLoaded?: string;
    afterDOMLoaded?: string;
};

export { type DocIngestOptions$1 as D, _default$1 as DocIngestAdd, _default as DocIngestView, _default$2 as DocIngestWidget, type DocIngestWidgetOptions };
