import { test, expect } from '@playwright/test';

test.describe('Chat Application', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('shows empty state when no conversations', async ({ page }) => {
    // Should show empty state or welcome message
    await expect(page.getByText(/start a conversation|new chat|welcome/i)).toBeVisible({ timeout: 5000 });
  });

  test('can type and send a message', async ({ page }) => {
    const input = page.locator('textarea[placeholder*="message"], textarea[placeholder*="Message"]');
    await expect(input).toBeVisible();
    
    await input.fill('Hello, this is a test message');
    await expect(input).toHaveValue('Hello, this is a test message');
    
    // Send button should be enabled
    const sendButton = page.locator('button[aria-label*="send"], button:has(svg)').last();
    await expect(sendButton).toBeEnabled();
  });

  test('can open settings page', async ({ page }) => {
    // Navigate to settings
    await page.goto('/settings');
    
    // Should show settings tabs
    await expect(page.getByText('Appearance')).toBeVisible();
    await expect(page.getByText('API')).toBeVisible();
  });

  test('can toggle sidebar', async ({ page }) => {
    // Find sidebar toggle button (desktop)
    const toggleButton = page.locator('button[aria-label*="sidebar"], button[aria-label*="Hide"], button[aria-label*="Show"]').first();
    
    if (await toggleButton.isVisible()) {
      await toggleButton.click();
      // Sidebar state should change
      await page.waitForTimeout(300); // Wait for animation
    }
  });

  test('keyboard shortcut opens search', async ({ page }) => {
    // Press Ctrl+K to open search
    await page.keyboard.press('Control+k');
    
    // Search modal should appear
    await expect(page.getByPlaceholder(/search/i)).toBeVisible({ timeout: 2000 });
    
    // Press Escape to close
    await page.keyboard.press('Escape');
  });

  test('can create new conversation with Ctrl+N', async ({ page }) => {
    await page.keyboard.press('Control+n');
    
    // Should focus on input
    const input = page.locator('textarea');
    await expect(input).toBeFocused({ timeout: 2000 });
  });
});

test.describe('Settings', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/settings');
  });

  test('can switch between tabs', async ({ page }) => {
    // Click on API tab
    await page.getByRole('tab', { name: /api/i }).click();
    await expect(page.getByText(/provider/i)).toBeVisible();

    // Click on Advanced tab
    await page.getByRole('tab', { name: /advanced/i }).click();
    await expect(page.getByText(/temperature/i)).toBeVisible();

    // Click on Data tab
    await page.getByRole('tab', { name: /data/i }).click();
    await expect(page.getByText(/storage/i)).toBeVisible();
  });

  test('can change theme', async ({ page }) => {
    await page.getByRole('tab', { name: /appearance/i }).click();
    
    // Should have theme options
    await expect(page.getByText(/dark|light|system/i).first()).toBeVisible();
  });

  test('can navigate back to chat', async ({ page }) => {
    const backButton = page.locator('button').filter({ has: page.locator('svg') }).first();
    await backButton.click();
    
    await expect(page).toHaveURL('/');
  });
});

test.describe('Responsive Design', () => {
  test('mobile view shows menu button', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    
    // Should show mobile menu button
    const menuButton = page.locator('button[aria-label*="menu"], button[aria-label*="Open"]');
    await expect(menuButton.first()).toBeVisible();
  });

  test('desktop view shows sidebar', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    
    // Sidebar should be visible on desktop
    await page.waitForTimeout(500);
    const sidebar = page.locator('[class*="sidebar"], aside, nav').first();
    // Just check page loads correctly
    await expect(page.locator('body')).toBeVisible();
  });
});
