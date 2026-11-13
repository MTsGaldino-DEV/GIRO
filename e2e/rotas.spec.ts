import { expect, test } from '@playwright/test'

/**
 * Rotas da navegação nova (spec de 13/11, seção 5) sem sessão.
 *
 * Toda rota protegida, nova ou antiga, termina em /login quando não há login.
 * Os fluxos autenticados (login de QSMS cai em /dashboard, de supervisor em
 * /radar; /qsms -> /radar com a query preservada; /qsms/dashboard -> /dashboard;
 * /supervisor e /colaboradores -> /radar; menu aceso na tela certa) são
 * verificados manualmente com as contas de teste, porque o e2e não tem login.
 */
const ROTAS_PROTEGIDAS = [
  '/radar',
  '/dashboard',
  '/colaboradores',
  '/qsms',
  '/qsms?status=vencido',
  '/qsms/dashboard',
  '/supervisor',
  '/qsms/base',
  '/admin/desligados',
]

for (const rota of ROTAS_PROTEGIDAS) {
  test(`${rota} sem sessão termina em /login`, async ({ page }) => {
    await page.goto(rota)
    await expect(page).toHaveURL(/\/login/)
  })
}

test('/login continua abrindo', async ({ page }) => {
  await page.goto('/login')
  await expect(page.getByRole('heading', { name: 'Entrar' })).toBeVisible()
})
