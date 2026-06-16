import { test, expect } from '@playwright/test';

/** Bypass gates and pre-seed a cart so we land straight on a populated checkout. */
async function setup(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('app_locale', 'es');
      localStorage.setItem('app_locale_chosen', '1');
      localStorage.setItem('age_verified', '1');
      localStorage.setItem('lab-cart-storage', JSON.stringify({
        state: {
          cart: [{
            product: {
              id: 'test-bpc', name: 'BPC-157 10mg', description: 'test',
              price: 45, stock: 100, category: 'peptides',
              img: 'https://placehold.co/100',
            },
            quantity: 1,
          }],
          products: [],
          sharedFrom: null,
        },
        version: 0,
      }));
    } catch { /* ignore */ }
  });
}

test('checkout: pickup option appears and hides shipping address', async ({ page }) => {
  await setup(page);
  await page.goto('/cart');
  await expect(page.getByRole('navigation')).toBeVisible({ timeout: 60_000 });

  // Move from the cart summary into the checkout step.
  await page.getByRole('button', { name: /Ir a pagar|Checkout/i }).click({ timeout: 30_000 });

  // All three shipping options present.
  await expect(page.getByText('Recoger en persona', { exact: false })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Estándar', { exact: false })).toBeVisible();
  await expect(page.getByText('Express', { exact: false })).toBeVisible();

  // Standard is default → address input visible.
  await expect(page.getByPlaceholder(/Calle 123|Main St/i)).toBeVisible();

  // Select in-person pickup.
  await page.getByText('Recoger en persona', { exact: false }).click();

  // Pickup note shows; the address input is gone.
  await expect(page.getByText(/no necesitamos tu dirección/i)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByPlaceholder(/Calle 123|Main St/i)).toHaveCount(0);

  // Shipping cost should read $0.00 in the summary.
  await expect(page.getByText('$0.00').first()).toBeVisible();
});
