/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Guarda no navegador, por 60 s, as telas dinâmicas já visitadas: voltar a
    // uma aba vista há pouco não refaz a ida ao servidor. Gravações não ficam
    // velhas — toda server action que muda dado chama revalidatePath, que
    // limpa esse cache. O que pode atrasar até 60 s é mudança feita por outra
    // pessoa ou pelo cron, e só ao voltar para uma aba já aberta.
    staleTimes: {
      dynamic: 60,
    },
    serverActions: {
      // Upload de ASO: PDFs de clínica raramente passam de 4 MB, mas
      // digitalização em 300dpi estoura o padrão de 1 MB do Next.
      bodySizeLimit: "8mb",
    },
  },
  // Links antigos (favoritos, e-mails, chat). Temporários (307) e com a query
  // string preservada. `source` é exata: "/qsms/item/<id>" etc. continuam
  // sendo páginas. "/qsms/base" (Base virou o lançamento de exame anterior na
  // aba ASO do perfil) e "/admin/desligados" (virou filtro da lista) só existem
  // aqui.
  async redirects() {
    return [
      { source: "/qsms", destination: "/radar", permanent: false },
      { source: "/qsms/dashboard", destination: "/dashboard", permanent: false },
      { source: "/supervisor", destination: "/radar", permanent: false },
      { source: "/qsms/base", destination: "/colaboradores", permanent: false },
      {
        source: "/admin/desligados",
        destination: "/colaboradores?situacao=desligados",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
