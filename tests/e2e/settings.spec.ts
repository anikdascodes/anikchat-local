import { test, expect } from '@playwright/test';

test.describe('API Provider Configuration', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/settings');
    await page.getByRole('tab', { name: /api/i }).click();
  });

  test('can add a new provider', async ({ page }) => {
    // Click add provider button
    const addButton = page.getByRole('button', { name: /add provider/i });
    await addButton.click();

    // Should show provider options
    await expect(page.getByText(/openai|anthropic|ollama/i).first()).toBeVisible();
  });

  test('shows provider presets', async ({ page }) => {
    const addButton = page.getByRole('button', { name: /add provider/i });
    await addButton.click();

    // Check for common providers
    const providers = ['OpenAI', 'Anthropic', 'Groq', 'Ollama'];
    for (const provider of providers) {
      await expect(page.getByText(provider).first()).toBeVisible();
    }
  });
});

test.describe('Data Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/settings');
    await page.getByRole('tab', { name: /data/i }).click();
  });

  test('shows storage information', async ({ page }) => {
    await expect(page.getByText(/storage/i).first()).toBeVisible();
  });

  test('has export button', async ({ page }) => {
    const exportButton = page.getByRole('button', { name: /export/i });
    await expect(exportButton.first()).toBeVisible();
  });

  test('has clear data option', async ({ page }) => {
    const clearButton = page.getByRole('button', { name: /clear|delete/i });
    await expect(clearButton.first()).toBeVisible();
  });
});

test.describe('Advanced Settings', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/settings');
    await page.getByRole('tab', { name: /advanced/i }).click();
  });

  test('shows temperature slider', async ({ page }) => {
    await expect(page.getByText(/temperature/i)).toBeVisible();
    
    // Should have a slider
    const slider = page.locator('[role="slider"]').first();
    await expect(slider).toBeVisible();
  });

  test('shows max tokens setting', async ({ page }) => {
    await expect(page.getByText(/max tokens/i)).toBeVisible();
  });

  test('has RAG toggle', async ({ page }) => {
    await expect(page.getByText(/semantic search|rag/i)).toBeVisible();
    
    // Should have a switch
    const toggle = page.locator('[role="switch"]').first();
    await expect(toggle).toBeVisible();
  });

  test('has reset button', async ({ page }) => {
    const resetButton = page.getByRole('button', { name: /reset/i });
    await expect(resetButton).toBeVisible();
  });
});
