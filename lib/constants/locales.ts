export const SUPPORTED_LOCALES = ['en', 'zh-CN', 'th-TH', 'ru-RU'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
