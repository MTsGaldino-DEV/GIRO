/**
 * Conclusões de ASO por mês.
 *
 * SVG inline em vez de biblioteca: é uma série única, sem interação além do
 * tooltip. `recharts` ou `chart.js` custariam centenas de kB no bundle para
 * desenhar doze retângulos.
 *
 * Série única, então sem legenda — o título já nomeia o que está no gráfico.
 * Petróleo, nunca cor de status: aqui a cor é identidade da série, e verde ou
 * vermelho num gráfico de volume sugeriria juízo de conformidade que este
 * número não carrega.
 */

const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export interface PontoMes {
  mes: string;
  quantidade: number;
}

export function GraficoConclusoes({ dados }: { dados: PontoMes[] }) {
  if (dados.length === 0) {
    return <p className="text-ink-faint text-label m-0">Sem dados suficientes.</p>;
  }

  const maximo = Math.max(...dados.map((d) => d.quantidade), 1);
  // Escala arredondada para cima, para o topo do gráfico não encostar na barra.
  const teto = Math.ceil(maximo * 1.15) || 1;

  const largura = 720;
  const altura = 220;
  const margemEsquerda = 32;
  const margemInferior = 26;
  const margemTopo = 12;

  const areaLargura = largura - margemEsquerda;
  const areaAltura = altura - margemInferior - margemTopo;
  const passo = areaLargura / dados.length;
  const larguraBarra = Math.min(28, passo * 0.5);

  // Três linhas de grade bastam para dar referência sem virar pauta.
  const marcas = [0, Math.round(teto / 2), teto];

  function rotulo(iso: string) {
    const [ano, mes] = iso.slice(0, 7).split("-");
    return `${MESES_CURTOS[Number(mes) - 1]}/${ano.slice(2)}`;
  }

  return (
    <figure className="m-0 overflow-x-auto">
      {/* min-width e rolagem própria: sem isso o SVG encolhe proporcionalmente
          num celular e os rótulos de mês viram borrão de 5px. Melhor rolar,
          como a tabela faz. */}
      <svg
        viewBox={`0 0 ${largura} ${altura}`}
        width="100%"
        role="img"
        aria-label={`Conclusões de ASO por mês nos últimos ${dados.length} meses.`}
        style={{ overflow: "visible", minWidth: `${largura}px` }}
      >
        {marcas.map((valor) => {
          const y = margemTopo + areaAltura - (valor / teto) * areaAltura;
          return (
            <g key={valor}>
              <line
                x1={margemEsquerda}
                x2={largura}
                y1={y}
                y2={y}
                stroke="var(--color-line)"
                strokeWidth={1}
              />
              <text
                x={margemEsquerda - 8}
                y={y + 4}
                textAnchor="end"
                fontSize="10"
                fill="var(--color-ink-faint)"
              >
                {valor}
              </text>
            </g>
          );
        })}

        {dados.map((ponto, i) => {
          const alturaBarra = (ponto.quantidade / teto) * areaAltura;
          const x = margemEsquerda + i * passo + (passo - larguraBarra) / 2;
          const y = margemTopo + areaAltura - alturaBarra;

          return (
            <g key={ponto.mes}>
              {ponto.quantidade > 0 && (
                <rect
                  x={x}
                  y={y}
                  width={larguraBarra}
                  height={alturaBarra}
                  rx={4}
                  fill="var(--color-brand)"
                >
                  <title>
                    {rotulo(ponto.mes)}: {ponto.quantidade}{" "}
                    {ponto.quantidade === 1 ? "ASO concluído" : "ASOs concluídos"}
                  </title>
                </rect>
              )}

              {/* Só o pico ganha número fixo. Rótulo em toda barra vira ruído e
                  o eixo já dá a ordem de grandeza. */}
              {ponto.quantidade === maximo && maximo > 0 && (
                <text
                  x={x + larguraBarra / 2}
                  y={y - 5}
                  textAnchor="middle"
                  fontSize="11"
                  fontWeight="500"
                  fill="var(--color-ink)"
                >
                  {ponto.quantidade}
                </text>
              )}

              <text
                x={x + larguraBarra / 2}
                y={altura - 8}
                textAnchor="middle"
                fontSize="10"
                fill="var(--color-ink-faint)"
              >
                {rotulo(ponto.mes)}
              </text>
            </g>
          );
        })}
      </svg>

      <figcaption className="sr-only">
        <table>
          <caption>Conclusões de ASO por mês</caption>
          <thead>
            <tr>
              <th scope="col">Mês</th>
              <th scope="col">Concluídos</th>
            </tr>
          </thead>
          <tbody>
            {dados.map((d) => (
              <tr key={d.mes}>
                <td>{rotulo(d.mes)}</td>
                <td>{d.quantidade}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </figcaption>
    </figure>
  );
}
