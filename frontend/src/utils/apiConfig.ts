export const getApiUrl = (envUrl: string | undefined, defaultLocal: string): string => {
  if (typeof window !== 'undefined') {
    const isLocalhost = 
      window.location.hostname === 'localhost' || 
      window.location.hostname === '127.0.0.1';

    if (isLocalhost) {
      return defaultLocal;
    }
  }
  return envUrl || defaultLocal;
};
