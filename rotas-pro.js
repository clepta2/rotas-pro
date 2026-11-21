/**
 * rotas-pro.js
 * Motor Soberano de Mapas, Rotas, Geocodificação, Tracking Ao Vivo (Uber/iFood),
 * Logística Rodoviária ANTT com Praças de Pedágio, Otimizador Multi-Paradas (TSP)
 * e Renderizador Vetorial SVG Nativo.
 *
 * 100% Independente de Terceiros (Zero Google Maps, Zero Mapbox, Zero OSRM externo).
 * Integrado nativamente com:
 * - CEPs Pro & Municípios Pro (5.570 cidades IBGE + faixas DNE Correios)
 * - Placas Pro (Consumo Inmetro PBEV, Categoria e Rodízio SP CET)
 * - Cotações Pro ANP (Preços reais de Gasolina, Etanol, Diesel S10 e GNV por UF)
 * - PixValidator Pro (EMV BR Code oficial com CRC16-CCITT e QR Code SVG)
 *
 * @author clepta2 <clepta2@gmail.com>
 * @license MIT
 */

import { GEO_MUNICIPIOS_IBGE, GEO_MUNICIPIOS_NOME } from './municipios_geo.js?v=4.4.0';

// ─── 1. POLOS URBANOS, BAIRROS, AVENIDAS E AEROPORTOS (ALTA PRECISÃO) ───
export const POLOS_URBANOS_BRASIL = {
  // São Paulo - SP
  '01310100': { lat: -23.5614, lng: -46.6558, logradouro: 'Avenida Paulista, 1578', bairro: 'Bela Vista', cidade: 'São Paulo', uf: 'SP', cep: '01310-100' },
  '01310200': { lat: -23.5582, lng: -46.6601, logradouro: 'Avenida Paulista, 2000', bairro: 'Consolação', cidade: 'São Paulo', uf: 'SP', cep: '01310-200' },
  '01001000': { lat: -23.5505, lng: -46.6333, logradouro: 'Praça da Sé', bairro: 'Sé', cidade: 'São Paulo', uf: 'SP', cep: '01001-000' },
  '04538133': { lat: -23.5869, lng: -46.6822, logradouro: 'Avenida Brigadeiro Faria Lima, 3477', bairro: 'Itaim Bibi', cidade: 'São Paulo', uf: 'SP', cep: '04538-133' },
  '04571010': { lat: -23.6025, lng: -46.6939, logradouro: 'Avenida Engenheiro Luís Carlos Berrini, 105', bairro: 'Cidade Monções', cidade: 'São Paulo', uf: 'SP', cep: '04571-010' },
  '04094050': { lat: -23.5874, lng: -46.6576, logradouro: 'Avenida Pedro Álvares Cabral (Parque Ibirapuera)', bairro: 'Vila Mariana', cidade: 'São Paulo', uf: 'SP', cep: '04094-050' },
  '04626911': { lat: -23.6261, lng: -46.6564, logradouro: 'Avenida Washington Luís (Aeroporto de Congonhas)', bairro: 'Vila Congonhas', cidade: 'São Paulo', uf: 'SP', cep: '04626-911' },
  '07190100': { lat: -23.4356, lng: -46.4731, logradouro: 'Rodovia Hélio Smidt (Aeroporto Internacional de Guarulhos)', bairro: 'Cumbica', cidade: 'Guarulhos', uf: 'SP', cep: '07190-100' },
  '05424000': { lat: -23.5672, lng: -46.6935, logradouro: 'Rua dos Pinheiros', bairro: 'Pinheiros', cidade: 'São Paulo', uf: 'SP', cep: '05424-000' },
  '03308000': { lat: -23.5432, lng: -46.5654, logradouro: 'Praça Sílvio Romero', bairro: 'Tatuapé', cidade: 'São Paulo', uf: 'SP', cep: '03308-000' },
  '02011000': { lat: -23.5015, lng: -46.6248, logradouro: 'Rua Voluntários da Pátria', bairro: 'Santana', cidade: 'São Paulo', uf: 'SP', cep: '02011-000' },
  '04717004': { lat: -23.6228, lng: -46.6992, logradouro: 'Avenida Doutor Chucri Zaidan (Morumbi)', bairro: 'Vila Cordeiro', cidade: 'São Paulo', uf: 'SP', cep: '04717-004' },
  // Rio de Janeiro - RJ
  '20040002': { lat: -22.9035, lng: -43.1769, logradouro: 'Avenida Rio Branco, 156', bairro: 'Centro', cidade: 'Rio de Janeiro', uf: 'RJ', cep: '20040-002' },
  '22070002': { lat: -22.9711, lng: -43.1825, logradouro: 'Avenida Atlântica, 1702', bairro: 'Copacabana', cidade: 'Rio de Janeiro', uf: 'RJ', cep: '22070-002' },
  '22410002': { lat: -22.9838, lng: -43.2045, logradouro: 'Rua Visconde de Pirajá, 351', bairro: 'Ipanema', cidade: 'Rio de Janeiro', uf: 'RJ', cep: '22410-002' },
  '22640102': { lat: -23.0003, lng: -43.3658, logradouro: 'Avenida das Américas, 4666 (BarraShopping)', bairro: 'Barra da Tijuca', cidade: 'Rio de Janeiro', uf: 'RJ', cep: '22640-102' },
  '21941900': { lat: -22.8099, lng: -43.2505, logradouro: 'Avenida Vinte de Janeiro (Aeroporto Galeão)', bairro: 'Ilha do Governador', cidade: 'Rio de Janeiro', uf: 'RJ', cep: '21941-900' },
  // Belo Horizonte - MG
  '30130000': { lat: -19.9191, lng: -43.9386, logradouro: 'Praça Sete de Setembro (Av. Afonso Pena)', bairro: 'Centro', cidade: 'Belo Horizonte', uf: 'MG', cep: '30130-000' },
  '30140071': { lat: -19.9322, lng: -43.9352, logradouro: 'Praça da Savassi', bairro: 'Savassi', cidade: 'Belo Horizonte', uf: 'MG', cep: '30140-071' },
  // Curitiba - PR
  '80020310': { lat: -25.4284, lng: -49.2733, logradouro: 'Praça Tiradentes', bairro: 'Centro', cidade: 'Curitiba', uf: 'PR', cep: '80020-310' },
  '80420090': { lat: -25.4418, lng: -49.2882, logradouro: 'Avenida do Batel, 1868', bairro: 'Batel', cidade: 'Curitiba', uf: 'PR', cep: '80420-090' },
  // Porto Alegre - RS
  '90010150': { lat: -30.0277, lng: -51.2287, logradouro: 'Praça Marechal Deodoro', bairro: 'Centro Histórico', cidade: 'Porto Alegre', uf: 'RS', cep: '90010-150' },
  // Brasília - DF
  '70040010': { lat: -15.7942, lng: -47.8825, logradouro: 'Eixo Monumental (Esplanada dos Ministérios)', bairro: 'Zona Cívico-Administrativa', cidade: 'Brasília', uf: 'DF', cep: '70040-010' },
  // Salvador - BA
  '40020000': { lat: -12.9714, lng: -38.5014, logradouro: 'Praça Municipal (Elevador Lacerda)', bairro: 'Centro Histórico', cidade: 'Salvador', uf: 'BA', cep: '40020-000' },
  // Recife - PE
  '50030230': { lat: -8.0631, lng: -34.8711, logradouro: 'Praça Rio Branco (Marco Zero)', bairro: 'Recife Antigo', cidade: 'Recife', uf: 'PE', cep: '50030-230' },
  // Fortaleza - CE
  '60165121': { lat: -3.7265, lng: -38.4962, logradouro: 'Avenida Beira Mar', bairro: 'Meireles', cidade: 'Fortaleza', uf: 'CE', cep: '60165-121' },
  // Campinas - SP
  '13010111': { lat: -22.9056, lng: -47.0608, logradouro: 'Avenida Francisco Glicério', bairro: 'Centro', cidade: 'Campinas', uf: 'SP', cep: '13010-111' },
  // Santos - SP
  '11060001': { lat: -23.9678, lng: -46.3322, logradouro: 'Avenida Presidente Wilson (Orla do Gonzaga)', bairro: 'Gonzaga', cidade: 'Santos', uf: 'SP', cep: '11060-001' }
};

// Apelidos e pontos famosos para resolução textual rápida
export const ALIASES_LOCAIS = {
  'av paulista': POLOS_URBANOS_BRASIL['01310100'],
  'avenida paulista': POLOS_URBANOS_BRASIL['01310100'],
  'paulista': POLOS_URBANOS_BRASIL['01310100'],
  'praca da se': POLOS_URBANOS_BRASIL['01001000'],
  'se sp': POLOS_URBANOS_BRASIL['01001000'],
  'faria lima': POLOS_URBANOS_BRASIL['04538133'],
  'av brigadeiro faria lima': POLOS_URBANOS_BRASIL['04538133'],
  'itaim bibi': POLOS_URBANOS_BRASIL['04538133'],
  'berrini': POLOS_URBANOS_BRASIL['04571010'],
  'av berrini': POLOS_URBANOS_BRASIL['04571010'],
  'ibirapuera': POLOS_URBANOS_BRASIL['04094050'],
  'parque ibirapuera': POLOS_URBANOS_BRASIL['04094050'],
  'congonhas': POLOS_URBANOS_BRASIL['04626911'],
  'aeroporto de congonhas': POLOS_URBANOS_BRASIL['04626911'],
  'cgh': POLOS_URBANOS_BRASIL['04626911'],
  'guarulhos aeroporto': POLOS_URBANOS_BRASIL['07190100'],
  'aeroporto de guarulhos': POLOS_URBANOS_BRASIL['07190100'],
  'gru': POLOS_URBANOS_BRASIL['07190100'],
  'pinheiros': POLOS_URBANOS_BRASIL['05424000'],
  'tatuape': POLOS_URBANOS_BRASIL['03308000'],
  'santana': POLOS_URBANOS_BRASIL['02011000'],
  'morumbi': POLOS_URBANOS_BRASIL['04717004'],
  'copacabana': POLOS_URBANOS_BRASIL['22070002'],
  'ipanema': POLOS_URBANOS_BRASIL['22410002'],
  'barra da tijuca': POLOS_URBANOS_BRASIL['22640102'],
  'aeroporto galeao': POLOS_URBANOS_BRASIL['21941900'],
  'savassi': POLOS_URBANOS_BRASIL['30140071'],
  'batel': POLOS_URBANOS_BRASIL['80420090'],
  'marco zero recife': POLOS_URBANOS_BRASIL['50030230'],
  'esplanada brasilia': POLOS_URBANOS_BRASIL['70040010']
};

// ─── 2. TABELA DE PREÇOS MÉDIOS ANP DE COMBUSTÍVEIS NA BOMBA POR UF (R$/L) ───
export const PRECOS_COMBUSTIVEL_ANP_UF = {
  SP: { gasolina: 5.89, etanol: 3.79, dieselS10: 5.98, gnv: 4.65 },
  RJ: { gasolina: 6.12, etanol: 4.35, dieselS10: 6.15, gnv: 4.59 },
  MG: { gasolina: 5.95, etanol: 4.09, dieselS10: 6.05, gnv: 4.89 },
  PR: { gasolina: 6.08, etanol: 4.19, dieselS10: 5.92, gnv: 4.79 },
  SC: { gasolina: 6.14, etanol: 4.49, dieselS10: 6.02, gnv: 4.85 },
  RS: { gasolina: 6.09, etanol: 4.65, dieselS10: 5.99, gnv: 4.92 },
  BA: { gasolina: 6.24, etanol: 4.42, dieselS10: 6.18, gnv: 4.72 },
  PE: { gasolina: 6.15, etanol: 4.38, dieselS10: 6.12, gnv: 4.68 },
  CE: { gasolina: 6.28, etanol: 4.55, dieselS10: 6.22, gnv: 4.88 },
  DF: { gasolina: 6.05, etanol: 4.15, dieselS10: 6.10, gnv: 4.95 },
  GO: { gasolina: 5.98, etanol: 3.89, dieselS10: 6.04, gnv: 4.85 },
  DEFAULT: { gasolina: 6.05, etanol: 4.15, dieselS10: 6.08, gnv: 4.79 }
};

// ─── 3. PRAÇAS DE PEDÁGIO REAIS NAS PRINCIPAIS RODOVIAS BRASILEIRAS ───
export const PRACAS_PEDAGIO_BRASIL = [
  // Via Dutra (BR-116 SP <-> RJ)
  { id: 'dutra_aruja', nome: 'Pedágio Arujá (BR-116 / Via Dutra km 204)', rodovia: 'BR-116 (Via Dutra)', lat: -23.4050, lng: -46.3320, uf: 'SP', tarifaCarro: 15.20, tarifaMoto: 7.60, tarifaEixoCaminhao: 15.20 },
  { id: 'dutra_jacarei', nome: 'Pedágio Jacareí (BR-116 / Via Dutra km 165)', rodovia: 'BR-116 (Via Dutra)', lat: -23.2850, lng: -45.9520, uf: 'SP', tarifaCarro: 15.20, tarifaMoto: 7.60, tarifaEixoCaminhao: 15.20 },
  { id: 'dutra_moreira_cesar', nome: 'Pedágio Moreira César / Pindamonhangaba (BR-116 km 88)', rodovia: 'BR-116 (Via Dutra)', lat: -22.9220, lng: -45.3610, uf: 'SP', tarifaCarro: 15.20, tarifaMoto: 7.60, tarifaEixoCaminhao: 15.20 },
  { id: 'dutra_itatiaia', nome: 'Pedágio Itatiaia (BR-116 / Via Dutra km 318)', rodovia: 'BR-116 (Via Dutra)', lat: -22.4890, lng: -44.5680, uf: 'RJ', tarifaCarro: 15.20, tarifaMoto: 7.60, tarifaEixoCaminhao: 15.20 },
  { id: 'dutra_viuvinha', nome: 'Pedágio Seropédica / Viúva Graça (BR-116 km 207)', rodovia: 'BR-116 (Via Dutra)', lat: -22.7420, lng: -43.7050, uf: 'RJ', tarifaCarro: 15.20, tarifaMoto: 7.60, tarifaEixoCaminhao: 15.20 },
  // Sistema Bandeirantes / Anhanguera (SP <-> Campinas / Ribeirão Preto)
  { id: 'band_caieiras', nome: 'Pedágio Caieiras (SP-348 Rod. dos Bandeirantes km 36)', rodovia: 'SP-348 (Bandeirantes)', lat: -23.3620, lng: -46.7950, uf: 'SP', tarifaCarro: 12.60, tarifaMoto: 6.30, tarifaEixoCaminhao: 12.60 },
  { id: 'band_itupeva', nome: 'Pedágio Itupeva (SP-348 Rod. dos Bandeirantes km 77)', rodovia: 'SP-348 (Bandeirantes)', lat: -23.0950, lng: -47.0250, uf: 'SP', tarifaCarro: 12.60, tarifaMoto: 6.30, tarifaEixoCaminhao: 12.60 },
  // Sistema Anchieta / Imigrantes (SP <-> Santos / Baixada Santista)
  { id: 'imigrantes_piratininga', nome: 'Pedágio Piratininga / SBC (SP-160 Rod. dos Imigrantes km 32)', rodovia: 'SP-160 (Imigrantes)', lat: -23.8150, lng: -46.5410, uf: 'SP', tarifaCarro: 35.30, tarifaMoto: 17.65, tarifaEixoCaminhao: 35.30 },
  // Fernão Dias (BR-381 SP <-> Belo Horizonte)
  { id: 'fernao_mairipora', nome: 'Pedágio Mairiporã (BR-381 Fernão Dias km 65)', rodovia: 'BR-381 (Fernão Dias)', lat: -23.2680, lng: -46.5820, uf: 'SP', tarifaCarro: 3.00, tarifaMoto: 1.50, tarifaEixoCaminhao: 3.00 },
  { id: 'fernao_vargem', nome: 'Pedágio Vargem (BR-381 Fernão Dias km 7)', rodovia: 'BR-381 (Fernão Dias)', lat: -22.8850, lng: -46.4120, uf: 'SP', tarifaCarro: 3.00, tarifaMoto: 1.50, tarifaEixoCaminhao: 3.00 },
  { id: 'fernao_cambui', nome: 'Pedágio Cambuí (BR-381 Fernão Dias km 899)', rodovia: 'BR-381 (Fernão Dias)', lat: -22.6120, lng: -46.0580, uf: 'MG', tarifaCarro: 3.00, tarifaMoto: 1.50, tarifaEixoCaminhao: 3.00 },
  { id: 'fernao_lavras', nome: 'Pedágio Santo Antônio do Amparo / Lavras (BR-381 km 659)', rodovia: 'BR-381 (Fernão Dias)', lat: -21.0250, lng: -44.9180, uf: 'MG', tarifaCarro: 3.00, tarifaMoto: 1.50, tarifaEixoCaminhao: 3.00 },
  // Régis Bittencourt (BR-116 SP <-> Curitiba)
  { id: 'regis_sao_lourenco', nome: 'Pedágio São Lourenço da Serra (BR-116 Régis Bittencourt km 299)', rodovia: 'BR-116 (Régis Bittencourt)', lat: -23.8620, lng: -46.9450, uf: 'SP', tarifaCarro: 4.10, tarifaMoto: 2.05, tarifaEixoCaminhao: 4.10 },
  { id: 'regis_cajati', nome: 'Pedágio Cajati (BR-116 Régis Bittencourt km 485)', rodovia: 'BR-116 (Régis Bittencourt)', lat: -24.7350, lng: -48.1250, uf: 'SP', tarifaCarro: 4.10, tarifaMoto: 2.05, tarifaEixoCaminhao: 4.10 },
  { id: 'regis_campina_grande', nome: 'Pedágio Campina Grande do Sul (BR-116 km 57)', rodovia: 'BR-116 (Régis Bittencourt)', lat: -25.3020, lng: -49.0510, uf: 'PR', tarifaCarro: 4.10, tarifaMoto: 2.05, tarifaEixoCaminhao: 4.10 },
  // Castello Branco (SP-280 SP <-> Sorocaba / Interior)
  { id: 'castello_barueri', nome: 'Pedágio Barueri (SP-280 Rod. Castello Branco km 20)', rodovia: 'SP-280 (Castello Branco)', lat: -23.5080, lng: -46.8420, uf: 'SP', tarifaCarro: 5.90, tarifaMoto: 2.95, tarifaEixoCaminhao: 5.90 }
];

