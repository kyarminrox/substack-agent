declare module 'sanitize-html' {
  export interface IOptions {
    allowedTags?: string[] | false;
    allowedAttributes?: Record<string, string[]>;
    transformTags?: Record<
      string,
      | string
      | ((
          tagName: string,
          attribs: Record<string, string>
        ) => { tagName: string; attribs?: Record<string, string> })
    >;
  }

  const sanitizeHtml: (dirty: string, options?: IOptions) => string;
  export default sanitizeHtml;
}

