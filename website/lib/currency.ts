export function poundsToPence(pounds: number): number {
    if (!isFinite(pounds) || isNaN(pounds)) return 0;
    return Math.round(pounds * 100);
  }
  
  export function penceToPounds(pence: number): number {
    if (!isFinite(pence) || isNaN(pence)) return 0;
    return pence / 100;
  }
  
  export function formatPenceToGBP(pence: number): string {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(penceToPounds(pence));
  }