// ─── 4. FAIXAS POSTAIS POR ESTADO E CAPITAIS (FALLBACK DETERMINÍSTICO) ───
const CAPITAIS_POR_UF = {
  SP: { cidade: 'São Paulo', lat: -23.5505, lng: -46.6333, min: 1000000, max: 19999999 },
  RJ: { cidade: 'Rio de Janeiro', lat: -22.9068, lng: -43.1729, min: 20000000, max: 28999999 },
  ES: { cidade: 'Vitória', lat: -20.3155, lng: -40.3128, min: 29000000, max: 29999999 },
  MG: { cidade: 'Belo Horizonte', lat: -19.9167, lng: -43.9345, min: 30000000, max: 39999999 },
  BA: { cidade: 'Salvador', lat: -12.9714, lng: -38.5014, min: 40000000, max: 48999999 },
  SE: { cidade: 'Aracaju', lat: -10.9472, lng: -37.0731, min: 49000000, max: 49999999 },
  PE: { cidade: 'Recife', lat: -8.0476, lng: -34.8770, min: 50000000, max: 56999999 },
  AL: { cidade: 'Maceió', lat: -9.6658, lng: -35.7350, min: 57000000, max: 57999999 },
  PB: { cidade: 'João Pessoa', lat: -7.1195, lng: -34.8450, min: 58000000, max: 58999999 },
  RN: { cidade: 'Natal', lat: -5.7945, lng: -35.2110, min: 59000000, max: 59999999 },
  CE: { cidade: 'Fortaleza', lat: -3.7172, lng: -38.5433, min: 60000000, max: 63999999 },
  PI: { cidade: 'Teresina', lat: -5.0892, lng: -42.8016, min: 64000000, max: 64999999 },
  MA: { cidade: 'São Luís', lat: -2.5307, lng: -44.3068, min: 65000000, max: 65999999 },
  PA: { cidade: 'Belém', lat: -1.4558, lng: -48.4902, min: 66000000, max: 68899999 },
  AP: { cidade: 'Macapá', lat: 0.0349, lng: -51.0694, min: 68900000, max: 68999999 },
  RR: { cidade: 'Boa Vista', lat: 2.8235, lng: -60.6758, min: 69300000, max: 69399999 },
  AM: { cidade: 'Manaus', lat: -3.1190, lng: -60.0217, min: 69000000, max: 69899999 },
  AC: { cidade: 'Rio Branco', lat: -9.9754, lng: -67.8249, min: 69900000, max: 69999999 },
  DF: { cidade: 'Brasília', lat: -15.7942, lng: -47.8825, min: 70000000, max: 73699999 },
  GO: { cidade: 'Goiânia', lat: -16.6869, lng: -49.2648, min: 73700000, max: 76799999 },
  RO: { cidade: 'Porto Velho', lat: -8.7612, lng: -63.9004, min: 76800000, max: 76999999 },
  TO: { cidade: 'Palmas', lat: -10.1844, lng: -48.3336, min: 77000000, max: 77999999 },
  MT: { cidade: 'Cuiabá', lat: -15.6014, lng: -56.0979, min: 78000000, max: 78899999 },
  MS: { cidade: 'Campo Grande', lat: -20.4697, lng: -54.6201, min: 79000000, max: 79999999 },
  PR: { cidade: 'Curitiba', lat: -25.4284, lng: -49.2733, min: 80000000, max: 87999999 },
  SC: { cidade: 'Florianópolis', lat: -27.5954, lng: -48.5480, min: 88000000, max: 89999999 },
  RS: { cidade: 'Porto Alegre', lat: -30.0346, lng: -51.2177, min: 90000000, max: 99999999 }
};

// Faixas postais regionais (prefixos de 2-3 dígitos dos Correios) para cidades do interior e regiões metropolitanas
const FAIXAS_CEP_INTERIOR = [
  // SP Interior & Litoral
  { min: 6000000, max: 6499999, chave: 'osasco_sp', cidade: 'Osasco', uf: 'SP' },
  { min: 7000000, max: 7399999, chave: 'guarulhos_sp', cidade: 'Guarulhos', uf: 'SP' },
  { min: 9000000, max: 9299999, chave: 'santo andre_sp', cidade: 'Santo André', uf: 'SP' },
  { min: 9600000, max: 9899999, chave: 'sao bernardo do campo_sp', cidade: 'São Bernardo do Campo', uf: 'SP' },
  { min: 11000000, max: 11299999, chave: 'santos_sp', cidade: 'Santos', uf: 'SP' },
  { min: 11300000, max: 11399999, chave: 'sao vicente_sp', cidade: 'São Vicente', uf: 'SP' },
  { min: 11400000, max: 11499999, chave: 'guaruja_sp', cidade: 'Guarujá', uf: 'SP' },
  { min: 11700000, max: 11729999, chave: 'praia grande_sp', cidade: 'Praia Grande', uf: 'SP' },
  { min: 12000000, max: 12199999, chave: 'taubate_sp', cidade: 'Taubaté', uf: 'SP' },
  { min: 12200000, max: 12299999, chave: 'sao jose dos campos_sp', cidade: 'São José dos Campos', uf: 'SP' },
  { min: 12900000, max: 12939999, chave: 'braganca paulista_sp', cidade: 'Bragança Paulista', uf: 'SP' },
  { min: 13000000, max: 13139999, chave: 'campinas_sp', cidade: 'Campinas', uf: 'SP' },
  { min: 13200000, max: 13219999, chave: 'jundiai_sp', cidade: 'Jundiaí', uf: 'SP' },
  { min: 13300000, max: 13319999, chave: 'itu_sp', cidade: 'Itu', uf: 'SP' },
  { min: 13330000, max: 13349999, chave: 'indaiatuba_sp', cidade: 'Indaiatuba', uf: 'SP' },
  { min: 13400000, max: 13439999, chave: 'piracicaba_sp', cidade: 'Piracicaba', uf: 'SP' },
  { min: 13465000, max: 13479999, chave: 'americana_sp', cidade: 'Americana', uf: 'SP' },
  { min: 13480000, max: 13489999, chave: 'limeira_sp', cidade: 'Limeira', uf: 'SP' },
  { min: 13560000, max: 13579999, chave: 'sao carlos_sp', cidade: 'São Carlos', uf: 'SP' },
  { min: 13600000, max: 13609999, chave: 'araras_sp', cidade: 'Araras', uf: 'SP' },
  { min: 13870000, max: 13879999, chave: 'sao joao da boa vista_sp', cidade: 'São João da Boa Vista', uf: 'SP' },
  { min: 14000000, max: 14109999, chave: 'ribeirao preto_sp', cidade: 'Ribeirão Preto', uf: 'SP' },
  { min: 14400000, max: 14419999, chave: 'franca_sp', cidade: 'Franca', uf: 'SP' },
  { min: 14800000, max: 14819999, chave: 'araraquara_sp', cidade: 'Araraquara', uf: 'SP' },
  { min: 15000000, max: 15109999, chave: 'sao jose do rio preto_sp', cidade: 'São José do Rio Preto', uf: 'SP' },
  { min: 16000000, max: 16099999, chave: 'aracatuba_sp', cidade: 'Araçatuba', uf: 'SP' },
  { min: 17000000, max: 17109999, chave: 'bauru_sp', cidade: 'Bauru', uf: 'SP' },
  { min: 17500000, max: 17539999, chave: 'marilia_sp', cidade: 'Marília', uf: 'SP' },
  { min: 18000000, max: 18109999, chave: 'sorocaba_sp', cidade: 'Sorocaba', uf: 'SP' },
  { min: 19000000, max: 19069999, chave: 'presidente prudente_sp', cidade: 'Presidente Prudente', uf: 'SP' },
  // RJ Interior
  { min: 24000000, max: 24399999, chave: 'niteroi_rj', cidade: 'Niterói', uf: 'RJ' },
  { min: 24400000, max: 24799999, chave: 'sao goncalo_rj', cidade: 'São Gonçalo', uf: 'RJ' },
  { min: 25000000, max: 25299999, chave: 'duque de caxias_rj', cidade: 'Duque de Caxias', uf: 'RJ' },
  { min: 25600000, max: 25799999, chave: 'petropolis_rj', cidade: 'Petrópolis', uf: 'RJ' },
  { min: 27200000, max: 27299999, chave: 'volta redonda_rj', cidade: 'Volta Redonda', uf: 'RJ' },
  { min: 28000000, max: 28199999, chave: 'campos dos goytacazes_rj', cidade: 'Campos dos Goytacazes', uf: 'RJ' },
  { min: 28900000, max: 28949999, chave: 'cabo frio_rj', cidade: 'Cabo Frio', uf: 'RJ' },
  // ES Interior
  { min: 29100000, max: 29129999, chave: 'vila velha_es', cidade: 'Vila Velha', uf: 'ES' },
  { min: 29160000, max: 29184999, chave: 'serra_es', cidade: 'Serra', uf: 'ES' },
  // MG Interior
  { min: 32000000, max: 32399999, chave: 'contagem_mg', cidade: 'Contagem', uf: 'MG' },
  { min: 32500000, max: 32699999, chave: 'betim_mg', cidade: 'Betim', uf: 'MG' },
  { min: 35000000, max: 35099999, chave: 'governador valadares_mg', cidade: 'Governador Valadares', uf: 'MG' },
  { min: 35160000, max: 35169999, chave: 'ipatinga_mg', cidade: 'Ipatinga', uf: 'MG' },
  { min: 35500000, max: 35509999, chave: 'divinopolis_mg', cidade: 'Divinópolis', uf: 'MG' },
  { min: 36000000, max: 36109999, chave: 'juiz de fora_mg', cidade: 'Juiz de Fora', uf: 'MG' },
  { min: 37000000, max: 37099999, chave: 'varginha_mg', cidade: 'Varginha', uf: 'MG' },
  { min: 37700000, max: 37719999, chave: 'pocos de caldas_mg', cidade: 'Poços de Caldas', uf: 'MG' },
  { min: 38000000, max: 38099999, chave: 'uberaba_mg', cidade: 'Uberaba', uf: 'MG' },
  { min: 38400000, max: 38439999, chave: 'uberlandia_mg', cidade: 'Uberlândia', uf: 'MG' },
  { min: 39400000, max: 39409999, chave: 'montes claros_mg', cidade: 'Montes Claros', uf: 'MG' },
  // BA / NE Interior
  { min: 44000000, max: 44149999, chave: 'feira de santana_ba', cidade: 'Feira de Santana', uf: 'BA' },
  { min: 45000000, max: 45099999, chave: 'vitoria da conquista_ba', cidade: 'Vitória da Conquista', uf: 'BA' },
  { min: 45600000, max: 45619999, chave: 'itabuna_ba', cidade: 'Itabuna', uf: 'BA' },
  { min: 45650000, max: 45669999, chave: 'ilheus_ba', cidade: 'Ilhéus', uf: 'BA' },
  { min: 55000000, max: 55049999, chave: 'caruaru_pe', cidade: 'Caruaru', uf: 'PE' },
  { min: 56300000, max: 56339999, chave: 'petrolina_pe', cidade: 'Petrolina', uf: 'PE' },
  { min: 58400000, max: 58449999, chave: 'campina grande_pb', cidade: 'Campina Grande', uf: 'PB' },
  { min: 59600000, max: 59649999, chave: 'mossoro_rn', cidade: 'Mossoró', uf: 'RN' },
  { min: 63000000, max: 63049999, chave: 'juazeiro do norte_ce', cidade: 'Juazeiro do Norte', uf: 'CE' },
  { min: 65900000, max: 65929999, chave: 'imperatriz_ma', cidade: 'Imperatriz', uf: 'MA' },
  // N / CO Interior
  { min: 68000000, max: 68049999, chave: 'santarem_pa', cidade: 'Santarém', uf: 'PA' },
  { min: 68500000, max: 68514999, chave: 'maraba_pa', cidade: 'Marabá', uf: 'PA' },
  { min: 75000000, max: 75159999, chave: 'anapolis_go', cidade: 'Anápolis', uf: 'GO' },
  { min: 75900000, max: 75919999, chave: 'rio verde_go', cidade: 'Rio Verde', uf: 'GO' },
  { min: 78550000, max: 78559999, chave: 'sinop_mt', cidade: 'Sinop', uf: 'MT' },
  { min: 78700000, max: 78749999, chave: 'rondonopolis_mt', cidade: 'Rondonópolis', uf: 'MT' },
  { min: 79800000, max: 79849999, chave: 'dourados_ms', cidade: 'Dourados', uf: 'MS' },
  // Sul Interior
  { min: 83000000, max: 83099999, chave: 'sao jose dos pinhais_pr', cidade: 'São José dos Pinhais', uf: 'PR' },
  { min: 84000000, max: 84099999, chave: 'ponta grossa_pr', cidade: 'Ponta Grossa', uf: 'PR' },
  { min: 85800000, max: 85819999, chave: 'cascavel_pr', cidade: 'Cascavel', uf: 'PR' },
  { min: 85850000, max: 85879999, chave: 'foz do iguacu_pr', cidade: 'Foz do Iguaçu', uf: 'PR' },
  { min: 86000000, max: 86099999, chave: 'londrina_pr', cidade: 'Londrina', uf: 'PR' },
  { min: 87000000, max: 87099999, chave: 'maringa_pr', cidade: 'Maringá', uf: 'PR' },
  { min: 88300000, max: 88319999, chave: 'itajai_sc', cidade: 'Itajaí', uf: 'SC' },
  { min: 88330000, max: 88339999, chave: 'balneario camboriu_sc', cidade: 'Balneário Camboriú', uf: 'SC' },
  { min: 88800000, max: 88819999, chave: 'criciuma_sc', cidade: 'Criciúma', uf: 'SC' },
  { min: 89000000, max: 89079999, chave: 'blumenau_sc', cidade: 'Blumenau', uf: 'SC' },
  { min: 89200000, max: 89239999, chave: 'joinville_sc', cidade: 'Joinville', uf: 'SC' },
  { min: 89800000, max: 89819999, chave: 'chapeco_sc', cidade: 'Chapecó', uf: 'SC' },
  { min: 92000000, max: 92499999, chave: 'canoas_rs', cidade: 'Canoas', uf: 'RS' },
  { min: 93300000, max: 93599999, chave: 'novo hamburgo_rs', cidade: 'Novo Hamburgo', uf: 'RS' },
  { min: 95000000, max: 95139999, chave: 'caxias do sul_rs', cidade: 'Caxias do Sul', uf: 'RS' },
  { min: 96000000, max: 96099999, chave: 'pelotas_rs', cidade: 'Pelotas', uf: 'RS' },
  { min: 97000000, max: 97119999, chave: 'santa maria_rs', cidade: 'Santa Maria', uf: 'RS' },
  { min: 99000000, max: 99099999, chave: 'passo fundo_rs', cidade: 'Passo Fundo', uf: 'RS' }
];

// ─── 5. UTILITÁRIOS MATEMÁTICOS E GEODÉSICOS (ZERO REGEX PESADO) ───

function normalizarTextoSemAcento(str) {
  if (!str) return '';
  return String(str)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function extrairApenasDigitos(str) {
  if (!str) return '';
  let out = '';
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    if (code >= 48 && code <= 57) out += s[i];
  }
  return out;
}

/**
 * Calcula a distância geodésica em linha reta (Haversine) em quilômetros.
 */
export function calcularDistanciaHaversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371.0088; // Raio médio da Terra em km
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Calcula o azimute / direção da bússola (bearing de 0° a 360°) entre dois pontos GPS.
 */
export function calcularBearingGraus(lat1, lng1, lat2, lng2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const toDeg = (rad) => (rad * 180) / Math.PI;
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const dLambda = toRad(lng2 - lng1);

  const y = Math.sin(dLambda) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda);
  const theta = Math.atan2(y, x);
  return Math.round((toDeg(theta) + 360) % 360);
}

export function obterRosaDosVentos(graus) {
  const dirs = ['Norte (N)', 'Nordeste (NE)', 'Leste (L)', 'Sudeste (SE)', 'Sul (S)', 'Sudoeste (SO)', 'Oeste (O)', 'Noroeste (NO)'];
  return dirs[Math.round(graus / 45) % 8];
}

// ─── 6. MOTOR SOBERANO DE GEOCODIFICAÇÃO DIRETA E REVERSA ───

/**
 * Resolve qualquer entrada (Coordenadas "lat,lng", CEP "01310-100", Código IBGE ou "Cidade - UF" / Endereço)
 * em um objeto georreferenciado completo 100% offline.
 */
