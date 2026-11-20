/**
 * municípios-geo-assets.js
 * Reexporta municípios_geo.js como string JS servível pelo worker.
 * Evita 404 quando o cliente tenta carregar /municipios_geo.js diretamente.
 */

import { GEO_MUNICIPIOS_IBGE, GEO_MUNICIPIOS_NOME } from './municipios_geo.js';

export const MUNICIPIOS_GEO_JS = `/**
 * Coordenadas Geográficas Oficiais (Latitude, Longitude e DDD) de Todos os 5.570 Municípios do Brasil (IBGE)
 * 100% Offline e Soberano (Zero chamadas externas na internet).
 */
export const GEO_MUNICIPIOS_IBGE = ${JSON.stringify(GEO_MUNICIPIOS_IBGE)};
export const GEO_MUNICIPIOS_NOME = ${JSON.stringify(GEO_MUNICIPIOS_NOME)};
`;
