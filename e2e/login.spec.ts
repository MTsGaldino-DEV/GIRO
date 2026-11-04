import { expect, test } from '@playwright/test'

test('tela de login carrega', async ({ page }) => {
  await page.goto('/login')
  await expect(page.getByRole('heading', { name: 'Entrar' })).toBeVisible()
})