export function geocodificarLocal(entrada) {
  if (!entrada) {
    return { valido: false, erro: 'ENTRADA_VAZIA', mensagem: 'Informe um CEP, coordenada GPS ou nome de localidade.' };
  }

  // Caso já seja um objeto { lat, lng }
  if (typeof entrada === 'object' && entrada.lat !== undefined && entrada.lng !== undefined) {
    const rev = geocodificarReverso(Number(entrada.lat), Number(entrada.lng));
    return {
      valido: true,
      tipoResolvido: 'coordenadas_diretas',
      lat: Number(entrada.lat),
      lng: Number(entrada.lng),
      rotulo: entrada.nome || entrada.rotulo || rev.enderecoFormatado,
      logradouro: entrada.logradouro || rev.logradouroSugerido,
      bairro: entrada.bairro || rev.bairroSugerido,
      cidade: entrada.cidade || rev.municipio,
      uf: entrada.uf || rev.uf,
      cep: entrada.cep || rev.cepEstimado,
      codigoIbge: rev.codigoIbge
    };
  }

  const raw = String(entrada).trim();

  // 1. Verificar se é par de coordenadas "lat,lng" (ex: "-23.5614,-46.6558")
  if (raw.includes(',')) {
    const partes = raw.split(',');
    if (partes.length === 2) {
      const pLat = parseFloat(partes[0].trim());
      const pLng = parseFloat(partes[1].trim());
      if (!isNaN(pLat) && !isNaN(pLng) && pLat >= -90 && pLat <= 90 && pLng >= -180 && pLng <= 180) {
        const rev = geocodificarReverso(pLat, pLng);
        return {
          valido: true,
          tipoResolvido: 'coordenadas_gps',
          lat: pLat,
          lng: pLng,
          rotulo: rev.enderecoFormatado,
          logradouro: rev.logradouroSugerido,
          bairro: rev.bairroSugerido,
          cidade: rev.municipio,
          uf: rev.uf,
          cep: rev.cepEstimado,
          codigoIbge: rev.codigoIbge
        };
      }
    }
  }

  // 2. Verificar se é CEP (8 dígitos) ou Código IBGE (7 dígitos)
  const digitos = extrairApenasDigitos(raw);
  if (digitos.length === 8) {
    if (POLOS_URBANOS_BRASIL[digitos]) {
      const p = POLOS_URBANOS_BRASIL[digitos];
      return {
        valido: true,
        tipoResolvido: 'cep_exato',
        lat: p.lat,
        lng: p.lng,
        rotulo: `${p.logradouro} — ${p.bairro}, ${p.cidade}/${p.uf}`,
        logradouro: p.logradouro,
        bairro: p.bairro,
        cidade: p.cidade,
        uf: p.uf,
        cep: p.cep,
        codigoIbge: '3550308'
      };
    }

    // Interpolação determinística por faixa de CEP (prioriza cidades do interior/RM antes da capital da UF)
    const numCep = parseInt(digitos, 10);
    let ufEncontrada = 'SP';
    let infoCap = CAPITAIS_POR_UF.SP;
    let codigoIbgeCep = '3550308';
    for (const [ufKey, cap] of Object.entries(CAPITAIS_POR_UF)) {
      if (numCep >= cap.min && numCep <= cap.max) {
        ufEncontrada = ufKey;
        infoCap = cap;
        break;
      }
    }
    for (const fx of FAIXAS_CEP_INTERIOR) {
      if (numCep >= fx.min && numCep <= fx.max && GEO_MUNICIPIOS_NOME[fx.chave]) {
        const [mLat, mLng, , mIbge] = GEO_MUNICIPIOS_NOME[fx.chave];
        ufEncontrada = fx.uf;
        infoCap = { cidade: fx.cidade, lat: mLat, lng: mLng };
        codigoIbgeCep = mIbge;
        break;
      }
    }

    // Deslocamento determinístico suave dentro da malha urbana baseado nos dígitos do setor postal
    const setor = (numCep % 100000) / 100000;
    const subsetor = (numCep % 1000) / 1000;
    const dLat = (setor - 0.5) * 0.06;
    const dLng = (subsetor - 0.5) * 0.06;
    const latFinal = Number((infoCap.lat + dLat).toFixed(6));
    const lngFinal = Number((infoCap.lng + dLng).toFixed(6));
    const cepFmt = `${digitos.slice(0, 5)}-${digitos.slice(5)}`;

    return {
      valido: true,
      tipoResolvido: 'cep_faixa_postal',
      lat: latFinal,
      lng: lngFinal,
      rotulo: `CEP ${cepFmt} — ${infoCap.cidade}/${ufEncontrada}`,
      logradouro: `Setor Postal ${cepFmt}`,
      bairro: 'Zona Urbana',
      cidade: infoCap.cidade,
      uf: ufEncontrada,
      cep: cepFmt,
      codigoIbge: codigoIbgeCep
    };
  }

  if (digitos.length === 7 && GEO_MUNICIPIOS_IBGE[digitos]) {
    const [lat, lng, ddd, ibge] = GEO_MUNICIPIOS_IBGE[digitos];
    const rev = geocodificarReverso(lat, lng);
    return {
      valido: true,
      tipoResolvido: 'codigo_ibge',
      lat,
      lng,
      rotulo: `${rev.municipio}/${rev.uf} (IBGE ${ibge})`,
      logradouro: 'Centro Urbano',
      bairro: 'Centro',
      cidade: rev.municipio,
      uf: rev.uf,
      cep: rev.cepEstimado,
      ddd,
      codigoIbge: ibge
    };
  }

  // 3. Verificar apelidos exatos de pontos famosos (Av. Paulista, Congonhas, Faria Lima, etc.)
  const norm = normalizarTextoSemAcento(raw);
  if (ALIASES_LOCAIS[norm]) {
    const p = ALIASES_LOCAIS[norm];
    return {
      valido: true,
      tipoResolvido: 'ponto_notavel_urbano',
      lat: p.lat,
      lng: p.lng,
      rotulo: `${p.logradouro} — ${p.bairro}, ${p.cidade}/${p.uf}`,
      logradouro: p.logradouro,
      bairro: p.bairro,
      cidade: p.cidade,
      uf: p.uf,
      cep: p.cep,
      codigoIbge: '3550308'
    };
  }

  // 4. Resolver nos 5.570 municípios do IBGE ANTES de substring de apelidos (evita "Feira de Santana-BA" -> "Santana SP")
  const chaveDireta = norm.replace(/[\s\-\/]+([a-z]{2})$/, '_$1');
  if (GEO_MUNICIPIOS_NOME[chaveDireta]) {
    const [lat, lng, ddd, ibge] = GEO_MUNICIPIOS_NOME[chaveDireta];
    const partes = chaveDireta.split('_');
    const uf = partes[1].toUpperCase();
    const nomeCidade = raw.split(/[\-\/,]/)[0].trim();
    return {
      valido: true,
      tipoResolvido: 'municipio_ibge',
      lat,
      lng,
      rotulo: `${nomeCidade} / ${uf}`,
      logradouro: `Centro de ${nomeCidade}`,
      bairro: 'Centro',
      cidade: nomeCidade,
      uf,
      cep: CAPITAIS_POR_UF[uf] ? `${String(CAPITAIS_POR_UF[uf].min).padStart(8, '0').slice(0, 5)}-000` : '01000-000',
      ddd,
      codigoIbge: ibge
    };
  }

  for (const [aliasKey, p] of Object.entries(ALIASES_LOCAIS)) {
    if (norm.includes(aliasKey)) {
      return {
        valido: true,
        tipoResolvido: 'ponto_notavel_urbano',
        lat: p.lat,
        lng: p.lng,
        rotulo: `${p.logradouro} — ${p.bairro}, ${p.cidade}/${p.uf}`,
        logradouro: p.logradouro,
        bairro: p.bairro,
        cidade: p.cidade,
        uf: p.uf,
        cep: p.cep,
        codigoIbge: '3550308'
      };
    }
  }

  // Busca por prefixo do nome da cidade
  const prefixoBusca = norm.split(/[\-\/,]/)[0].trim() + '_';
  for (const [k, val] of Object.entries(GEO_MUNICIPIOS_NOME)) {
    if (k.startsWith(prefixoBusca)) {
      const [lat, lng, ddd, ibge] = val;
      const uf = k.split('_')[1].toUpperCase();
      const cidFormatada = k.split('_')[0].replace(/\b\w/g, (l) => l.toUpperCase());
      return {
        valido: true,
        tipoResolvido: 'municipio_ibge',
        lat,
        lng,
        rotulo: `${cidFormatada} / ${uf}`,
        logradouro: `Centro de ${cidFormatada}`,
        bairro: 'Centro',
        cidade: cidFormatada,
        uf,
        cep: '01000-000',
        ddd,
        codigoIbge: ibge
      };
    }
  }

  return {
    valido: false,
    erro: 'LOCAL_NAO_ENCONTRADO',
    mensagem: `Não foi possível geocodificar "${raw}". Informe um CEP válido, coordenada (lat,lng) ou Cidade/UF.`
  };
}

/**
 * Geocodificação Reversa Soberana: recebe (lat, lng) e encontra o ponto urbano ou município IBGE mais próximo.
 */
export function geocodificarReverso(lat, lng) {
  const nLat = parseFloat(lat);
  const nLng = parseFloat(lng);

  if (isNaN(nLat) || isNaN(nLng)) {
    return { valido: false, erro: 'COORDENADAS_INVALIDAS', mensagem: 'Latitude e Longitude numéricas são obrigatórias.' };
  }

  // 1. Verificar proximidade imediata com nossos Polos Urbanos (< 3 km)
  let poloMaisProximo = null;
  let menorDistPolo = Infinity;
  for (const p of Object.values(POLOS_URBANOS_BRASIL)) {
    const d = calcularDistanciaHaversineKm(nLat, nLng, p.lat, p.lng);
    if (d < menorDistPolo) {
      menorDistPolo = d;
      poloMaisProximo = p;
    }
  }

  if (poloMaisProximo && menorDistPolo <= 2.8) {
    return {
      valido: true,
      precisao: 'alta_logradouro_urbano',
      latitude: nLat,
      longitude: nLng,
      distanciaCentroReferenciaKm: Number(menorDistPolo.toFixed(3)),
      logradouroSugerido: poloMaisProximo.logradouro,
      bairroSugerido: poloMaisProximo.bairro,
      municipio: poloMaisProximo.cidade,
      uf: poloMaisProximo.uf,
      cepEstimado: poloMaisProximo.cep,
      codigoIbge: '3550308',
      enderecoFormatado: `${poloMaisProximo.logradouro}, ${poloMaisProximo.bairro} — ${poloMaisProximo.cidade}/${poloMaisProximo.uf} (${poloMaisProximo.cep})`
    };
  }

  // 2. Busca exaustiva ultrarrápida nos 5.570 municípios do IBGE em memória
  let melhorChave = 'sao paulo_sp';
  let melhorVal = GEO_MUNICIPIOS_NOME['sao paulo_sp'] || [-23.5505, -46.6333, '11', '3550308'];
  let menorDist = Infinity;

  for (const [k, val] of Object.entries(GEO_MUNICIPIOS_NOME)) {
    const dLat = nLat - val[0];
    const dLng = nLng - val[1];
    const distQuad = dLat * dLat + dLng * dLng;
    if (distQuad < menorDist) {
      menorDist = distQuad;
      melhorChave = k;
      melhorVal = val;
    }
  }

  const distKm = calcularDistanciaHaversineKm(nLat, nLng, melhorVal[0], melhorVal[1]);
  const partes = melhorChave.split('_');
  const uf = (partes[1] || 'SP').toUpperCase();
  const municipioNome = partes[0].replace(/\b\w/g, (c) => c.toUpperCase());
  const capInfo = CAPITAIS_POR_UF[uf] || CAPITAIS_POR_UF.SP;
  const cepBase = String(capInfo.min).padStart(8, '0');
  const cepEstimado = `${cepBase.slice(0, 5)}-${cepBase.slice(5)}`;

  return {
    valido: true,
    precisao: 'municipio_ibge_proximo',
    latitude: nLat,
    longitude: nLng,
    distanciaCentroReferenciaKm: Number(distKm.toFixed(2)),
    logradouroSugerido: distKm < 5 ? `Área Central de ${municipioNome}` : `Perímetro Rodoviário / Urbano de ${municipioNome}`,
    bairroSugerido: distKm < 3 ? 'Centro' : 'Zona Metropolitana',
    municipio: municipioNome,
    uf,
    ddd: melhorVal[2],
    codigoIbge: melhorVal[3],
    cepEstimado,
    enderecoFormatado: `${municipioNome} / ${uf} — DDD (${melhorVal[2]}) • IBGE ${melhorVal[3]}`
  };
}

// ─── 7. INTEGRAÇÃO NATIVA COM PIXVALIDATOR PRO (EMV BR CODE + CRC16) ───

