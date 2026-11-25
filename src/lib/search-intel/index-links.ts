export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://gravyblock.com";
export const reportLink = (businessId: string) => `${SITE_URL}/admin/house/search-reports/${businessId}`;
