/**
 * Estado de um bloco cuja consulta falhou. Nunca um 0 nem "ninguém": dizer que
 * não há dado é diferente de dizer que não há ninguém.
 */
export function Indisponivel() {
  return (
    <p role="status" className="text-label text-ink-muted py-6 text-center m-0">
      Não foi possível carregar. Atualize a página em instantes.
    </p>
  );
}