function calcularCrc16Ccitt(payload) {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

function montarCampoEmv(id, valor) {
  const str = String(valor || '');
  const tam = String(str.length).padStart(2, '0');
  return `${id}${tam}${str}`;
}

export function gerarCobrancaPixCorrida(valorReais, txid = 'ROTASPRO2026', chavePix = 'pagamentos@ozpro.com.br') {
  const valorFmt = Number(valorReais || 0).toFixed(2);
  const gui = montarCampoEmv('00', 'br.gov.bcb.pix');
  const key = montarCampoEmv('01', chavePix);
  const merchantAccount = montarCampoEmv('26', gui + key);
  const txidClean = String(txid).replace(/[^a-zA-Z0-9]/g, '').slice(0, 25) || 'ROTASPRO';
  const additionalData = montarCampoEmv('62', montarCampoEmv('05', txidClean));

  const payloadSemCrc =
    '000201' +
    merchantAccount +
    '52040000' +
    '5303986' +
    montarCampoEmv('54', valorFmt) +
    '5802BR' +
    montarCampoEmv('59', 'PONTE ROTAS PRO') +
    montarCampoEmv('60', 'SAO PAULO') +
    additionalData +
    '6304';

  const crc = calcularCrc16Ccitt(payloadSemCrc);
  const copiaECola = payloadSemCrc + crc;

  return {
    valorFormatado: `R$ ${valorFmt.replace('.', ',')}`,
    valorNumerico: Number(valorFmt),
    chaveRecebedor: chavePix,
    txid: txidClean,
    crc16: crc,
    pixCopiaECola: copiaECola,
    qrCodeSvgEndpoint: `https://pixvalidator-pro-api.pixvalidator.workers.dev/api/pix/qrcode?chave=${encodeURIComponent(chavePix)}&valor=${valorFmt}&nome=PONTE+ROTAS&cidade=SAO+PAULO&txid=${txidClean}`
  };
}

// ─── 8. INTEGRAÇÃO COM PLACAS PRO (INTELIGÊNCIA VEICULAR & RODÍZIO SP) ───

const DADOS_PLACAS_EXEMPLO = {
  BRA2E19: { modelo: 'Toyota Corolla Altis Hybrid 1.8', categoria: 'sedan_hibrido', alturaVeiculoM: 1.45, larguraM: 1.78, pbtToneladas: 1.8, eixos: 2, consumoGasolinaKmL: 16.5, consumoEtanolKmL: 11.4, finalPlaca: '9' },
  EZK5520: { modelo: 'Volkswagen Golf GTI 2.0 TSI', categoria: 'hatch_esportivo', alturaVeiculoM: 1.44, larguraM: 1.80, pbtToneladas: 1.4, eixos: 2, consumoGasolinaKmL: 11.2, consumoEtanolKmL: 7.9, finalPlaca: '0' },
  ABC12C4: { modelo: 'Honda CB 500X ABS', categoria: 'motocicleta', alturaVeiculoM: 1.35, larguraM: 0.83, pbtToneladas: 0.3, eixos: 2, consumoGasolinaKmL: 29.5, consumoEtanolKmL: 21.0, finalPlaca: '4' },
  RIO2016: { modelo: 'Hyundai HB20 1.0 Turbo Flex', categoria: 'hatch_compacto', alturaVeiculoM: 1.47, larguraM: 1.72, pbtToneladas: 1.3, eixos: 2, consumoGasolinaKmL: 13.8, consumoEtanolKmL: 9.6, finalPlaca: '6' },
  // Caminhões de Logística & Carga Pesada (com alturas regulamentares CONTRAN para pontes)
  CAM2026: { modelo: 'Scania R450 6x2 Highline Baú', categoria: 'caminhao_pesado', alturaVeiculoM: 4.40, larguraM: 2.60, pbtToneladas: 45.0, eixos: 6, consumoDieselKmL: 3.2, finalPlaca: '6' },
  TRK1E22: { modelo: 'Mercedes-Benz Actros 2548 Truck', categoria: 'caminhao_pesado', alturaVeiculoM: 4.20, larguraM: 2.60, pbtToneladas: 29.0, eixos: 4, consumoDieselKmL: 3.6, finalPlaca: '2' },
  VUC3456: { modelo: 'Hyundai HR 2.5 Turbo VUC Urbano', categoria: 'caminhao_urbano_vuc', alturaVeiculoM: 2.80, larguraM: 2.10, pbtToneladas: 3.5, eixos: 2, consumoDieselKmL: 8.5, finalPlaca: '6' }
};

export function diagnosticarPlacaNaRota(placaInput) {
  if (!placaInput) return null;
  const limpa = String(placaInput).replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  if (limpa.length !== 7) {
    return { placaValida: false, placaInformada: placaInput, mensagem: 'Placa fora do padrão de 7 caracteres CONTRAN.' };
  }

  const ultimoDigito = limpa[6];
  const ehCaminhaoPlaca = limpa.startsWith('CAM') || limpa.startsWith('TRK') || limpa.startsWith('VUC');
  const preset = DADOS_PLACAS_EXEMPLO[limpa] || {
    modelo: ehCaminhaoPlaca ? 'Caminhão de Carga Pesada' : (limpa[4] >= 'A' && limpa[4] <= 'Z' ? 'Veículo Padrão Mercosul Flex' : 'Veículo Padrão Nacional Flex'),
    categoria: ehCaminhaoPlaca ? 'caminhao_pesado' : 'automovel_flex',
    alturaVeiculoM: ehCaminhaoPlaca ? 4.40 : 1.50,
    larguraM: ehCaminhaoPlaca ? 2.60 : 1.78,
    pbtToneladas: ehCaminhaoPlaca ? 42.0 : 1.5,
    eixos: ehCaminhaoPlaca ? 6 : 2,
    consumoGasolinaKmL: 13.2,
    consumoEtanolKmL: 9.3,
    consumoDieselKmL: ehCaminhaoPlaca ? 3.4 : 14.0,
    finalPlaca: ultimoDigito
  };

  let diaRodizio = 'Sexta-feira';
  if (ultimoDigito === '1' || ultimoDigito === '2') diaRodizio = 'Segunda-feira';
  else if (ultimoDigito === '3' || ultimoDigito === '4') diaRodizio = 'Terça-feira';
  else if (ultimoDigito === '5' || ultimoDigito === '6') diaRodizio = 'Quarta-feira';
  else if (ultimoDigito === '7' || ultimoDigito === '8') diaRodizio = 'Quinta-feira';

  return {
    placaValida: true,
    placaNormalizada: limpa,
    veiculoIdentificado: preset.modelo,
    categoria: preset.categoria,
    especificacoesFisicas: {
      alturaTotalMetros: preset.alturaVeiculoM || 1.50,
      larguraMetros: preset.larguraM || 1.80,
      pbtToneladas: preset.pbtToneladas || 1.5,
      quantidadeEixos: preset.eixos || 2,
      ehVeiculoPesado: preset.categoria.includes('caminhao')
    },
    consumoHomologadoInmetro: {
      gasolinaKmL: preset.consumoGasolinaKmL,
      etanolKmL: preset.consumoEtanolKmL,
      dieselKmL: preset.consumoDieselKmL || 13.5
    },
    rodizioSpCet: {
      finalPlaca: ultimoDigito,
      diaRestricao: diaRodizio,
      janelasRestricao: '07h00 às 10h00 e das 17h00 às 20h00',
      alertaCentroExpandido: `Atenção nas ${diaRodizio}s dentro do Minianel Viário de SP`
    }
  };
}

// ─── 8.5 CATÁLOGO SOBERANO DE PONTES, VIADUTOS E GABARITOS DE ALTURA LIVRE ───

export const PONTES_VIADUTOS_BRASIL = [
  {
    id: 'ponte_estaiada_sp',
    nome: 'Ponte Octávio Frias de Oliveira (Ponte Estaiada)',
    tipo: 'ponte_estaiada',
    via: 'Complexo Real Parque / Marginal Pinheiros',
    cidade: 'São Paulo',
    uf: 'SP',
    coordenadas: { lat: -23.6128, lng: -46.6990 },
    comprimentoM: 1380,
    alturaLivreM: 5.50, // Gabarito sob a ponte
    vaoPrincipalM: 144,
    permiteCaminhaoPesado: true
  },
  {
    id: 'complexo_ayrton_senna_sp',
    nome: 'Complexo Viário Ayrton Senna (Túnel sob o Ibirapuera)',
    tipo: 'tunel_urbano',
    via: 'Av. 23 de Maio ↔ Av. Rubem Berta',
    cidade: 'São Paulo',
    uf: 'SP',
    coordenadas: { lat: -23.5875, lng: -46.6515 },
    comprimentoM: 1950,
    alturaLivreM: 4.20, // Altura máxima permitida pela CET (Caminhões > 4.20m proibidos)
    vaoPrincipalM: 16,
    permiteCaminhaoPesado: false
  },
  {
    id: 'viaduto_antartica_sp',
    nome: 'Viaduto Antártica (Complexo Água Branca)',
    tipo: 'viaduto',
    via: 'Av. Antártica ↔ Av. Francisco Matarazzo',
    cidade: 'São Paulo',
    uf: 'SP',
    coordenadas: { lat: -23.5240, lng: -46.6780 },
    comprimentoM: 340,
    alturaLivreM: 4.10, // Restrição crítica de altura (ponto clássico de enrosco de caminhão baú alto)
    vaoPrincipalM: 28,
    permiteCaminhaoPesado: false
  },
  {
    id: 'viaduto_brigadeiro_23maio_sp',
    nome: 'Viaduto Brigadeiro Luís Antônio',
    tipo: 'viaduto',
    via: 'Av. Brigadeiro cruzando sobre a Av. 23 de Maio',
    cidade: 'São Paulo',
    uf: 'SP',
    coordenadas: { lat: -23.5585, lng: -46.6430 },
    comprimentoM: 180,
    alturaLivreM: 4.45,
    vaoPrincipalM: 32,
    permiteCaminhaoPesado: true
  },
  {
    id: 'viaduto_reboucas_eusebio_sp',
    nome: 'Viaduto Rebouças (Complexo Eusébio Matoso)',
    tipo: 'viaduto',
    via: 'Av. Rebouças ↔ Ponte Eusébio Matoso',
    cidade: 'São Paulo',
    uf: 'SP',
    coordenadas: { lat: -23.5725, lng: -46.6850 },
    comprimentoM: 420,
    alturaLivreM: 4.80,
    vaoPrincipalM: 38,
    permiteCaminhaoPesado: true
  },
  {
    id: 'ponte_rio_niteroi',
    nome: 'Ponte Presidente Costa e Silva (Ponte Rio-Niterói)',
    tipo: 'ponte_maritima',
    via: 'Rodovia BR-101',
    cidade: 'Rio de Janeiro',
    uf: 'RJ',
    coordenadas: { lat: -22.8680, lng: -43.1550 },
    comprimentoM: 13290,
    alturaLivreM: 72.0,
    vaoPrincipalM: 300,
    permiteCaminhaoPesado: true
  },
  {
    id: 'ponte_jk_brasilia',
    nome: 'Ponte Juscelino Kubitschek (Ponte JK)',
    tipo: 'ponte_em_arco',
    via: 'Lago Paranoá / Eixo Monumental Leste',
    cidade: 'Brasília',
    uf: 'DF',
    coordenadas: { lat: -15.8239, lng: -47.8294 },
    comprimentoM: 1200,
    alturaLivreM: 18.0,
    vaoPrincipalM: 240,
    permiteCaminhaoPesado: true
  }
];

/**
 * Detecta e avalia pontes, viadutos e túneis no trajeto,
 * calculando se o veículo passa por cima ou por baixo e se o caminhão
 * atende ao gabarito vertical de altura regulamentar CONTRAN.
 */
export function detectarPontesViadutosNaRota(waypoints, alturaVeiculoM = 1.50) {
  if (!Array.isArray(waypoints) || waypoints.length < 2) {
    return { totalPontes: 0, pontesNaRota: [], alertaGabarito: false, mensagemGabarito: 'Sem pontes no trajeto.' };
  }

  const pontesEncontradas = [];
  const jaVistos = new Set();
  let alturaRestritaDetectada = false;
  let ponteMaisBaixaM = Infinity;
  let ponteCritica = null;

  for (const ponte of PONTES_VIADUTOS_BRASIL) {
    for (let i = 0; i < waypoints.length; i++) {
      const wp = waypoints[i];
      const dKm = calcularDistanciaHaversineKm(wp.lat, wp.lng, ponte.coordenadas.lat, ponte.coordenadas.lng);
      // Se a rota cruza o perímetro da ponte/viaduto (raio de 380m)
      if (dKm <= 0.38 && !jaVistos.has(ponte.id)) {
        jaVistos.add(ponte.id);

        // Determina se a rota passa por cima ou por baixo da ponte
        const ehViaElevada = ponte.tipo === 'ponte_estaiada' || ponte.tipo === 'ponte_maritima' || ponte.tipo === 'ponte_em_arco';
        const nivelRota = ehViaElevada ? 'ponte' : (ponte.tipo === 'tunel_urbano' ? 'tunel_subterraneo' : 'sob_ponte');

        const aprovadoGabarito = nivelRota === 'ponte' || (alturaVeiculoM <= ponte.alturaLivreM);
        const folgaCm = Math.round((ponte.alturaLivreM - alturaVeiculoM) * 100);

        if (!aprovadoGabarito) {
          alturaRestritaDetectada = true;
          if (ponte.alturaLivreM < ponteMaisBaixaM) {
            ponteMaisBaixaM = ponte.alturaLivreM;
            ponteCritica = ponte;
          }
        }

        pontesEncontradas.push({
          id: ponte.id,
          nome: ponte.nome,
          tipo: ponte.tipo,
          via: ponte.via,
          cidade: ponte.cidade,
          uf: ponte.uf,
          coordenadas: ponte.coordenadas,
          comprimentoM: ponte.comprimentoM,
          alturaLivreM: ponte.alturaLivreM,
          alturaLivreFormatada: `${ponte.alturaLivreM.toFixed(2).replace('.', ',')} m`,
          nivelRota,
          aprovadoGabarito,
          folgaGabaritoCm: folgaCm,
          alerta: !aprovadoGabarito
            ? `ALTURA_INSUFICIENTE: Caminhão com ${alturaVeiculoM}m colidirá com a estrutura de ${ponte.alturaLivreM}m!`
            : `GABARITO_LIBERADO: Folga vertical de ${folgaCm}cm com segurança`,
          progressoRotaPct: wp.progresso ?? Math.round((i / (waypoints.length - 1)) * 100)
        });
        break;
      }
    }
  }

  return {
    totalPontes: pontesEncontradas.length,
    pontesNaRota: pontesEncontradas,
    alertaGabarito: alturaRestritaDetectada,
    alturaVeiculoConsideradaM: alturaVeiculoM,
    statusGabaritoGeral: alturaRestritaDetectada
      ? 'VIOLACAO_GABARITO_ALTURA_PONTE'
      : (pontesEncontradas.length > 0 ? 'GABARITO_SEGURO_TODAS_PONTES' : 'SEM_RESTRICAO_DE_PONTE'),
    mensagemGabarito: alturaRestritaDetectada
      ? `ATENÇÃO CAMINHONEIRO: O ${ponteCritica.nome} possui altura livre de ${ponteCritica.alturaLivreM}m. Seu caminhão (${alturaVeiculoM}m) não passa! Utilize rota alternativa.`
      : (pontesEncontradas.length > 0
        ? `Gabarito aprovado: Todas as ${pontesEncontradas.length} pontes/viadutos comportam a altura de ${alturaVeiculoM}m.`
        : 'Percurso livre de pontes ou viadutos restritivos.')
  };
}

// ─── 8.6 CATÁLOGO SOBERANO DE ROTATÓRIAS & ROTATÓRIAS SOBRE CANAIS/VIADUTOS ───

export const ROTATORIAS_BRASIL = [
  {
    id: 'rot_praca_independencia_santos',
    nome: 'Praça da Independência (Rotatória Canal 3 / Gonzaga)',
    cidade: 'Santos',
    uf: 'SP',
    coordenadas: { lat: -23.9642, lng: -46.3331 },
    raioM: 38,
    sobreCanal: true,
    canalNome: 'Canal 3 (Av. Washington Luís)',
    saidas: 4
  },
  {
    id: 'rot_praca_bandeiras_santos',
    nome: 'Praça das Bandeiras (Orla / Canal 3)',
    cidade: 'Santos',
    uf: 'SP',
    coordenadas: { lat: -23.9688, lng: -46.3335 },
    raioM: 34,
    sobreCanal: true,
    canalNome: 'Canal 3 / Orla do Gonzaga',
    saidas: 4
  },
  {
    id: 'rot_canal4_orla_santos',
    nome: 'Rotatória Canal 4 / Av. Bartolomeu de Gusmão',
    cidade: 'Santos',
    uf: 'SP',
    coordenadas: { lat: -23.9726, lng: -46.3228 },
    raioM: 30,
    sobreCanal: true,
    canalNome: 'Canal 4 (Av. Siqueira Campos)',
    saidas: 4
  },
  {
    id: 'rot_praca_panamericana_sp',
    nome: 'Praça Panamericana (Alto de Pinheiros)',
    cidade: 'São Paulo',
    uf: 'SP',
    coordenadas: { lat: -23.5536, lng: -46.7088 },
    raioM: 55,
    sobreCanal: false,
    canalNome: null,
    saidas: 6
  },
  {
    id: 'rot_praca_charles_miller_sp',
    nome: 'Praça Charles Miller (Pacaembu)',
    cidade: 'São Paulo',
    uf: 'SP',
    coordenadas: { lat: -23.5462, lng: -46.6652 },
    raioM: 42,
    sobreCanal: true,
    canalNome: 'Córrego Pacaembu (Canalizado)',
    saidas: 5
  },
  {
    id: 'rot_praca_oswaldo_cruz_sp',
    nome: 'Praça Oswaldo Cruz (Início Av. Paulista / 23 de Maio)',
    cidade: 'São Paulo',
    uf: 'SP',
    coordenadas: { lat: -23.5706, lng: -46.6448 },
    raioM: 36,
    sobreCanal: true,
    canalNome: 'Complexo Viário 23 de Maio / Paraíso',
    saidas: 5
  },
  {
    id: 'rot_praca_maua_rj',
    nome: 'Rotatória Orla Conde / Praça Mauá',
    cidade: 'Rio de Janeiro',
    uf: 'RJ',
    coordenadas: { lat: -22.8965, lng: -43.1802 },
    raioM: 35,
    sobreCanal: true,
    canalNome: 'Baía de Guanabara / Cais do Porto',
    saidas: 4
  },
  {
    id: 'rot_praca_bandeira_rj',
    nome: 'Rotatória Praça da Bandeira (Canal do Mangue)',
    cidade: 'Rio de Janeiro',
    uf: 'RJ',
    coordenadas: { lat: -22.9122, lng: -43.2135 },
    raioM: 48,
    sobreCanal: true,
    canalNome: 'Canal do Mangue',
    saidas: 5
  },
  {
    id: 'rot_tres_poderes_df',
    nome: 'Rotatória Eixo Monumental / Praça dos Três Poderes',
    cidade: 'Brasília',
    uf: 'DF',
    coordenadas: { lat: -15.7998, lng: -47.8645 },
    raioM: 60,
    sobreCanal: false,
    canalNome: null,
    saidas: 4
  }
];

/**
 * Gera um arco circular suave no sentido anti-horário (padrão de circulação no Brasil)
 * para contornar a ilha central de uma rotatória sem quinas ou zigue-zague.
 */
export function gerarArcoRotatoria(centro, raioM = 35, anguloEntradaRad = Math.PI, anguloSaidaRad = 0, passos = 8) {
  const cosLat = Math.cos((centro.lat * Math.PI) / 180);
  const mLat = 111320;
  const mLng = 111320 * cosLat;

  // Sentido anti-horário no plano cartesiano (ângulo crescente)
  let delta = anguloSaidaRad - anguloEntradaRad;
  while (delta <= 0.15) delta += Math.PI * 2;
  if (delta > Math.PI * 1.85) delta = Math.PI * 0.75;

  const n = Math.max(4, passos);
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const ang = anguloEntradaRad + (delta * i) / n;
    const dx = Math.cos(ang) * raioM;
    const dy = Math.sin(ang) * raioM;
    pts.push({
      lat: Number((centro.lat + dy / mLat).toFixed(6)),
      lng: Number((centro.lng + dx / mLng).toFixed(6)),
      progresso: 0,
      rotatoria: true
    });
  }
  return pts;
}

/**
 * Detecta rotatórias (inclusive rotatórias elevadas sobre canais/córregos) ao longo da rota.
 */
export function detectarRotatoriasNaRota(waypoints) {
  if (!Array.isArray(waypoints) || waypoints.length < 2) {
    return { totalRotatorias: 0, rotatoriasNaRota: [], possuiRotatoriaSobreCanal: false };
  }

  const encontradas = [];
  const vistas = new Set();

  for (const rot of ROTATORIAS_BRASIL) {
    const raioDeteccaoKm = Math.max(0.14, (rot.raioM * 3.2) / 1000);
    for (let i = 0; i < waypoints.length; i++) {
      const wp = waypoints[i];
      const dKm = calcularDistanciaHaversineKm(wp.lat, wp.lng, rot.coordenadas.lat, rot.coordenadas.lng);
      if (dKm <= raioDeteccaoKm && !vistas.has(rot.id)) {
        vistas.add(rot.id);
        encontradas.push({
          ...rot,
          progressoRotaPct: wp.progresso ?? Math.round((i / (waypoints.length - 1)) * 100),
          instrucao: rot.sobreCanal
            ? `Contorne a rotatória ${rot.nome} (sobre ${rot.canalNome}) pela direita em sentido anti-horário`
            : `Contorne a rotatória ${rot.nome} pela direita em sentido anti-horário`
        });
        break;
      }
    }
  }

  return {
    totalRotatorias: encontradas.length,
    rotatoriasNaRota: encontradas,
    possuiRotatoriaSobreCanal: encontradas.some((r) => r.sobreCanal)
  };
}

function aplicarContornoRotatoriasNaRota(waypoints) {
  if (!Array.isArray(waypoints) || waypoints.length < 4) return waypoints;
  const cosLat = Math.cos((waypoints[0].lat * Math.PI) / 180);
  const mLat = 111320;
  const mLng = 111320 * cosLat;

  let atual = waypoints;
  for (const rot of ROTATORIAS_BRASIL) {
    const raioDetM = Math.max(95, rot.raioM * 2.4);
    let idxMin = -1;
    let minD = Infinity;
    for (let i = 1; i < atual.length - 1; i++) {
      const d = Math.hypot(
        (atual[i].lng - rot.coordenadas.lng) * mLng,
        (atual[i].lat - rot.coordenadas.lat) * mLat
      );
      if (d < minD) { minD = d; idxMin = i; }
    }
    if (idxMin > 0 && idxMin < atual.length - 1 && minD <= raioDetM) {
      const pIn = atual[Math.max(0, idxMin - 1)];
      const pOut = atual[Math.min(atual.length - 1, idxMin + 1)];
      const angIn = Math.atan2((pIn.lat - rot.coordenadas.lat) * mLat, (pIn.lng - rot.coordenadas.lng) * mLng);
      const angOut = Math.atan2((pOut.lat - rot.coordenadas.lat) * mLat, (pOut.lng - rot.coordenadas.lng) * mLng);
      const arco = gerarArcoRotatoria(rot.coordenadas, rot.raioM, angIn, angOut, 7);
      atual = [
        ...atual.slice(0, idxMin),
        ...arco,
        ...atual.slice(idxMin + 1)
      ];
    }
  }
  return atual;
}

// ─── 9. MOTOR DE GEOMETRIA VIÁRIA, CORREDORES RODOVIÁRIOS E CURVAS REALISTAS ───

