"use client";

import { useState, useRef } from "react";
import { salvarFoto, type Acao } from "./acoes";
import { MensagemErro } from "@/components/aviso";
import { AvatarColaborador } from "@/components/avatar-colaborador";

const LADO = 256;

/**
 * Reduz a imagem no navegador antes de enviar.
 *
 * Sem isso, 25 linhas da lista com fotos de celular de 3 MB seriam 75 MB por
 * página. Feito no cliente e não no servidor porque `sharp` no servidor seria
 * dependência de runtime a mais, CPU por upload e mais uma peça no deploy — o
 * canvas já está em todo navegador e nada trafega além do necessário.
 *
 * Recorta quadrado pelo centro: o avatar é redondo, e uma foto retangular
 * espremida num círculo distorce o rosto.
 */
async function reduzir(arquivo: File): Promise<File> {
  const bitmap = await createImageBitmap(arquivo);
  const lado = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - lado) / 2;
  const sy = (bitmap.height - lado) / 2;

  const canvas = document.createElement("canvas");
  canvas.width = LADO;
  canvas.height = LADO;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponível neste navegador.");
  ctx.drawImage(bitmap, sx, sy, lado, lado, 0, 0, LADO, LADO);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.8)
  );
  if (!blob) throw new Error("Não foi possível processar a imagem.");

  return new File([blob], "foto.jpg", { type: "image/jpeg" });
}

export function EnvioFoto({
  colaboradorId,
  nome,
  fotoUrl,
  origem = "Cadastro do colaborador",
}: {
  colaboradorId: string;
  nome: string;
  fotoUrl: string | null;
  /** Vai para a trilha de auditoria, para distinguir de onde partiu a troca. */
  origem?: string;
}) {
  const [estado, setEstado] = useState<Acao | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [previa, setPrevia] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function aoEscolher(evento: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = evento.target.files?.[0];
    if (!arquivo) return;

    setEstado(null);
    setEnviando(true);

    try {
      const reduzida = await reduzir(arquivo);
      setPrevia(URL.createObjectURL(reduzida));

      const dados = new FormData();
      dados.set("id", colaboradorId);
      dados.set("foto", reduzida);
      dados.set("origem", origem);

      setEstado(await salvarFoto(null, dados));
    } catch (erro) {
      setEstado({
        ok: false,
        erro: erro instanceof Error ? erro.message : "Falha ao processar a imagem.",
      });
    } finally {
      setEnviando(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex items-center gap-4">
      <AvatarColaborador nome={nome} fotoUrl={previa ?? fotoUrl} tamanho={72} />

      <div>
        <label className="btn btn--secondary cursor-pointer">
          {enviando ? "Enviando…" : fotoUrl ? "Trocar foto" : "Enviar foto"}
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={aoEscolher}
            disabled={enviando}
          />
        </label>

        <p className="text-caption text-ink-faint mt-1.5 mb-0 max-w-[36ch]">
          A imagem é recortada em quadrado e reduzida para 256px no seu
          navegador antes de subir.
        </p>

        {estado?.ok && (
          <p role="status" className="text-label text-ink-muted mt-1 mb-0">{estado.mensagem}</p>
        )}
        {estado && !estado.ok && <MensagemErro>{estado.erro}</MensagemErro>}
      </div>
    </div>
  );
}
