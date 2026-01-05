import { test, expect } from '@playwright/test';

test('has title', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/AnikChat/);
});

test('shows empty state initially', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('AnikChat')).toBeVisible();
    await expect(page.getByText('Your intelligent AI chat assistant')).toBeVisible();
});

test('settings navigation works', async ({ page }) => {
    await page.goto('/');
    await page.click('button[aria-label="Open settings"]');
    await expect(page).toHaveURL(/.*settings/);
});
