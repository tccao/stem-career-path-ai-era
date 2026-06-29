import { expect, test } from '@playwright/test';

async function openApplication(page) {
  const trigger = page.getByRole('button', { name: 'Sign Up' }).first();
  await trigger.click();
  return { trigger, dialog: page.getByRole('dialog', { name: 'Start your application' }) };
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('presents the current program and accessible disclosure navigation', async ({ page }) => {
  await expect(page.getByRole('heading', { level: 1 })).toContainText('STEM Graduates');
  await expect(page.locator('body')).toContainText('4-Week Fast Track');
  await expect(page.locator('body')).not.toContainText(/8[–-]12/);

  const trigger = page.getByRole('button', { name: 'STEM Career Path' });
  const menu = page.locator('#programMenu');
  await expect(menu).toBeHidden();
  await trigger.click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('link', { name: 'Timeline Tracks' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
});

test('opens without Firebase config and offers only supported age groups', async ({ page }) => {
  const { dialog } = await openApplication(page);
  await expect(dialog).toBeVisible();
  await expect(page.locator('main')).toHaveAttribute('aria-hidden', 'true');

  const age = dialog.getByLabel('Age group *');
  await expect(age.locator('option')).toHaveText(['Select…', '13–17', '18 or older']);
  await expect(dialog.getByLabel('Full name *')).toBeHidden();

  await age.selectOption('18plus');
  await expect(dialog.getByLabel('Full name *')).toBeVisible();
  await expect(dialog.getByLabel('Preferred track *').locator('option[value="fasttrack"]')).toHaveText('4-Week Fast Track');
  await expect(dialog.getByText('Both types receive the same student experience.')).toBeVisible();
});

test('requires guardian consent before revealing a minor application', async ({ page }) => {
  const { dialog } = await openApplication(page);
  await dialog.getByLabel('Age group *').selectOption('13-17');

  const consent = dialog.getByRole('checkbox', { name: /parent or guardian consents/i });
  await expect(consent).toBeVisible();
  await expect(consent).toHaveAttribute('required', '');
  await expect(dialog.getByLabel('Full name *')).toBeHidden();

  await consent.check();
  await expect(dialog.getByLabel('Full name *')).toBeVisible();
});

test('traps modal focus, closes with Escape, and restores the opener', async ({ page }) => {
  const { trigger, dialog } = await openApplication(page);
  const age = dialog.getByLabel('Age group *');
  await age.focus();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button', { name: 'Close dialog' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(age).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(page.locator('main')).not.toHaveAttribute('aria-hidden', 'true');
});

test('keeps collapsed FAQ answers out of the interaction tree', async ({ page }) => {
  const question = page.getByRole('button', { name: 'Who is this program for?' });
  const answerId = await question.getAttribute('aria-controls');
  const answer = page.locator(`#${answerId}`);

  await expect(answer).toBeHidden();
  await question.click();
  await expect(question).toHaveAttribute('aria-expanded', 'true');
  await expect(answer).toBeVisible();
  await question.click();
  await expect(answer).toBeHidden();
});

test('announces a friendly service error instead of breaking the landing UI', async ({ page }) => {
  const { dialog } = await openApplication(page);
  await dialog.getByLabel('Age group *').selectOption('18plus');
  await dialog.getByLabel('Full name *').fill('Audit Student');
  await dialog.getByLabel('Email *').fill('audit@example.com');
  await dialog.getByLabel('Current stage *').selectOption('student');
  await dialog.getByLabel('Preferred track *').selectOption('fasttrack');
  await dialog.getByLabel('Application type *').selectOption('supporter');
  await dialog.getByLabel('Why are you applying? *').fill('I want practical AI-era career skills.');
  await dialog.getByRole('button', { name: 'Submit application' }).click();

  await expect(dialog.getByRole('alert')).toContainText('could not be submitted right now');
  await expect(dialog.getByRole('button', { name: 'Submit application' })).toBeEnabled();
});

test('keeps the repaired footer and application modal usable on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();

  const footer = page.locator('.site-footer');
  await footer.scrollIntoViewIfNeeded();
  const mark = await footer.locator('.brand-mark').boundingBox();
  expect(mark?.width).toBeLessThanOrEqual(48);
  expect(mark?.height).toBeLessThanOrEqual(48);
  await expect(footer.getByRole('link', { name: /^codeforgood\.us/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

  const { dialog } = await openApplication(page);
  await dialog.getByLabel('Age group *').selectOption('18plus');
  await expect(dialog.getByRole('button', { name: 'Close dialog' })).toBeVisible();
  await dialog.locator('.modal-body').evaluate((element) => { element.scrollTop = element.scrollHeight; });
  await expect(dialog.getByRole('button', { name: 'Close dialog' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Submit application' })).toBeVisible();
});
