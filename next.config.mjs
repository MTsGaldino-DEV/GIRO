/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      // Upload de ASO: PDFs de clínica raramente passam de 4 MB, mas
      // digitalização em 300dpi estoura o padrão de 1 MB do Next.
      bodySizeLimit: "8mb",
    },
  },
};

export default nextConfig;
