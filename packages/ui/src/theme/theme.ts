// Spacing, radii and type sizes in rem, shared by every layout gap and by Spacer.
export const theme = {
  space: { xxs: '0.25rem', xs: '0.5rem', sm: '0.75rem', md: '1rem', lg: '1.5rem', xl: '2rem' },
  radius: { sm: '0.375rem', md: '0.5rem', lg: '0.625rem', pill: '999px' },
  font: { xs: '0.75rem', sm: '0.8125rem', md: '0.875rem', lg: '1.0625rem', xl: '1.375rem' }
} as const;

export type AppTheme = typeof theme;