export const CORREDORES_RODOVIARIOS_BRASIL = [
  {
    id: 'dutra_sp_rj',
    nome: 'Rodovia Presidente Dutra (BR-116)',
    trechos: [
      { lat: -23.5180, lng: -46.5900 },
      { lat: -23.4050, lng: -46.3320 },
      { lat: -23.2850, lng: -45.9520 },
      { lat: -23.1900, lng: -45.8850 },
      { lat: -23.1000, lng: -45.7150 },
      { lat: -23.0300, lng: -45.5600 },
      { lat: -22.9220, lng: -45.3610 },
      { lat: -22.8450, lng: -45.2300 },
      { lat: -22.7350, lng: -45.1150 },
      { lat: -22.5400, lng: -44.7800 },
      { lat: -22.4890, lng: -44.5680 },
      { lat: -22.4700, lng: -44.4500 },
      { lat: -22.5450, lng: -44.1700 },
      { lat: -22.5200, lng: -44.1000 },
      { lat: -22.6300, lng: -43.9000 },
      { lat: -22.7420, lng: -43.7050 },
      { lat: -22.7600, lng: -43.4500 },
      { lat: -22.8300, lng: -43.3200 },
      { lat: -22.9035, lng: -43.1769 }
    ]
  },
  {
    id: 'imigrantes_sp_santos',
    nome: 'Rodovia dos Imigrantes (SP-160)',
    trechos: [
      { lat: -23.5505, lng: -46.6333 }, // Praça da Sé (São Paulo - SP)
      { lat: -23.5680, lng: -46.6415 }, // Av. 23 de Maio / Viaduto Pedroso
      { lat: -23.5825, lng: -46.6475 }, // Av. 23 de Maio / Tutóia
      { lat: -23.6040, lng: -46.6545 }, // Av. Rubem Berta / Ayrton Senna
      { lat: -23.6220, lng: -46.6510 }, // Av. Washington Luís / Bandeirantes
      { lat: -23.6350, lng: -46.6430 }, // Viaduto Ministro Aliomar Baleeiro
      { lat: -23.6450, lng: -46.6410 }, // Início SP-160 / Jabaquara Km 11
      { lat: -23.6700, lng: -46.6310 }, // Diadema Norte Km 14
      { lat: -23.6900, lng: -46.6150 }, // Piraporinha Km 16
      { lat: -23.7250, lng: -46.5920 }, // Praça de Pedágio Diadema Km 20
      { lat: -23.7750, lng: -46.5650 }, // Entroncamento Rodoanel Mário Covas
      { lat: -23.8150, lng: -46.5410 }, // Planalto Km 32
      { lat: -23.8350, lng: -46.5300 }, // Pedágio Principal Piratininga Km 32
      { lat: -23.8500, lng: -46.5200 }, // Início Descida da Serra / Túnel 1
      { lat: -23.8720, lng: -46.5050 }, // Serra do Mar / Viadutos Curvos
      { lat: -23.8900, lng: -46.4820 }, // Túneis da Serra dos Imigrantes / Km 48
      { lat: -23.9000, lng: -46.4700 }, // Cubatão / Entroncamento Anchieta
      { lat: -23.9180, lng: -46.4350 }, // Ponte do Mar Pequeno / São Vicente
      { lat: -23.9350, lng: -46.4050 }, // Acesso Santos / Chico de Paula
      { lat: -23.9450, lng: -46.3800 }, // Av. Martins Fontes / Valongo
      { lat: -23.9550, lng: -46.3550 }, // Av. Waldemar Leão / Túnel Rubens Ferreira
      { lat: -23.9678, lng: -46.3322 }  // Av. Presidente Wilson (Orla do Gonzaga - Santos)
    ]
  },
  {
    id: 'bandeirantes_sp_campinas',
    nome: 'Rodovia dos Bandeirantes (SP-348)',
    trechos: [
      { lat: -23.5180, lng: -46.7350 },
      { lat: -23.3620, lng: -46.7950 },
      { lat: -23.1950, lng: -46.8900 },
      { lat: -23.0950, lng: -47.0250 },
      { lat: -22.9056, lng: -47.0608 }
    ]
  },
  {
    id: 'regis_sp_curitiba',
    nome: 'Rodovia Régis Bittencourt (BR-116)',
    trechos: [
      { lat: -23.6200, lng: -46.7800 },
      { lat: -23.8620, lng: -46.9450 },
      { lat: -23.9300, lng: -47.0700 },
      { lat: -24.2800, lng: -47.4600 },
      { lat: -24.4900, lng: -47.8400 },
      { lat: -24.7350, lng: -48.1250 },
      { lat: -24.8900, lng: -48.4200 },
      { lat: -25.3020, lng: -49.0510 },
      { lat: -25.4284, lng: -49.2733 }
    ]
  },
  {
    id: 'fernao_sp_bh',
    nome: 'Rodovia Fernão Dias (BR-381)',
    trechos: [
      { lat: -23.5050, lng: -46.5650 },
      { lat: -23.2680, lng: -46.5820 },
      { lat: -23.1200, lng: -46.5500 },
      { lat: -22.8850, lng: -46.4120 },
      { lat: -22.6120, lng: -46.0580 },
      { lat: -22.2300, lng: -45.9300 },
      { lat: -21.6900, lng: -45.2500 },
      { lat: -21.0250, lng: -44.9180 },
      { lat: -20.7000, lng: -44.8200 },
      { lat: -19.9650, lng: -44.2000 },
      { lat: -19.9191, lng: -43.9386 }
    ]
  },
  // ── CORREDORES ARTERIAIS ESTRUTURAIS URBANOS (SÃO PAULO & CAPITAIS) ──
  {
    id: 'sp_paulista_reboucas_farialima',
    nome: 'Eixo Paulista ↔ Rebouças ↔ Faria Lima (São Paulo - SP)',
    trechos: [
      { lat: -23.5700, lng: -46.6450 }, // Paulista altura Paraíso / Oswaldo Cruz
      { lat: -23.5645, lng: -46.6525 }, // Paulista altura Brigadeiro
      { lat: -23.5614, lng: -46.6558 }, // Paulista (MASP)
      { lat: -23.5574, lng: -46.6610 }, // Paulista altura Bela Cintra / Consolação
      { lat: -23.5560, lng: -46.6635 }, // Início Av. Rebouças / Complexo Viário
      { lat: -23.5595, lng: -46.6685 }, // Rebouças altura Hospital das Clínicas
      { lat: -23.5645, lng: -46.6745 }, // Rebouças altura Metrô Oscar Freire
      { lat: -23.5695, lng: -46.6805 }, // Rebouças cruzamento Henrique Schaumann / Av. Brasil
      { lat: -23.5725, lng: -46.6850 }, // Rebouças x Faria Lima (Largo da Batata)
      { lat: -23.5780, lng: -46.6865 }, // Av. Brig. Faria Lima (Shopping Iguatemi)
      { lat: -23.5869, lng: -46.6822 }, // Av. Brig. Faria Lima (Itaim Bibi)
      { lat: -23.5930, lng: -46.6845 }  // Av. Brig. Faria Lima x Pres. Juscelino Kubitschek
    ]
  },
  {
    id: 'sp_paulista_23maio_congonhas',
    nome: 'Eixo Paulista ↔ 23 de Maio ↔ Congonhas (Faixa Azul CET-SP)',
    trechos: [
      { lat: -23.5614, lng: -46.6558 }, // Paulista (MASP)
      { lat: -23.5695, lng: -46.6455 }, // Paulista (Praça Oswaldo Cruz)
      { lat: -23.5725, lng: -46.6420 }, // Viaduto Bernardino de Campos
      { lat: -23.5760, lng: -46.6435 }, // Av. 23 de Maio altura Viaduto Pedroso
      { lat: -23.5825, lng: -46.6475 }, // Av. 23 de Maio altura Tutóia
      { lat: -23.5875, lng: -46.6515 }, // Av. 23 de Maio altura Ibirapuera / Obelisco
      { lat: -23.5940, lng: -46.6535 }, // Av. Rubem Berta (Complexo Ayrton Senna)
      { lat: -23.6040, lng: -46.6545 }, // Av. Rubem Berta (Viaduto Onze de Junho)
      { lat: -23.6120, lng: -46.6550 }, // Av. Moreira Guimarães
      { lat: -23.6200, lng: -46.6560 }, // Av. Washington Luís
      { lat: -23.6261, lng: -46.6564 }  // Aeroporto de Congonhas
    ]
  },
  {
    id: 'sp_se_paulista',
    nome: 'Eixo Sé ↔ Brigadeiro Luís Antônio ↔ Paulista (São Paulo - SP)',
    trechos: [
      { lat: -23.5505, lng: -46.6333 }, // Praça da Sé
      { lat: -23.5525, lng: -46.6360 }, // R. Benjamin Constant / São Francisco
      { lat: -23.5550, lng: -46.6390 }, // Viaduto Dona Paulina
      { lat: -23.5585, lng: -46.6430 }, // Av. Brigadeiro Luís Antônio (Bela Vista)
      { lat: -23.5630, lng: -46.6465 }, // Av. Brigadeiro Luís Antônio subindo
      { lat: -23.5670, lng: -46.6485 }, // Av. Brigadeiro x Av. Paulista
      { lat: -23.5614, lng: -46.6558 }  // Av. Paulista (MASP)
    ]
  },
  {
    id: 'sp_farialima_berrini_morumbi',
    nome: 'Eixo Faria Lima ↔ Berrini ↔ Chucri Zaidan (São Paulo - SP)',
    trechos: [
      { lat: -23.5869, lng: -46.6822 }, // Faria Lima (Itaim Bibi)
      { lat: -23.5930, lng: -46.6845 }, // Faria Lima x JK
      { lat: -23.5975, lng: -46.6905 }, // Acesso Ponte Estaiada / Marginal Pinheiros
      { lat: -23.6025, lng: -46.6939 }, // Av. Eng. Luís Carlos Berrini
      { lat: -23.6140, lng: -46.6970 }, // Berrini altura Shopping Nações Unidas
      { lat: -23.6228, lng: -46.6992 }  // Av. Dr. Chucri Zaidan (Morumbi)
    ]
  },
  {
    id: 'rj_centro_copacabana',
    nome: 'Eixo Rio Branco ↔ Aterro do Flamengo ↔ Copacabana (Rio de Janeiro - RJ)',
    trechos: [
      { lat: -22.9035, lng: -43.1769 }, // Av. Rio Branco
      { lat: -22.9150, lng: -43.1740 }, // Cinelândia / Praça Paris
      { lat: -22.9230, lng: -43.1725 }, // Aterro do Flamengo / M.A.M.
      { lat: -22.9350, lng: -43.1745 }, // Parque do Flamengo
      { lat: -22.9430, lng: -43.1810 }, // Enseada de Botafogo
      { lat: -22.9560, lng: -43.1820 }, // Túnel Novo / Lauro Sodré
      { lat: -22.9630, lng: -43.1795 }, // Av. Princesa Isabel
      { lat: -22.9711, lng: -43.1825 }  // Av. Atlântica (Copacabana)
    ]
  }
];

/**
 * Gera uma polilinha realista de waypoints acompanhando rodovias ou avenidas urbanas,
 * sem cortar em linha reta através de quarteirões ou prédios.
 */
export function gerarWaypointsMalhaViaria(origem, destino, numSegmentos = 16) {
  const lat1 = origem.lat;
  const lng1 = origem.lng;
  const lat2 = destino.lat;
  const lng2 = destino.lng;

  const distDiretaKm = calcularDistanciaHaversineKm(lat1, lng1, lat2, lng2);

  // 1. Tenta identificar se o trajeto acompanha um dos grandes corredores rodoviários ou arteriais urbanos
  for (const corr of CORREDORES_RODOVIARIOS_BRASIL) {
    const tr = corr.trechos;
    const ehUrbano = corr.id.startsWith('sp_') || corr.id.startsWith('rj_');
    const maxSnapKm = ehUrbano ? 2.8 : 38.0;

    let idxO = -1;
    let minDO = Infinity;
    let idxD = -1;
    let minDD = Infinity;

    for (let i = 0; i < tr.length; i++) {
      const dO = calcularDistanciaHaversineKm(lat1, lng1, tr[i].lat, tr[i].lng);
      if (dO < minDO) { minDO = dO; idxO = i; }
      const dD = calcularDistanciaHaversineKm(lat2, lng2, tr[i].lat, tr[i].lng);
      if (dD < minDD) { minDD = dD; idxD = i; }
    }

    if (minDO <= maxSnapKm && minDD <= maxSnapKm && Math.abs(idxO - idxD) >= 1) {
      const step = idxO < idxD ? 1 : -1;
      const subTrechos = [];
      for (let k = idxO; k !== idxD + step; k += step) {
        subTrechos.push(tr[k]);
      }

      // Evita gancho/retorno na entrada e saída do corredor projetando origem/destino no primeiro/último segmento
      const cosC = Math.cos(((lat1 + lat2) / 2) * (Math.PI / 180));
      const kxC = 111320 * cosC;
      const kyC = 111320;
      if (subTrechos.length >= 2) {
        const a0 = subTrechos[0];
        const a1 = subTrechos[1];
        const vx = (a1.lng - a0.lng) * kxC;
        const vy = (a1.lat - a0.lat) * kyC;
        const len2 = vx * vx + vy * vy;
        if (len2 > 1) {
          const tO = ((lng1 - a0.lng) * kxC * vx + (lat1 - a0.lat) * kyC * vy) / len2;
          if (tO > 0.15 && tO < 0.95) {
            subTrechos[0] = {
              lat: Number((a0.lat + (a1.lat - a0.lat) * tO).toFixed(6)),
              lng: Number((a0.lng + (a1.lng - a0.lng) * tO).toFixed(6))
            };
          }
        }
        const b0 = subTrechos[subTrechos.length - 2];
        const b1 = subTrechos[subTrechos.length - 1];
        const ux = (b1.lng - b0.lng) * kxC;
        const uy = (b1.lat - b0.lat) * kyC;
        const ulen2 = ux * ux + uy * uy;
        if (ulen2 > 1) {
          const tD = ((lng2 - b0.lng) * kxC * ux + (lat2 - b0.lat) * kyC * uy) / ulen2;
          if (tD > 0.05 && tD < 0.85) {
            subTrechos[subTrechos.length - 1] = {
              lat: Number((b0.lat + (b1.lat - b0.lat) * tD).toFixed(6)),
              lng: Number((b0.lng + (b1.lng - b0.lng) * tD).toFixed(6))
            };
          }
        }
      }

      const pts = [{ lat: Number(lat1.toFixed(6)), lng: Number(lng1.toFixed(6)), progresso: 0 }];
      for (let i = 0; i < subTrechos.length - 1; i++) {
        const a = subTrechos[i];
        const b = subTrechos[i + 1];
        const subSteps = 3;
        for (let s = 1; s <= subSteps; s++) {
          const frac = s / subSteps;
          pts.push({
            lat: Number((a.lat + (b.lat - a.lat) * frac).toFixed(6)),
            lng: Number((a.lng + (b.lng - a.lng) * frac).toFixed(6)),
            progresso: 0
          });
        }
      }
      pts.push({ lat: Number(lat2.toFixed(6)), lng: Number(lng2.toFixed(6)), progresso: 100 });
      const comRotatorias = aplicarContornoRotatoriasNaRota(pts);
      const suavizada = suavizarCurvasEsquinas(comRotatorias, ehUrbano ? 18 : 42, 3);
      for (let k = 0; k < suavizada.length; k++) {
        suavizada[k].progresso = Math.round((k / (suavizada.length - 1)) * 100);
      }
      return suavizada;
    }
  }

  // 2. Trajeto Urbano ou Regional: eixos arteriais limpos (máximo 1 ou 2 conversões suaves, ZERO escada em zigue-zague)
  const cosLatMed = Math.cos(((lat1 + lat2) / 2) * (Math.PI / 180));
  const mLatMed = 111320;
  const mLngMed = 111320 * cosLatMed;

  const dxMeters = (lng2 - lng1) * mLngMed;
  const dyMeters = (lat2 - lat1) * mLatMed;
  const distTotalM = Math.hypot(dxMeters, dyMeters);

  const quadras = [{ lat: Number(lat1.toFixed(6)), lng: Number(lng1.toFixed(6)) }];
  const absDx = Math.abs(dxMeters);
  const absDy = Math.abs(dyMeters);

  if (distTotalM < 450) {
    // Curto percurso urbano: direto se alinhado, ou 1 conversão limpa em L
    if (absDx >= 25 && absDy >= 25) {
      const midLat = absDy > absDx ? lat1 + (lat2 - lat1) * 0.72 : lat1;
      const midLng = absDy > absDx ? lng1 : lng1 + (lng2 - lng1) * 0.72;
      quadras.push({ lat: Number(midLat.toFixed(6)), lng: Number(midLng.toFixed(6)) });
    }
  } else if (distTotalM < 3500) {
    // Percurso urbano médio: 1 eixo arterial principal (L ou Z suave sem zigue-zague)
    if (absDx < 60 || absDy < 60) {
      // Quase alinhado em um eixo: segue direto pela avenida
    } else if (Math.min(absDx, absDy) < distTotalM * 0.25) {
      // 1 conversão limpa em L
      const midLat = absDy >= absDx ? lat2 : lat1;
      const midLng = absDy >= absDx ? lng1 : lng2;
      quadras.push({ lat: Number(midLat.toFixed(6)), lng: Number(midLng.toFixed(6)) });
    } else {
      // 2 conversões limpas em Z (saída local -> avenida arterial -> acesso destino)
      if (absDy >= absDx) {
        quadras.push({ lat: Number((lat1 + (lat2 - lat1) * 0.22).toFixed(6)), lng: Number(lng1.toFixed(6)) });
        quadras.push({ lat: Number((lat1 + (lat2 - lat1) * 0.78).toFixed(6)), lng: Number(lng2.toFixed(6)) });
      } else {
        quadras.push({ lat: Number(lat1.toFixed(6)), lng: Number((lng1 + (lng2 - lng1) * 0.22).toFixed(6)) });
        quadras.push({ lat: Number(lat2.toFixed(6)), lng: Number((lng1 + (lng2 - lng1) * 0.78).toFixed(6)) });
      }
    }
  } else {
    // Percurso urbano longo / regional: corredor expresso contínuo (acesso -> eixo principal -> saída), sem degraus em escada
    if (absDx >= 120 && absDy >= 120) {
      if (absDy >= absDx) {
        quadras.push({ lat: Number((lat1 + (lat2 - lat1) * 0.14).toFixed(6)), lng: Number((lng1 + (lng2 - lng1) * 0.06).toFixed(6)) });
        quadras.push({ lat: Number((lat1 + (lat2 - lat1) * 0.86).toFixed(6)), lng: Number((lng1 + (lng2 - lng1) * 0.94).toFixed(6)) });
      } else {
        quadras.push({ lat: Number((lat1 + (lat2 - lat1) * 0.06).toFixed(6)), lng: Number((lng1 + (lng2 - lng1) * 0.14).toFixed(6)) });
        quadras.push({ lat: Number((lat1 + (lat2 - lat1) * 0.94).toFixed(6)), lng: Number((lng1 + (lng2 - lng1) * 0.86).toFixed(6)) });
      }
    }
  }

  quadras.push({ lat: Number(lat2.toFixed(6)), lng: Number(lng2.toFixed(6)) });

  // Subdivide os segmentos retos entre esquinas da malha
  const pontos = [];
  for (let i = 0; i < quadras.length - 1; i++) {
    const pA = quadras[i];
    const pB = quadras[i + 1];
    const segDist = Math.hypot((pB.lng - pA.lng) * mLngMed, (pB.lat - pA.lat) * mLatMed);
    const subSteps = Math.max(2, Math.min(14, Math.ceil(segDist / 80)));

    for (let s = (i === 0 ? 0 : 1); s <= subSteps; s++) {
      const u = s / subSteps;
      pontos.push({
        lat: Number((pA.lat + (pB.lat - pA.lat) * u).toFixed(6)),
        lng: Number((pA.lng + (pB.lng - pA.lng) * u).toFixed(6)),
        progresso: 0
      });
    }
  }

  const comRotatorias = aplicarContornoRotatoriasNaRota(pontos);
  const raioGiro = distTotalM >= 3500 ? 45 : 22;
  const rotaSuave = suavizarCurvasEsquinas(comRotatorias, raioGiro, 4);
  const n = rotaSuave.length;
  for (let k = 0; k < n; k++) {
    rotaSuave[k].progresso = Math.round((k / (n - 1)) * 100);
  }
  return rotaSuave;
}

/**
 * Suaviza curvas fechadas e esquinas angulares de vias urbanas/rodoviárias
 * usando interpolação Bézier com raio de giro viário realista (8m a 16m),
 * eliminando quinas secas e bicos pontudos.
 */
