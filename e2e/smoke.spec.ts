import { test, expect } from '@playwright/test';

/** Skip language + age overlays so E2E hits the storefront. */
async function bypassGates(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('app_locale', 'en');
      localStorage.setItem('app_locale_chosen', '1');
      localStorage.setItem('age_verified', '1');
    } catch {
      /* ignore */
    }
  });
}

test.describe('Smoke', () => {
  test('home shows navigation after gates bypass', async ({ page }) => {
    await bypassGates(page);
    await page.goto('/');
    await expect(page.getByRole('navigation')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole('navigation').getByRole('link', { name: 'Products', exact: true })).toBeVisible();
  });

  test('shop page loads', async ({ page }) => {
    await bypassGates(page);
    await page.goto('/shop');
    await expect(page.getByRole('navigation')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('/es sets Spanish nav labels', async ({ page }) => {
    await bypassGates(page);
    await page.goto('/es');
    await expect(page).toHaveURL('/', { timeout: 30_000 });
    await expect(
      page.getByRole('navigation').getByRole('link', { name: 'Productos', exact: true })
    ).toBeVisible({ timeout: 60_000 });
  });

  test('login page reachable', async ({ page }) => {
    await bypassGates(page);
    await page.goto('/login');
    await expect(page.getByRole('heading', { level: 1, name: 'Welcome Back' })).toBeVisible({ timeout: 30_000 });
  });
});
