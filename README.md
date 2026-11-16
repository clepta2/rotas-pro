# Rotas & Mapas Pro API — Cloudflare Edge Anycast

API soberana de roteamento urbano e rodoviário, tracking de entregas e corridas em tempo real (estilo Uber / iFood), otimizador de múltiplas paradas (algoritmo TSP 2-Opt), praças de pedágio ANTT, geocodificação reversa com 5.570 municípios do IBGE e renderizador vetorial SVG nativo.

## Endpoints Principais

- `GET /api/rotas/calcular?origem=01310-100&destino=04538-133&modal=moto&placa=BRA2E19`
- `GET /api/rotas/tracking?origem=01310-100&destino=04538-133&progresso=65`
- `GET /api/rotas/mapa.svg?origem=01310-100&destino=04538-133&progresso=65&tema=dark`
- `POST /api/rotas/otimizar` (Algoritmo TSP 2-Opt para múltiplas entregas)
- `GET /api/rotas/geocoding?q=01310-100`
- `GET /api/rotas/geocoding/reverso?lat=-23.5614&lng=-46.6558`
- `GET /api/rotas/pedagios`