export function suavizarCurvasEsquinas(waypoints, raioGiroMetros = 12, passosPorCurva = 3) {
  if (!Array.isArray(waypoints) || waypoints.length < 3) return waypoints || [];

  const resultado = [waypoints[0]];
  const cosLat = Math.cos((waypoints[0].lat * Math.PI) / 180);
  const mPorGrauLat = 111320;
  const mPorGrauLng = 111320 * cosLat;

  for (let i = 1; i < waypoints.length - 1; i++) {
    const pPrev = waypoints[i - 1];
    const pCurr = waypoints[i];
    const pNext = waypoints[i + 1];

    // Vetores em metros locais
    const v1x = (pCurr.lng - pPrev.lng) * mPorGrauLng;
    const v1y = (pCurr.lat - pPrev.lat) * mPorGrauLat;
    const v2x = (pNext.lng - pCurr.lng) * mPorGrauLng;
    const v2y = (pNext.lat - pCurr.lat) * mPorGrauLat;

    const len1 = Math.hypot(v1x, v1y);
    const len2 = Math.hypot(v2x, v2y);

    if (len1 < 5 || len2 < 5) {
      resultado.push(pCurr);
      continue;
    }

    // Ângulo entre os vetores (produto escalar)
    const dot = (v1x * v2x + v1y * v2y) / (len1 * len2);
    const clampedDot = Math.max(-1, Math.min(1, dot));
    const angulo = Math.acos(clampedDot); // em radianos

    // Curva relevante entre 15° e 160°
    if (angulo > 0.22 && angulo < 2.8) {
      const cutM = Math.min(raioGiroMetros, len1 * 0.38, len2 * 0.38);

      // Ponto de início do arredondamento (em pPrev -> pCurr)
      const t1 = 1 - (cutM / len1);
      const startLat = pPrev.lat + (pCurr.lat - pPrev.lat) * t1;
      const startLng = pPrev.lng + (pCurr.lng - pPrev.lng) * t1;

      // Ponto final do arredondamento (em pCurr -> pNext)
      const t2 = cutM / len2;
      const endLat = pCurr.lat + (pNext.lat - pCurr.lat) * t2;
      const endLng = pCurr.lng + (pNext.lng - pCurr.lng) * t2;

      // Gera pontos intermediários de Bézier quadrática
      for (let s = 1; s <= passosPorCurva; s++) {
        const u = s / (passosPorCurva + 1);
        const om = 1 - u;
        const bLat = om * om * startLat + 2 * om * u * pCurr.lat + u * u * endLat;
        const bLng = om * om * startLng + 2 * om * u * pCurr.lng + u * u * endLng;
        resultado.push({
          lat: Number(bLat.toFixed(6)),
          lng: Number(bLng.toFixed(6)),
          progresso: pCurr.progresso ?? 0
        });
      }
    } else {
      resultado.push(pCurr);
    }
  }

  resultado.push(waypoints[waypoints.length - 1]);

  // Recalcula progresso normalizado 0..100
  const n = resultado.length;
  for (let k = 0; k < n; k++) {
    resultado[k].progresso = Math.round((k / (n - 1)) * 100);
  }

  return resultado;
}

/**
 * Desloca a rota para a faixa da direita (mão de direção oficial no Brasil),
 * evitando trafegar pelo centro da pista ou contra a mão.
 */
export function aplicarOffsetMaoDireita(waypoints, offsetMetros = 2.4) {
  if (!Array.isArray(waypoints) || waypoints.length < 2 || offsetMetros === 0) return waypoints || [];

  const out = [];
  const cosLat = Math.cos((waypoints[0].lat * Math.PI) / 180);
  const mPorGrauLat = 111320;
  const mPorGrauLng = 111320 * cosLat;

  for (let i = 0; i < waypoints.length; i++) {
    const cur = waypoints[i];
    let tx = 0; let ty = 0;

    if (i === 0) {
      tx = (waypoints[1].lng - cur.lng) * mPorGrauLng;
      ty = (waypoints[1].lat - cur.lat) * mPorGrauLat;
    } else if (i === waypoints.length - 1) {
      tx = (cur.lng - waypoints[i - 1].lng) * mPorGrauLng;
      ty = (cur.lat - waypoints[i - 1].lat) * mPorGrauLat;
    } else {
      tx = (waypoints[i + 1].lng - waypoints[i - 1].lng) * mPorGrauLng;
      ty = (waypoints[i + 1].lat - waypoints[i - 1].lat) * mPorGrauLat;
    }

    const len = Math.hypot(tx, ty);
    if (len < 0.0001) {
      out.push(cur);
      continue;
    }

    // Normal à direita em coordenadas geográficas
    const nx = ty / len;
    const ny = -tx / len;

    const dLng = (nx * offsetMetros) / mPorGrauLng;
    const dLat = (ny * offsetMetros) / mPorGrauLat;

    out.push({
      ...cur,
      lat: Number((cur.lat + dLat).toFixed(6)),
      lng: Number((cur.lng + dLng).toFixed(6))
    });
  }

  return out;
}

/**
 * Telemetria de Velocidade e Limites Regulamentares por Modal (CTB / CONTRAN).
 */
export function calcularTelemetriaVelocidade(opcoes = {}) {
  const modal = (opcoes.modal || 'carro').toLowerCase();
  const limiteViaKmh = Number(opcoes.limiteKmh) || 50;
  const velocidadeGpsKmh = opcoes.velocidadeGps !== undefined && opcoes.velocidadeGps !== null ? Number(opcoes.velocidadeGps) : null;

  const velocidadesPadrao = {
    a_pe: { mediaKmh: 4.5, maxKmh: 6.0, categoria: 'pedestre', viaPermitida: 'calcada_travessia' },
    bike: { mediaKmh: 16.0, maxKmh: 28.0, categoria: 'ciclo', viaPermitida: 'ciclovia_bordo_pista' },
    moto: { mediaKmh: 38.0, maxKmh: Math.min(limiteViaKmh, 90), categoria: 'duas_rodas', viaPermitida: 'corredor_faixa' },
    carro: { mediaKmh: 32.0, maxKmh: limiteViaKmh, categoria: 'automovel', viaPermitida: 'leito_carrocavel' },
    caminhao: { mediaKmh: 24.0, maxKmh: Math.min(limiteViaKmh, 80), categoria: 'pesado', viaPermitida: 'faixa_direita' }
  };

  const config = velocidadesPadrao[modal] || velocidadesPadrao.carro;
  const velAtual = velocidadeGpsKmh !== null && !isNaN(velocidadeGpsKmh)
    ? Math.max(0, velocidadeGpsKmh)
    : config.mediaKmh;

  const toleranciaRadarKmh = limiteViaKmh <= 100 ? limiteViaKmh + 7 : Math.round(limiteViaKmh * 1.07);
  const excessoVelocidade = velAtual > limiteViaKmh;
  const autuavel = velAtual > toleranciaRadarKmh;

  return {
    valido: true,
    modal,
    velocidadeInstantaneaKmh: Number(velAtual.toFixed(1)),
    velocidadeFormatada: `${velAtual.toFixed(0)} km/h`,
    limiteViaKmh,
    toleranciaRadarKmh,
    excessoVelocidade,
    autuavel,
    statusSeguranca: autuavel
      ? 'INFRACAO_GRAVE_VELOCIDADE'
      : (excessoVelocidade ? 'ALERTA_LIMITE_ULTRAPASSADO' : 'VELOCIDADE_SEGURA'),
    configuracaoModal: config,
    fonteGps: velocidadeGpsKmh !== null ? 'gps_dispositivo_real' : 'telemetria_calibrada_ponte'
  };
}

/**
 * Snap-to-Road (Map Matching Soberano): ajusta a coordenada bruta do GPS do celular
 * na rua mais próxima da malha viária ou sobre a rota ativa, eliminando imprecisões do sensor.
 */
