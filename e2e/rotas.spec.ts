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
  // Link dos e-mails semanais; com sessão redireciona para /qsms/item/<id>.
  '/supervisor/item/00000000-0000-4000-8000-000000000000',
  '/qsms/base',
  '/admin/desligados',
]

for (const rota of ROTAS_PROTEGIDAS) {
  test(`${rota} sem sessão termina em /login`, async ({ page }) => {
    await page.goto(rota)
    await expect(page).toHaveURL(/\/login/)
  })
}

// Os redirecionamentos de config acontecem antes da autenticação. Pedir sem
// seguir o redirecionamento fixa o destino, que o teste acima (que só vê o
// /login final) não mostra.
const REDIRECTS: [string, string][] = [
  ['/qsms/base', '/colaboradores'],
  ['/admin/desligados', '/colaboradores?situacao=desligados'],
]

for (const [origem, destino] of REDIRECTS) {
  test(`${origem} redireciona (307) para ${destino}`, async ({ request }) => {
    const resposta = await request.get(origem, { maxRedirects: 0 })
    expect(resposta.status()).toBe(307)
    expect(resposta.headers()['location'].endsWith(destino)).toBe(true)
  })
}

test('/login continua abrindo', async ({ page }) => {
  await page.goto('/login')
  await expect(page.getByRole('heading', { name: 'Entrar' })).toBeVisible()
})
