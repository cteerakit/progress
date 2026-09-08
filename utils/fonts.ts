export const GOOGLE_SANS_FAMILY = 'Google Sans';

export const GOOGLE_SANS_STACK = `"${GOOGLE_SANS_FAMILY}", Roboto, Arial, sans-serif`;

export const GOOGLE_SANS_STYLESHEET =
  'https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500;600;700&display=swap';

const GOOGLE_SANS_LINK_ID = 'progress-google-sans';

export function injectGoogleSansLink(doc: Document = document): void {
  if (doc.getElementById(GOOGLE_SANS_LINK_ID)) {
    return;
  }

  const preconnectGoogle = doc.createElement('link');
  preconnectGoogle.rel = 'preconnect';
  preconnectGoogle.href = 'https://fonts.googleapis.com';
  doc.head.append(preconnectGoogle);

  const preconnectStatic = doc.createElement('link');
  preconnectStatic.rel = 'preconnect';
  preconnectStatic.href = 'https://fonts.gstatic.com';
  preconnectStatic.crossOrigin = '';
  doc.head.append(preconnectStatic);

  const link = doc.createElement('link');
  link.id = GOOGLE_SANS_LINK_ID;
  link.rel = 'stylesheet';
  link.href = GOOGLE_SANS_STYLESHEET;
  doc.head.append(link);
}