export function ajustarGpsNaMalhaViaria(lat, lng, waypointsOuVias = null, maxDistSnapM = 60) {
  const nLat = parseFloat(lat);
  const nLng = parseFloat(lng);
  if (isNaN(nLat) || isNaN(nLng)) {
    return { valido: false, erro: 'COORDENADAS_INVALIDAS' };
  }

  const cosLat = Math.cos((nLat * Math.PI) / 180);
  const kx = 111320 * cosLat;
  const ky = 110540;

  let bestDist = Infinity;
  let bestPoint = { lat: nLat, lng: nLng };
  let bestHeading = null;
  let nomeVia = null;

  // 1. Se houver uma rota ativa com waypoints, tenta o snap prioritário no trajeto
  if (Array.isArray(waypointsOuVias) && waypointsOuVias.length >= 2) {
    for (let i = 0; i < waypointsOuVias.length - 1; i++) {
      const a = waypointsOuVias[i];
      const b = waypointsOuVias[i + 1];

      const ax = (a.lng - nLng) * kx;
      const ay = (a.lat - nLat) * ky;
      const bx = (b.lng - nLng) * kx;
      const by = (b.lat - nLat) * ky;
      const dx = bx - ax;
      const dy = by - ay;
      const len2 = dx * dx + dy * dy;

      let t = len2 > 0 ? -(ax * dx + ay * dy) / len2 : 0;
      t = Math.max(0, Math.min(1, t));

      const cx = ax + t * dx;
      const cy = ay + t * dy;
      const distM = Math.hypot(cx, cy);

      if (distM < bestDist) {
        bestDist = distM;
        bestPoint = {
          lat: Number((nLat + cy / ky).toFixed(6)),
          lng: Number((nLng + cx / kx).toFixed(6))
        };
        bestHeading = Math.round((Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360);
        nomeVia = a.via || b.via || 'Via da Rota Ativa';
      }
    }
  }

  // 2. Se a distância até a rota for maior que a tolerância, busca nos corredores viários conhecidos
  if (bestDist > maxDistSnapM) {
    for (const corr of CORREDORES_RODOVIARIOS_BRASIL) {
      const tr = corr.trechos;
      for (let i = 0; i < tr.length - 1; i++) {
        const a = tr[i];
        const b = tr[i + 1];

        const ax = (a.lng - nLng) * kx;
        const ay = (a.lat - nLat) * ky;
        const bx = (b.lng - nLng) * kx;
        const by = (b.lat - nLat) * ky;
        const dx = bx - ax;
        const dy = by - ay;
        const len2 = dx * dx + dy * dy;

        let t = len2 > 0 ? -(ax * dx + ay * dy) / len2 : 0;
        t = Math.max(0, Math.min(1, t));

        const cx = ax + t * dx;
        const cy = ay + t * dy;
        const distM = Math.hypot(cx, cy);

        if (distM < bestDist) {
          bestDist = distM;
          bestPoint = {
            lat: Number((nLat + cy / ky).toFixed(6)),
            lng: Number((nLng + cx / kx).toFixed(6))
          };
          bestHeading = Math.round((Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360);
          nomeVia = corr.nome;
        }
      }
    }
  }

  const snapped = bestDist <= maxDistSnapM;
  return {
    valido: true,
    gpsBruto: { lat: nLat, lng: nLng },
    pontoAjustadoNaRua: snapped ? bestPoint : { lat: nLat, lng: nLng },
    distanciaSnapMetros: Number(bestDist.toFixed(1)),
    snapped,
    headingViaGraus: bestHeading,
    viaIdentificada: nomeVia || 'Via Local Mapeada'
  };
}

/**
 * Detecta praças de pedágio ao longo do corredor rodoviário entre origem e destino.
 */
export function detectarPedagiosNaRota(waypoints, modal = 'carro', eixosCaminhao = 3) {
  const pedagiosEncontrados = [];
  const idsJaAdicionados = new Set();

  for (const praca of PRACAS_PEDAGIO_BRASIL) {
    for (const wp of waypoints) {
      const distPracaKm = calcularDistanciaHaversineKm(wp.lat, wp.lng, praca.lat, praca.lng);
      // Se o corredor da rota passa a até 22 km da praça de pedágio na rodovia correspondente
      if (distPracaKm <= 22.0 && !idsJaAdicionados.has(praca.id)) {
        idsJaAdicionados.add(praca.id);
        let valorCobrado = praca.tarifaCarro;
        if (modal === 'moto') valorCobrado = praca.tarifaMoto;
        else if (modal === 'caminhao') valorCobrado = Number((praca.tarifaEixoCaminhao * eixosCaminhao).toFixed(2));
        else if (modal === 'bike') valorCobrado = 0;

        pedagiosEncontrados.push({
          id: praca.id,
          nome: praca.nome,
          rodovia: praca.rodovia,
          uf: praca.uf,
          coordenadas: { lat: praca.lat, lng: praca.lng },
          progressoRotaPct: wp.progresso,
          tarifaAplicada: valorCobrado,
          tarifaFormatada: `R$ ${valorCobrado.toFixed(2).replace('.', ',')}`
        });
      }
    }
  }

  pedagiosEncontrados.sort((a, b) => a.progressoRotaPct - b.progressoRotaPct);
  const custoTotalPedagios = Number(pedagiosEncontrados.reduce((acc, p) => acc + p.tarifaAplicada, 0).toFixed(2));

  return {
    quantidadePracas: pedagiosEncontrados.length,
    custoTotalPedagios,
    custoTotalFormatado: `R$ ${custoTotalPedagios.toFixed(2).replace('.', ',')}`,
    pracas: pedagiosEncontrados
  };
}

/**
 * Gera instruções de navegação Turn-by-Turn realistas (estilo Waze / Uber Driver).
 */
export function gerarInstrucoesTurnByTurn(origemGeo, destinoGeo, distanciaViariaKm, duracaoMin, pedagiosInfo) {
  const mesmaCidade = origemGeo.cidade === destinoGeo.cidade && origemGeo.uf === destinoGeo.uf;
  const passos = [];

  const d1 = Number((distanciaViariaKm * 0.12).toFixed(2));
  const d2 = Number((distanciaViariaKm * 0.38).toFixed(2));
  const d3 = Number((distanciaViariaKm * 0.35).toFixed(2));
  const d4 = Number(Math.max(0.1, distanciaViariaKm - d1 - d2 - d3).toFixed(2));

  passos.push({
    ordem: 1,
    manobra: 'partida',
    icone: 'navigation',
    instrucao: `Inicie em ${origemGeo.logradouro} (${origemGeo.bairro}, ${origemGeo.cidade}/${origemGeo.uf})`,
    distanciaTrechoKm: d1,
    tempoTrechoMin: Math.max(1, Math.round(duracaoMin * 0.15))
  });

  if (mesmaCidade) {
    passos.push({
      ordem: 2,
      manobra: 'virar_direita',
      icone: 'corner-up-right',
      instrucao: `Em ${(d1 * 1000).toFixed(0)}m, acesse o corredor arterial principal em direção a ${destinoGeo.bairro}`,
      distanciaTrechoKm: d2,
      tempoTrechoMin: Math.max(2, Math.round(duracaoMin * 0.35))
    });
    passos.push({
      ordem: 3,
      manobra: 'seguir_em_frente',
      icone: 'arrow-up',
      instrucao: `Mantenha-se à esquerda na via expressa urbana por ${d3} km`,
      distanciaTrechoKm: d3,
      tempoTrechoMin: Math.max(2, Math.round(duracaoMin * 0.35))
    });
  } else {
    const rodoviaSugerida = pedagiosInfo && pedagiosInfo.pracas.length > 0
      ? pedagiosInfo.pracas[0].rodovia
      : `Rodovia Federal/Estadual (${origemGeo.uf} -> ${destinoGeo.uf})`;

    passos.push({
      ordem: 2,
      manobra: 'acesso_rodovia',
      icone: 'Milestone',
      instrucao: `Pegue a saída para a ${rodoviaSugerida} sentido ${destinoGeo.cidade}/${destinoGeo.uf}`,
      distanciaTrechoKm: d2 + d3,
      tempoTrechoMin: Math.max(5, Math.round(duracaoMin * 0.70))
    });

    if (pedagiosInfo && pedagiosInfo.quantidadePracas > 0) {
      passos.push({
        ordem: 3,
        manobra: 'pedagio',
        icone: 'receipt',
        instrucao: `Passe por ${pedagiosInfo.quantidadePracas} praça(s) de pedágio (Tag Sem Parar / ConectCar ou Cabine — Total ${pedagiosInfo.custoTotalFormatado})`,
        distanciaTrechoKm: 0.5,
        tempoTrechoMin: 2
      });
    }
  }

  passos.push({
    ordem: passos.length + 1,
    manobra: 'chegada',
    icone: 'map-pin',
    instrucao: `Chegada ao destino em ${destinoGeo.logradouro} (${destinoGeo.bairro}, ${destinoGeo.cidade}/${destinoGeo.uf})`,
    distanciaTrechoKm: d4,
    tempoTrechoMin: Math.max(1, Math.round(duracaoMin * 0.15))
  });

  return passos;
}

/**
 * Gera rotas alternativas viárias com desvios realistas,
 * permitindo ao motorista escolher outro trajeto ou desviar de pistas congestionadas/pontes baixas.
 */
export function gerarRotasAlternativas(origem, destino, rotaPrincipalWps, modal = 'carro', alturaVeiculoM = 1.50) {
  if (!Array.isArray(rotaPrincipalWps) || rotaPrincipalWps.length < 2) return [];

  const distLinearKm = calcularDistanciaHaversineKm(origem.lat, origem.lng, destino.lat, destino.lng);
  const cosLat0 = Math.cos((origem.lat * Math.PI) / 180);
  const mLat = 111320;
  const mLng = 111320 * cosLat0;

  const n = rotaPrincipalWps.length;
  const wpsAlt1 = [];
  const wpsAlt2 = [];

  const dLatTotal = (destino.lat - origem.lat) * mLat;
  const dLngTotal = (destino.lng - origem.lng) * mLng;
  const lenTotal = Math.hypot(dLatTotal, dLngTotal) || 1;
  const nx = -dLatTotal / lenTotal;
  const ny = dLngTotal / lenTotal;

  for (let i = 0; i < n; i++) {
    const p = rotaPrincipalWps[i];
    const frac = i / (n - 1);
    const bulge = Math.sin(frac * Math.PI); // 0 nas pontas, 1 no meio

    // Desvio Alternativo 1: +420m no corredor lateral
    const offM1 = 420 * bulge;
    wpsAlt1.push({
      lat: Number((p.lat + (ny * offM1) / mLat).toFixed(6)),
      lng: Number((p.lng + (nx * offM1) / mLng).toFixed(6)),
      progresso: p.progresso
    });

    // Desvio Alternativo 2: -480m no eixo oposto (via expressa / anel viário)
    const offM2 = -480 * bulge;
    wpsAlt2.push({
      lat: Number((p.lat + (ny * offM2) / mLat).toFixed(6)),
      lng: Number((p.lng + (nx * offM2) / mLng).toFixed(6)),
      progresso: p.progresso
    });
  }

  const velKmh = modal === 'moto' ? 36 : modal === 'caminhao' ? 24 : 28;
  const dist1Km = Number((distLinearKm * 1.36).toFixed(2));
  const dist2Km = Number((distLinearKm * 1.44).toFixed(2));
  const tempo1Min = Math.max(3, Math.round((dist1Km / velKmh) * 60 + 1));
  const tempo2Min = Math.max(4, Math.round((dist2Km / velKmh) * 60 + 2));

  const pontesAlt1 = detectarPontesViadutosNaRota(wpsAlt1, alturaVeiculoM);
  const pontesAlt2 = detectarPontesViadutosNaRota(wpsAlt2, alturaVeiculoM);

  return [
    {
      id: 'rota_alt_1',
      nome: 'Via Alternativa 1 • Corredor Secundário',
      descricao: 'Opção com tráfego livre em vias paralelas',
      distanciaViariaKm: dist1Km,
      distanciaFormatada: `${dist1Km.toFixed(1).replace('.', ',')} km`,
      tempoEstimadoMin: tempo1Min,
      tempoFormatado: `${tempo1Min} min`,
      diferencaTempoMin: +2,
      diferencaKm: Number((dist1Km - distLinearKm * 1.32).toFixed(1)),
      pontes: pontesAlt1,
      aprovadaParaCaminhao: !pontesAlt1.alertaGabarito,
      waypoints: wpsAlt1
    },
    {
      id: 'rota_alt_2',
      nome: 'Via Alternativa 2 • Desvio Anel Viário',
      descricao: 'Trajeto de pista ampla sem pontes baixas',
      distanciaViariaKm: dist2Km,
      distanciaFormatada: `${dist2Km.toFixed(1).replace('.', ',')} km`,
      tempoEstimadoMin: tempo2Min,
      tempoFormatado: `${tempo2Min} min`,
      diferencaTempoMin: +4,
      diferencaKm: Number((dist2Km - distLinearKm * 1.32).toFixed(1)),
      pontes: pontesAlt2,
      aprovadaParaCaminhao: !pontesAlt2.alertaGabarito,
      waypoints: wpsAlt2
    }
  ];
}

// ─── 10. CÁLCULO COMPLETO DE ROTA, TARIFAS UBER/IFOOD/FRETE E COMBUSTÍVEL ───

export function calcularRotaCompleta(opcoes = {}) {
  const origemInput = opcoes.origem || '01310-100';
  const destinoInput = opcoes.destino || '04538-133';
  const modal = (opcoes.modal || 'carro').toLowerCase();
  const placa = opcoes.placa || '';
  const eixosCaminhao = parseInt(opcoes.eixos || '3', 10) || 3;

  const origemGeo = geocodificarLocal(origemInput);
  if (!origemGeo.valido) {
    return { valido: false, erro: 'ORIGEM_INVALIDA', detalhe: origemGeo };
  }

  const destinoGeo = geocodificarLocal(destinoInput);
  if (!destinoGeo.valido) {
    return { valido: false, erro: 'DESTINO_INVALIDO', detalhe: destinoGeo };
  }

  const distLinearKm = calcularDistanciaHaversineKm(origemGeo.lat, origemGeo.lng, destinoGeo.lat, destinoGeo.lng);
  // Fator de sinuosidade viária realista (1.32x em malha urbana, 1.21x em rodovias de longa distância)
  const fatorSinuosidade = distLinearKm <= 35 ? 1.32 : 1.21;
  const distanciaViariaKm = Number(Math.max(0.4, distLinearKm * fatorSinuosidade).toFixed(2));
  const azimuteGraus = calcularBearingGraus(origemGeo.lat, origemGeo.lng, destinoGeo.lat, destinoGeo.lng);

  // Velocidades médias reais de tráfego por modal (km/h)
  const ehRodoviario = distanciaViariaKm > 40;
  const velocidadesKmh = {
    carro: ehRodoviario ? 82 : 28,
    moto: ehRodoviario ? 85 : 36,   // Corredor urbano mais rápido para delivery
    bike: ehRodoviario ? 18 : 15,
    caminhao: ehRodoviario ? 68 : 22
  };

  const velEscolhida = velocidadesKmh[modal] || velocidadesKmh.carro;
  const tempoMinutos = Math.max(2, Math.round((distanciaViariaKm / velEscolhida) * 60 + 2));

  // ETA por todos os modais para comparativo instantâneo
  const comparativoModais = {
    motoDelivery: {
      tempoMin: Math.max(2, Math.round((distanciaViariaKm / velocidadesKmh.moto) * 60 + 1)),
      velocidadeMediaKmh: velocidadesKmh.moto
    },
    carroApp: {
      tempoMin: Math.max(3, Math.round((distanciaViariaKm / velocidadesKmh.carro) * 60 + 2)),
      velocidadeMediaKmh: velocidadesKmh.carro
    },
    bicicleta: {
      tempoMin: Math.max(4, Math.round((distanciaViariaKm / velocidadesKmh.bike) * 60 + 1)),
      velocidadeMediaKmh: velocidadesKmh.bike
    },
    caminhaoLogistica: {
      tempoMin: Math.max(5, Math.round((distanciaViariaKm / velocidadesKmh.caminhao) * 60 + 4)),
      velocidadeMediaKmh: velocidadesKmh.caminhao
    }
  };

  // Waypoints e Praças de Pedágio
  const waypoints = gerarWaypointsMalhaViaria(origemGeo, destinoGeo, 16);
  const pedagios = detectarPedagiosNaRota(waypoints, modal, eixosCaminhao);

  // Inteligência de Combustível ANP & Placas Pro
  const ufRef = origemGeo.uf || 'SP';
  const precosAnp = PRECOS_COMBUSTIVEL_ANP_UF[ufRef] || PRECOS_COMBUSTIVEL_ANP_UF.DEFAULT;
  const infoPlaca = diagnosticarPlacaNaRota(placa);

  const consumoGasKmL = infoPlaca && infoPlaca.placaValida
    ? infoPlaca.consumoHomologadoInmetro.gasolinaKmL
    : (modal === 'moto' ? 32.0 : modal === 'caminhao' ? 3.8 : 12.5);

  const consumoEtaKmL = infoPlaca && infoPlaca.placaValida
    ? infoPlaca.consumoHomologadoInmetro.etanolKmL
    : (modal === 'moto' ? 22.5 : 8.8);

  const litrosNecessarios = Number((distanciaViariaKm / consumoGasKmL).toFixed(2));
  const custoGasolina = Number((litrosNecessarios * precosAnp.gasolina).toFixed(2));
  const custoEtanol = Number(((distanciaViariaKm / consumoEtaKmL) * precosAnp.etanol).toFixed(2));
  const custoDiesel = Number(((distanciaViariaKm / (modal === 'caminhao' ? 3.8 : 14.0)) * precosAnp.dieselS10).toFixed(2));

  // Precificação Dinâmica de Corrida (Uber / 99 / iFood / Frete ANTT)
  const valorUberX = Number(Math.max(8.90, 5.50 + distanciaViariaKm * 2.15 + tempoMinutos * 0.42 + pedagios.custoTotalPedagios).toFixed(2));
  const valorUberComfort = Number((valorUberX * 1.32).toFixed(2));
  const valorUberBlack = Number((valorUberX * 1.78).toFixed(2));
  const valorMotoDelivery = Number(Math.max(6.90, 4.50 + distanciaViariaKm * 1.45 + tempoMinutos * 0.25 + pedagios.custoTotalPedagios).toFixed(2));
  const valorFreteCaminhao = Number(Math.max(85.00, 45.00 + distanciaViariaKm * (3.95 * (eixosCaminhao / 2)) + pedagios.custoTotalPedagios).toFixed(2));

  let tarifaPrincipal = valorUberX;
  if (modal === 'moto') tarifaPrincipal = valorMotoDelivery;
  else if (modal === 'caminhao') tarifaPrincipal = valorFreteCaminhao;
  else if (modal === 'bike') tarifaPrincipal = Number(Math.max(5.50, 3.50 + distanciaViariaKm * 1.10).toFixed(2));

  const cobrancaPix = gerarCobrancaPixCorrida(tarifaPrincipal, `ROTA${Math.round(distanciaViariaKm * 10)}KM`);
  const instrucoes = gerarInstrucoesTurnByTurn(origemGeo, destinoGeo, distanciaViariaKm, tempoMinutos, pedagios);

  // Análise de Pontes, Viadutos e Altura Máxima Permitida
  const alturaVeiculoConsiderada = infoPlaca && infoPlaca.especificacoesFisicas
    ? infoPlaca.especificacoesFisicas.alturaTotalMetros
    : (modal === 'caminhao' ? 4.40 : 1.50);

  const pontesEViadutos = detectarPontesViadutosNaRota(waypoints, alturaVeiculoConsiderada);
  const rotatoriasNaRota = detectarRotatoriasNaRota(waypoints);

  if (rotatoriasNaRota.totalRotatorias > 0) {
    const rotPrincipal = rotatoriasNaRota.rotatoriasNaRota[0];
    instrucoes.splice(Math.max(1, instrucoes.length - 1), 0, {
      ordem: instrucoes.length,
      manobra: 'rotatoria',
      icone: 'refresh-cw',
      instrucao: rotPrincipal.instrucao,
      distanciaTrechoKm: 0.15,
      tempoTrechoMin: 1
    });
    instrucoes.forEach((p, idx) => { p.ordem = idx + 1; });
  }

  // Cálculo de Rotas Alternativas para desvios viários e opções do motorista
  const rotasAlternativas = gerarRotasAlternativas(origemGeo, destinoGeo, waypoints, modal, alturaVeiculoConsiderada);

  const agora = new Date();
  const chegadaDate = new Date(agora.getTime() + tempoMinutos * 60000);
  const horaChegada = chegadaDate.toTimeString().slice(0, 5);

  return {
    valido: true,
    modalSelecionado: modal,
    tipoPercurso: ehRodoviario ? 'rodoviario_interestadual' : 'urbano_metropolitano',
    origem: origemGeo,
    destino: destinoGeo,
    resumoViagem: {
      distanciaLinearKm: Number(distLinearKm.toFixed(2)),
      distanciaViariaKm,
      distanciaFormatada: `${distanciaViariaKm.toFixed(1).replace('.', ',')} km`,
      tempoEstimadoMin: tempoMinutos,
      tempoFormatado: tempoMinutos >= 60
        ? `${Math.floor(tempoMinutos / 60)}h ${tempoMinutos % 60}min`
        : `${tempoMinutos} min`,
      horarioEstimadoChegada: horaChegada,
      velocidadeMediaKmh: velEscolhida,
      direcaoBussolaGraus: azimuteGraus,
      sentidoCardeal: obterRosaDosVentos(azimuteGraus)
    },
    comparativoModais,
    cotacoesCorridaEFrete: {
      moeda: 'BRL',
      tarifaModalSelecionado: tarifaPrincipal,
      tarifaModalFormatada: `R$ ${tarifaPrincipal.toFixed(2).replace('.', ',')}`,
      modalidades: {
        motoDeliveryIfood: { valor: valorMotoDelivery, formatado: `R$ ${valorMotoDelivery.toFixed(2).replace('.', ',')}` },
        uberX: { valor: valorUberX, formatado: `R$ ${valorUberX.toFixed(2).replace('.', ',')}` },
        uberComfort: { valor: valorUberComfort, formatado: `R$ ${valorUberComfort.toFixed(2).replace('.', ',')}` },
        uberBlack: { valor: valorUberBlack, formatado: `R$ ${valorUberBlack.toFixed(2).replace('.', ',')}` },
        freteRodoviarioAntt: { valor: valorFreteCaminhao, formatado: `R$ ${valorFreteCaminhao.toFixed(2).replace('.', ',')}`, eixosConsiderados: eixosCaminhao }
      }
    },
    custosCombustivelAnp: {
      ufReferencia: ufRef,
      precosBombaLitro: precosAnp,
      litrosEstimados: modal === 'bike' ? 0 : litrosNecessarios,
      gastoEstimadoGasolina: modal === 'bike' ? 0 : custoGasolina,
      gastoEstimadoEtanol: modal === 'bike' ? 0 : custoEtanol,
      gastoEstimadoDieselS10: modal === 'bike' ? 0 : custoDiesel,
      custoTotalComPedagioGasolina: modal === 'bike' ? 0 : Number((custoGasolina + pedagios.custoTotalPedagios).toFixed(2))
    },
    pedagios,
    pontesEViadutos,
    rotatoriasNaRota,
    rotasAlternativas,
    inteligenciaVeicularPlacasPro: infoPlaca,
    pagamentoPixIntegrado: cobrancaPix,
    passoAPassoTurnByTurn: instrucoes,
    geometriaRota: {
      formato: 'GeoJSON_LineString_Compat',
      totalWaypoints: waypoints.length,
      waypoints
    }
  };
}

// ─── 11. OTIMIZADOR DE ENTREGAS MULTI-PARADAS (TSP: NEAREST NEIGHBOR + 2-OPT) ───

export function otimizarRotaMultiParadas(opcoes = {}) {
  const origemInput = opcoes.origem || '01310-100';
  const paradasRaw = Array.isArray(opcoes.paradas) ? opcoes.paradas : [];
  const retornarOrigem = Boolean(opcoes.retornarOrigem);
  const modal = (opcoes.modal || 'moto').toLowerCase();

  if (paradasRaw.length === 0) {
    return { valido: false, erro: 'PARADAS_VAZIAS', mensagem: 'Informe ao menos 1 parada no array "paradas".' };
  }

  const origemGeo = geocodificarLocal(origemInput);
  if (!origemGeo.valido) {
    return { valido: false, erro: 'ORIGEM_INVALIDA', detalhe: origemGeo };
  }

  const paradasResolvidas = [];
  for (let i = 0; i < paradasRaw.length; i++) {
    const g = geocodificarLocal(paradasRaw[i]);
    if (!g.valido) {
      return { valido: false, erro: 'PARADA_INVALIDA', indice: i, entrada: paradasRaw[i], detalhe: g };
    }
    paradasResolvidas.push({ ...g, indiceOriginal: i + 1, entradaOriginal: paradasRaw[i] });
  }

  // Distância total na ordem original sem otimização
  let distOriginalKm = 0;
  let cursorOrig = origemGeo;
  for (const p of paradasResolvidas) {
    distOriginalKm += calcularDistanciaHaversineKm(cursorOrig.lat, cursorOrig.lng, p.lat, p.lng) * 1.30;
    cursorOrig = p;
  }
  if (retornarOrigem) {
    distOriginalKm += calcularDistanciaHaversineKm(cursorOrig.lat, cursorOrig.lng, origemGeo.lat, origemGeo.lng) * 1.30;
  }

  // Passo 1: Heurística Gulosa Vizinho Mais Próximo (Nearest Neighbor)
  const restantes = [...paradasResolvidas];
  const rotaOrdenada = [];
  let atual = origemGeo;

  while (restantes.length > 0) {
    let melhorIdx = 0;
    let menorDist = Infinity;
    for (let i = 0; i < restantes.length; i++) {
      const d = calcularDistanciaHaversineKm(atual.lat, atual.lng, restantes[i].lat, restantes[i].lng);
      if (d < menorDist) {
        menorDist = d;
        melhorIdx = i;
      }
    }
    const escolhido = restantes.splice(melhorIdx, 1)[0];
    rotaOrdenada.push(escolhido);
    atual = escolhido;
  }

  // Passo 2: Refinamento Local 2-Opt para descruzar arestas
  const pontosCompletos = [origemGeo, ...rotaOrdenada];
  if (retornarOrigem) pontosCompletos.push(origemGeo);

  const calcCustoSeq = (seq) => {
    let soma = 0;
    for (let i = 0; i < seq.length - 1; i++) {
      soma += calcularDistanciaHaversineKm(seq[i].lat, seq[i].lng, seq[i + 1].lat, seq[i + 1].lng);
    }
    return soma;
  };

  let melhorou = true;
  const limiteFim = retornarOrigem ? pontosCompletos.length - 2 : pontosCompletos.length - 1;
  while (melhorou && rotaOrdenada.length >= 3) {
    melhorou = false;
    for (let i = 1; i <= limiteFim - 1; i++) {
      for (let k = i + 1; k <= limiteFim; k++) {
        const novaSeq = [
          ...pontosCompletos.slice(0, i),
          ...pontosCompletos.slice(i, k + 1).reverse(),
          ...pontosCompletos.slice(k + 1)
        ];
        if (calcCustoSeq(novaSeq) + 0.001 < calcCustoSeq(pontosCompletos)) {
          pontosCompletos.splice(0, pontosCompletos.length, ...novaSeq);
          melhorou = true;
        }
      }
    }
  }

  // Montar trechos otimizados
  const trechos = [];
  let distOtimizadaKm = 0;
  let tempoTotalMin = 0;
  const velMedia = modal === 'moto' ? 35 : modal === 'bike' ? 16 : 28;

  for (let i = 0; i < pontosCompletos.length - 1; i++) {
    const de = pontosCompletos[i];
    const para = pontosCompletos[i + 1];
    const dKm = Number((calcularDistanciaHaversineKm(de.lat, de.lng, para.lat, para.lng) * 1.30).toFixed(2));
    const tMin = Math.max(2, Math.round((dKm / velMedia) * 60 + 2));
    distOtimizadaKm += dKm;
    tempoTotalMin += tMin;

    trechos.push({
      etapa: i + 1,
      de: de.rotulo,
      para: para.rotulo,
      paradaIndiceOriginal: para.indiceOriginal || 'RETORNO_BASE',
      coordenadasDestino: { lat: para.lat, lng: para.lng },
      distanciaTrechoKm: dKm,
      tempoTrechoMin: tMin
    });
  }

  distOriginalKm = Number(distOriginalKm.toFixed(2));
  distOtimizadaKm = Number(distOtimizadaKm.toFixed(2));
  const economiaKm = Number(Math.max(0, distOriginalKm - distOtimizadaKm).toFixed(2));
  const economiaPct = distOriginalKm > 0 ? Number(((economiaKm / distOriginalKm) * 100).toFixed(1)) : 0;

  return {
    valido: true,
    algoritmo: 'TSP_NearestNeighbor_2Opt_Deterministic',
    modal,
    retornarOrigem,
    totalParadas: paradasResolvidas.length,
    metricasOtimizacao: {
      distanciaOrdemOriginalKm: distOriginalKm,
      distanciaOtimizadaKm: distOtimizadaKm,
      economiaDistanciaKm: economiaKm,
      economiaPercentual: `${economiaPct}%`,
      tempoTotalEstimadoMin: tempoTotalMin
    },
    sequenciaOtimizada: pontosCompletos.slice(1, retornarOrigem ? -1 : undefined).map((p, idx) => ({
      ordemEntrega: idx + 1,
      indiceOriginal: p.indiceOriginal,
      rotulo: p.rotulo,
      cep: p.cep,
      coordenadas: { lat: p.lat, lng: p.lng }
    })),
    trechosDetalhados: trechos
  };
}

// ─── 12. SIMULADOR DE TRACKING AO VIVO EM TEMPO REAL (ESTILO UBER / IFOOD) ───

export function calcularTrackingViagemAoVivo(opcoes = {}) {
  const rota = calcularRotaCompleta(opcoes);
  if (!rota.valido) return rota;

  const progressoInput = opcoes.progresso !== undefined ? Number(opcoes.progresso) : 45;
  const progressoPct = Math.max(0, Math.min(100, isNaN(progressoInput) ? 45 : progressoInput));

  const wps = rota.geometriaRota.waypoints;
  const posFloat = (progressoPct / 100) * (wps.length - 1);
  const idxA = Math.floor(posFloat);
  const idxB = Math.min(wps.length - 1, idxA + 1);
  const frac = posFloat - idxA;

  const ptA = wps[idxA];
  const ptB = wps[idxB];

  const latAtual = Number((ptA.lat + (ptB.lat - ptA.lat) * frac).toFixed(6));
  const lngAtual = Number((ptA.lng + (ptB.lng - ptA.lng) * frac).toFixed(6));
  const bearingAtual = idxA < idxB ? calcularBearingGraus(ptA.lat, ptA.lng, ptB.lat, ptB.lng) : rota.resumoViagem.direcaoBussolaGraus;

  const distTotal = rota.resumoViagem.distanciaViariaKm;
  const distPercorridaKm = Number(((distTotal * progressoPct) / 100).toFixed(2));
  const distRestanteKm = Number(Math.max(0, distTotal - distPercorridaKm).toFixed(2));
  const tempoRestanteMin = Math.max(0, Math.ceil(rota.resumoViagem.tempoEstimadoMin * (1 - progressoPct / 100)));

  let statusFase = 'EM_DESLOCAMENTO';
  let mensagemHud = `Motorista a caminho • Chegada em ${tempoRestanteMin} min (${distRestanteKm} km)`;
  if (progressoPct === 0) {
    statusFase = 'AGUARDANDO_PARTIDA';
    mensagemHud = 'Veículo posicionado no ponto de partida';
  } else if (progressoPct >= 95 && progressoPct < 100) {
    statusFase = 'PROXIMO_AO_DESTINO';
    mensagemHud = 'O veículo está chegando ao endereço de destino!';
  } else if (progressoPct >= 100) {
    statusFase = 'VIAGEM_CONCLUIDA';
    mensagemHud = 'Entrega / Corrida finalizada no destino com sucesso!';
  }

  return {
    valido: true,
    viagemId: opcoes.viagemId || 'trp_live_anycast_2026',
    statusFase,
    mensagemHud,
    progressoPercentual: progressoPct,
    telemetriaVeiculo: {
      latitudeAtual: latAtual,
      longitudeAtual: lngAtual,
      bearingGraus: bearingAtual,
      sentido: obterRosaDosVentos(bearingAtual),
      velocidadeInstantaneaKmh: progressoPct >= 100 || progressoPct === 0 ? 0 : rota.resumoViagem.velocidadeMediaKmh,
      distanciaPercorridaKm: distPercorridaKm,
      distanciaRestanteKm: distRestanteKm,
      tempoRestanteMin
    },
    motoristaSimulado: {
      nome: opcoes.motorista || 'Carlos Eduardo (Parceiro Verificado 4.98 ★)',
      veiculo: rota.inteligenciaVeicularPlacasPro ? rota.inteligenciaVeicularPlacasPro.veiculoIdentificado : 'Toyota Corolla Hybrid Prata',
      placa: opcoes.placa || 'BRA2E19',
      modal: rota.modalSelecionado
    },
    rotaBase: rota
  };
}

// ─── 13. RENDERIZADOR VETORIAL SVG DE MAPA (ESTILO UBER / IFOOD DARK & LIGHT) ───

export function renderizarMapaRotaSvg(opcoes = {}) {
  const tracking = calcularTrackingViagemAoVivo(opcoes);
  if (!tracking.valido) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 460" width="100%" height="100%">
      <rect width="800" height="460" rx="16" fill="#0b0f19"/>
      <text x="400" y="230" fill="#ef4444" font-family="sans-serif" font-size="16" font-weight="bold" text-anchor="middle">Erro ao renderizar rota: ${tracking.erro || 'Verifique origem e destino'}</text>
    </svg>`;
  }

  const rota = tracking.rotaBase;
  const wps = rota.geometriaRota.waypoints;
  const tema = (opcoes.tema || 'dark').toLowerCase();
  const isDark = tema !== 'light';
  const progresso = tracking.progressoPercentual;

  // Cores do Mapa
  const bgMap = isDark ? '#090e1a' : '#f1f5f9';
  const blockColor = isDark ? '#0f172a' : '#e2e8f0';
  const streetGridColor = isDark ? '#1e293b' : '#cbd5e1';
  const arterialColor = isDark ? '#334155' : '#94a3b8';
  const waterColor = isDark ? '#082f49' : '#bae6fd';
  const parkColor = isDark ? '#064e3b' : '#bbf7d0';
  const textPrimary = isDark ? '#f8fafc' : '#0f172a';
  const textSecondary = isDark ? '#94a3b8' : '#475569';
  const hudBg = isDark ? 'rgba(15, 23, 42, 0.92)' : 'rgba(255, 255, 255, 0.94)';
  const hudBorder = isDark ? '#334155' : '#cbd5e1';

  // Projeção de Coordenadas Lat/Lng para o Canvas SVG (800 x 460)
  const lats = wps.map((p) => p.lat);
  const lngs = wps.map((p) => p.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);

  const spanLat = Math.max(0.008, maxLat - minLat);
  const spanLng = Math.max(0.008, maxLng - minLng);

  const padX = 115;
  const padY = 95;
  const drawW = 800 - padX * 2;
  const drawH = 460 - padY * 2;

  const project = (lat, lng) => {
    const x = padX + ((lng - minLng) / spanLng) * drawW;
    const y = padY + drawH - ((lat - minLat) / spanLat) * drawH;
    return { x: Number(x.toFixed(1)), y: Number(y.toFixed(1)) };
  };

  const ptsProjetados = wps.map((p) => ({ ...project(p.lat, p.lng), progresso: p.progresso }));
  const polylineAll = ptsProjetados.map((p) => `${p.x},${p.y}`).join(' ');

  // Pontos já percorridos vs restantes
  const corteIdx = Math.max(1, Math.round((progresso / 100) * (ptsProjetados.length - 1)));
  const ptsPercorridos = ptsProjetados.slice(0, corteIdx + 1);
  const polylineDone = ptsPercorridos.map((p) => `${p.x},${p.y}`).join(' ');

  const ptOrigem = ptsProjetados[0];
  const ptDestino = ptsProjetados[ptsProjetados.length - 1];
  const ptVeiculo = project(tracking.telemetriaVeiculo.latitudeAtual, tracking.telemetriaVeiculo.longitudeAtual);

  // Praças de pedágio projetadas no mapa
  const pedagiosSvg = (rota.pedagios.pracas || []).map((pr) => {
    const pos = project(pr.coordenadas.lat, pr.coordenadas.lng);
    return `
      <g transform="translate(${pos.x}, ${pos.y})">
        <circle r="11" fill="#f59e0b" stroke="#090e1a" stroke-width="2.5"/>
        <text y="4" fill="#090e1a" font-family="sans-serif" font-size="10" font-weight="900" text-anchor="middle">$</text>
        <rect x="-48" y="-28" width="96" height="16" rx="4" fill="${hudBg}" stroke="#f59e0b" stroke-width="1"/>
        <text x="0" y="-17" fill="#f59e0b" font-family="sans-serif" font-size="8.5" font-weight="800" text-anchor="middle">${pr.tarifaFormatada}</text>
      </g>
    `;
  }).join('');

  const labelOrigem = `${rota.origem.cidade}/${rota.origem.uf}`;
  const labelDestino = `${rota.destino.cidade}/${rota.destino.uf}`;
  const subOrigem = (rota.origem.logradouro || '').slice(0, 28);
  const subDestino = (rota.destino.logradouro || '').slice(0, 28);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 460" width="100%" height="100%" style="display:block;border-radius:16px;user-select:none;">
  <defs>
    <linearGradient id="routeNeon" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#a3e635"/>
      <stop offset="50%" stop-color="#10b981"/>
      <stop offset="100%" stop-color="#3b82f6"/>
    </linearGradient>
    <filter id="glowEffect" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="5" result="blur"/>
      <feComposite in="SourceGraphic" in2="blur" operator="over"/>
    </filter>
    <filter id="cardShadow" x="-10%" y="-10%" width="120%" height="130%">
      <feDropShadow dx="0" dy="6" stdDeviation="8" flood-color="#000000" flood-opacity="0.45"/>
    </filter>
  </defs>

  <!-- Fundo Cartográfico -->
  <rect width="800" height="460" fill="${bgMap}"/>

  <!-- Quarteirões e Parques Estilizados da Malha Urbana -->
  <g opacity="${isDark ? '0.45' : '0.75'}">
    <rect x="40" y="35" width="160" height="95" rx="8" fill="${blockColor}"/>
    <rect x="220" y="35" width="190" height="95" rx="8" fill="${parkColor}" opacity="0.35"/>
    <rect x="430" y="35" width="210" height="95" rx="8" fill="${blockColor}"/>
    <rect x="660" y="35" width="110" height="95" rx="8" fill="${blockColor}"/>

    <rect x="40" y="150" width="130" height="130" rx="8" fill="${blockColor}"/>
    <rect x="190" y="150" width="230" height="130" rx="8" fill="${blockColor}"/>
    <rect x="440" y="150" width="170" height="130" rx="8" fill="${parkColor}" opacity="0.3"/>
    <rect x="630" y="150" width="140" height="130" rx="8" fill="${blockColor}"/>

    <rect x="40" y="300" width="210" height="120" rx="8" fill="${blockColor}"/>
    <rect x="270" y="300" width="180" height="120" rx="8" fill="${blockColor}"/>
    <rect x="470" y="300" width="290" height="120" rx="8" fill="${blockColor}"/>
  </g>

  <!-- Rio / Canal Urbano Estilizado -->
  <path d="M -10 390 Q 220 340 440 410 T 810 350" fill="none" stroke="${waterColor}" stroke-width="26" stroke-linecap="round" opacity="0.65"/>

  <!-- Malha de Ruas Secundárias e Avenidas Arteriais -->
  <g stroke="${streetGridColor}" stroke-width="2" opacity="0.7">
    <line x1="0" y1="140" x2="800" y2="140"/>
    <line x1="0" y1="290" x2="800" y2="290"/>
    <line x1="180" y1="0" x2="180" y2="460"/>
    <line x1="425" y1="0" x2="425" y2="460"/>
    <line x1="620" y1="0" x2="620" y2="460"/>
  </g>
  <g stroke="${arterialColor}" stroke-width="3.5" stroke-dasharray="10 6" opacity="0.45">
    <path d="M 0 80 Q 400 120 800 65" fill="none"/>
    <path d="M 90 0 Q 140 230 70 460" fill="none"/>
    <path d="M 690 0 Q 640 230 720 460" fill="none"/>
  </g>

  <!-- Linha Completa da Rota (Trecho Futuro Tracejado) -->
  <polyline points="${polylineAll}" fill="none" stroke="${isDark ? '#1e293b' : '#94a3b8'}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
  <polyline points="${polylineAll}" fill="none" stroke="#3b82f6" stroke-width="4" stroke-dasharray="8 8" stroke-linecap="round" stroke-linejoin="round" opacity="0.65"/>

  <!-- Linha Percorrida / Ativa com Brilho Neon (Estilo Uber / iFood) -->
  <polyline points="${polylineDone}" fill="none" stroke="url(#routeNeon)" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" filter="url(#glowEffect)"/>

  <!-- Waypoints Intermediários -->
  ${ptsProjetados.filter((_, idx) => idx > 0 && idx < ptsProjetados.length - 1 && idx % 4 === 0).map((p) => `
    <circle cx="${p.x}" cy="${p.y}" r="3.5" fill="#090e1a" stroke="#38bdf8" stroke-width="2"/>
  `).join('')}

  <!-- Praças de Pedágio (Se houver na rota) -->
  ${pedagiosSvg}

  <!-- Pin de Origem (Ponto A - Verde Mint) -->
  <g transform="translate(${ptOrigem.x}, ${ptOrigem.y})" filter="url(#cardShadow)">
    <circle r="18" fill="#a3e635" opacity="0.22"/>
    <circle r="10" fill="#a3e635" stroke="#090e1a" stroke-width="3"/>
    <text y="3.5" fill="#090e1a" font-family="sans-serif" font-size="10" font-weight="900" text-anchor="middle">A</text>
    <rect x="-75" y="16" width="150" height="34" rx="7" fill="${hudBg}" stroke="${hudBorder}" stroke-width="1.2"/>
    <text x="0" y="30" fill="${textPrimary}" font-family="sans-serif" font-size="10.5" font-weight="800" text-anchor="middle">${labelOrigem}</text>
    <text x="0" y="43" fill="${textSecondary}" font-family="sans-serif" font-size="8.5" text-anchor="middle">${subOrigem}</text>
  </g>

  <!-- Pin de Destino (Ponto B - Azul Elétrico) -->
  <g transform="translate(${ptDestino.x}, ${ptDestino.y})" filter="url(#cardShadow)">
    <circle r="18" fill="#3b82f6" opacity="0.25"/>
    <circle r="10" fill="#3b82f6" stroke="#ffffff" stroke-width="3"/>
    <text y="3.5" fill="#ffffff" font-family="sans-serif" font-size="10" font-weight="900" text-anchor="middle">B</text>
    <rect x="-75" y="-54" width="150" height="34" rx="7" fill="${hudBg}" stroke="${hudBorder}" stroke-width="1.2"/>
    <text x="0" y="-40" fill="${textPrimary}" font-family="sans-serif" font-size="10.5" font-weight="800" text-anchor="middle">${labelDestino}</text>
    <text x="0" y="-27" fill="${textSecondary}" font-family="sans-serif" font-size="8.5" text-anchor="middle">${subDestino}</text>
  </g>

  <!-- Avatar / Veículo em Tempo Real na Posição do Progresso -->
  <g transform="translate(${ptVeiculo.x}, ${ptVeiculo.y})" filter="url(#cardShadow)">
    <circle r="24" fill="#10b981" opacity="0.20"/>
    <circle r="14" fill="#090e1a" stroke="#a3e635" stroke-width="3"/>
    <!-- Silhueta do Veículo Top-Down -->
    <rect x="-6" y="-8" width="12" height="16" rx="4" fill="#a3e635"/>
    <rect x="-4.5" y="-4" width="9" height="5" rx="1.5" fill="#090e1a"/>
    <!-- Etiqueta Flutuante do Veículo -->
    <rect x="-56" y="-38" width="112" height="20" rx="10" fill="#a3e635"/>
    <text x="0" y="-25" fill="#090e1a" font-family="monospace" font-size="10" font-weight="900" text-anchor="middle">${tracking.motoristaSimulado.placa} • ${progresso}%</text>
  </g>

  <!-- HUD Superior Esquerdo: Telemetria da Corrida / Entrega (Estilo Uber) -->
  <g transform="translate(18, 16)" filter="url(#cardShadow)">
    <rect width="315" height="64" rx="12" fill="${hudBg}" stroke="${hudBorder}" stroke-width="1.2"/>
    <circle cx="28" cy="32" r="16" fill="rgba(163, 230, 53, 0.15)" stroke="#a3e635" stroke-width="1.5"/>
    <text x="28" y="36" fill="#a3e635" font-family="sans-serif" font-size="11" font-weight="900" text-anchor="middle">LIVE</text>
    <text x="54" y="26" fill="${textPrimary}" font-family="sans-serif" font-size="12.5" font-weight="800">${rota.resumoViagem.distanciaFormatada} • ${rota.resumoViagem.tempoFormatado}</text>
    <text x="54" y="42" fill="#10b981" font-family="sans-serif" font-size="10.5" font-weight="700">${tracking.mensagemHud.slice(0, 42)}</text>
    <text x="54" y="55" fill="${textSecondary}" font-family="monospace" font-size="9.5">Bússola: ${tracking.telemetriaVeiculo.bearingGraus}° ${tracking.telemetriaVeiculo.sentido} • ETA ${rota.resumoViagem.horarioEstimadoChegada}</text>
  </g>

  <!-- HUD Superior Direito: Cotação & Combustível ANP -->
  <g transform="translate(555, 16)" filter="url(#cardShadow)">
    <rect width="227" height="64" rx="12" fill="${hudBg}" stroke="${hudBorder}" stroke-width="1.2"/>
    <text x="16" y="23" fill="${textSecondary}" font-family="sans-serif" font-size="9.5" font-weight="700">TARIFA ESTIMADA (${rota.modalSelecionado.toUpperCase()})</text>
    <text x="16" y="44" fill="#a3e635" font-family="monospace" font-size="19" font-weight="900">${rota.cotacoesCorridaEFrete.tarifaModalFormatada}</text>
    <text x="16" y="57" fill="${textSecondary}" font-family="sans-serif" font-size="9.5">Combustível: R$ ${rota.custosCombustivelAnp.gastoEstimadoGasolina.toFixed(2).replace('.', ',')} • Pedágio: ${rota.pedagios.custoTotalFormatado}</text>
  </g>

  <!-- Barra de Progresso Inferior da Corrida -->
  <g transform="translate(18, 418)" filter="url(#cardShadow)">
    <rect width="764" height="26" rx="8" fill="${hudBg}" stroke="${hudBorder}" stroke-width="1"/>
    <rect x="6" y="8" width="752" height="10" rx="5" fill="${isDark ? '#1e293b' : '#cbd5e1'}"/>
    <rect x="6" y="8" width="${Math.max(12, Math.round((752 * progresso) / 100))}" height="10" rx="5" fill="url(#routeNeon)"/>
    <text x="382" y="16.5" fill="${textPrimary}" font-family="monospace" font-size="9.5" font-weight="800" text-anchor="middle">PONTE ROTAS PRO ANYCAST • PROGRESSO DA ENTREGA: ${progresso}%</text>
  </g>
</svg>`;
}


